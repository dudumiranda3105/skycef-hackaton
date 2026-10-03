"""Cálculo do dimensionamento (funções puras): equilíbrio, saldo mensal, situação, correlação e R$."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.painel import calculo
from app.painel.calculo import DiaHistorico

ADUBO, INSUMOS, PATIO, LOJA = 2, 1, 3, 4
PISO = Decimal("90.1731")


def uteis(ano: int, mes: int, n: int, liquidos: int, eventos: dict[int, int]) -> list[DiaHistorico]:
    """n dias úteis consecutivos do mês, todos iguais."""
    dias, d = [], date(ano, mes, 1)
    while len(dias) < n:
        if d.weekday() < 5:
            dias.append(DiaHistorico(d, liquidos, dict(eventos)))
        d += timedelta(days=1)
    return dias


def test_esforco_do_dia_usa_a_norma_de_cada_armazem():
    dia = DiaHistorico(date(2026, 3, 2), 8, {ADUBO: 2, INSUMOS: 3, PATIO: 4, LOJA: 50})

    # Adubo 2×225 + Insumos 3×100 + Pátio 4×17,5 + Loja 50×0 (menos de 500 kg não usa chapa)
    assert dia.esforco == 2 * 225 + 3 * 100 + 4 * 17.5 + 0
    assert dia.total_eventos == 59


def test_equilibrio_e_o_esforco_por_chapa_dia_de_todo_o_historico():
    dias = uteis(2026, 3, 10, 4, {ADUBO: 10}) + uteis(2026, 4, 10, 4, {ADUBO: 30})

    # (10 dias × 2.250 + 10 dias × 6.750) ÷ 80 chapa-dias
    assert calculo.equilibrio(dias) == pytest.approx(1125.0)


def test_equilibrio_sem_chapas_nao_divide_por_zero():
    assert calculo.equilibrio([]) == 0.0
    assert calculo.equilibrio([DiaHistorico(date(2026, 3, 2), 0, {ADUBO: 3})]) == 0.0


def test_mes_de_pouca_demanda_sobra_e_mes_de_pico_falta_com_a_mesma_equipe():
    dias = uteis(2026, 3, 10, 4, {ADUBO: 10}) + uteis(2026, 4, 10, 4, {ADUBO: 30})

    ap = calculo.apurar(dias, calculo.equilibrio(dias))
    marco, abril = ap.meses

    assert marco.chapas_necessarias == pytest.approx(20)  # 22.500 ÷ 1.125
    assert marco.saldo_diarias == pytest.approx(20)  # 40 presentes − 20 necessárias
    assert (marco.situacao, abril.situacao) == ("SOBRA", "FALTA")
    assert abril.saldo_diarias == pytest.approx(-20)


def test_contra_o_proprio_equilibrio_a_soma_dos_saldos_e_zero():
    dias = uteis(2026, 3, 10, 4, {ADUBO: 10}) + uteis(2026, 4, 10, 4, {ADUBO: 30})

    ap = calculo.apurar(dias, calculo.equilibrio(dias))

    assert sum(m.saldo_diarias for m in ap.meses) == pytest.approx(0, abs=1e-9)
    assert ap.sobra_diarias() == pytest.approx(ap.falta_diarias())


@pytest.mark.parametrize(
    ("saldo", "esperado"),
    [(3.9, "EQUILIBRADO"), (-3.9, "EQUILIBRADO"), (4.1, "SOBRA"), (-4.1, "FALTA"), (0, "EQUILIBRADO")],
)
def test_limiar_de_dez_por_cento_da_equipe_do_mes(saldo, esperado):
    mes = calculo.Mes("2026-03", 10, 40, 100, 0.0, 40 - saldo, saldo)  # 40 chapa-dias: 10% = 4

    assert mes.situacao == esperado


def test_mes_sem_chapas_fica_sem_dados():
    assert calculo.Mes("2026-03", 10, 0, 0, 0.0, 0.0, 0.0).situacao == "SEM_DADOS"


def test_mes_parcial_fica_fora_da_analise():
    parcial = uteis(2025, 1, 5, 12, {ADUBO: 3})  # jan/2025 tinha só 5 dias de folha
    cheio = uteis(2026, 3, 10, 4, {ADUBO: 10})

    validos = calculo.dias_validos(parcial + cheio)

    assert {d.data.month for d in validos} == {3}
    assert len(validos) == 10


def test_apurar_agrupa_por_mes_e_ordena():
    dias = uteis(2026, 4, 10, 4, {ADUBO: 30}) + uteis(2026, 3, 10, 4, {ADUBO: 10})

    ap = calculo.apurar(dias, 1000.0)

    assert [m.mes for m in ap.meses] == ["2026-03", "2026-04"]
    assert ap.meses[0].dias == 10 and ap.meses[0].liquidos == 40 and ap.meses[0].eventos == 100


def test_correlacao_de_series_com_relacao_perfeita_e_inversa():
    assert calculo.correlacao([1, 2, 3, 4], [2, 4, 6, 8]) == pytest.approx(1.0)
    assert calculo.correlacao([1, 2, 3, 4], [8, 6, 4, 2]) == pytest.approx(-1.0)


def test_correlacao_sem_variacao_ou_com_poucos_pontos_e_nula():
    assert calculo.correlacao([3, 3, 3, 3], [1, 2, 3, 4]) is None
    assert calculo.correlacao([1, 2], [1, 2]) is None
    assert calculo.correlacao([1, 2, 3], [1, 2]) is None


def test_percentil_interpola():
    assert calculo.percentil([1, 2, 3, 4], 0.5) == pytest.approx(2.5)
    assert calculo.percentil([10], 0.75) == 10
    assert calculo.percentil([], 0.5) == 0.0


def test_reais_valora_ao_piso_em_decimal_com_4_casas():
    assert calculo.reais(20, PISO) == Decimal("1803.4620")
    assert calculo.reais(-20, PISO) == Decimal("-1803.4620")
    assert calculo.reais(10.5, PISO) == Decimal("946.8176")  # a mesma conta do boletim com meia diária
