"""Casos do dossiê: Armazém de Adubo, 17/11/2025 (seção 8)."""

from decimal import Decimal

import pytest

from app.boletim.domain import PISO_DIARIA_COMPLETA, calcular_piso

# 2.848 unidades x R$ 0,3224
PRODUCAO_ADUBO = Decimal("2848") * Decimal("0.3224")


def test_exemplo_do_dossie_11_chapas_diaria_completa_paga_piso_com_complemento():
    r = calcular_piso(PRODUCAO_ADUBO, 11, 0)

    assert r.producao_total == Decimal("918.20")
    assert r.diarias_equivalentes == Decimal("11")
    assert r.valor_por_diaria == Decimal("83.47")
    assert r.total_a_pagar == Decimal("991.90")
    assert r.complemento == Decimal("73.71")
    assert r.abaixo_do_piso


def test_variacao_do_dossie_uma_meia_diaria():
    r = calcular_piso(PRODUCAO_ADUBO, 11, 1)

    assert r.diarias_equivalentes == Decimal("10.5")
    assert r.valor_por_diaria == Decimal("87.45")
    assert r.total_a_pagar == Decimal("946.82")
    assert r.complemento == Decimal("28.62")


def test_acima_do_piso_nao_ha_teto_e_nao_ha_complemento():
    r = calcular_piso(Decimal("2000.00"), 11, 0)

    assert not r.abaixo_do_piso
    assert r.total_a_pagar == Decimal("2000.00")
    assert r.complemento == Decimal("0")


def test_valor_exatamente_igual_ao_piso_nao_gera_complemento():
    producao = PISO_DIARIA_COMPLETA * 4
    r = calcular_piso(producao, 4, 0)

    assert not r.abaixo_do_piso
    assert r.complemento == Decimal("0")


def test_producao_zero_paga_o_piso_inteiro_como_complemento():
    r = calcular_piso(Decimal("0"), 2, 0)

    assert r.total_a_pagar == Decimal("180.35")  # 2 x 90,1731 = 180,3462
    assert r.complemento == Decimal("180.35")


def test_todas_em_meia_diaria():
    r = calcular_piso(Decimal("10"), 3, 3)

    assert r.diarias_equivalentes == Decimal("1.5")
    assert r.total_a_pagar == Decimal("135.26")  # 1,5 x 90,1731 = 135,25965


def test_saidas_tem_duas_casas_decimais():
    r = calcular_piso(PRODUCAO_ADUBO, 11, 0)

    assert r.total_a_pagar.as_tuple().exponent == -2
    assert r.complemento.as_tuple().exponent == -2


def test_aceita_piso_customizado():
    r = calcular_piso(Decimal("100"), 2, 0, piso=Decimal("60"))

    assert r.total_a_pagar == Decimal("120.00")
    assert r.complemento == Decimal("20.00")


@pytest.mark.parametrize(
    "producao,chapas,meias",
    [(PRODUCAO_ADUBO, 0, 0), (PRODUCAO_ADUBO, 2, 3), (PRODUCAO_ADUBO, 2, -1), (Decimal("-1"), 2, 0)],
)
def test_rejeita_entradas_invalidas(producao, chapas, meias):
    with pytest.raises(ValueError):
        calcular_piso(producao, chapas, meias)
