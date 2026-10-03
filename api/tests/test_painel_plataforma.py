"""Indicadores e sobra/falta sobre os registros da plataforma (fluxos reais da Tarefa 1 + boletins da 2).

Cenário das descargas (segunda 05/10 e terça 06/10/2026):
  A  seg 08:00 BATIDO     Adubo    chegada 07:50 entrada 08:10 saída 08:55  5 chapas  espera 20, descarga 45
  B  seg 10:00 PALETIZADO Insumos  chegada 10:00 entrada 10:05 saída 10:25  2 chapas  espera  5, descarga 20
  C  ter 13:00 BIG_BAG    Adubo    chegada 13:00 entrada 13:30 saída 14:00  2 chapas  espera 30, descarga 30
  D  qua 15:00 PALETIZADO Insumos  chegou e entrou, mas NÃO terminou: não é carga recebida
"""

from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.agendamento.domain import Acondicionamento, MotivoNaoRecebimento
from app.agendamento.nao_recebimento import NaoRecebimentoService
from app.boletim.domain import TipoDiaria
from app.boletim.service import BoletimService, LancarCommand, LinhaCmd, MembroCmd
from app.core.clock import RelogioFixo
from app.etl.chapas import carregar
from app.painel import plataforma
from app.painel.plataforma import Filtro
from tests.helpers_painel import descarga, em, fornecedor

D = Decimal
SEG, TER, QUA = date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7)
ADUBO, INSUMOS, LOJA = 2, 1, 4
PISO = D("90.1731")
EQUIPE_EXEMPLO = [f"CHAPA_{n:02d}" for n in (8, 9, 15, 48, 30, 49, 37, 38, 41, 42, 43)]


@pytest.fixture
def sessao(db):
    with db() as s:
        s.execute(text("truncate boletim, nao_recebimento restart identity cascade"))
        carregar(s, EQUIPE_EXEMPLO + ["CHAPA_01"])
        yield s


@pytest.fixture
def operacao(sessao):
    f1, f2 = fornecedor(sessao, "Agro Alfa"), fornecedor(sessao, "Agro Beta")
    descarga(sessao, f1, SEG, time(8), Acondicionamento.BATIDO, ADUBO, (7, 50), (8, 10), (8, 55), chapas=5)
    descarga(sessao, f1, SEG, time(10), Acondicionamento.PALETIZADO, INSUMOS, (10, 0), (10, 5), (10, 25))
    descarga(sessao, f2, TER, time(13), Acondicionamento.BIG_BAG, ADUBO, (13, 0), (13, 30), (14, 0))
    descarga(sessao, f2, QUA, time(15), Acondicionamento.PALETIZADO, INSUMOS, (15, 0), (15, 10), None)
    return sessao


def indicadores(s, **filtro):
    return plataforma.indicadores_operacionais(s, Filtro(**filtro))


# ------------------------------------------------------------------ indicadores operacionais


def test_so_descarga_concluida_conta_como_carga_recebida(operacao):
    assert indicadores(operacao)["cargasRecebidas"]["total"] == 3  # a D não terminou


def test_cargas_por_dia_e_armazem(operacao):
    por_dia = indicadores(operacao)["cargasRecebidas"]["porDiaEArmazem"]

    assert [(x["data"], x["armazemId"], x["cargas"]) for x in por_dia] == [
        (SEG, INSUMOS, 1),
        (SEG, ADUBO, 1),
        (TER, ADUBO, 1),
    ]


def test_espera_e_entrada_menos_chegada_e_descarga_e_saida_menos_entrada(operacao):
    i = indicadores(operacao)

    assert i["tempoMedioEsperaMin"] == {
        "media": 18.3,
        "amostra": 3,
        "definicao": "entrada − chegada",
    }  # (20+5+30)/3
    assert i["tempoMedioDescargaMin"]["media"] == 31.7  # (45+20+30)/3
    assert i["tempoMedioDescargaMin"]["amostra"] == 3


