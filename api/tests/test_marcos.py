"""Chegada, entrada e saída. Relógio fixo: segunda-feira 05/10/2026, 14h00 (fuso de São Paulo)."""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.agendamento.domain import Acondicionamento, DecisaoCompras, StatusAgendamento, TipoEvento
from app.agendamento.marcos import MarcosService
from app.agendamento.models import Agendamento, Descarga, DescargaEquipamento, EventoAgendamento
from app.agendamento.service import AgendamentoService, AgendarCommand
from app.core.clock import RelogioFixo, get_relogio
from app.core.db import get_session
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.main import create_app

FUSO = ZoneInfo("America/Sao_Paulo")
HOJE = date(2026, 10, 5)


def _h(hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, 5, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def relogio():
    return RelogioFixo(_h(14, 0))


@pytest.fixture
def abertas(db):
    """Controla as sessões abertas para fechá-las no fim (sessão esquecida segura locks)."""
    sessoes = []
    yield sessoes
    for sessao in sessoes:
        sessao.close()


@pytest.fixture
def base(db, relogio, abertas):
    def _base():
        sessao = db()
        abertas.append(sessao)
        return AgendamentoService(sessao, relogio)

    return _base


@pytest.fixture
def marcos(db, relogio, abertas):
    def _marcos():
        sessao = db()
        abertas.append(sessao)
        return MarcosService(sessao, relogio)

    return _marcos


@pytest.fixture
def autorizado(base, fornecedor_id):
    """Fábrica: agendamento das 15h de hoje, já autorizado por Compras (sem destinos ainda)."""

    def _criar(acond=Acondicionamento.PALETIZADO) -> int:
        servico = base()
        agendamento = servico.agendar(AgendarCommand(fornecedor_id, HOJE, time(15), acond))
        base().decidir_compras(agendamento.id, DecisaoCompras.AUTORIZADO, pedido_referencia="4500")
        return agendamento.id

    return _criar


def _descargas(db, agendamento_id):
    with db() as sessao:
        return list(
            sessao.scalars(
                select(Descarga)
                .where(Descarga.agendamento_id == agendamento_id)
                .order_by(Descarga.armazem_id)
            )
        )


def _status(db, agendamento_id):
    with db() as sessao:
        return sessao.get(Agendamento, agendamento_id).status


def _equipamento(db, identificacao):
    with db() as sessao:
        return sessao.execute(
            text("select id from equipamento where identificacao = :i"), {"i": identificacao}
        ).scalar_one()


# ---------------------------------------------------------------- fluxo completo


def test_fluxo_completo_com_dois_destinos_e_marcos_independentes(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 30))
    base().definir_destinos(ag, [1, 2])
    d1, d2 = _descargas(db, ag)
    assert d1.chegada_em == d2.chegada_em == _h(13, 30)  # as descargas herdam a chegada do caminhão

    marcos().registrar_entrada(d1.id, _h(13, 40))
    assert _status(db, ag) == StatusAgendamento.EM_DESCARGA

    marcos().registrar_saida(d1.id, 2, [_equipamento(db, "INS-EMPG-01")], _h(13, 50))
    assert _status(db, ag) == StatusAgendamento.EM_DESCARGA  # ainda falta o 2º destino

    marcos().registrar_entrada(d2.id, _h(13, 55))
    marcos().registrar_saida(d2.id, 0, [], _h(13, 59))

    assert _status(db, ag) == StatusAgendamento.CONCLUIDO
    d1, d2 = _descargas(db, ag)
    assert (d1.entrada_em - d1.chegada_em).total_seconds() == 10 * 60  # espera = entrada - chegada
    assert (d1.saida_em - d1.entrada_em).total_seconds() == 10 * 60  # descarga = saída - entrada
    assert (d1.quantidade_chapas, d2.quantidade_chapas) == (2, 0)  # por descarga, nunca somadas


def test_saida_grava_os_equipamentos_usados(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [2])
    (d,) = _descargas(db, ag)
    marcos().registrar_entrada(d.id, _h(13, 10))
    gas, manual = _equipamento(db, "ADU-EMPG-01"), _equipamento(db, "ADU-PALM-01")

    marcos().registrar_saida(d.id, 2, [manual, gas, gas], _h(13, 40))

    with db() as sessao:
        usados = sessao.scalars(select(DescargaEquipamento.equipamento_id)).all()
        assert sorted(usados) == sorted({gas, manual})
    assert base().detalhes([ag])[ag].equipamentos[d.id] == sorted({gas, manual})


def test_trilha_de_auditoria_registra_cada_marco(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)
    marcos().registrar_entrada(d.id, _h(13, 5))
    marcos().registrar_saida(d.id, 1, [], _h(13, 20))

    with db() as sessao:
        eventos = list(
            sessao.scalars(select(EventoAgendamento).where(EventoAgendamento.tipo == TipoEvento.MARCO))
        )
    assert [e.detalhe["marco"] for e in eventos] == ["CHEGADA", "ENTRADA", "SAIDA"]
    assert eventos[2].detalhe["quantidadeChapas"] == 1


