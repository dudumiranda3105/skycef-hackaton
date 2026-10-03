import pytest

from app.agendamento.domain import STATUS_QUE_LIBERAM_VAGA
from app.agendamento.domain import StatusAgendamento as S


@pytest.mark.parametrize(
    "de,para",
    [
        (S.PENDENTE_COMPRAS, S.AUTORIZADO),
        (S.PENDENTE_COMPRAS, S.NAO_AUTORIZADO),
        (S.AUTORIZADO, S.EM_DESCARGA),
        (S.EM_DESCARGA, S.CONCLUIDO),
    ],
)
def test_fluxo_normal(de, para):
    assert de.pode_ir(para)


@pytest.mark.parametrize(
    "de,para",
    [
        (S.PENDENTE_COMPRAS, S.EM_DESCARGA),  # não descarrega sem a decisão de Compras
        (S.PENDENTE_COMPRAS, S.CONCLUIDO),
        (S.AUTORIZADO, S.CONCLUIDO),
        (S.AUTORIZADO, S.PENDENTE_COMPRAS),
        (S.NAO_AUTORIZADO, S.AUTORIZADO),
    ],
)
def test_nao_pula_etapas_nem_volta(de, para):
    assert not de.pode_ir(para)


@pytest.mark.parametrize("de", [S.PENDENTE_COMPRAS, S.AUTORIZADO])
@pytest.mark.parametrize("para", [S.CANCELADO, S.NAO_RECEBIDO])
def test_pode_cancelar_ou_nao_receber_antes_da_descarga(de, para):
    assert de.pode_ir(para)


@pytest.mark.parametrize("para", [S.CANCELADO, S.NAO_RECEBIDO])
def test_descarga_iniciada_nao_pode_ser_cancelada_nem_recusada(para):
    assert not S.EM_DESCARGA.pode_ir(para)


@pytest.mark.parametrize("status", [S.NAO_AUTORIZADO, S.CONCLUIDO, S.CANCELADO, S.NAO_RECEBIDO])
def test_estados_finais_nao_tem_saida(status):
    assert status.proximos() == frozenset()


def test_nenhum_estado_transita_para_si_mesmo():
    assert all(not s.pode_ir(s) for s in S)


def test_so_os_estados_finais_sem_descarga_liberam_a_vaga():
    assert STATUS_QUE_LIBERAM_VAGA == {S.CANCELADO, S.NAO_AUTORIZADO, S.NAO_RECEBIDO}
    for status in S:
        assert status.ocupa_vaga() == (status not in STATUS_QUE_LIBERAM_VAGA)


def test_todo_status_tem_rotulo_em_portugues():
    assert S.PENDENTE_COMPRAS.rotulo == "Aguardando Compras"
    assert S.NAO_AUTORIZADO.rotulo == "Não autorizado"
    assert all(s.rotulo for s in S)
