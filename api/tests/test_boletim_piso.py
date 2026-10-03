"""Cálculo do boletim contra os casos do dossiê (seção 8) e do CLAUDE.md (seção 5).

Exemplo oficial: Armazém de Adubo, 17/11/2025 — 2.778 Fertilizantes (2.378 descarga + 400 remoção),
30 Agroquímico e 40 Serviços diversos, tudo a R$ 0,3224; 11 chapas em diária completa.
"""

from decimal import Decimal

import pytest

from app.boletim.domain import (
    MAX_CHAPAS_POR_BOLETIM,
    PISO_DIARIA_COMPLETA,
    LinhaProducao,
    SituacaoBoletim,
    arredondar_exibicao,
    calcular_boletim,
    calcular_piso,
    producao_total,
    validar_equipe,
)

PRECO = Decimal("0.3224")
LINHAS_ADUBO = [
    LinhaProducao(PRECO, descarga=2378, remocao=400),  # Fertilizantes
    LinhaProducao(PRECO, descarga=30),  # Agroquímico
    LinhaProducao(PRECO, remocao=40),  # Serviços diversos
]
PRODUCAO_ADUBO = Decimal("918.1952")  # 2.848 x 0,3224


def test_producao_do_exemplo_oficial():
    assert producao_total(LINHAS_ADUBO) == PRODUCAO_ADUBO
    assert arredondar_exibicao(PRODUCAO_ADUBO) == Decimal("918.20")


def test_exemplo_do_dossie_11_completas_paga_o_piso_com_complemento():
    r = calcular_boletim(LINHAS_ADUBO, completas=11, meias=0)

    assert r.situacao == SituacaoBoletim.CONSISTENTE
    assert r.producao_total == Decimal("918.1952")
    assert r.diarias_equivalentes == Decimal("11")
    assert r.valor_por_diaria == Decimal("83.4723")
    assert r.total_a_pagar == Decimal("991.9041")
    assert r.complemento == Decimal("73.7089")
    assert r.abaixo_do_piso is True
    # o que a Cocapec vê na tela (R$)
    assert arredondar_exibicao(r.valor_por_diaria) == Decimal("83.47")
    assert arredondar_exibicao(r.total_a_pagar) == Decimal("991.90")
    assert arredondar_exibicao(r.complemento) == Decimal("73.71")


def test_variacao_do_dossie_10_completas_e_uma_meia():
    r = calcular_boletim(LINHAS_ADUBO, completas=10, meias=1)

    assert r.diarias_equivalentes == Decimal("10.5")
    assert r.valor_por_diaria == Decimal("87.4472")
    assert r.total_a_pagar == Decimal("946.8176")
    assert r.complemento == Decimal("28.6224")
    assert arredondar_exibicao(r.valor_por_diaria) == Decimal("87.45")
    assert arredondar_exibicao(r.total_a_pagar) == Decimal("946.82")
    assert arredondar_exibicao(r.complemento) == Decimal("28.62")


def test_total_e_sempre_producao_mais_complemento():
    for completas, meias in [(11, 0), (10, 1), (7, 4), (1, 1)]:
        r = calcular_boletim(LINHAS_ADUBO, completas, meias)
        assert r.total_a_pagar == r.producao_total + r.complemento


def test_acima_do_piso_nao_ha_teto_e_nao_ha_complemento():
    r = calcular_piso(Decimal("2000"), completas=11, meias=0)

    assert r.abaixo_do_piso is False
    assert r.total_a_pagar == Decimal("2000.0000")
    assert r.complemento == Decimal("0.0000")


def test_valor_exatamente_igual_ao_piso_nao_gera_complemento():
    r = calcular_piso(PISO_DIARIA_COMPLETA * 4, completas=4, meias=0)

    assert r.abaixo_do_piso is False
    assert r.complemento == Decimal("0.0000")


def test_producao_zero_com_equipe_paga_o_piso_inteiro_como_complemento():
    r = calcular_piso(Decimal("0"), completas=2, meias=0)

    assert r.total_a_pagar == Decimal("180.3462")  # 2 x 90,1731
    assert r.complemento == Decimal("180.3462")


def test_so_meias_diarias():
    r = calcular_piso(Decimal("10"), completas=0, meias=3)

    assert r.diarias_equivalentes == Decimal("1.5")
    assert r.total_a_pagar == Decimal("135.2597")  # 1,5 x 90,1731 = 135,25965


@pytest.mark.parametrize("producao", [Decimal("0"), Decimal("918.1952")])
def test_sem_equipe_o_boletim_e_inconsistente_e_nao_divide(producao):
    r = calcular_piso(producao, completas=0, meias=0)

    assert r.situacao == SituacaoBoletim.INCONSISTENTE
    assert (r.valor_por_diaria, r.total_a_pagar, r.complemento, r.abaixo_do_piso) == (None, None, None, None)
    assert r.producao_total == producao.quantize(Decimal("0.0001"))


def test_aceita_piso_customizado_editavel():
    r = calcular_piso(Decimal("100"), completas=2, meias=0, piso=Decimal("60"))

    assert r.total_a_pagar == Decimal("120.0000")
    assert r.complemento == Decimal("20.0000")


def test_linha_soma_as_tres_modalidades():
    linha = LinhaProducao(Decimal("0.1824"), descarga=100, remocao=20, transferencia=5)

    assert linha.quantidade_total == 125
    assert linha.valor == Decimal("22.8000")


def test_custo_da_operacao_nao_usa_os_outros_valores_de_diaria():
    # R$ 180 (com encargos) e R$ 99-113 (diária base da folha) não entram na conta
    r = calcular_piso(Decimal("0"), completas=1, meias=0)

    assert r.total_a_pagar == Decimal("90.1731")


@pytest.mark.parametrize(
    "chamada",
    [
        lambda: calcular_piso(Decimal("-1"), 2, 0),
        lambda: calcular_piso(Decimal("1"), -1, 0),
        lambda: calcular_piso(Decimal("1"), 1, -1),
        lambda: LinhaProducao(PRECO, descarga=-1),
        lambda: LinhaProducao(Decimal("-0.1")),
    ],
)
def test_rejeita_entradas_negativas(chamada):
    with pytest.raises(ValueError):
        chamada()


def test_equipe_tem_no_maximo_20_chapas():
    validar_equipe([f"CHAPA_{i:02d}" for i in range(MAX_CHAPAS_POR_BOLETIM)])  # 20: ok

    with pytest.raises(ValueError, match="no máximo 20"):
        validar_equipe([f"CHAPA_{i:02d}" for i in range(MAX_CHAPAS_POR_BOLETIM + 1)])


def test_matricula_nao_repete_dentro_do_mesmo_boletim():
    with pytest.raises(ValueError, match="duas vezes"):
        validar_equipe(["CHAPA_01", "CHAPA_02", "CHAPA_01"])