def test_chapas_por_recebimento_e_a_media_por_descarga_nao_o_efetivo(operacao):
    c = indicadores(operacao)["chapasPorRecebimento"]

    assert c["media"] == 3.0  # (5+2+2)/3
    assert "NÃO é o efetivo do dia" in c["observacao"]


def test_utilizacao_por_armazem_em_cargas_e_horas_ocupadas(operacao):
    por_armazem = {a["armazem"]: a for a in indicadores(operacao)["porArmazem"]}
    adubo = por_armazem["Adubo"]

    assert (adubo["cargas"], adubo["diasComMovimento"]) == (2, 2)
    assert adubo["horasOcupadas"] == 1.25  # (45 + 30) min
    assert adubo["esperaMediaMin"] == 25.0 and adubo["descargaMediaMin"] == 37.5
    assert adubo["chapasPorRecebimento"] == 3.5
    assert por_armazem["Insumos"]["cargas"] == 1


def test_fornecedores_com_maior_volume_na_unidade_declarada(operacao):
    i = indicadores(operacao)

    assert [(f["fornecedor"], f["recebimentos"]) for f in i["fornecedoresMaiorVolume"]] == [
        ("Agro Alfa", 2),
        ("Agro Beta", 1),
    ]
    assert "não se soma kg com unidades" in i["fornecedoresUnidade"]


def test_horarios_e_dias_de_maior_movimento(operacao):
    mov = indicadores(operacao)["movimento"]

    assert mov["porHoraDeEntrada"] == [
        {"hora": 8, "cargas": 1},
        {"hora": 10, "cargas": 1},
        {"hora": 13, "cargas": 1},
    ]
    assert mov["porDiaDaSemana"] == [
        {"diaSemana": 1, "cargas": 2},
        {"diaSemana": 2, "cargas": 1},
    ]  # seg=1, ter=2


def test_nao_recebimentos_por_motivo(operacao):
    relogio = RelogioFixo(em(SEG, 12))
    servico = NaoRecebimentoService(operacao, relogio)
    f = fornecedor(operacao, "Agro Gama")
    servico.registrar(
        MotivoNaoRecebimento.OUTRO, data=SEG, fornecedor_id=f, descricao="Carroceria danificada"
    )
    servico.registrar(
        MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA, data=TER, fornecedor_nome="Transportadora X"
    )
    servico.registrar(
        MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA, data=TER, fornecedor_nome="Transportadora Y"
    )

    nao = indicadores(operacao)["naoRecebimentos"]

    assert nao == [
        {"motivo": "SEM_AGENDAMENTO_SEM_VAGA", "quantidade": 2},
        {"motivo": "OUTRO", "quantidade": 1},
    ]


def test_filtros_de_armazem_e_periodo(operacao):
    assert indicadores(operacao, armazem_id=ADUBO)["cargasRecebidas"]["total"] == 2
    assert indicadores(operacao, armazem_id=INSUMOS)["cargasRecebidas"]["total"] == 1
    assert indicadores(operacao, de=TER)["cargasRecebidas"]["total"] == 1
    assert indicadores(operacao, ate=SEG)["cargasRecebidas"]["total"] == 2
    assert indicadores(operacao, de=date(2027, 1, 1))["cargasRecebidas"]["total"] == 0


def test_filtro_de_origem_separa_plataforma_de_teste(operacao):
    operacao.execute(text("update agendamento set origem = 'TESTE' where id = 1"))
    operacao.commit()

    assert indicadores(operacao)["origens"] == {"PLATAFORMA": 2, "TESTE": 1}
    assert indicadores(operacao, origem="TESTE")["cargasRecebidas"]["total"] == 1
    assert indicadores(operacao, origem="PLATAFORMA")["cargasRecebidas"]["total"] == 2


def test_sem_registros_devolve_zeros_e_nulos_sem_quebrar(sessao):
    i = indicadores(sessao)

    assert i["cargasRecebidas"]["total"] == 0
    assert i["tempoMedioEsperaMin"]["media"] is None
    assert i["fornecedoresMaiorVolume"] == [] and i["naoRecebimentos"] == []
    assert i["custoDaOperacao"]["totalAPagar"] == 0


