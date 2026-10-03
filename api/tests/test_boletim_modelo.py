"""O banco já traz o que a Tarefa 2 precisa: preços, piso e tabelas do boletim.

Estes testes provam que o modelo ORM bate com o schema e que o exemplo oficial do dossiê (Adubo,
17/11/2025) sai certo usando os preços SEMEADOS no banco, não constantes do teste.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.boletim.domain import (
    LinhaProducao,
    SituacaoBoletim,
    TipoDiaria,
    arredondar_exibicao,
    calcular_boletim,
)
from app.boletim.models import Boletim, BoletimEquipe, BoletimProducao, TipoItem
from app.cadastros.models import Chapa
from app.etl.chapas import carregar
from app.shared.domain import Origem
from tests.conftest import SEGUNDA_10H

DIA = date(2025, 11, 17)
ADUBO = 2

# A tabela do CLAUDE.md (seção 5); Sementes e Alimentação animal conferidos no boletim_diario_chapas.xlsx
PRECOS = {
    "SACARIA_MALAS_25": "0.1824",
    "SACARIA_MALAS_40": "0.2635",
    "SACARIA_MALAS_50": "0.3224",
    "SACARIA_FARDO_250": "1.1780",
    "SACARIA_FARDO_500": "2.3561",
    "PECAS": "0.3387",
    "MAQUINAS": "0.3224",
    "AGROQUIMICO": "0.3224",
    "FERTILIZANTES": "0.3224",
    "SEMENTES": "0.3224",
    "MEDICAMENTOS": "0.3387",
    "ALIMENTACAO_ANIMAL": "0.3387",
    "ACESSORIOS": "0.3224",
    "SERVICOS_DIVERSOS": "0.3224",
}
# As 11 chapas do exemplo (matrículas numéricas 158, 137, 35, 155, 161, 15, 69, 13, 75, 74, 79 no papel)
EQUIPE_EXEMPLO = [f"CHAPA_{n}" for n in ("08", "09", "15", "48", "30", "49", "37", "38", "41", "42", "43")]


@pytest.fixture
def sessao(db):
    with db() as s:
        s.execute(text("truncate boletim restart identity cascade"))
        carregar(s, EQUIPE_EXEMPLO + ["CHAPA_01"])
        yield s


def test_os_14_tipos_de_item_e_os_precos_batem_com_o_claude_md(sessao):
    tipos = {t.codigo: t.preco_unitario for t in sessao.scalars(select(TipoItem))}

    assert tipos == {codigo: Decimal(preco) for codigo, preco in PRECOS.items()}


def test_piso_semeado_e_a_diaria_completa_nao_a_de_180(sessao):
    piso = sessao.execute(text("select valor from parametro where chave = 'DIARIA_COMPLETA'")).scalar_one()

    assert piso == Decimal("90.1731")


def test_exemplo_oficial_com_os_precos_do_banco(sessao):
    preco = {t.codigo: t.preco_unitario for t in sessao.scalars(select(TipoItem))}
    linhas = [
        LinhaProducao(preco["FERTILIZANTES"], descarga=2378, remocao=400),
        LinhaProducao(preco["AGROQUIMICO"], descarga=30),
        LinhaProducao(preco["SERVICOS_DIVERSOS"], remocao=40),
    ]

    r = calcular_boletim(linhas, completas=11, meias=0)

    assert arredondar_exibicao(r.producao_total) == Decimal("918.20")
    assert arredondar_exibicao(r.total_a_pagar) == Decimal("991.90")
    assert arredondar_exibicao(r.complemento) == Decimal("73.71")


def _novo_boletim(armazem=ADUBO, data=DIA, **extra) -> Boletim:
    campos = {
        "armazem_id": armazem,
        "data": data,
        "producao_total": Decimal("918.1952"),
        "diarias_equivalentes": Decimal("11.0"),
        "valor_por_diaria": Decimal("83.4723"),
        "total_a_pagar": Decimal("991.9041"),
        "complemento": Decimal("73.7089"),
        "origem": Origem.TESTE,
        "criado_em": SEGUNDA_10H,
        **extra,
    }
    return Boletim(**campos)


def test_grava_e_le_um_boletim_completo(sessao):
    boletim = _novo_boletim()
    sessao.add(boletim)
    sessao.flush()
    sessao.add(
        BoletimProducao(
            boletim_id=boletim.id,
            tipo_item="FERTILIZANTES",
            qtd_descarga=2378,
            qtd_remocao=400,
            preco_unitario=Decimal("0.3224"),
        )
    )
    sessao.add_all(
        BoletimEquipe(boletim_id=boletim.id, matricula=m, tipo_diaria=TipoDiaria.COMPLETA)
        for m in EQUIPE_EXEMPLO
    )
    sessao.commit()

    lido = sessao.scalars(select(Boletim)).one()
    assert (lido.total_a_pagar, lido.complemento, lido.situacao) == (
        Decimal("991.9041"),
        Decimal("73.7089"),
        SituacaoBoletim.CONSISTENTE,
    )
    assert len(sessao.scalars(select(BoletimEquipe)).all()) == 11
    assert sessao.scalars(select(BoletimProducao)).one().qtd_transferencia == 0


def test_um_boletim_por_armazem_por_dia(sessao):
    sessao.add(_novo_boletim())
    sessao.commit()
    sessao.add(_novo_boletim())

    with pytest.raises(IntegrityError):
        sessao.commit()


def test_outro_armazem_ou_outro_dia_pode(sessao):
    sessao.add_all([_novo_boletim(), _novo_boletim(armazem=1), _novo_boletim(data=date(2025, 11, 18))])
    sessao.commit()

    assert len(sessao.scalars(select(Boletim)).all()) == 3


def test_a_mesma_matricula_pode_estar_em_dois_armazens_no_mesmo_dia(sessao):
    a, b = _novo_boletim(armazem=1), _novo_boletim(armazem=2)
    sessao.add_all([a, b])
    sessao.flush()
    sessao.add_all(
        [
            BoletimEquipe(boletim_id=a.id, matricula="CHAPA_01", tipo_diaria=TipoDiaria.MEIA),
            BoletimEquipe(boletim_id=b.id, matricula="CHAPA_01", tipo_diaria=TipoDiaria.MEIA),
        ]
    )
    sessao.commit()

    assert len(sessao.scalars(select(BoletimEquipe)).all()) == 2


def test_matricula_nao_repete_dentro_do_boletim(sessao):
    boletim = _novo_boletim()
    sessao.add(boletim)
    sessao.flush()
    sessao.add_all(
        [
            BoletimEquipe(boletim_id=boletim.id, matricula="CHAPA_01", tipo_diaria=TipoDiaria.COMPLETA),
            BoletimEquipe(boletim_id=boletim.id, matricula="CHAPA_01", tipo_diaria=TipoDiaria.MEIA),
        ]
    )

    with pytest.raises(IntegrityError):
        sessao.commit()


def test_matricula_precisa_estar_cadastrada(sessao):
    boletim = _novo_boletim()
    sessao.add(boletim)
    sessao.flush()
    sessao.add(BoletimEquipe(boletim_id=boletim.id, matricula="CHAPA_999", tipo_diaria=TipoDiaria.COMPLETA))

    with pytest.raises(IntegrityError):
        sessao.commit()


def test_boletim_inconsistente_nao_guarda_valores_calculados(sessao):
    sessao.add(
        _novo_boletim(
            situacao=SituacaoBoletim.INCONSISTENTE,
            diarias_equivalentes=Decimal("0.0"),
            valor_por_diaria=None,
            total_a_pagar=None,
            complemento=None,
        )
    )
    sessao.commit()

    assert sessao.scalars(select(Boletim)).one().situacao == SituacaoBoletim.INCONSISTENTE


def test_o_banco_recusa_boletim_consistente_sem_total(sessao):
    sessao.add(_novo_boletim(total_a_pagar=None, complemento=None, valor_por_diaria=None))

    with pytest.raises(IntegrityError):
        sessao.commit()


def test_chapa_cadastrado_guarda_o_identificador_como_nome(sessao):
    assert sessao.get(Chapa, "CHAPA_08").nome == "CHAPA_08"
