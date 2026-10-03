"""Serviço de agendamento contra o PostgreSQL real. Relógio fixo: segunda-feira 05/10/2026, 10h00."""

from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.agendamento.domain import (
    Acondicionamento,
    DecisaoCompras,
    StatusAgendamento,
    StatusVagaLiberada,
)
from app.agendamento.models import Agendamento, EventoAgendamento, NotaFiscal, VagaLiberada
from app.agendamento.service import AgendamentoService, AgendarCommand, NotaFiscalCmd
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.shared.domain import Origem

HOJE = date(2026, 10, 5)  # segunda
AMANHA = date(2026, 10, 6)  # terça
SABADO = date(2026, 10, 10)
DOMINGO = date(2026, 10, 11)
FERIADO = date(2026, 10, 12)  # segunda, Nossa Senhora Aparecida (seed da V3)
H08, H10, H13 = time(8), time(10), time(13)
B, P, G = Acondicionamento.BATIDO, Acondicionamento.PALETIZADO, Acondicionamento.BIG_BAG


@pytest.fixture
def agendar(db, relogio, fornecedor_id):
    """Agenda em uma sessão nova a cada chamada, como faria cada requisição."""

    def _agendar(data=AMANHA, horario=H08, acond=P, nf_chave=None, nf_numero=None, **extra):
        notas = extra.pop("notas", None)
        if notas is None:
            notas = (
                (NotaFiscalCmd(nf_chave=nf_chave, nf_numero=nf_numero),) if (nf_chave or nf_numero) else ()
            )
        cmd = AgendarCommand(
            fornecedor_id=extra.pop("fornecedor_id", fornecedor_id),
            data=data,
            horario=horario,
            acondicionamento=acond,
            notas=tuple(notas),
            **extra,
        )
        with db() as sessao:
            return AgendamentoService(sessao, relogio).agendar(cmd)

    return _agendar


def test_agenda_com_sucesso_e_grava_o_evento_de_auditoria(agendar, db):
    criado = agendar()

    assert criado.id is not None
    assert criado.status == StatusAgendamento.PENDENTE_COMPRAS
    assert criado.origem == Origem.PLATAFORMA
    assert criado.limite_ignorado is False
    with db() as sessao:
        gravado = sessao.get(Agendamento, criado.id)
        assert gravado.data_agendada == AMANHA and gravado.horario == H08
        eventos = list(sessao.scalars(select(EventoAgendamento)))
        assert len(eventos) == 1
        assert eventos[0].de_status is None
        assert eventos[0].para_status == StatusAgendamento.PENDENTE_COMPRAS


def test_dados_sobrevivem_a_uma_nova_sessao(agendar, db):
    criado = agendar(nf_chave="1" * 44, nf_numero="123")

    with db() as sessao:  # "gravado e recuperado"
        lido = sessao.get(Agendamento, criado.id)
        assert lido.criado_em.isoformat().startswith("2026-10-05T10:00")
        nota = sessao.scalars(select(NotaFiscal).where(NotaFiscal.agendamento_id == criado.id)).one()
        assert nota.nf_chave == "1" * 44
        assert nota.nf_numero == "123"
        assert nota.ativa is True


def test_um_agendamento_pode_ter_varias_notas_fiscais(agendar, db):
    criado = agendar(
        notas=[
            NotaFiscalCmd(nf_chave="7" * 44, nf_numero="1", peso_total_kg=Decimal("1200.5")),
            NotaFiscalCmd(nf_chave="8" * 44, nf_numero="2", peso_total_kg=Decimal("800")),
        ]
    )

    with db() as sessao:
        notas = list(sessao.scalars(select(NotaFiscal).where(NotaFiscal.agendamento_id == criado.id)))
        assert sorted(n.nf_numero for n in notas) == ["1", "2"]
        assert sum(n.peso_total_kg for n in notas) == Decimal("2000.5")


