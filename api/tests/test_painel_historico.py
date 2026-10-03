"""Análise do histórico sobre dados sintéticos de resultado conhecido (PostgreSQL real).

Cenário: 2 meses de 10 dias úteis, sempre 4 chapas. Março: 10 recebimentos/dia no Adubo. Abril: 30.
Esforço do Adubo = 225 pessoa-min por recebimento -> equilíbrio = (10×2.250 + 10×6.750) ÷ 80 = 1.125.
Março precisa de 20 chapa-dias (tem 40): sobram 20. Abril precisa de 60 (tem 40): faltam 20.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.painel import historico
from tests.helpers_painel import dias_uteis, historico_dia, limpar_historico, recebimentos_sem_folha

PISO = Decimal("90.1731")
D = Decimal


@pytest.fixture
def sessao(db):
    with db() as s:
        limpar_historico(s)
        for dia in dias_uteis(2026, 3, 10):
            historico_dia(s, dia, 4, {"MATFerti": 10})
        for dia in dias_uteis(2026, 4, 10):
            historico_dia(s, dia, 4, {"MATFerti": 30})
        yield s


def analisar(sessao, **filtros):
    return historico.analisar(historico.carregar(sessao), PISO, **filtros)


def test_equilibrio_e_calculado_sobre_todo_o_historico(sessao):
    r = analisar(sessao)

    assert r["origem"] == "HISTORICO"
    assert r["equilibrio"]["pessoaMinutosPorChapaDia"] == 1125.0
    assert r["equilibrio"]["diasUteisAnalisados"] == 20


def test_marco_sobra_e_abril_falta(sessao):
    r = analisar(sessao)
    marco, abril = r["meses"]

    assert (marco["mes"], marco["situacao"], marco["saldoDiarias"]) == ("2026-03", "SOBRA", 20.0)
    assert (abril["mes"], abril["situacao"], abril["saldoDiarias"]) == ("2026-04", "FALTA", -20.0)
    assert marco["chapasPorDia"] == 4.0 and marco["recebimentosPorDia"] == 10.0
    assert marco["chapasNecessariasPorDia"] == 2.0  # 20 chapa-dias ÷ 10 dias
    assert abril["chapasNecessariasPorDia"] == 6.0


def test_recebimento_com_varios_itens_conta_uma_vez(sessao):
    # O 1º recebimento de cada dia tem duas linhas na planilha; o evento é um só
    assert analisar(sessao)["meses"][0]["recebimentosPorDia"] == 10.0


def test_totais_em_reais_ao_piso_do_boletim(sessao):
    t = analisar(sessao)["totais"]

    assert t["sobraDiarias"] == 20.0 and t["faltaDiarias"] == 20.0
    assert D(t["sobraReais"]) == D("1803.4620")  # 20 × 90,1731
    assert D(t["faltaReais"]) == D("1803.4620")
    assert D(t["saldoReais"]) == 0


def test_safra_e_entressafra_pelo_calendario_da_cocapec(sessao):
    estacoes = {e["estacao"]: e for e in analisar(sessao)["estacoes"]}

    assert estacoes["SAFRA"]["saldoDiarias"] == 20.0  # março é safra (out a mar)
    assert estacoes["ENTRESSAFRA"]["saldoDiarias"] == -20.0  # abril é entressafra


def test_recorte_de_periodo_nao_muda_o_equilibrio(sessao):
    r = analisar(sessao, de=date(2026, 4, 1))

    assert [m["mes"] for m in r["meses"]] == ["2026-04"]
    assert r["equilibrio"]["pessoaMinutosPorChapaDia"] == 1125.0  # senão qualquer recorte daria saldo zero
    assert r["totais"]["sobraDiarias"] == 0.0 and r["totais"]["faltaDiarias"] == 20.0
    assert r["equilibrio"]["diasUteisExibidos"] == 10


def test_quebra_por_armazem_pela_participacao_na_necessidade(sessao):
    armazens = {a["armazem"]: a for a in analisar(sessao)["armazens"]}

    assert armazens["Adubo"]["recebimentos"] == 400  # 10×10 + 10×30
    assert armazens["Adubo"]["participacaoNaNecessidade"] == 1.0
    assert D(armazens["Adubo"]["parcelaDaSobraReais"]) == D("1803.4620")
    assert armazens["Insumos"]["recebimentos"] == 0 and armazens["Loja"]["participacaoNaNecessidade"] == 0.0


def test_mes_parcial_de_folha_fica_fora(sessao):
    for dia in dias_uteis(2026, 1, 5):  # só 5 dias de folha (como jan/2025 no pacote real)
        historico_dia(sessao, dia, 15, {"MATFerti": 1})

    r = analisar(sessao)

    assert [m["mes"] for m in r["meses"]] == ["2026-03", "2026-04"]
    assert r["equilibrio"]["pessoaMinutosPorChapaDia"] == 1125.0


def test_sabado_da_folha_nao_entra_na_analise(sessao):
    historico_dia(sessao, date(2026, 3, 14), 15, {})  # sábado: a equipe faz organização de estoque

    r = analisar(sessao)

    assert r["equilibrio"]["diasUteisAnalisados"] == 20
    assert r["meses"][0]["saldoDiarias"] == 20.0


def test_chapas_da_operacao_de_cafe_nao_contam(sessao):
    sessao.execute(text("update hist_chapa_dia set qtd_cafe = 2 where data >= '2026-04-01'"))
    sessao.commit()

    r = analisar(sessao)

    # Abril passa a ter 2 chapas líquidas/dia (a equipe disponível para o recebimento caiu)
    assert r["meses"][1]["chapasPorDia"] == 2.0


def test_demanda_mensal_cobre_tambem_meses_sem_folha(sessao):
    recebimentos_sem_folha(sessao, date(2025, 8, 4), "MATFerti", 3)  # ago/2025 não tem folha

    demanda = analisar(sessao)["demandaPorMesEArmazem"]

    assert {"mes": "2025-08", "armazemId": 2, "armazem": "Adubo", "recebimentos": 3} in demanda


def test_deposito_fora_do_dossie_nao_entra_na_quebra_e_e_declarado(sessao):
    recebimentos_sem_folha(sessao, date(2026, 3, 2), "MATIndus", 5)

    r = analisar(sessao)

    assert sum(a["recebimentos"] for a in r["armazens"]) == 400
    assert any("5 linhas de depósitos fora do dossiê" in lim for lim in r["limitacoes"])


def test_cenarios_trazem_o_equilibrio_medio_e_a_capacidade_demonstrada(sessao):
    cenarios = analisar(sessao)["cenarios"]

    assert cenarios[0]["nome"].startswith("Equilíbrio médio")
    assert cenarios[0]["pessoaMinutosPorChapaDia"] == 1125.0 and D(cenarios[0]["saldoReais"]) == 0
    # Capacidade demonstrada (3º quartil mensal) é mais exigente: sobra mais e falta menos
    assert cenarios[1]["pessoaMinutosPorChapaDia"] > 1125.0
    assert D(cenarios[1]["saldoReais"]) > 0


def test_robustez_traz_a_correlacao_entre_equipe_e_demanda(sessao):
    # Equipe constante (4) -> sem variação -> correlação indefinida (None), nunca um número inventado
    assert analisar(sessao)["robustez"]["correlacaoEquipeEDemanda"] is None


def test_historico_vazio_nao_quebra(db):
    with db() as s:
        limpar_historico(s)
        r = historico.analisar(historico.carregar(s), PISO)

    assert r["meses"] == [] and r["periodo"] == {"de": None, "ate": None}
    assert r["totais"]["sobraDiarias"] == 0.0


# ---------------------------------------------------------------- indicadores de recebimento do histórico


def test_indicadores_contam_recebimentos_e_nao_linhas_de_item(sessao):
    i = historico.indicadores(sessao)

    assert i["origem"] == "HISTORICO"
    assert i["fornecedoresMaiorVolume"] == [{"fornecedor": "ACME", "recebimentos": 400}]  # 10×10 + 10×30
    assert i["porAnoEArmazem"] == [{"ano": 2026, "armazemId": 2, "armazem": "Adubo", "recebimentos": 400}]


def test_indicadores_por_dia_da_semana_so_com_dias_que_tiveram_recebimento(sessao):
    por_dia = {x["diaSemana"]: x for x in historico.indicadores(sessao)["porDiaDaSemana"]}

    assert sorted(por_dia) == [1, 2, 3, 4, 5]  # segunda a sexta
    # segundas: 2 e 9/3 (10 por dia) e 6 e 13/4 (30 por dia) -> 80 recebimentos em 4 dias
    assert por_dia[1] == {"diaSemana": 1, "recebimentos": 80, "dias": 4, "mediaPorDia": 20.0}


def test_indicadores_respeitam_o_periodo(sessao):
    i = historico.indicadores(sessao, date(2026, 4, 1), date(2026, 4, 30))

    assert i["fornecedoresMaiorVolume"][0]["recebimentos"] == 300
    assert i["porAnoEArmazem"][0]["recebimentos"] == 300


def test_indicadores_declaram_que_nao_ha_horario_no_historico(sessao):
    assert "nunca registrou horário" in historico.indicadores(sessao)["observacao"]


def test_fornecedor_sem_nome_cai_no_codigo_e_depois_em_sem_identificacao(sessao):
    recebimentos_sem_folha(sessao, date(2026, 3, 2), "MATFerti", 2)  # nome e código nulos

    nomes = [x["fornecedor"] for x in historico.indicadores(sessao)["fornecedoresMaiorVolume"]]

    assert nomes == ["ACME", "sem identificação"]