# ---------------------------------------------------------------- chegada


def test_chegada_pode_vir_antes_da_autorizacao_do_armazem(base, marcos, fornecedor_id, db):
    # caminhão sem aviso: chega, entra na fila, e só depois Compras e o armazém decidem
    ag = (
        base()
        .agendar(
            AgendarCommand(fornecedor_id, HOJE, time(15), Acondicionamento.BIG_BAG, agendado_na_hora=True)
        )
        .id
    )

    marcos().registrar_chegada(ag, _h(13, 0))

    with db() as sessao:
        assert sessao.get(Agendamento, ag).chegada_em == _h(13, 0)
    base().decidir_compras(ag, DecisaoCompras.AUTORIZADO, pedido_referencia="1")
    base().definir_destinos(ag, [3])
    assert _descargas(db, ag)[0].chegada_em == _h(13, 0)  # a descarga nasce já com a chegada


def test_chegada_sem_horario_usa_o_relogio_do_servidor(autorizado, marcos, db):
    ag = autorizado()

    marcos().registrar_chegada(ag)

    with db() as sessao:
        assert sessao.get(Agendamento, ag).chegada_em == _h(14, 0)


def test_chegada_so_pode_ser_registrada_uma_vez(autorizado, marcos):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))

    with pytest.raises(ConflitoError, match="já foi registrada"):
        marcos().registrar_chegada(ag, _h(13, 5))


def test_chegada_nao_vale_para_agendamento_recusado(base, marcos, fornecedor_id):
    ag = base().agendar(AgendarCommand(fornecedor_id, HOJE, time(15), Acondicionamento.BIG_BAG)).id
    base().decidir_compras(ag, DecisaoCompras.NAO_AUTORIZADO, observacao="Itens divergentes")

    with pytest.raises(ConflitoError, match="'Não autorizado'"):
        marcos().registrar_chegada(ag, _h(13, 0))


def test_chegada_da_descarga_pode_ser_refeita_antes_de_comecar(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1, 2])
    d1, d2 = _descargas(db, ag)

    marcos().registrar_chegada_descarga(d2.id, _h(13, 45))  # voltou à fila para o 2º armazém

    assert _descargas(db, ag)[1].chegada_em == _h(13, 45)
    marcos().registrar_entrada(d1.id, _h(13, 10))
    with pytest.raises(ConflitoError, match="já começou"):
        marcos().registrar_chegada_descarga(d1.id, _h(13, 5))


# ---------------------------------------------------------------- entrada


def test_entrada_exige_a_chegada(autorizado, base, marcos, db):
    ag = autorizado()
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)

    with pytest.raises(RegraDeNegocioError, match="chegada do caminhão"):
        marcos().registrar_entrada(d.id, _h(13, 0))


def test_entrada_nao_pode_ser_anterior_a_chegada(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 30))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)

    with pytest.raises(RegraDeNegocioError, match="anterior à chegada"):
        marcos().registrar_entrada(d.id, _h(13, 29))
    assert _status(db, ag) == StatusAgendamento.AUTORIZADO


def test_entrada_so_uma_vez(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)
    marcos().registrar_entrada(d.id, _h(13, 10))

    with pytest.raises(ConflitoError, match="já foi registrada"):
        marcos().registrar_entrada(d.id, _h(13, 15))


def test_descarga_inexistente(marcos):
    with pytest.raises(NaoEncontradoError):
        marcos().registrar_entrada(999_999)


# ---------------------------------------------------------------- saída


def test_saida_exige_a_entrada(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)

    with pytest.raises(ConflitoError, match="registre a entrada antes da saída"):
        marcos().registrar_saida(d.id, 1, [], _h(13, 30))


def test_segundo_destino_sem_entrada_nao_pode_sair(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1, 2])
    d1, d2 = _descargas(db, ag)
    marcos().registrar_entrada(d1.id, _h(13, 5))

    with pytest.raises(RegraDeNegocioError, match="entrada antes da saída"):
        marcos().registrar_saida(d2.id, 1, [], _h(13, 30))


def test_saida_nao_pode_ser_anterior_a_entrada(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)
    marcos().registrar_entrada(d.id, _h(13, 20))

    with pytest.raises(RegraDeNegocioError, match="anterior à entrada"):
        marcos().registrar_saida(d.id, 1, [], _h(13, 19))


def test_saida_com_equipamento_inexistente_nao_deixa_rastro(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)
    marcos().registrar_entrada(d.id, _h(13, 10))

    with pytest.raises(RegraDeNegocioError, match="Equipamento inválido: 9999"):
        marcos().registrar_saida(d.id, 1, [9999], _h(13, 30))

    (d,) = _descargas(db, ag)
    assert d.saida_em is None and d.quantidade_chapas is None