def test_rejeita_a_mesma_nota_repetida_no_pedido(agendar):
    with pytest.raises(RegraDeNegocioError, match="mais de uma vez"):
        agendar(notas=[NotaFiscalCmd(nf_chave="5" * 44), NotaFiscalCmd(nf_chave="5" * 44)])


def test_anexo_da_nota_fica_gravado_com_o_tamanho(agendar, db):
    criado = agendar(
        notas=[NotaFiscalCmd(arquivo_nome="nota.xml", content_type="application/xml", conteudo=b"<nfe/>")]
    )

    with db() as sessao:
        nota = sessao.scalars(select(NotaFiscal).where(NotaFiscal.agendamento_id == criado.id)).one()
        assert (nota.arquivo_nome, nota.content_type, nota.tamanho_bytes) == (
            "nota.xml",
            "application/xml",
            6,
        )
        assert nota.conteudo == b"<nfe/>"


def test_rejeita_data_passada(agendar):
    with pytest.raises(RegraDeNegocioError, match="passada"):
        agendar(data=date(2026, 10, 2))


@pytest.mark.parametrize("dia", [SABADO, DOMINGO])
def test_rejeita_fim_de_semana(agendar, dia):
    with pytest.raises(RegraDeNegocioError, match="sábados e domingos"):
        agendar(data=dia)


def test_rejeita_feriado_cadastrado(agendar):
    with pytest.raises(RegraDeNegocioError, match="Aparecida"):
        agendar(data=FERIADO)


def test_rejeita_horario_fora_da_grade(agendar):
    with pytest.raises(RegraDeNegocioError, match="Horário inválido"):
        agendar(horario=time(9))


def test_rejeita_horario_que_ja_passou_hoje(agendar):
    with pytest.raises(RegraDeNegocioError, match="já passou"):
        agendar(data=HOJE, horario=H08)


def test_caminhao_sem_aviso_pode_agendar_na_hora_em_horario_iniciado(agendar):
    criado = agendar(data=HOJE, horario=H08, agendado_na_hora=True)

    assert criado.agendado_na_hora is True


def test_hoje_em_horario_futuro_e_permitido(agendar):
    assert agendar(data=HOJE, horario=H13).id is not None


def test_limite_de_dois_caminhoes_por_horario(agendar):
    agendar(acond=P)
    agendar(acond=G)

    with pytest.raises(ConflitoError, match="limite de 2"):
        agendar(acond=P)


def test_a_vaga_e_da_cooperativa_inteira_e_nao_de_um_armazem(agendar, db):
    # dois fornecedores diferentes disputam o mesmo horário: o limite é global
    with db() as sessao:
        from app.cadastros.models import Fornecedor

        outro = Fornecedor(razao_social="Outro Fornecedor")
        sessao.add(outro)
        sessao.commit()
        outro_id = outro.id
    agendar(acond=P)
    agendar(acond=G, fornecedor_id=outro_id)

    with pytest.raises(ConflitoError):
        agendar(acond=P)


def test_ocupacao_de_outro_horario_nao_conta(agendar):
    agendar(horario=H10, acond=P)
    agendar(horario=H10, acond=G)

    assert agendar(horario=H08, acond=P).horario == H08


def test_carga_batida_exige_o_horario_livre(agendar):
    agendar(acond=P)

    with pytest.raises(ConflitoError, match="carga batida exige"):
        agendar(acond=B)


def test_horario_com_carga_batida_fica_reservado_so_para_ela(agendar):
    agendar(acond=B)

    with pytest.raises(ConflitoError, match="carga batida"):
        agendar(acond=P)


def test_cancelamento_libera_a_vaga(agendar, db):
    primeiro = agendar(acond=P)
    agendar(acond=G)
    with db() as sessao:
        sessao.get(Agendamento, primeiro.id).status = StatusAgendamento.CANCELADO
        sessao.commit()

    assert agendar(acond=P).id is not None


