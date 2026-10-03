"""Regra do piso do Boletim Diário de Serviços dos Ensacadores (dossiê, seção 8).

    diárias equivalentes = nº de chapas − 0,5 por meia diária
    valor por diária     = produção total ÷ diárias equivalentes
    se valor por diária < piso: total = piso × diárias equivalentes; complemento = total − produção
    senão:                      total = produção;                    complemento = 0

Os cálculos usam precisão total; só as saídas são arredondadas (2 casas, meio para cima).
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

PISO_DIARIA_COMPLETA = Decimal("90.1731")
_MEIA = Decimal("0.5")
_CENTAVOS = Decimal("0.01")


@dataclass(frozen=True)
class ResultadoPiso:
    producao_total: Decimal
    diarias_equivalentes: Decimal
    valor_por_diaria: Decimal
    total_a_pagar: Decimal
    complemento: Decimal
    abaixo_do_piso: bool


def _centavos(valor: Decimal) -> Decimal:
    return valor.quantize(_CENTAVOS, rounding=ROUND_HALF_UP)


def calcular_piso(
    producao_total: Decimal,
    total_chapas: int,
    meias_diarias: int,
    piso: Decimal = PISO_DIARIA_COMPLETA,
) -> ResultadoPiso:
    if producao_total is None or producao_total < 0:
        raise ValueError("Produção total inválida")
    if total_chapas <= 0:
        raise ValueError("O boletim precisa de ao menos 1 chapa")
    if not 0 <= meias_diarias <= total_chapas:
        raise ValueError("Meias diárias deve estar entre 0 e o total de chapas")

    diarias = Decimal(total_chapas) - _MEIA * meias_diarias
    valor_por_diaria = producao_total / diarias
    abaixo = valor_por_diaria < piso

    total = piso * diarias if abaixo else producao_total
    complemento = total - producao_total if abaixo else Decimal(0)

    return ResultadoPiso(
        producao_total=_centavos(producao_total),
        diarias_equivalentes=diarias,
        valor_por_diaria=_centavos(valor_por_diaria),
        total_a_pagar=_centavos(total),
        complemento=_centavos(complemento),
        abaixo_do_piso=abaixo,
    )
