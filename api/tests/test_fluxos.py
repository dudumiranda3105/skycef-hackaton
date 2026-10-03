"""Reagendamento, cancelamento com vaga liberada e não recebimento.

Relógio fixo (fixture `relogio` do conftest): segunda-feira 05/10/2026, 10h00.
Terça 06, quarta 07 e quinta 08 são dias úteis; sábado 10 e o feriado de 12/10 não.
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.agendamento.cancelamento import CancelamentoService
from app.agendamento.domain import (
    Acondicionamento,
    DecisaoCompras,
    MotivoNaoRecebimento,
    SituacaoCancelamento,
    StatusAgendamento,
    StatusVagaLiberada,
    TipoEvento,
)
from app.agendamento.marcos import MarcosService
from app.agendamento.models import (
    Agendamento,
    Cancelamento,
    Descarga,
    EventoAgendamento,
    NotaFiscal,
    Reagendamento,
    VagaLiberada,
)
from app.agendamento.nao_recebimento import NaoRecebimentoService
from app.agendamento.reagendamento import ReagendamentoService
from app.agendamento.service import AgendamentoService, AgendarCommand, NotaFiscalCmd
from app.core.clock import get_relogio
from app.core.db import get_session
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.main import create_app

FUSO = ZoneInfo("America/Sao_Paulo")
TER, QUA, QUI = date(2026, 10, 6), date(2026, 10, 7), date(2026, 10, 8)
SABADO, FERIADO = date(2026, 10, 10), date(2026, 10, 12)
H08, H10, H13, H15 = time(8), time(10), time(13), time(15)
P, G, B = Acondicionamento.PALETIZADO, Acondicionamento.BIG_BAG, Acondicionamento.BATIDO


@pytest.fixture
def abertas():
    """Sessões abertas pelos testes; fechadas no fim (sessão esquecida segura locks)."""
    sessoes = []
    yield sessoes
    for sessao in sessoes:
        sessao.close()


@pytest.fixture
def S(db, relogio, abertas):
    """Fábrica de serviços, cada chamada com uma sessão nova (como cada requisição)."""

    class Servicos:
        @staticmethod
        def _sessao():
            sessao = db()
            abertas.append(sessao)
            return sessao

        def base(self):
            return AgendamentoService(self._sessao(), relogio)

        def reag(self):
            return ReagendamentoService(self._sessao(), relogio)

        def canc(self):
            return CancelamentoService(self._sessao(), relogio)

        def nao_rec(self):
            return NaoRecebimentoService(self._sessao(), relogio)

        def marcos(self):
            return MarcosService(self._sessao(), relogio)

    return Servicos()


@pytest.fixture
def novo(S, fornecedor_id):
    """Cria um agendamento e devolve o id."""

    def _novo(data=TER, horario=H08, acond=P, **extra) -> int:
        return S.base().agendar(AgendarCommand(fornecedor_id, data, horario, acond, **extra)).id

    return _novo


def _ag(db, agendamento_id) -> Agendamento:
    with db() as sessao:
        return sessao.get(Agendamento, agendamento_id)


def _ocupados(S, data, horario) -> int:
    grade = S.base().consultar_grade(data)
    return next(s.ocupados for s in grade.slots if s.horario == horario)


def _eventos(db, agendamento_id, tipo):
    with db() as sessao:
        return list(
            sessao.scalars(
                select(EventoAgendamento).where(
                    EventoAgendamento.agendamento_id == agendamento_id, EventoAgendamento.tipo == tipo
                )
            )
        )


# ================================================================ reagendamento


def test_reagenda_para_horario_livre_e_guarda_o_historico(S, novo, db):
    ag = novo(TER, H08)

    S.reag().reagendar(ag, QUA, H13, "Fornecedor pediu outra data")

    atual = _ag(db, ag)
    assert (atual.data_agendada, atual.horario) == (QUA, H13)
    assert atual.limite_ignorado is False
    with db() as sessao:
        h = sessao.scalars(select(Reagendamento)).one()
        assert (h.data_anterior, h.horario_anterior) == (TER, H08)
        assert (h.data_nova, h.horario_novo) == (QUA, H13)
        assert h.limite_excedido is False
    (evento,) = _eventos(db, ag, TipoEvento.REAGENDAMENTO)
    assert evento.detalhe["de"] == {"data": "2026-10-06", "horario": "08:00"}
    assert evento.detalhe["para"] == {"data": "2026-10-07", "horario": "13:00"}
    assert _ocupados(S, TER, H08) == 0  # o horário antigo ficou livre
    assert _ocupados(S, QUA, H13) == 1


def test_sem_vaga_no_destino_e_sem_caso_fortuito_nada_muda(S, novo, db):
    novo(QUA, H08, P)
    novo(QUA, H08, G)
    ag = novo(TER, H08, P)

    with pytest.raises(ConflitoError, match="limite de 2"):
        S.reag().reagendar(ag, QUA, H08, "Quero este horário")

    assert (_ag(db, ag).data_agendada, _ag(db, ag).horario) == (TER, H08)
    with db() as sessao:
        assert sessao.scalars(select(Reagendamento)).all() == []


def test_caso_fortuito_pode_exceder_o_limite_e_marca_o_agendamento(S, novo, db):
    novo(QUA, H08, P)
    novo(QUA, H08, G)
    ag = novo(TER, H08, P)

    S.reag().reagendar(ag, QUA, H08, "Chuva forte impediu a descarga", caso_fortuito=True)

    assert _ag(db, ag).limite_ignorado is True
    assert _ocupados(S, QUA, H08) == 3  # excede o limite de 2, por caso fortuito
    with db() as sessao:
        assert sessao.scalars(select(Reagendamento)).one().limite_excedido is True


def test_caso_fortuito_com_vaga_disponivel_nao_marca_excesso(S, novo, db):
    ag = novo(TER, H08)

    S.reag().reagendar(ag, QUA, H10, "Chuva", caso_fortuito=True)

    assert _ag(db, ag).limite_ignorado is False
    with db() as sessao:
        assert sessao.scalars(select(Reagendamento)).one().limite_excedido is False


def test_carga_batida_em_horario_ocupado_so_por_caso_fortuito(S, novo):
    novo(QUA, H08, P)
    ag = novo(TER, H08, B)

    with pytest.raises(ConflitoError, match="carga batida exige"):
        S.reag().reagendar(ag, QUA, H08, "Quero")
    S.reag().reagendar(ag, QUA, H08, "Chuva", caso_fortuito=True)


def test_nao_reagenda_para_o_mesmo_horario(S, novo):
    ag = novo(TER, H08)

    with pytest.raises(RegraDeNegocioError, match="diferente do atual"):
        S.reag().reagendar(ag, TER, H08, "Sem mudança")


@pytest.mark.parametrize(
    "data,horario,mensagem",
    [
        (date(2026, 10, 2), H08, "passada"),
        (SABADO, H08, "sábados e domingos"),
        (FERIADO, H08, "Aparecida"),
        (date(2026, 10, 5), H08, "já passou"),  # hoje às 10h, o horário das 8h já passou
        (QUA, time(9), "Horário inválido"),
    ],
)
def test_destino_precisa_ser_data_e_horario_validos(S, novo, data, horario, mensagem):
    ag = novo(TER, H08)

    with pytest.raises(RegraDeNegocioError, match=mensagem):
        S.reag().reagendar(ag, data, horario, "Motivo", caso_fortuito=True)


def test_reagendamento_exige_motivo(S, novo):
    ag = novo(TER, H08)

    with pytest.raises(RegraDeNegocioError, match="motivo"):
        S.reag().reagendar(ag, QUA, H08, "   ")


def test_nao_reagenda_depois_da_decisao_final(S, novo):
    ag = novo(TER, H08)
    S.base().decidir_compras(ag, DecisaoCompras.NAO_AUTORIZADO, observacao="Itens divergentes")

    with pytest.raises(ConflitoError, match="'Não autorizado'"):
        S.reag().reagendar(ag, QUA, H08, "Tentativa")


def test_nao_reagenda_com_a_descarga_em_andamento(S, novo, db):
    ag = novo(date(2026, 10, 5), H13)
    S.base().decidir_compras(ag, DecisaoCompras.AUTORIZADO, pedido_referencia="1")
    S.base().definir_destinos(ag, [1])
    S.marcos().registrar_chegada(ag, datetime(2026, 10, 5, 9, 0, tzinfo=FUSO))
    with db() as sessao:
        descarga = sessao.scalars(select(Descarga)).one()
    S.marcos().registrar_entrada(descarga.id, datetime(2026, 10, 5, 9, 30, tzinfo=FUSO))

    with pytest.raises(ConflitoError, match="'Descarregando'"):
        S.reag().reagendar(ag, QUA, H08, "Tarde demais")


def test_seis_reagendamentos_simultaneos_para_o_mesmo_horario_deixam_so_duas_vagas(S, novo, db):
    ids = [novo(QUA, h, acond) for h in (H08, H10, H13) for acond in (P, G)]
    largada = threading.Barrier(len(ids))

    def tentar(agendamento_id):
        largada.wait()
        try:
            S.reag().reagendar(agendamento_id, QUI, H08, "Quero o mesmo horário")
            return True
        except ConflitoError:
            return False

    with ThreadPoolExecutor(len(ids)) as pool:
        resultados = list(pool.map(tentar, ids))

    assert resultados.count(True) == 2
    assert _ocupados(S, QUI, H08) == 2


# ================================================================ cancelamento e vagas


def test_solicitar_cancelamento_nao_libera_a_vaga_ainda(S, novo, db):
    ag = novo(TER, H08)

    S.canc().solicitar(ag, "Fornecedor desistiu da entrega")

    assert _ag(db, ag).status == StatusAgendamento.PENDENTE_COMPRAS
    with db() as sessao:
        c = sessao.get(Cancelamento, ag)
        assert c.situacao == SituacaoCancelamento.SOLICITADO and c.efetivado_em is None
        assert sessao.scalars(select(VagaLiberada)).all() == []
    assert _ocupados(S, TER, H08) == 1


def test_solicitacao_exige_motivo_e_so_pode_ser_feita_uma_vez(S, novo):
    ag = novo(TER, H08)
    with pytest.raises(RegraDeNegocioError, match="motivo"):
        S.canc().solicitar(ag, "")
    S.canc().solicitar(ag, "Motivo")

    with pytest.raises(ConflitoError, match="Já existe uma solicitação"):
        S.canc().solicitar(ag, "Outra vez")


def test_nao_ha_o_que_efetivar_sem_solicitacao(S, novo):
    ag = novo(TER, H08)

    with pytest.raises(RegraDeNegocioError, match="Não há solicitação"):
        S.canc().efetivar(ag)


def test_efetivar_cancela_libera_as_notas_e_abre_a_vaga_sem_entregar_a_ninguem(S, novo, db):
    ag = novo(TER, H08, P, notas=(NotaFiscalCmd(nf_chave="4" * 44),))
    novo(TER, H08, G)
    S.canc().solicitar(ag, "Quebra do caminhão")

    S.canc().efetivar(ag)

    assert _ag(db, ag).status == StatusAgendamento.CANCELADO
    with db() as sessao:
        assert sessao.get(Cancelamento, ag).situacao == SituacaoCancelamento.EFETIVADO
        assert sessao.scalars(select(NotaFiscal)).one().ativa is False
        vaga = sessao.scalars(select(VagaLiberada)).one()
        assert (vaga.data_vaga, vaga.horario, vaga.acondicionamento) == (TER, H08, P)
        assert vaga.status == StatusVagaLiberada.ABERTA
    # a vaga continua contando como ocupada: ninguém a pega sozinho
    assert _ocupados(S, TER, H08) == 2
    with pytest.raises(ConflitoError, match="limite de 2"):
        novo(TER, H08, P)


def test_efetivar_duas_vezes(S, novo):
    ag = novo(TER, H08)
    S.canc().solicitar(ag, "Motivo")
    S.canc().efetivar(ag)

    with pytest.raises(ConflitoError):
        S.canc().efetivar(ag)


def test_liberar_geral_devolve_a_vaga_ao_publico(S, novo, db):
    ag = novo(TER, H08, P)
    novo(TER, H08, G)
    S.canc().solicitar(ag, "Motivo")
    S.canc().efetivar(ag)
    (vaga,) = S.canc().listar_vagas(StatusVagaLiberada.ABERTA)

    S.canc().liberar_geral(vaga.id)

    assert _ocupados(S, TER, H08) == 1
    assert novo(TER, H08, P)  # agora cabe
    with pytest.raises(ConflitoError, match="já teve o destino decidido"):
        S.canc().liberar_geral(vaga.id)
    with db() as sessao:
        assert sessao.get(VagaLiberada, vaga.id).decidido_em is not None


def test_armazem_escolhe_quem_ocupa_a_vaga(S, novo, db):
    cancelado = novo(TER, H08, P)
    novo(TER, H08, G)
    escolhido = novo(QUA, H13, P)
    S.canc().solicitar(cancelado, "Motivo")
    S.canc().efetivar(cancelado)
    (vaga,) = S.canc().listar_vagas()

    S.canc().atribuir(vaga.id, escolhido)

    atual = _ag(db, escolhido)
    assert (atual.data_agendada, atual.horario) == (TER, H08)
    with db() as sessao:
        v = sessao.get(VagaLiberada, vaga.id)
        assert v.status == StatusVagaLiberada.ATRIBUIDA and v.atribuida_a_agendamento_id == escolhido
        h = sessao.scalars(select(Reagendamento)).one()
        assert (h.data_anterior, h.horario_anterior) == (QUA, H13)
        assert h.limite_excedido is False
    assert _ocupados(S, TER, H08) == 2  # o escolhido + o outro
    assert _ocupados(S, QUA, H13) == 0  # o horário que ele deixou ficou livre


def test_nao_atribui_quem_nao_cabe_na_vaga(S, novo):
    cancelado = novo(TER, H08, P)
    novo(TER, H08, G)
    batido = novo(QUA, H13, B)
    S.canc().solicitar(cancelado, "Motivo")
    S.canc().efetivar(cancelado)
    (vaga,) = S.canc().listar_vagas()

    with pytest.raises(ConflitoError, match="carga batida exige"):
        S.canc().atribuir(vaga.id, batido)


def test_vaga_so_pode_ser_decidida_uma_vez(S, novo):
    cancelado = novo(TER, H08, P)
    a, b = novo(QUA, H08, P), novo(QUA, H10, P)
    S.canc().solicitar(cancelado, "Motivo")
    S.canc().efetivar(cancelado)
    (vaga,) = S.canc().listar_vagas()
    S.canc().atribuir(vaga.id, a)

    with pytest.raises(ConflitoError, match="já teve o destino decidido"):
        S.canc().atribuir(vaga.id, b)


def test_candidatos_sao_so_os_que_cabem_e_de_outros_horarios(S, novo):
    cancelado = novo(TER, H08, P)
    novo(TER, H08, G)
    cabe = novo(QUA, H13, P)
    novo(QUI, H10, B)  # batido não caberia: o horário tem outra carga
    S.canc().solicitar(cancelado, "Motivo")
    S.canc().efetivar(cancelado)
    (vaga,) = S.canc().listar_vagas()

    ids = [a.id for a in S.canc().candidatos(vaga.id)]

    # só o paletizado de outro horário: o cancelado saiu, o big bag já está nesse horário
    # e a carga batida não cabe onde há outra carga
    assert ids == [cabe]


def test_nao_cancela_com_a_descarga_em_andamento(S, novo, db):
    ag = novo(date(2026, 10, 5), H13)
    S.base().decidir_compras(ag, DecisaoCompras.AUTORIZADO, pedido_referencia="1")
    S.base().definir_destinos(ag, [1])
    S.marcos().registrar_chegada(ag, datetime(2026, 10, 5, 9, 0, tzinfo=FUSO))
    with db() as sessao:
        descarga = sessao.scalars(select(Descarga)).one()
    S.marcos().registrar_entrada(descarga.id, datetime(2026, 10, 5, 9, 30, tzinfo=FUSO))

    with pytest.raises(ConflitoError, match="'Descarregando'"):
        S.canc().solicitar(ag, "Tarde demais")


def test_duas_atribuicoes_simultaneas_da_mesma_vaga_so_uma_vence(S, novo, db):
    cancelado = novo(TER, H08, P)
    novo(TER, H08, G)
    candidatos = [novo(QUA, h, P) for h in (H08, H10, H13)]
    S.canc().solicitar(cancelado, "Motivo")
    S.canc().efetivar(cancelado)
    (vaga,) = S.canc().listar_vagas()
    largada = threading.Barrier(len(candidatos))

    def tentar(agendamento_id):
        largada.wait()
        try:
            S.canc().atribuir(vaga.id, agendamento_id)
            return True
        except ConflitoError:
            return False

    with ThreadPoolExecutor(len(candidatos)) as pool:
        resultados = list(pool.map(tentar, candidatos))

    assert resultados.count(True) == 1
    assert _ocupados(S, TER, H08) == 2


# ================================================================ não recebimento


def test_nao_recebimento_de_agendamento_fecha_o_agendamento_e_libera_a_vaga(S, novo, db):
    ag = novo(TER, H08, P, notas=(NotaFiscalCmd(nf_chave="5" * 44),))

    r = S.nao_rec().registrar(
        MotivoNaoRecebimento.CASO_FORTUITO, agendamento_id=ag, descricao="Rodovia interditada"
    )

    assert _ag(db, ag).status == StatusAgendamento.NAO_RECEBIDO
    assert (r.agendamento_id, r.data, r.motivo) == (ag, TER, MotivoNaoRecebimento.CASO_FORTUITO)
    assert r.fornecedor_id is not None
    assert _ocupados(S, TER, H08) == 0
    with db() as sessao:
        assert sessao.scalars(select(NotaFiscal)).one().ativa is False


def test_motivo_outro_exige_descricao(S, novo):
    ag = novo(TER, H08)

    with pytest.raises(RegraDeNegocioError, match="Descreva o motivo"):
        S.nao_rec().registrar(MotivoNaoRecebimento.OUTRO, agendamento_id=ag, descricao="  ")


def test_sem_agendamento_sem_vaga_vale_para_quem_nao_tem_agendamento(S, novo, fornecedor_id):
    ag = novo(TER, H08)

    with pytest.raises(RegraDeNegocioError, match="sem agendamento"):
        S.nao_rec().registrar(MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA, agendamento_id=ag)

    r = S.nao_rec().registrar(MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA, fornecedor_id=fornecedor_id)
    assert r.agendamento_id is None and r.fornecedor_id == fornecedor_id
    assert r.data == date(2026, 10, 5)  # sem data informada vale o dia de hoje (relógio do servidor)


def test_caminhao_desconhecido_pode_ser_registrado_so_pelo_nome(S):
    r = S.nao_rec().registrar(
        MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA, fornecedor_nome="Transportes Estrela"
    )

    assert r.fornecedor_id is None and r.fornecedor_nome == "Transportes Estrela"


def test_sem_agendamento_exige_algum_fornecedor(S):
    with pytest.raises(RegraDeNegocioError, match="Informe o fornecedor"):
        S.nao_rec().registrar(MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA)
    with pytest.raises(NaoEncontradoError, match="Fornecedor"):
        S.nao_rec().registrar(MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA, fornecedor_id=999_999)


def test_agendamento_ja_encerrado_nao_pode_virar_nao_recebido(S, novo):
    ag = novo(TER, H08)
    S.nao_rec().registrar(MotivoNaoRecebimento.CASO_FORTUITO, agendamento_id=ag)

    with pytest.raises(ConflitoError, match="já está 'Não recebido'"):
        S.nao_rec().registrar(MotivoNaoRecebimento.CASO_FORTUITO, agendamento_id=ag)


def test_listagem_filtra_por_data_e_motivo(S, novo, fornecedor_id):
    S.nao_rec().registrar(MotivoNaoRecebimento.CASO_FORTUITO, agendamento_id=novo(TER, H08))
    S.nao_rec().registrar(MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA, fornecedor_id=fornecedor_id)
    S.nao_rec().registrar(MotivoNaoRecebimento.OUTRO, fornecedor_id=fornecedor_id, descricao="Carga errada")

    assert len(S.nao_rec().listar()) == 3
    assert len(S.nao_rec().listar(data=TER)) == 1
    assert [n.motivo for n in S.nao_rec().listar(motivo=MotivoNaoRecebimento.OUTRO)] == [
        MotivoNaoRecebimento.OUTRO
    ]


# ================================================================ HTTP


@pytest.fixture
def cliente(db, relogio):
    app = create_app()

    def _sessao():
        with db() as sessao:
            yield sessao

    app.dependency_overrides[get_session] = _sessao
    app.dependency_overrides[get_relogio] = lambda: relogio
    return TestClient(app)


def _post_agendamento(cliente, fornecedor_id, data="2026-10-06", horario="08:00", acond="PALETIZADO"):
    resposta = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": data,
            "horario": horario,
            "acondicionamento": acond,
            "notas": [{}],
        },
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()["id"]


def test_http_reagendamento(cliente, fornecedor_id):
    id_ = _post_agendamento(cliente, fornecedor_id)

    ok = cliente.post(
        f"/api/agendamentos/{id_}/reagendamento",
        json={"data": "2026-10-07", "horario": "13:00", "motivo": "Chuva", "casoFortuito": True},
    )

    assert ok.status_code == 200
    assert (ok.json()["data"], ok.json()["horario"]) == ("2026-10-07", "13:00")
    sabado = cliente.post(
        f"/api/agendamentos/{id_}/reagendamento",
        json={"data": "2026-10-10", "horario": "08:00", "motivo": "x"},
    )
    assert sabado.status_code == 422
    sem_motivo = cliente.post(
        f"/api/agendamentos/{id_}/reagendamento", json={"data": "2026-10-08", "horario": "08:00"}
    )
    assert sem_motivo.status_code == 400


def test_http_cancelamento_e_destino_da_vaga(cliente, fornecedor_id):
    cancelado = _post_agendamento(cliente, fornecedor_id, "2026-10-06", "08:00")
    escolhido = _post_agendamento(cliente, fornecedor_id, "2026-10-07", "10:00")

    solicitado = cliente.post(f"/api/agendamentos/{cancelado}/cancelamento", json={"motivo": "Desistência"})
    assert solicitado.status_code == 200
    assert solicitado.json()["cancelamento"]["situacao"] == "SOLICITADO"
    assert solicitado.json()["status"] == "PENDENTE_COMPRAS"

    efetivado = cliente.post(f"/api/agendamentos/{cancelado}/cancelamento/efetivacao")
    assert efetivado.json()["status"] == "CANCELADO"
    assert efetivado.json()["cancelamento"]["situacao"] == "EFETIVADO"

    (vaga,) = cliente.get("/api/vagas-liberadas", params={"situacao": "ABERTA"}).json()
    assert (vaga["data"], vaga["horario"], vaga["status"]) == ("2026-10-06", "08:00", "ABERTA")
    candidatos = cliente.get(f"/api/vagas-liberadas/{vaga['id']}/candidatos").json()
    assert [c["id"] for c in candidatos] == [escolhido]

    atribuido = cliente.post(
        f"/api/vagas-liberadas/{vaga['id']}/atribuicao", json={"agendamentoId": escolhido}
    )
    assert atribuido.status_code == 200
    assert (atribuido.json()["data"], atribuido.json()["horario"]) == ("2026-10-06", "08:00")
    repetida = cliente.post(
        f"/api/vagas-liberadas/{vaga['id']}/atribuicao", json={"agendamentoId": escolhido}
    )
    assert repetida.status_code == 409


def test_http_liberacao_geral_e_vaga_inexistente(cliente, fornecedor_id):
    id_ = _post_agendamento(cliente, fornecedor_id)
    cliente.post(f"/api/agendamentos/{id_}/cancelamento", json={"motivo": "x"})
    cliente.post(f"/api/agendamentos/{id_}/cancelamento/efetivacao")
    (vaga,) = cliente.get("/api/vagas-liberadas").json()

    liberada = cliente.post(f"/api/vagas-liberadas/{vaga['id']}/liberacao-geral")

    assert liberada.status_code == 200 and liberada.json()["status"] == "LIBERADA_GERAL"
    assert cliente.post("/api/vagas-liberadas/999999/liberacao-geral").status_code == 404


def test_http_nao_recebimento(cliente, fornecedor_id):
    id_ = _post_agendamento(cliente, fornecedor_id)

    com_agendamento = cliente.post(
        "/api/nao-recebimentos", json={"motivo": "CASO_FORTUITO", "agendamentoId": id_, "descricao": "Chuva"}
    )
    assert com_agendamento.status_code == 201
    assert com_agendamento.json()["origem"] == "PLATAFORMA"
    assert cliente.get(f"/api/agendamentos/{id_}").json()["status"] == "NAO_RECEBIDO"

    avulso = cliente.post(
        "/api/nao-recebimentos",
        json={"motivo": "SEM_AGENDAMENTO_SEM_VAGA", "fornecedorNome": "Transportes Estrela"},
    )
    assert avulso.status_code == 201 and avulso.json()["agendamentoId"] is None

    sem_descricao = cliente.post(
        "/api/nao-recebimentos", json={"motivo": "OUTRO", "fornecedorId": fornecedor_id}
    )
    assert sem_descricao.status_code == 422

    motivo_invalido = cliente.post("/api/nao-recebimentos", json={"motivo": "PREGUICA", "fornecedorId": 1})
    assert motivo_invalido.status_code == 400

    lista = cliente.get("/api/nao-recebimentos", params={"motivo": "SEM_AGENDAMENTO_SEM_VAGA"}).json()
    assert [n["fornecedorNome"] for n in lista] == ["Transportes Estrela"]