def test_vaga_cancelada_ainda_em_aberto_continua_ocupada(agendar, db, relogio):
    # o responsável do armazém ainda não decidiu quem ocupa a vaga liberada
    cancelado = agendar(acond=B)
    with db() as sessao:
        sessao.get(Agendamento, cancelado.id).status = StatusAgendamento.CANCELADO
        sessao.add(
            VagaLiberada(
                data_vaga=AMANHA,
                horario=H08,
                acondicionamento=B,
                origem_agendamento_id=cancelado.id,
                status=StatusVagaLiberada.ABERTA,
                criado_em=relogio.agora(),
            )
        )
        sessao.commit()

    with pytest.raises(ConflitoError):
        agendar(acond=P)

    with db() as sessao:  # quando o armazém devolve a vaga para o público, ela volta a ficar livre
        vaga = sessao.scalars(select(VagaLiberada)).one()
        vaga.status = StatusVagaLiberada.LIBERADA_GERAL
        sessao.commit()
    assert agendar(acond=P).id is not None


def test_rejeita_fornecedor_inexistente(agendar):
    with pytest.raises(NaoEncontradoError, match="Fornecedor"):
        agendar(fornecedor_id=999_999)


def test_rejeita_nota_fiscal_ja_agendada(agendar):
    agendar(nf_chave="2" * 44, horario=H08)

    with pytest.raises(ConflitoError, match="notas fiscais"):
        agendar(nf_chave="2" * 44, horario=H10)


def test_nota_de_agendamento_recusado_pode_ser_agendada_de_novo(agendar, db, relogio):
    primeiro = agendar(nf_chave="3" * 44)
    with db() as sessao:  # Compras recusa: o status libera a vaga e, junto, a nota fiscal
        AgendamentoService(sessao, relogio).decidir_compras(
            primeiro.id, DecisaoCompras.NAO_AUTORIZADO, observacao="Quantidade diferente do pedido"
        )

    assert agendar(nf_chave="3" * 44, horario=H10).id is not None
    with db() as sessao:
        notas = list(sessao.scalars(select(NotaFiscal).order_by(NotaFiscal.id)))
        assert [n.ativa for n in notas] == [False, True]


@pytest.mark.parametrize("chave", ["1" * 43, "1" * 45, "a" * 44])
def test_rejeita_chave_de_acesso_invalida(agendar, chave):
    with pytest.raises(RegraDeNegocioError, match="44 dígitos"):
        agendar(nf_chave=chave)


def test_falha_nao_deixa_registro_pela_metade(agendar, db):
    with pytest.raises(RegraDeNegocioError):
        agendar(data=SABADO)

    with db() as sessao:
        assert sessao.scalars(select(Agendamento)).all() == []
        assert sessao.scalars(select(EventoAgendamento)).all() == []


def test_consulta_da_grade_mostra_o_que_cabe_em_cada_horario(agendar, db, relogio):
    agendar(horario=H08, acond=P)
    agendar(horario=H08, acond=G)
    agendar(horario=H10, acond=B)

    with db() as sessao:
        grade = AgendamentoService(sessao, relogio).consultar_grade(AMANHA)

    assert grade.dia_util and len(grade.slots) == 4
    h08, h10, h13, h15 = grade.slots
    assert (h08.ocupados, h08.aceita_batido, h08.aceita_paletizado_ou_big_bag) == (2, False, False)
    assert (h10.ocupados, h10.aceita_batido, h10.aceita_paletizado_ou_big_bag) == (1, False, False)
    assert (h13.ocupados, h13.aceita_batido, h13.aceita_paletizado_ou_big_bag) == (0, True, True)
    assert h15.horario == time(15)


def test_consulta_da_grade_em_dia_nao_util_nao_oferece_horarios(db, relogio):
    with db() as sessao:
        grade = AgendamentoService(sessao, relogio).consultar_grade(DOMINGO)

    assert not grade.dia_util
    assert grade.slots == []
    assert "domingos" in grade.motivo_indisponivel
