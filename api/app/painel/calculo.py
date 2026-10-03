"""Cálculo do dimensionamento (sobra/falta de chapas) a partir do histórico. Funções puras, sem banco.

Método (ver docs/relatorio-gerencial.md):

  necessidade do dia  = Σ (recebimentos do armazém × esforço da norma do dossiê)       [pessoa-minutos]
  equilíbrio (b)      = Σ necessidade ÷ Σ chapas líquidas, em TODO o histórico com folha
                        [pessoa-minutos por chapa-dia]
  chapas necessárias  = necessidade do dia ÷ b
  saldo               = chapas líquidas − chapas necessárias   (> 0 sobra; < 0 falta)
  R$                  = saldo em diárias × piso do boletim (R$ 90,1731)

Chapas líquidas = presentes na folha − os da operação de café (outra operação, fora do desafio).

Limite assumido e declarado: o histórico só enxerga o RECEBIMENTO. O carregamento de cooperados divide
a mesma equipe e não foi registrado. Por isso o equilíbrio é relativo ao próprio histórico: o método
mostra se a equipe ACOMPANHOU a demanda ao longo do tempo, não o tamanho absoluto ideal da equipe.
O tamanho absoluto só fecha com o boletim da plataforma (ver dimensionamento_plataforma).
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

# Esforço por recebimento (pessoa-minutos) por armazém, a partir das normas do dossiê (seções 7 e 9).
# O histórico não tem acondicionamento; a premissa por armazém é declarada e pode ser ajustada.
ESFORCO_POR_ARMAZEM: dict[int, tuple[float, str]] = {
    1: (100.0, "Insumos: paletizado, 2 chapas × 50 min (10 paletes × 5 min de ciclo completo)"),
    2: (225.0, "Adubo: carga batida, 5 chapas × 45 min (40 a 50 min para 200 sacas ou 28 t)"),
    3: (17.5, "Pátio de Máquinas: 1 chapa × 17,5 min (15 a 20 min por implemento)"),
    4: (0.0, "Loja: fracionado leve, menos de 500 kg não usa chapa (dossiê, seção 7)"),
}
MIN_DIAS_POR_MES = 10  # mês com menos dias de folha (ex.: jan/2025, 5 dias) é parcial: fora da análise
LIMIAR_SITUACAO = 0.10  # ±10% da equipe do mês para chamar de sobra/falta


@dataclass(frozen=True)
class DiaHistorico:
    data: date
    liquidos: int  # chapas presentes − operação de café
    eventos: dict[int, int]  # armazém -> recebimentos do dia

    @property
    def esforco(self) -> float:
        return sum(n * ESFORCO_POR_ARMAZEM[a][0] for a, n in self.eventos.items() if a in ESFORCO_POR_ARMAZEM)

    @property
    def total_eventos(self) -> int:
        return sum(self.eventos.values())


@dataclass
class Mes:
    mes: str  # AAAA-MM
    dias: int
    liquidos: int
    eventos: int
    esforco: float
    chapas_necessarias: float
    saldo_diarias: float

    @property
    def situacao(self) -> str:
        if self.liquidos == 0:
            return "SEM_DADOS"
        relativo = self.saldo_diarias / self.liquidos
        if relativo > LIMIAR_SITUACAO:
            return "SOBRA"
        if relativo < -LIMIAR_SITUACAO:
            return "FALTA"
        return "EQUILIBRADO"


@dataclass
class Apuracao:
    equilibrio: float  # pessoa-minutos por chapa-dia
    meses: list[Mes] = field(default_factory=list)

    def sobra_diarias(self) -> float:
        return sum(m.saldo_diarias for m in self.meses if m.saldo_diarias > 0)

    def falta_diarias(self) -> float:
        return -sum(m.saldo_diarias for m in self.meses if m.saldo_diarias < 0)


def equilibrio(dias: Sequence[DiaHistorico]) -> float:
    """Pessoa-minutos de recebimento que a equipe processou, em média, por chapa-dia."""
    liquidos = sum(d.liquidos for d in dias)
    return sum(d.esforco for d in dias) / liquidos if liquidos else 0.0


def dias_validos(dias: Sequence[DiaHistorico]) -> list[DiaHistorico]:
    """Só dias úteis de meses com folha suficiente (a análise não mistura mês parcial)."""
    por_mes: dict[str, int] = {}
    for d in dias:
        por_mes[d.data.strftime("%Y-%m")] = por_mes.get(d.data.strftime("%Y-%m"), 0) + 1
    return [d for d in dias if por_mes[d.data.strftime("%Y-%m")] >= MIN_DIAS_POR_MES]


def apurar(dias: Sequence[DiaHistorico], referencia: float) -> Apuracao:
    """Saldo mês a mês contra uma referência de equilíbrio (pessoa-min/chapa-dia)."""
    ap = Apuracao(equilibrio=referencia)
    por_mes: dict[str, list[DiaHistorico]] = {}
    for d in sorted(dias, key=lambda x: x.data):
        por_mes.setdefault(d.data.strftime("%Y-%m"), []).append(d)
    for chave, grupo in por_mes.items():
        liquidos = sum(d.liquidos for d in grupo)
        esforco = sum(d.esforco for d in grupo)
        necessarias = esforco / referencia if referencia else 0.0
        ap.meses.append(
            Mes(
                mes=chave,
                dias=len(grupo),
                liquidos=liquidos,
                eventos=sum(d.total_eventos for d in grupo),
                esforco=esforco,
                chapas_necessarias=necessarias,
                saldo_diarias=liquidos - necessarias,
            )
        )
    return ap


def percentil(valores: Sequence[float], p: float) -> float:
    ordenados = sorted(valores)
    if not ordenados:
        return 0.0
    posicao = (len(ordenados) - 1) * p
    base = int(posicao)
    resto = posicao - base
    return ordenados[base] + ((ordenados[min(base + 1, len(ordenados) - 1)] - ordenados[base]) * resto)


def correlacao(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    """Pearson. None se não há variação em alguma das séries."""
    n = len(xs)
    if n < 3 or n != len(ys):
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / (sxx**0.5 * syy**0.5)


def reais(diarias: float, piso: Decimal) -> Decimal:
    """Diárias equivalentes -> R$, ao piso do boletim. Arredonda só no fim (4 casas, como o dinheiro)."""
    return (Decimal(str(round(diarias, 6))) * piso).quantize(Decimal("0.0001"))
