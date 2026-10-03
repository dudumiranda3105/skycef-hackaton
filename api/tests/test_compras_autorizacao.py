"""Fluxo de dupla validação: Compras confere nota x pedido; o armazém autoriza e define o destino."""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.agendamento.domain import Acondicionamento, MotivoNaoRecebimento, StatusAgendamento, TipoEvento
from app.agendamento.models import Agendamento, AgendamentoDestino, EventoAgendamento, NaoRecebimento
from app.agendamento.service import AgendamentoService, AgendarCommand
from app.core.clock import get_relogio
from app.core.db import get_session
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.main import create_app

DATA = date(2026, 10, 6)
P = Acondicionamento.PALETIZADO


@pytest.fixture
def servico(db, relogio):
    """Fábrica de serviços; cada chamada usa uma sessão nova, como cada requisição.
    As sessões são fechadas no fim: uma sessão esquecida com transação aberta segura locks
    e travaria o `truncate` do teste seguinte."""
    abertas = []

    def _servico():
        sessao = db()
        abertas.append(sessao)
        return AgendamentoService(sessao, relogio)

    yield _servico
    for sessao in abertas:
        sessao.close()


@pytest.fixture
def agendamento_id(servico, fornecedor_id) -> int:
    return servico().agendar(AgendarCommand(fornecedor_id, DATA, time(8), P)).id


def _estado(db, agendamento_id):
    with db() as sessao:
        return sessao.get(Agendamento, agendamento_id)


def _eventos(db, agendamento_id):
    with db() as sessao:
        return list(
            sessao.scalars(
                select(EventoAgendamento)
                .where(EventoAgendamento.agendamento_id == agendamento_id)
                .order_by(EventoAgendamento.id)
            )
        )


# ---------------------------------------------------------------- Compras


def test_compras_confirma_a_conformidade(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="4500001234")

    ag = _estado(db, agendamento_id)
    assert ag.status == StatusAgendamento.VALIDADO_COMPRAS
    assert ag.pedido_compra == "4500001234"
    assert ag.compras_em is not None
    ultimo = _eventos(db, agendamento_id)[-1]
    assert (ultimo.de_status, ultimo.para_status) == (
        StatusAgendamento.AGENDADO,
        StatusAgendamento.VALIDADO_COMPRAS,
    )


def test_conformidade_exige_o_numero_do_pedido(servico, db, agendamento_id):
    with pytest.raises(RegraDeNegocioError, match="pedido de compra"):
        servico().validar_compras(agendamento_id, True, pedido_compra="   ")

    assert _estado(db, agendamento_id).status == StatusAgendamento.AGENDADO


def test_divergencia_vira_nao_recebido_registra_o_motivo_e_libera_a_vaga(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, False, observacao="Nota traz 20 itens; pedido tem 18")

    ag = _estado(db, agendamento_id)
    assert ag.status == StatusAgendamento.NAO_RECEBIDO
    with db() as sessao:
        registro = sessao.scalars(select(NaoRecebimento)).one()
        assert registro.agendamento_id == agendamento_id
        assert registro.motivo == MotivoNaoRecebimento.DIVERGENCIA_NF_PEDIDO
        assert "20 itens" in registro.descricao
        assert registro.data == DATA
    # a vaga foi liberada: dois outros caminhões agora cabem no horário
    grade = servico().consultar_grade(DATA)
    assert grade.slots[0].ocupados == 0


def test_divergencia_exige_descricao(servico, db, agendamento_id):
    with pytest.raises(RegraDeNegocioError, match="divergência"):
        servico().validar_compras(agendamento_id, False)

    assert _estado(db, agendamento_id).status == StatusAgendamento.AGENDADO


def test_nao_valida_duas_vezes(servico, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="1")

    with pytest.raises(ConflitoError, match="já está 'Validado por Compras'"):
        servico().validar_compras(agendamento_id, True, pedido_compra="1")


def test_agendamento_inexistente(servico):
    with pytest.raises(NaoEncontradoError):
        servico().validar_compras(999_999, True, pedido_compra="1")


# ---------------------------------------------------------------- Armazém


def test_armazem_nao_autoriza_antes_de_compras(servico, db, agendamento_id):
    with pytest.raises(ConflitoError, match="'Agendado' e não pode passar para 'Autorizado'"):
        servico().autorizar(agendamento_id, [1])

    assert _estado(db, agendamento_id).status == StatusAgendamento.AGENDADO


