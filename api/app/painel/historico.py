"""Análise do histórico (origem HISTORICO): demanda por armazém, equipe da folha e dimensionamento.

Unidade de carga: o EVENTO de recebimento = (data, nº do recebimento, armazém físico). A planilha tem uma
linha por ITEM de pedido (41.779 linhas), não por caminhão; contar linhas inflaria a demanda.
Não se usa a coluna de peso: ela é inutilizável (a mediana do Adubo é de ~573 toneladas por recebimento).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.painel import calculo
from app.painel.calculo import DiaHistorico

MESES_SAFRA = (10, 11, 12, 1, 2, 3)  # reforço de pessoal informado pela Cocapec (dossiê, seção 7)

_EVENTOS_POR_DIA = text(
    """
    select h.data_recebimento as data, d.armazem_id, count(distinct h.nr_recebimento) as eventos
    from hist_recebimento_item h
    join deposito_armazem d on d.deposito = h.deposito
    where d.armazem_id is not null and h.data_recebimento is not null
    group by 1, 2
    """
)
_FOLHA = text(
    """
    select data, qtd_presentes - coalesce(qtd_cafe, 0) as liquidos
    from hist_chapa_dia
    where extract(isodow from data) between 1 and 5 and qtd_presentes is not null
    """
)
_NOMES = text("select id, nome from armazem order by id")
_FORA_DO_DOSSIE = text(
    """
    select count(*) filter (where d.armazem_id is null) as fora, count(*) as total
    from hist_recebimento_item h left join deposito_armazem d on d.deposito = h.deposito
    """
)


@dataclass
class Carga:
    dias_folha: list[DiaHistorico]  # dias úteis com folha (base do equilíbrio)
    eventos_por_mes_armazem: dict[tuple[str, int], int]  # toda a série de recebimentos (2022-2026)
    nomes: dict[int, str]
    linhas_fora_do_dossie: int


def carregar(session: Session) -> Carga:
    eventos: dict[date, dict[int, int]] = {}
    por_mes_armazem: dict[tuple[str, int], int] = {}
    for dia, armazem, n in session.execute(_EVENTOS_POR_DIA):
        eventos.setdefault(dia, {})[armazem] = n
        chave = (dia.strftime("%Y-%m"), armazem)
        por_mes_armazem[chave] = por_mes_armazem.get(chave, 0) + n
    folha = [
        DiaHistorico(data=dia, liquidos=int(liquidos), eventos=eventos.get(dia, {}))
        for dia, liquidos in session.execute(_FOLHA)
    ]
    nomes = {int(i): nome for i, nome in session.execute(_NOMES)}
    fora = session.execute(_FORA_DO_DOSSIE).one().fora
    return Carga(sorted(folha, key=lambda d: d.data), por_mes_armazem, nomes, int(fora or 0))


def _estacao(mes: str) -> str:
    return "SAFRA" if int(mes[5:7]) in MESES_SAFRA else "ENTRESSAFRA"


def analisar(carga: Carga, piso: Decimal, de: date | None = None, ate: date | None = None) -> dict:
    """Resultado completo. O equilíbrio é calculado sobre TODO o histórico com folha; `de`/`ate` só
    recortam o que é exibido (senão qualquer recorte daria saldo zero por construção)."""
    base = calculo.dias_validos(carga.dias_folha)
    referencia = calculo.equilibrio(base)
    ap = calculo.apurar(base, referencia)
    meses = [m for m in ap.meses if _no_periodo(m.mes, de, ate)]

    def saida_mes(m: calculo.Mes) -> dict:
        return {
            "mes": m.mes,
            "estacao": _estacao(m.mes),
            "diasUteis": m.dias,
            "recebimentosPorDia": round(m.eventos / m.dias, 2),
            "chapasPorDia": round(m.liquidos / m.dias, 2),
            "chapasNecessariasPorDia": round(m.chapas_necessarias / m.dias, 2),
            "saldoDiarias": round(m.saldo_diarias, 2),
            "saldoReais": calculo.reais(m.saldo_diarias, piso),
            "situacao": m.situacao,
        }

    sobra = sum(m.saldo_diarias for m in meses if m.saldo_diarias > 0)
    falta = -sum(m.saldo_diarias for m in meses if m.saldo_diarias < 0)

    estacoes = []
    for nome in ("SAFRA", "ENTRESSAFRA"):
        grupo = [m for m in meses if _estacao(m.mes) == nome]
        dias = sum(m.dias for m in grupo)
        if not dias:
            continue
        saldo = sum(m.saldo_diarias for m in grupo)
        estacoes.append(
            {
                "estacao": nome,
                "rotulo": "Safra (out a mar)" if nome == "SAFRA" else "Entressafra (abr a set)",
                "diasUteis": dias,
                "recebimentosPorDia": round(sum(m.eventos for m in grupo) / dias, 2),
                "chapasPorDia": round(sum(m.liquidos for m in grupo) / dias, 2),
                "saldoDiarias": round(saldo, 2),
                "saldoReais": calculo.reais(saldo, piso),
            }
        )

    # Participação de cada armazém na necessidade (esforço da norma) no período exibido
    esforco_arm: dict[int, float] = {a: 0.0 for a in calculo.ESFORCO_POR_ARMAZEM}
    eventos_arm: dict[int, int] = {a: 0 for a in calculo.ESFORCO_POR_ARMAZEM}
    ini, fim = (meses[0].mes, meses[-1].mes) if meses else ("", "")
    for d in base:
        if ini <= d.data.strftime("%Y-%m") <= fim:
            for a, n in d.eventos.items():
                eventos_arm[a] += n
                esforco_arm[a] += n * calculo.ESFORCO_POR_ARMAZEM[a][0]
    esforco_total = sum(esforco_arm.values()) or 1.0
    armazens = [
        {
            "armazemId": a,
            "armazem": carga.nomes.get(a, str(a)),
            "recebimentos": eventos_arm[a],
            "esforcoPessoaMinutos": round(esforco_arm[a], 1),
            "participacaoNaNecessidade": round(esforco_arm[a] / esforco_total, 4),
            "parcelaDaSobraReais": calculo.reais(sobra * esforco_arm[a] / esforco_total, piso),
            "parcelaDaFaltaReais": calculo.reais(falta * esforco_arm[a] / esforco_total, piso),
            "premissa": calculo.ESFORCO_POR_ARMAZEM[a][1],
        }
        for a in sorted(calculo.ESFORCO_POR_ARMAZEM)
    ]

    # Robustez: o resultado não depende da ponderação por armazém?
    diarios_equipe = [float(d.liquidos) for d in base]
    corr_ponderada = calculo.correlacao(diarios_equipe, [d.esforco for d in base])
    corr_simples = calculo.correlacao(diarios_equipe, [float(d.total_eventos) for d in base])

    # Cenários de referência: o equilíbrio médio e uma "capacidade demonstrada" (P75 mensal)
    razoes = [m.esforco / m.liquidos for m in ap.meses if m.liquidos]
    cenarios = []
    for nome, ref in (
        ("Equilíbrio médio do histórico", referencia),
        ("Capacidade demonstrada (3º quartil mensal)", calculo.percentil(razoes, 0.75)),
    ):
        outro = calculo.apurar(base, ref)
        sel = [m for m in outro.meses if _no_periodo(m.mes, de, ate)]
        s = sum(m.saldo_diarias for m in sel if m.saldo_diarias > 0)
        f = -sum(m.saldo_diarias for m in sel if m.saldo_diarias < 0)
        cenarios.append(
            {
                "nome": nome,
                "pessoaMinutosPorChapaDia": round(ref, 2),
                "sobraReais": calculo.reais(s, piso),
                "faltaReais": calculo.reais(f, piso),
                "saldoReais": calculo.reais(s - f, piso),
            }
        )

    return {
        "origem": "HISTORICO",
        "periodo": {"de": meses[0].mes if meses else None, "ate": meses[-1].mes if meses else None},
        "piso": piso,
        "equilibrio": {
            "pessoaMinutosPorChapaDia": round(referencia, 2),
            "diasUteisAnalisados": len(base),
            "diasUteisExibidos": sum(m.dias for m in meses),
        },
        "meses": [saida_mes(m) for m in meses],
        "estacoes": estacoes,
        "totais": {
            "sobraDiarias": round(sobra, 2),
            "faltaDiarias": round(falta, 2),
            "sobraReais": calculo.reais(sobra, piso),
            "faltaReais": calculo.reais(falta, piso),
            "saldoReais": calculo.reais(sobra - falta, piso),
        },
        "armazens": armazens,
        "cenarios": cenarios,
        "robustez": {
            "correlacaoEquipeEDemanda": None if corr_ponderada is None else round(corr_ponderada, 3),
            "correlacaoEquipeEDemandaSemPeso": None if corr_simples is None else round(corr_simples, 3),
        },
        "demandaPorMesEArmazem": [
            {"mes": mes, "armazemId": a, "armazem": carga.nomes.get(a, str(a)), "recebimentos": n}
            for (mes, a), n in sorted(carga.eventos_por_mes_armazem.items())
            if _no_periodo(mes, de, ate)
        ],
        "limitacoes": [
            "O histórico só enxerga o recebimento; o carregamento de cooperados divide a mesma equipe e "
            "nunca foi registrado. O equilíbrio é relativo ao próprio histórico: mostra se a equipe "
            "acompanhou a demanda, não o tamanho absoluto ideal. O absoluto vem do boletim da plataforma.",
            "A folha não distingue o armazém de cada chapa: a quebra por armazém reparte o saldo pela "
            "participação de cada um na necessidade (esforço da norma do dossiê).",
            "O esforço por recebimento usa as normas do dossiê (seções 7 e 9) com uma premissa de "
            "acondicionamento por armazém, pois o histórico não registra o acondicionamento.",
            f"{carga.linhas_fora_do_dossie} linhas de depósitos fora do dossiê ficam fora da quebra "
            "por armazém.",
            "Não há folha de agosto e dezembro de 2025 nem de janeiro/2025 completo: esses meses ficam fora.",
        ],
    }


def _no_periodo(mes: str, de: date | None, ate: date | None) -> bool:
    if de is not None and mes < de.strftime("%Y-%m"):
        return False
    return not (ate is not None and mes > ate.strftime("%Y-%m"))


_INDICADORES_FORNECEDORES = text(
    """
    select coalesce(h.fornecedor_nome, h.fornecedor_codigo, 'sem identificação') as fornecedor,
           count(distinct (h.data_recebimento, h.nr_recebimento)) as recebimentos
    from hist_recebimento_item h
    where h.data_recebimento is not null
      and (cast(:de as date) is null or h.data_recebimento >= cast(:de as date))
      and (cast(:ate as date) is null or h.data_recebimento <= cast(:ate as date))
    group by 1 order by 2 desc, 1 limit 10
    """
)
_INDICADORES_DIA_SEMANA = text(
    """
    select extract(isodow from h.data_recebimento)::int as dia_semana,
           count(distinct (h.data_recebimento, h.nr_recebimento)) as recebimentos,
           count(distinct h.data_recebimento) as dias
    from hist_recebimento_item h
    where h.data_recebimento is not null
      and (cast(:de as date) is null or h.data_recebimento >= cast(:de as date))
      and (cast(:ate as date) is null or h.data_recebimento <= cast(:ate as date))
    group by 1 order by 1
    """
)
_INDICADORES_ANO = text(
    """
    select extract(year from h.data_recebimento)::int as ano, d.armazem_id,
           count(distinct (h.data_recebimento, h.nr_recebimento)) as recebimentos
    from hist_recebimento_item h join deposito_armazem d on d.deposito = h.deposito
    where d.armazem_id is not null and h.data_recebimento is not null
      and (cast(:de as date) is null or h.data_recebimento >= cast(:de as date))
      and (cast(:ate as date) is null or h.data_recebimento <= cast(:ate as date))
    group by 1, 2 order by 1, 2
    """
)


def indicadores(session: Session, de: date | None = None, ate: date | None = None) -> dict:
    """Indicadores de recebimento sobre o histórico (origem HISTORICO), por RECEBIMENTO (nunca por linha de
    item, nem somando peso). O histórico não tem horário de chegada/descarga: não há tempo médio nem hora."""
    p = {"de": de, "ate": ate}
    nomes = {int(i): nome for i, nome in session.execute(_NOMES)}
    return {
        "origem": "HISTORICO",
        "unidade": "recebimentos (nº do recebimento na data); um recebimento pode ter vários itens",
        "fornecedoresMaiorVolume": [
            {"fornecedor": f, "recebimentos": int(n)}
            for f, n in session.execute(_INDICADORES_FORNECEDORES, p)
        ],
        "porDiaDaSemana": [
            {
                "diaSemana": int(dia),
                "recebimentos": int(n),
                "dias": int(dias),
                "mediaPorDia": round(n / dias, 1) if dias else None,
            }
            for dia, n, dias in session.execute(_INDICADORES_DIA_SEMANA, p)
        ],
        "porAnoEArmazem": [
            {"ano": int(a), "armazemId": int(arm), "armazem": nomes.get(int(arm)), "recebimentos": int(n)}
            for a, arm, n in session.execute(_INDICADORES_ANO, p)
        ],
        "observacao": "A cooperativa nunca registrou horário de chegada ou de descarga: o histórico não "
        "permite tempos médios nem horários de pico. O dia da semana inclui os 5 sábados com recebimento.",
    }
