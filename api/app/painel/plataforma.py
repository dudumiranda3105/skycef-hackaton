"""Indicadores calculados sobre o que a plataforma registra (Tarefas 1 e 2).

Cada número declara sua origem (PLATAFORMA, TESTE ou HISTORICO). Os recortes de data usam o fuso da
cooperativa. Nada é persistido: tudo sai de consultas sobre as tabelas operacionais.
"""

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.boletim.domain import PISO_DIARIA_COMPLETA
from app.core.config import get_settings

LIMIAR_SITUACAO = Decimal("0.10")  # ±10% do piso para chamar de sobra/falta


@dataclass(frozen=True)
class Filtro:
    de: date | None = None
    ate: date | None = None
    armazem_id: int | None = None
    origem: str | None = None  # PLATAFORMA | TESTE | HISTORICO; None = todas

    def parametros(self) -> dict[str, Any]:
        return {
            "de": self.de,
            "ate": self.ate,
            "armazem": self.armazem_id,
            "origem": self.origem,
            "fuso": get_settings().fuso,
        }


# Uma descarga concluída é uma carga recebida. Data = dia da saída, no fuso da cooperativa.
_DESCARGAS = """
    select d.id, d.armazem_id, ar.nome as armazem, a.origem as origem, a.fornecedor_id,
           d.chegada_em, d.entrada_em, d.saida_em, d.quantidade_chapas,
           (d.saida_em at time zone :fuso)::date as dia,
           extract(hour from d.entrada_em at time zone :fuso)::int as hora_entrada,
           extract(isodow from d.saida_em at time zone :fuso)::int as dia_semana
    from descarga d
    join agendamento a on a.id = d.agendamento_id
    join armazem ar on ar.id = d.armazem_id
    where d.saida_em is not null
      and (:de   is null or (d.saida_em at time zone :fuso)::date >= :de)
      and (:ate  is null or (d.saida_em at time zone :fuso)::date <= :ate)
      and (:armazem is null or d.armazem_id = :armazem)
      and (:origem  is null or a.origem = :origem)
"""
_NAO_RECEBIMENTOS = """
    select motivo, count(*) as n
    from nao_recebimento
    where (:de is null or data >= :de) and (:ate is null or data <= :ate)
      and (:origem is null or origem = :origem)
    group by motivo order by n desc
"""
_CUSTO = """
    select count(*) as boletins,
           count(*) filter (where situacao = 'INCONSISTENTE') as inconsistentes,
           coalesce(sum(producao_total), 0) as producao,
           coalesce(sum(total_a_pagar) filter (where situacao = 'CONSISTENTE'), 0) as total_a_pagar,
           coalesce(sum(complemento)   filter (where situacao = 'CONSISTENTE'), 0) as complemento
    from boletim
    where (:de is null or data >= :de) and (:ate is null or data <= :ate)
      and (:armazem is null or armazem_id = :armazem)
      and (:origem is null or origem = :origem)
"""


def _media(valores: list[float]) -> float | None:
    return round(sum(valores) / len(valores), 1) if valores else None


def _minutos(inicio, fim) -> float | None:
    if inicio is None or fim is None:
        return None
    return (fim - inicio).total_seconds() / 60