def test_autoriza_com_um_destino(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="1")

    servico().autorizar(agendamento_id, [2])

    ag = _estado(db, agendamento_id)
    assert ag.status == StatusAgendamento.AUTORIZADO
    assert ag.autorizado_em is not None
    assert servico().destinos_por_agendamento([agendamento_id]) == {agendamento_id: [2]}


def test_uma_carga_pode_ter_mais_de_um_armazem_de_destino_sem_repeticao(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="1")

    servico().autorizar(agendamento_id, [2, 1, 2])

    assert servico().destinos_por_agendamento([agendamento_id])[agendamento_id] == [1, 2]
    destino = [e for e in _eventos(db, agendamento_id) if e.tipo == TipoEvento.DESTINO]
    assert len(destino) == 1
    assert destino[0].detalhe == {"armazemIds": [1, 2]}


def test_autorizacao_exige_ao_menos_um_destino(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="1")

    with pytest.raises(RegraDeNegocioError, match="ao menos um armazém"):
        servico().autorizar(agendamento_id, [])


def test_destino_inexistente_e_rejeitado_sem_deixar_rastro(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="1")

    with pytest.raises(RegraDeNegocioError, match="Armazém inválido: 99"):
        servico().autorizar(agendamento_id, [1, 99])

    assert _estado(db, agendamento_id).status == StatusAgendamento.VALIDADO_COMPRAS
    with db() as sessao:
        assert sessao.scalars(select(AgendamentoDestino)).all() == []


def test_nao_autoriza_duas_vezes_nem_duplica_destinos(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="1")
    servico().autorizar(agendamento_id, [1])

    with pytest.raises(ConflitoError, match="já está 'Autorizado'"):
        servico().autorizar(agendamento_id, [1, 2])

    assert servico().destinos_por_agendamento([agendamento_id])[agendamento_id] == [1]


# ---------------------------------------------------------------- concorrência


def _em_paralelo(tarefa, quantidade):
    """Roda `tarefa` em várias threads que largam juntas; True = conseguiu, False = ConflitoError."""
    largada = threading.Barrier(quantidade)

    def _executar(_):
        largada.wait()
        try:
            tarefa()
            return True
        except ConflitoError:
            return False

    with ThreadPoolExecutor(max_workers=quantidade) as pool:
        return list(pool.map(_executar, range(quantidade)))


def test_duas_decisoes_simultaneas_de_compras_so_uma_vence(servico, db, agendamento_id):
    resultados = _em_paralelo(lambda: servico().validar_compras(agendamento_id, True, pedido_compra="1"), 6)

    assert resultados.count(True) == 1
    transicoes = [
        e for e in _eventos(db, agendamento_id) if e.para_status == StatusAgendamento.VALIDADO_COMPRAS
    ]
    assert len(transicoes) == 1


def test_compras_conforme_e_divergente_ao_mesmo_tempo_deixam_um_estado_coerente(servico, db, agendamento_id):
    tarefas = [
        lambda: servico().validar_compras(agendamento_id, True, pedido_compra="1"),
        lambda: servico().validar_compras(agendamento_id, False, observacao="Itens divergentes"),
    ]
    indice = iter(range(2))
    lock = threading.Lock()

    def _uma():
        with lock:
            i = next(indice)
        tarefas[i]()

    resultados = _em_paralelo(_uma, 2)

    # A divergência sempre vence no fim: se a conformidade vier antes, a divergência ainda é válida
    # (o conferente pode achar o problema depois); se vier depois, a conformidade é recusada.
    assert resultados.count(True) >= 1
    assert _estado(db, agendamento_id).status == StatusAgendamento.NAO_RECEBIDO
    with db() as sessao:
        assert len(sessao.scalars(select(NaoRecebimento)).all()) == 1
    # a trilha de auditoria forma uma cadeia sem buracos nem repetições
    cadeia = [
        (e.de_status, e.para_status) for e in _eventos(db, agendamento_id) if e.tipo == TipoEvento.STATUS
    ]
    for (_, para), (de_seguinte, _) in zip(cadeia, cadeia[1:], strict=False):
        assert de_seguinte == para


