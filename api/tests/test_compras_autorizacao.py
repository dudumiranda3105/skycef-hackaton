"""Dupla validação: Compras confere nota x pedido; o armazém define o(s) destino(s).

Cada destino vira uma Descarga (CLAUDE.md, seção 4).
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.agendamento.domain import (
    Acondicionamento,
    DecisaoCompras,
    MotivoNaoRecebimento,
    StatusAgendamento,
    TipoEvento,
)
from app.agendamento.models import (
    Agendamento,
    Descarga,
    EventoAgendamento,
    NaoRecebimento,
    NotaFiscal,
    ValidacaoCompras,
)
from app.agendamento.service import AgendamentoService, AgendarCommand, NotaFiscalCmd
from app.core.clock import get_relogio
from app.core.db import get_session
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.main import create_app

DATA = date(2026, 10, 6)
P = Acondicionamento.PALETIZADO
AUTORIZA, RECUSA = DecisaoCompras.AUTORIZADO, DecisaoCompras.NAO_AUTORIZADO


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
    nota = NotaFiscalCmd(nf_chave="9" * 44, nf_numero="55")
    return servico().agendar(AgendarCommand(fornecedor_id, DATA, time(8), P, notas=(nota,))).id


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


def _descargas(db, agendamento_id):
    with db() as sessao:
        return list(
            sessao.scalars(
                select(Descarga)
                .where(Descarga.agendamento_id == agendamento_id)
                .order_by(Descarga.armazem_id)
            )
        )


# ---------------------------------------------------------------- Compras


def test_compras_autoriza_e_registra_o_pedido_de_referencia(servico, db, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="4500001234")

    assert _estado(db, agendamento_id).status == StatusAgendamento.AUTORIZADO
    with db() as sessao:
        validacao = sessao.get(ValidacaoCompras, agendamento_id)
        assert validacao.decisao == AUTORIZA
        assert validacao.pedido_referencia == "4500001234"
        assert validacao.decidido_em is not None
    ultimo = _eventos(db, agendamento_id)[-1]
    assert (ultimo.de_status, ultimo.para_status) == (
        StatusAgendamento.PENDENTE_COMPRAS,
        StatusAgendamento.AUTORIZADO,
    )


def test_autorizar_exige_o_pedido_de_referencia(servico, db, agendamento_id):
    with pytest.raises(RegraDeNegocioError, match="pedido de compra"):
        servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="   ")

    assert _estado(db, agendamento_id).status == StatusAgendamento.PENDENTE_COMPRAS


def test_nao_autorizar_registra_a_divergencia_libera_a_vaga_e_a_nota(servico, db, agendamento_id):
    servico().decidir_compras(agendamento_id, RECUSA, observacao="Nota traz 20 itens; pedido tem 18")

    assert _estado(db, agendamento_id).status == StatusAgendamento.NAO_AUTORIZADO
    with db() as sessao:
        registro = sessao.scalars(select(NaoRecebimento)).one()
        assert registro.agendamento_id == agendamento_id
        assert registro.motivo == MotivoNaoRecebimento.DIVERGENCIA_NF_PEDIDO
        assert "20 itens" in registro.descricao
        assert registro.data == DATA
        assert sessao.get(ValidacaoCompras, agendamento_id).decisao == RECUSA
        assert sessao.scalars(select(NotaFiscal)).one().ativa is False
    assert servico().consultar_grade(DATA).slots[0].ocupados == 0  # a vaga voltou


def test_nao_autorizar_exige_descricao(servico, db, agendamento_id):
    with pytest.raises(RegraDeNegocioError, match="divergência"):
        servico().decidir_compras(agendamento_id, RECUSA)

    assert _estado(db, agendamento_id).status == StatusAgendamento.PENDENTE_COMPRAS


def test_compras_decide_uma_unica_vez(servico, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")

    with pytest.raises(ConflitoError, match="já está 'Autorizado'"):
        servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")
    with pytest.raises(ConflitoError, match="não pode passar para 'Não autorizado'"):
        servico().decidir_compras(agendamento_id, RECUSA, observacao="mudei de ideia")


def test_agendamento_inexistente(servico):
    with pytest.raises(NaoEncontradoError):
        servico().decidir_compras(999_999, AUTORIZA, pedido_referencia="1")


# ---------------------------------------------------------------- Armazém


def test_armazem_nao_define_destinos_antes_de_compras(servico, db, agendamento_id):
    with pytest.raises(ConflitoError, match="Compras precisa autorizar"):
        servico().definir_destinos(agendamento_id, [1])

    assert _descargas(db, agendamento_id) == []


def test_armazem_nao_define_destinos_se_compras_recusou(servico, agendamento_id):
    servico().decidir_compras(agendamento_id, RECUSA, observacao="Itens divergentes")

    with pytest.raises(ConflitoError, match="'Não autorizado'"):
        servico().definir_destinos(agendamento_id, [1])


def test_um_destino_gera_uma_descarga_ainda_sem_marcos(servico, db, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")

    servico().definir_destinos(agendamento_id, [2])

    descargas = _descargas(db, agendamento_id)
    assert [d.armazem_id for d in descargas] == [2]
    assert descargas[0].chegada_em is None and descargas[0].entrada_em is None
    assert descargas[0].saida_em is None and descargas[0].quantidade_chapas is None
    assert _estado(db, agendamento_id).status == StatusAgendamento.AUTORIZADO  # o status não muda


def test_varios_destinos_geram_uma_descarga_por_armazem_sem_repeticao(servico, db, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")

    servico().definir_destinos(agendamento_id, [2, 1, 2])

    assert [d.armazem_id for d in _descargas(db, agendamento_id)] == [1, 2]
    destino = [e for e in _eventos(db, agendamento_id) if e.tipo == TipoEvento.DESTINO]
    assert len(destino) == 1
    assert destino[0].detalhe == {"armazemIds": [1, 2]}


def test_destinos_exigem_ao_menos_um_armazem(servico, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")

    with pytest.raises(RegraDeNegocioError, match="ao menos um armazém"):
        servico().definir_destinos(agendamento_id, [])


def test_destino_inexistente_e_rejeitado_sem_deixar_rastro(servico, db, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")

    with pytest.raises(RegraDeNegocioError, match="Armazém inválido: 99"):
        servico().definir_destinos(agendamento_id, [1, 99])

    assert _descargas(db, agendamento_id) == []


def test_destinos_so_podem_ser_definidos_uma_vez(servico, db, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")
    servico().definir_destinos(agendamento_id, [1])

    with pytest.raises(ConflitoError, match="já foram definidos"):
        servico().definir_destinos(agendamento_id, [1, 2])

    assert [d.armazem_id for d in _descargas(db, agendamento_id)] == [1]


def test_detalhes_reunem_notas_decisao_e_descargas(servico, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="777")
    servico().definir_destinos(agendamento_id, [1, 3])

    detalhes = servico().detalhes([agendamento_id])[agendamento_id]

    assert [n.nf_numero for n in detalhes.notas] == ["55"]
    assert detalhes.validacao.pedido_referencia == "777"
    assert [d.armazem_id for d in detalhes.descargas] == [1, 3]


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


def test_varias_decisoes_simultaneas_de_compras_so_uma_vence(servico, db, agendamento_id):
    resultados = _em_paralelo(
        lambda: servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1"), 6
    )

    assert resultados.count(True) == 1
    with db() as sessao:
        assert len(sessao.scalars(select(ValidacaoCompras)).all()) == 1
    assert [e.para_status for e in _eventos(db, agendamento_id)].count(StatusAgendamento.AUTORIZADO) == 1


def test_autorizar_e_recusar_ao_mesmo_tempo_deixam_um_estado_coerente(servico, db, agendamento_id):
    tarefas = iter(
        [
            lambda: servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1"),
            lambda: servico().decidir_compras(agendamento_id, RECUSA, observacao="Itens divergentes"),
        ]
    )
    lock = threading.Lock()

    def _uma():
        with lock:
            tarefa = next(tarefas)
        tarefa()

    resultados = _em_paralelo(_uma, 2)

    assert resultados.count(True) == 1  # a decisão de Compras é única
    status = _estado(db, agendamento_id).status
    with db() as sessao:
        validacoes = sessao.scalars(select(ValidacaoCompras)).all()
        divergencias = len(sessao.scalars(select(NaoRecebimento)).all())
    assert len(validacoes) == 1
    assert (status, validacoes[0].decisao, divergencias) in {
        (StatusAgendamento.AUTORIZADO, AUTORIZA, 0),
        (StatusAgendamento.NAO_AUTORIZADO, RECUSA, 1),
    }


def test_duas_definicoes_de_destino_simultaneas_so_uma_vence(servico, db, agendamento_id):
    servico().decidir_compras(agendamento_id, AUTORIZA, pedido_referencia="1")

    resultados = _em_paralelo(lambda: servico().definir_destinos(agendamento_id, [1, 2]), 6)

    assert resultados.count(True) == 1
    assert [d.armazem_id for d in _descargas(db, agendamento_id)] == [1, 2]


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


def _agendar_http(cliente, fornecedor_id, **extra) -> dict:
    resposta = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-06",
            "horario": "10:00",
            "acondicionamento": "BIG_BAG",
            "notas": [{"nfChave": "6" * 44, "nfNumero": "321", "pesoTotalKg": "1500.50"}],
            **extra,
        },
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def test_http_lista_os_quatro_armazens(cliente):
    armazens = cliente.get("/api/armazens").json()

    assert [a["nome"] for a in armazens] == ["Insumos", "Adubo", "Pátio de Máquinas", "Loja"]


def test_http_fluxo_completo_ate_os_destinos(cliente, fornecedor_id):
    criado = _agendar_http(cliente, fornecedor_id)
    id_ = criado["id"]
    assert criado["status"] == "PENDENTE_COMPRAS"
    assert criado["statusRotulo"] == "Aguardando Compras"
    assert criado["notas"][0]["nfNumero"] == "321"
    assert criado["validacaoCompras"] is None and criado["descargas"] == []

    autorizado = cliente.post(
        f"/api/agendamentos/{id_}/validacao-compras",
        json={"decisao": "AUTORIZADO", "pedidoReferencia": "4500009999"},
    )
    assert autorizado.status_code == 200
    assert autorizado.json()["status"] == "AUTORIZADO"
    assert autorizado.json()["validacaoCompras"]["pedidoReferencia"] == "4500009999"

    destinos = cliente.post(f"/api/agendamentos/{id_}/destinos", json={"armazemIds": [1, 2]})
    assert destinos.status_code == 200
    corpo = destinos.json()
    assert corpo["status"] == "AUTORIZADO"
    assert [d["armazemId"] for d in corpo["descargas"]] == [1, 2]
    assert corpo["descargas"][0]["chegadaEm"] is None

    assert [d["armazemId"] for d in cliente.get(f"/api/agendamentos/{id_}").json()["descargas"]] == [1, 2]
    eventos = cliente.get(f"/api/agendamentos/{id_}/eventos").json()
    assert [e["tipo"] for e in eventos] == ["STATUS", "STATUS", "DESTINO"]


def test_http_nao_autorizado_registra_a_divergencia(cliente, fornecedor_id):
    id_ = _agendar_http(cliente, fornecedor_id)["id"]

    resposta = cliente.post(
        f"/api/agendamentos/{id_}/validacao-compras",
        json={"decisao": "NAO_AUTORIZADO", "observacao": "Quantidade diferente do pedido"},
    )

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "NAO_AUTORIZADO"
    assert resposta.json()["statusRotulo"] == "Não autorizado"
    assert resposta.json()["notas"][0]["ativa"] is False


def test_http_destinos_antes_de_compras_devolve_409(cliente, fornecedor_id):
    id_ = _agendar_http(cliente, fornecedor_id)["id"]

    resposta = cliente.post(f"/api/agendamentos/{id_}/destinos", json={"armazemIds": [1]})

    assert resposta.status_code == 409
    assert resposta.json()["codigo"] == "CONFLITO"


def test_http_agendar_exige_ao_menos_uma_nota(cliente, fornecedor_id):
    resposta = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-06",
            "horario": "10:00",
            "acondicionamento": "BIG_BAG",
            "notas": [],
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["codigo"] == "REQUISICAO_INVALIDA"


def test_http_nota_ja_agendada_devolve_409(cliente, fornecedor_id):
    _agendar_http(cliente, fornecedor_id)

    resposta = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-07",
            "horario": "08:00",
            "acondicionamento": "PALETIZADO",
            "notas": [{"nfChave": "6" * 44}],
        },
    )

    assert resposta.status_code == 409
    assert "já está agendada" in resposta.json()["detail"]


def test_http_validacao_de_entrada(cliente, fornecedor_id):
    id_ = _agendar_http(cliente, fornecedor_id)["id"]

    sem_destino = cliente.post(f"/api/agendamentos/{id_}/destinos", json={"armazemIds": []})
    assert sem_destino.status_code == 400
    assert sem_destino.json()["codigo"] == "REQUISICAO_INVALIDA"

    campo_extra = cliente.post(
        f"/api/agendamentos/{id_}/validacao-compras",
        json={"decisao": "AUTORIZADO", "pedidoReferencia": "1", "status": "CONCLUIDO"},
    )
    assert campo_extra.status_code == 400

    decisao_invalida = cliente.post(f"/api/agendamentos/{id_}/validacao-compras", json={"decisao": "TALVEZ"})
    assert decisao_invalida.status_code == 400

    sem_pedido = cliente.post(f"/api/agendamentos/{id_}/validacao-compras", json={"decisao": "AUTORIZADO"})
    assert sem_pedido.status_code == 422

    assert cliente.post("/api/agendamentos/999999/destinos", json={"armazemIds": [1]}).status_code == 404