# ------------------------------------------------------------------ boletim: custo e sobra/falta


def lancar(sessao, armazem, dia, linhas, equipe, origem=None):
    relogio = RelogioFixo(em(date(2026, 10, 8), 8))
    cmd = LancarCommand(
        armazem,
        dia,
        tuple(LinhaCmd(*x) for x in linhas),
        tuple(MembroCmd(m, t) for m, t in equipe),
    )
    return BoletimService(sessao, relogio).lancar(cmd, **({"origem": origem} if origem else {}))


@pytest.fixture
def boletins(sessao):
    # Adubo: exemplo oficial (918,1952 com 11 chapas): abaixo do piso -> complemento 73,7089
    lancar(
        sessao, ADUBO, SEG,
        [("FERTILIZANTES", 2378, 400, 0), ("AGROQUIMICO", 30, 0, 0), ("SERVICOS_DIVERSOS", 0, 40, 0)],
        [(m, TipoDiaria.COMPLETA) for m in EQUIPE_EXEMPLO],
    )  # fmt: skip
    # Insumos: 1 chapa produziu 322,40 -> acima do piso (sem teto): paga a produção
    lancar(sessao, INSUMOS, SEG, [("FERTILIZANTES", 1000, 0, 0)], [("CHAPA_01", TipoDiaria.COMPLETA)])
    return sessao


def dimensionar(s, agrupar="mes", **filtro):
    return plataforma.dimensionamento_plataforma(s, Filtro(**filtro), agrupar, PISO)


def test_custo_da_operacao_e_a_soma_do_total_a_pagar_dos_boletins(boletins):
    custo = indicadores(boletins)["custoDaOperacao"]

    assert D(custo["totalAPagar"]) == D("991.9041") + D("322.4000")
    assert D(custo["complemento"]) == D("73.7089")
    assert custo["boletins"] == 2 and custo["boletinsInconsistentes"] == 0
    assert "Sem encargos" in custo["definicao"]


def test_boletim_inconsistente_fica_fora_do_custo_mas_e_contado(boletins):
    lancar(boletins, LOJA, SEG, [("PECAS", 500, 0, 0)], [])  # sem equipe: não divide

    custo = indicadores(boletins)["custoDaOperacao"]

    assert custo["boletins"] == 3 and custo["boletinsInconsistentes"] == 1
    assert D(custo["totalAPagar"]) == D("1314.3041")  # só os dois consistentes


def test_sobra_e_o_complemento_pago_e_a_falta_e_a_producao_acima_do_piso(boletins):
    d = dimensionar(boletins)
    por = {a["armazem"]: a for a in d["porArmazem"]}

    assert D(por["Adubo"]["sobraReais"]) == D("73.7089")
    assert D(por["Adubo"]["faltaReais"]) == 0
    assert por["Adubo"]["sobraDiarias"] == D("0.82")  # 73,7089 ÷ 90,1731
    assert D(por["Insumos"]["sobraReais"]) == 0
    assert D(por["Insumos"]["faltaReais"]) == D("232.2269")  # 322,40 − 90,1731
    assert por["Insumos"]["faltaDiarias"] == D("2.58")  # 232,2269 ÷ 90,1731


def test_aproveitamento_e_situacao_por_armazem(boletins):
    por = {a["armazem"]: a for a in dimensionar(boletins)["porArmazem"]}

    # 918,1952 ÷ (90,1731 × 11) = 0,9257: dentro de ±10%
    assert (por["Adubo"]["aproveitamento"], por["Adubo"]["situacao"]) == (D("0.9257"), "EQUILIBRADO")
    # 322,40 ÷ 90,1731 = 3,57535 (arredondado a 4 casas)
    assert (por["Insumos"]["aproveitamento"], por["Insumos"]["situacao"]) == (D("3.5753"), "FALTA")