def indicadores_operacionais(session: Session, f: Filtro) -> dict[str, Any]:
    p = f.parametros()
    descargas = session.execute(text(_sql(_DESCARGAS)), p).mappings().all()

    cargas_dia: dict[tuple[date, int], int] = defaultdict(int)
    por_armazem: dict[int, dict[str, Any]] = {}
    fornecedores: dict[int, int] = defaultdict(int)
    por_hora: dict[int, int] = defaultdict(int)
    por_dia_semana: dict[int, int] = defaultdict(int)
    origens: dict[str, int] = defaultdict(int)
    esperas: list[float] = []
    duracoes: list[float] = []
    chapas: list[float] = []

    for d in descargas:
        arm = por_armazem.setdefault(
            d["armazem_id"],
            {"armazem": d["armazem"], "cargas": 0, "espera": [], "descarga": [], "chapas": [], "dias": set()},
        )
        arm["cargas"] += 1
        arm["dias"].add(d["dia"])
        espera, duracao = _minutos(d["chegada_em"], d["entrada_em"]), _minutos(d["entrada_em"], d["saida_em"])
        if espera is not None:
            esperas.append(espera)
            arm["espera"].append(espera)
        if duracao is not None:
            duracoes.append(duracao)
            arm["descarga"].append(duracao)
        if d["quantidade_chapas"] is not None:
            chapas.append(float(d["quantidade_chapas"]))
            arm["chapas"].append(float(d["quantidade_chapas"]))
        cargas_dia[(d["dia"], d["armazem_id"])] += 1
        fornecedores[d["fornecedor_id"]] += 1
        if d["hora_entrada"] is not None:
            por_hora[d["hora_entrada"]] += 1
        por_dia_semana[d["dia_semana"]] += 1
        origens[d["origem"]] += 1

    nomes_forn: dict[int, str] = {}
    if fornecedores:
        consulta = text("select id, razao_social from fornecedor where id = any(:ids)")
        nomes_forn = {i: nome for i, nome in session.execute(consulta, {"ids": list(fornecedores)})}
    nomes_arm = {i: dados["armazem"] for i, dados in por_armazem.items()}
    custo = session.execute(text(_sql(_CUSTO)), p).mappings().one()
    nao = session.execute(text(_sql(_NAO_RECEBIMENTOS)), p).mappings().all()

    return {
        "filtro": {
            "de": f.de,
            "ate": f.ate,
            "armazemId": f.armazem_id,
            "origem": f.origem or "TODAS",
        },
        "origens": dict(origens),
        "cargasRecebidas": {
            "total": len(descargas),
            "unidade": "descargas concluídas (um caminhão com 2 destinos conta 2)",
            "porDiaEArmazem": [
                {"data": dia, "armazemId": a, "armazem": nomes_arm.get(a), "cargas": n}
                for (dia, a), n in sorted(cargas_dia.items())
            ],
        },
        "tempoMedioEsperaMin": {
            "media": _media(esperas),
            "amostra": len(esperas),
            "definicao": "entrada − chegada",
        },
        "tempoMedioDescargaMin": {
            "media": _media(duracoes),
            "amostra": len(duracoes),
            "definicao": "saída − entrada",
        },
        "chapasPorRecebimento": {
            "media": _media(chapas),
            "amostra": len(chapas),
            "observacao": "intensidade de cada descarga; NÃO é o efetivo do dia (esse vem do boletim)",
        },
        "porArmazem": [
            {
                "armazemId": i,
                "armazem": dados["armazem"],
                "cargas": dados["cargas"],
                "diasComMovimento": len(dados["dias"]),
                "horasOcupadas": round(sum(dados["descarga"]) / 60, 2),
                "esperaMediaMin": _media(dados["espera"]),
                "descargaMediaMin": _media(dados["descarga"]),
                "chapasPorRecebimento": _media(dados["chapas"]),
            }
            for i, dados in sorted(por_armazem.items())
        ],
        "utilizacao": {
            "observacao": "A Cocapec não definiu a fórmula de utilização: mostramos descargas e horas "
            "ocupadas por armazém, sem um percentual 'oficial'.",
        },
        "fornecedoresMaiorVolume": [
            {"fornecedorId": i, "fornecedor": nomes_forn.get(i, str(i)), "recebimentos": n}
            for i, n in sorted(fornecedores.items(), key=lambda kv: -kv[1])[:10]
        ],
        "fornecedoresUnidade": "recebimentos (descargas concluídas); não se soma kg com unidades",
        "movimento": {
            "porHoraDeEntrada": [{"hora": h, "cargas": n} for h, n in sorted(por_hora.items())],
            "porDiaDaSemana": [{"diaSemana": d, "cargas": n} for d, n in sorted(por_dia_semana.items())],
        },
        "naoRecebimentos": [{"motivo": r["motivo"], "quantidade": r["n"]} for r in nao],
        "custoDaOperacao": {
            "totalAPagar": custo["total_a_pagar"],
            "producao": custo["producao"],
            "complemento": custo["complemento"],
            "boletins": custo["boletins"],
            "boletinsInconsistentes": custo["inconsistentes"],
            "definicao": "soma do total a pagar dos boletins (produção, ou piso + complemento). Sem "
            "encargos e sem equipamentos. Boletins INCONSISTENTES ficam de fora.",
        },
    }