def test_duas_autorizacoes_simultaneas_so_uma_vence(servico, db, agendamento_id):
    servico().validar_compras(agendamento_id, True, pedido_compra="1")

    resultados = _em_paralelo(lambda: servico().autorizar(agendamento_id, [1, 2]), 6)

    assert resultados.count(True) == 1
    assert servico().destinos_por_agendamento([agendamento_id])[agendamento_id] == [1, 2]


# ---------------------------------------------------------------- HTTP


@pytest.fixture
def cliente(db, relogio):
    app = create_app()

    def _sessao():
        with db() as sessao:
            yield sessao

    app.dependency_overrides[get_session] = _sessao
    app.dependency_overrides[get_relogio] = lambda: relogio
    return TestClient(app)


def _agendar_http(cliente, fornecedor_id) -> int:
    resposta = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-06",
            "horario": "10:00",
            "acondicionamento": "BIG_BAG",
        },
    )
    assert resposta.status_code == 201
    return resposta.json()["id"]


def test_http_lista_os_quatro_armazens(cliente):
    armazens = cliente.get("/api/armazens").json()

    assert [a["nome"] for a in armazens] == ["Insumos", "Adubo", "Pátio de Máquinas", "Loja"]


def test_http_fluxo_completo_ate_a_autorizacao(cliente, fornecedor_id):
    id_ = _agendar_http(cliente, fornecedor_id)

    validado = cliente.post(
        f"/api/agendamentos/{id_}/validacao-compras",
        json={"conforme": True, "pedidoCompra": "4500009999"},
    )
    assert validado.status_code == 200
    assert validado.json()["status"] == "VALIDADO_COMPRAS"
    assert validado.json()["statusRotulo"] == "Validado por Compras"
    assert validado.json()["pedidoCompra"] == "4500009999"

    autorizado = cliente.post(f"/api/agendamentos/{id_}/autorizacao", json={"armazemIds": [1, 2]})
    assert autorizado.status_code == 200
    corpo = autorizado.json()
    assert corpo["status"] == "AUTORIZADO"
    assert corpo["destinos"] == [1, 2]
    assert corpo["autorizadoEm"] is not None

    assert cliente.get(f"/api/agendamentos/{id_}").json()["destinos"] == [1, 2]
    eventos = cliente.get(f"/api/agendamentos/{id_}/eventos").json()
    assert [e["paraStatus"] for e in eventos] == [
        "AGENDADO",
        "VALIDADO_COMPRAS",
        "AUTORIZADO",
        "AUTORIZADO",
    ]
    assert [e["tipo"] for e in eventos][-1] == "DESTINO"


def test_http_divergencia_nao_recebe_e_explica(cliente, fornecedor_id):
    id_ = _agendar_http(cliente, fornecedor_id)

    resposta = cliente.post(
        f"/api/agendamentos/{id_}/validacao-compras",
        json={"conforme": False, "observacao": "Quantidade diferente do pedido"},
    )

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "NAO_RECEBIDO"
    assert resposta.json()["statusRotulo"] == "Não recebido"


def test_http_autorizar_antes_de_compras_devolve_409(cliente, fornecedor_id):
    id_ = _agendar_http(cliente, fornecedor_id)

    resposta = cliente.post(f"/api/agendamentos/{id_}/autorizacao", json={"armazemIds": [1]})

    assert resposta.status_code == 409
    assert resposta.json()["codigo"] == "CONFLITO"


def test_http_validacao_de_entrada(cliente, fornecedor_id):
    id_ = _agendar_http(cliente, fornecedor_id)

    sem_destino = cliente.post(f"/api/agendamentos/{id_}/autorizacao", json={"armazemIds": []})
    assert sem_destino.status_code == 400
    assert sem_destino.json()["codigo"] == "REQUISICAO_INVALIDA"

    campo_extra = cliente.post(
        f"/api/agendamentos/{id_}/validacao-compras",
        json={"conforme": True, "pedidoCompra": "1", "status": "CONCLUIDO"},
    )
    assert campo_extra.status_code == 400

    sem_pedido = cliente.post(f"/api/agendamentos/{id_}/validacao-compras", json={"conforme": True})
    assert sem_pedido.status_code == 422

    assert cliente.post("/api/agendamentos/999999/autorizacao", json={"armazemIds": [1]}).status_code == 404