def test_total_junta_sobra_e_falta_sem_compensar_uma_na_outra(boletins):
    t = dimensionar(boletins)["total"]

    assert D(t["sobraReais"]) == D("73.7089") and D(t["faltaReais"]) == D("232.2269")
    assert t["boletins"] == 2 and t["diasComComplemento"] == 1 and t["diasAcimaDoPiso"] == 1


def test_sobra_diaria_exata_quando_so_ha_sobra(sessao):
    lancar(sessao, ADUBO, SEG, [("PECAS", 100, 0, 0)], [("CHAPA_01", TipoDiaria.COMPLETA)])  # 33,87 < piso

    por = dimensionar(sessao)["porArmazem"][0]

    assert por["situacao"] == "SOBRA"
    assert D(por["sobraReais"]) == D("90.1731") - D("33.8700")  # o complemento do boletim
    assert D(por["faltaReais"]) == 0


def test_agrupa_por_dia_semana_e_mes(boletins):
    semana = date(2026, 10, 5).isocalendar()
    rotulo_semana = f"{semana[0]}-S{semana[1]:02d}"

    assert {p["periodo"] for p in dimensionar(boletins, "dia")["porPeriodo"]} == {"2026-10-05"}
    assert {p["periodo"] for p in dimensionar(boletins, "semana")["porPeriodo"]} == {rotulo_semana}
    assert {p["periodo"] for p in dimensionar(boletins, "mes")["porPeriodo"]} == {"2026-10"}


def test_periodos_separam_o_mesmo_armazem_em_dias_diferentes(sessao):
    lancar(sessao, ADUBO, SEG, [("PECAS", 100, 0, 0)], [("CHAPA_01", TipoDiaria.COMPLETA)])
    lancar(sessao, ADUBO, TER, [("FERTILIZANTES", 1000, 0, 0)], [("CHAPA_01", TipoDiaria.COMPLETA)])

    dias = {p["periodo"]: p["situacao"] for p in dimensionar(sessao, "dia")["porPeriodo"]}

    assert dias == {"2026-10-05": "SOBRA", "2026-10-06": "FALTA"}


def test_efetivo_distinto_do_dia_soma_as_pessoas_dos_boletins_sem_repeticao(boletins):
    d = dimensionar(boletins)

    # 11 chapas do exemplo (Adubo) + CHAPA_01 (Insumos): ninguém repete
    assert d["efetivoDistintoPorDia"] == [{"data": SEG, "pessoas": 12}]
    assert d["alertas"]["matriculasEmMaisDeUmBoletimNoMesmoDia"] == 0


def test_matricula_repetida_em_dois_boletins_conta_uma_vez_no_efetivo(sessao):
    lancar(sessao, ADUBO, SEG, [("PECAS", 100, 0, 0)], [("CHAPA_01", TipoDiaria.COMPLETA)])
    lancar(sessao, INSUMOS, SEG, [("PECAS", 100, 0, 0)], [("CHAPA_01", TipoDiaria.MEIA)])

    d = dimensionar(sessao)

    assert d["alertas"]["matriculasEmMaisDeUmBoletimNoMesmoDia"] == 1
    assert d["efetivoDistintoPorDia"] == [{"data": SEG, "pessoas": 1}]


def test_filtros_do_dimensionamento(boletins):
    assert dimensionar(boletins, armazem_id=ADUBO)["total"]["boletins"] == 1
    assert dimensionar(boletins, de=TER)["total"]["boletins"] == 0
    assert dimensionar(boletins, origem="TESTE")["total"]["boletins"] == 0
    assert dimensionar(boletins)["origens"] == {"PLATAFORMA": 2}


def test_sem_boletins_nao_quebra_e_fica_sem_dados(sessao):
    d = dimensionar(sessao)

    assert d["total"]["boletins"] == 0
    assert d["total"]["situacao"] == "SEM_DADOS" and d["total"]["aproveitamento"] is None
    assert d["porArmazem"] == [] and d["porPeriodo"] == []