# ---------------------------------------------------------------- sobra/falta pelo boletim

_BOLETINS = """
    select b.id, b.data, b.armazem_id, a.nome as armazem, b.producao_total, b.diarias_equivalentes,
           b.total_a_pagar, b.complemento, b.situacao, b.origem
    from boletim b join armazem a on a.id = b.armazem_id
    where (:de is null or b.data >= :de) and (:ate is null or b.data <= :ate)
      and (:armazem is null or b.armazem_id = :armazem)
      and (:origem is null or b.origem = :origem)
    order by b.data, b.armazem_id
"""
_EQUIPE_DUPLICADA = """
    select count(*) as n from (
        select b.data, e.matricula
        from boletim_equipe e join boletim b on b.id = e.boletim_id
        where (:de is null or b.data >= :de) and (:ate is null or b.data <= :ate)
          and (:armazem is null or b.armazem_id = :armazem)
          and (:origem is null or b.origem = :origem)
        group by b.data, e.matricula having count(*) > 1
    ) x
"""
_EFETIVO = """
    select b.data, count(distinct e.matricula) as pessoas
    from boletim_equipe e join boletim b on b.id = e.boletim_id
    where (:de is null or b.data >= :de) and (:ate is null or b.data <= :ate)
      and (:armazem is null or b.armazem_id = :armazem)
      and (:origem is null or b.origem = :origem)
    group by b.data
"""


def _chave_periodo(data: date, agrupar: str) -> str:
    if agrupar == "dia":
        return data.isoformat()
    if agrupar == "semana":
        ano, semana, _ = data.isocalendar()
        return f"{ano}-S{semana:02d}"
    return data.strftime("%Y-%m")


def _situacao(aproveitamento: Decimal | None) -> str:
    if aproveitamento is None:
        return "SEM_DADOS"
    if aproveitamento < 1 - LIMIAR_SITUACAO:
        return "SOBRA"
    if aproveitamento > 1 + LIMIAR_SITUACAO:
        return "FALTA"
    return "EQUILIBRADO"


@dataclass
class _Acum:
    boletins: int = 0
    inconsistentes: int = 0
    diarias: Decimal = Decimal(0)
    producao: Decimal = Decimal(0)
    total: Decimal = Decimal(0)
    complemento: Decimal = Decimal(0)
    falta_diarias: Decimal = Decimal(0)
    falta_reais: Decimal = Decimal(0)
    dias_com_complemento: int = 0
    dias_acima_do_piso: int = 0

    def somar(self, b: Any, piso: Decimal) -> None:
        self.boletins += 1
        if b["situacao"] != "CONSISTENTE":
            self.inconsistentes += 1
            return
        diarias, producao = Decimal(b["diarias_equivalentes"]), Decimal(b["producao_total"])
        self.diarias += diarias
        self.producao += producao
        self.total += Decimal(b["total_a_pagar"])
        complemento = Decimal(b["complemento"])
        self.complemento += complemento
        if complemento > 0:
            self.dias_com_complemento += 1
        acima = producao - piso * diarias
        if acima > 0:  # produziu mais do que o piso garante: demanda acima da equipe do dia
            self.dias_acima_do_piso += 1
            self.falta_reais += acima
            self.falta_diarias += acima / piso

    def saida(self, piso: Decimal) -> dict[str, Any]:
        aproveitamento = (self.producao / (piso * self.diarias)) if self.diarias else None
        return {
            "boletins": self.boletins,
            "boletinsInconsistentes": self.inconsistentes,
            "diariasEquivalentes": self.diarias,
            "producao": self.producao,
            "totalAPagar": self.total,
            "sobraReais": self.complemento,
            "sobraDiarias": (self.complemento / piso).quantize(Decimal("0.01")),
            "faltaReais": self.falta_reais.quantize(Decimal("0.0001")),
            "faltaDiarias": self.falta_diarias.quantize(Decimal("0.01")),
            "diasComComplemento": self.dias_com_complemento,
            "diasAcimaDoPiso": self.dias_acima_do_piso,
            "aproveitamento": None if aproveitamento is None else aproveitamento.quantize(Decimal("0.0001")),
            "situacao": _situacao(aproveitamento),
        }


