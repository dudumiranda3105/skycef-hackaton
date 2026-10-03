import pytest

from app.agendamento.domain import StatusAgendamento as S


@pytest.mark.parametrize(
    "de,para",
    [
        (S.AGENDADO, S.VALIDADO_COMPRAS),
        (S.VALIDADO_COMPRAS, S.AUTORIZADO),
        (S.AUTORIZADO, S.CHEGOU),
        (S.CHEGOU, S.EM_DESCARGA),
        (S.EM_DESCARGA, S.CONCLUIDO),
    ],
)
def test_fluxo_normal_ate_concluido(de, para):
    assert de.pode_ir(para)


@pytest.mark.parametrize("de,para", [(S.AGENDADO, S.AUTORIZADO), (S.AGENDADO, S.EM_DESCARGA)])
def test_nao_pula_etapas(de, para):
    assert not de.pode_ir(para)


@pytest.mark.parametrize("para", [S.CANCELADO, S.NAO_RECEBIDO])
def test_descarga_iniciada_nao_pode_ser_cancelada_nem_recusada(para):
    assert not S.EM_DESCARGA.pode_ir(para)


@pytest.mark.parametrize("status", [S.CONCLUIDO, S.CANCELADO, S.NAO_RECEBIDO])
def test_estados_finais_nao_tem_saida(status):
    assert status.proximos() == frozenset()


def test_nenhum_estado_transita_para_si_mesmo():
    assert all(not s.pode_ir(s) for s in S)


@pytest.mark.parametrize("status", [S.CANCELADO, S.NAO_RECEBIDO])
def test_cancelamento_e_nao_recebimento_liberam_a_vaga(status):
    assert not status.ocupa_vaga()


@pytest.mark.parametrize(
    "status", [S.AGENDADO, S.VALIDADO_COMPRAS, S.AUTORIZADO, S.CHEGOU, S.EM_DESCARGA, S.CONCLUIDO]
)
def test_demais_estados_ocupam_vaga(status):
    assert status.ocupa_vaga()