@pytest.mark.parametrize("chapas", [-1, None])
def test_saida_exige_quantidade_de_chapas_valida(autorizado, base, marcos, db, chapas):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)
    marcos().registrar_entrada(d.id, _h(13, 10))

    with pytest.raises(RegraDeNegocioError, match="quantidade de chapas"):
        marcos().registrar_saida(d.id, chapas, [], _h(13, 30))


def test_zero_chapas_e_valido_para_carga_abaixo_de_500_kg(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [4])
    (d,) = _descargas(db, ag)
    marcos().registrar_entrada(d.id, _h(13, 10))

    marcos().registrar_saida(d.id, 0, [], _h(13, 20))

    assert _descargas(db, ag)[0].quantidade_chapas == 0


# ---------------------------------------------------------------- instantes


def test_rejeita_instante_no_futuro(autorizado, marcos):
    ag = autorizado()

    with pytest.raises(RegraDeNegocioError, match="futuro"):
        marcos().registrar_chegada(ag, _h(14, 30))


def test_rejeita_instante_sem_fuso_horario(autorizado, marcos):
    ag = autorizado()

    with pytest.raises(RegraDeNegocioError, match="fuso"):
        marcos().registrar_chegada(ag, datetime(2026, 10, 5, 13, 0))


# ---------------------------------------------------------------- concorrência


def test_duas_entradas_simultaneas_na_mesma_descarga_so_uma_vence(autorizado, base, marcos, db):
    ag = autorizado()
    marcos().registrar_chegada(ag, _h(13, 0))
    base().definir_destinos(ag, [1])
    (d,) = _descargas(db, ag)
    largada = threading.Barrier(6)

    def tentar(_):
        largada.wait()
        try:
            marcos().registrar_entrada(d.id, _h(13, 10))
            return True
        except ConflitoError:
            return False

    with ThreadPoolExecutor(6) as pool:
        resultados = list(pool.map(tentar, range(6)))

    assert resultados.count(True) == 1
    with db() as sessao:
        entradas = sessao.scalars(
            select(EventoAgendamento).where(EventoAgendamento.detalhe["marco"].astext == "ENTRADA")
        ).all()
    assert len(entradas) == 1


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


def test_http_fluxo_dos_marcos(cliente, fornecedor_id):
    criado = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-05",
            "horario": "15:00",
            "acondicionamento": "PALETIZADO",
            "notas": [{"nfChave": "3" * 44}],
        },
    ).json()
    id_ = criado["id"]
    assert (
        cliente.post(
            f"/api/agendamentos/{id_}/chegada", json={"ocorridoEm": "2026-10-05T13:30:00-03:00"}
        ).status_code
        == 200
    )
    cliente.post(
        f"/api/agendamentos/{id_}/validacao-compras",
        json={"decisao": "AUTORIZADO", "pedidoReferencia": "4500"},
    )
    destinos = cliente.post(f"/api/agendamentos/{id_}/destinos", json={"armazemIds": [1]}).json()
    descarga = destinos["descargas"][0]
    assert descarga["chegadaEm"].startswith("2026-10-05T13:30")

    entrada = cliente.post(
        f"/api/descargas/{descarga['id']}/entrada", json={"ocorridoEm": "2026-10-05T13:40:00-03:00"}
    )
    assert entrada.status_code == 200
    assert entrada.json()["status"] == "EM_DESCARGA"

    saida = cliente.post(
        f"/api/descargas/{descarga['id']}/saida",
        json={"ocorridoEm": "2026-10-05T13:55:00-03:00", "quantidadeChapas": 2, "equipamentoIds": []},
    )
    assert saida.status_code == 200
    corpo = saida.json()
    assert corpo["status"] == "CONCLUIDO" and corpo["statusRotulo"] == "Concluído"
    assert corpo["chegadaEm"].startswith("2026-10-05T13:30")
    assert corpo["descargas"][0]["quantidadeChapas"] == 2


def test_http_erros_dos_marcos(cliente, fornecedor_id):
    id_ = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-05",
            "horario": "15:00",
            "acondicionamento": "PALETIZADO",
            "notas": [{}],
        },
    ).json()["id"]

    sem_fuso = cliente.post(f"/api/agendamentos/{id_}/chegada", json={"ocorridoEm": "2026-10-05T13:30:00"})
    assert sem_fuso.status_code == 400

    sem_chapas = cliente.post("/api/descargas/1/saida", json={"equipamentoIds": []})
    assert sem_chapas.status_code == 400
    assert sem_chapas.json()["codigo"] == "REQUISICAO_INVALIDA"

    assert cliente.post("/api/descargas/999999/entrada", json={}).status_code == 404
    assert cliente.post("/api/agendamentos/999999/chegada", json={}).status_code == 404