def dimensionamento_plataforma(
    session: Session, f: Filtro, agrupar: str = "mes", piso: Decimal = PISO_DIARIA_COMPLETA
) -> dict[str, Any]:
    """Sobra/falta de chapas em R$, por armazém e período, a partir dos boletins.

    A produção do boletim já diz quantas diárias ela 'paga': produção ÷ piso. Se a equipe do dia
    foi maior, a diferença é a SOBRA e o complemento é o seu custo exato em R$. Se produziu acima do
    piso, a equipe foi curta para a demanda do dia: a produção excedente é a FALTA (pressão), em R$ e
    em diárias que faltaram. O aproveitamento é produção ÷ (piso × diárias): abaixo de 0,90 = sobra,
    acima de 1,10 = falta."""
    p = f.parametros()
    linhas = session.execute(text(_sql(_BOLETINS)), p).mappings().all()
    por_periodo: dict[tuple[str, int], _Acum] = defaultdict(_Acum)
    por_armazem: dict[int, _Acum] = defaultdict(_Acum)
    nomes: dict[int, str] = {}
    origens: dict[str, int] = defaultdict(int)
    total = _Acum()
    for b in linhas:
        nomes[b["armazem_id"]] = b["armazem"]
        origens[b["origem"]] += 1
        por_periodo[(_chave_periodo(b["data"], agrupar), b["armazem_id"])].somar(b, piso)
        por_armazem[b["armazem_id"]].somar(b, piso)
        total.somar(b, piso)
    efetivo = session.execute(text(_sql(_EFETIVO)), p).mappings().all()
    repetidos = session.execute(text(_sql(_EQUIPE_DUPLICADA)), p).scalar_one()

    return {
        "agrupadoPor": agrupar,
        "piso": piso,
        "filtro": {"de": f.de, "ate": f.ate, "armazemId": f.armazem_id, "origem": f.origem or "TODAS"},
        "origens": dict(origens),
        "total": total.saida(piso),
        "porArmazem": [
            {"armazemId": a, "armazem": nomes[a], **acum.saida(piso)}
            for a, acum in sorted(por_armazem.items())
        ],
        "porPeriodo": [
            {"periodo": per, "armazemId": a, "armazem": nomes[a], **acum.saida(piso)}
            for (per, a), acum in sorted(por_periodo.items())
        ],
        "efetivoDistintoPorDia": [{"data": r["data"], "pessoas": r["pessoas"]} for r in efetivo],
        "alertas": {
            "matriculasEmMaisDeUmBoletimNoMesmoDia": repetidos,
            "observacao": "Se uma matrícula aparece em dois boletins no mesmo dia, cada boletim paga as suas "
            "diárias; o efetivo distinto do dia conta a pessoa uma única vez.",
        },
        "comoLer": "Sobra em R$ = complemento pago (diária garantida sem produção que a justifique). "
        "Falta em R$ = produção acima do piso (equipe curta para a demanda do dia).",
    }


_TIPOS = {"de": "date", "ate": "date", "armazem": "smallint", "origem": "text", "fuso": "text"}


def _sql(consulta: str) -> str:
    """O psycopg 3 faz o bind no servidor: parâmetro NULL sem tipo não resolve. Tipa todos."""
    return re.sub(
        r":(de|ate|armazem|origem|fuso)\b", lambda m: f"cast(:{m.group(1)} as {_TIPOS[m.group(1)]})", consulta
    )
