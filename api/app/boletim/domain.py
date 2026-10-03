"""Regra do Boletim Diário de Serviços dos Ensacadores (dossiê, seção 8; CLAUDE.md, seção 5).

    qtd_linha         = descarga + remoção + transferência
    valor_linha       = qtd_linha × preço unitário
    produção total    = Σ valor_linha
    diárias equiv.    = completas + 0,5 × meias
    valor por diária  = produção ÷ diárias equivalentes
    se valor por diária < piso: total = piso × diárias equivalentes; complemento = total − produção
    senão:                      total = produção;                    complemento = 0   (sem teto)
    se diárias equivalentes = 0: NÃO divide; o boletim fica INCONSISTENTE (pendente de conferência)

Dinheiro é sempre Decimal com 4 casas (nunca float). Arredonda-se para 2 casas só na EXIBIÇÃO
(`arredondar_exibicao`). O custo da operação é o `total_a_pagar` do boletim: não usar R$ 180
(custo com encargos) nem R$ 99–113 (diária base da folha).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

PISO_DIARIA_COMPLETA = Decimal("90.1731")
MAX_CHAPAS_POR_BOLETIM = 20
_MEIA = Decimal("0.5")
_QUATRO_CASAS = Decimal("0.0001")
_DUAS_CASAS = Decimal("0.01")


class SituacaoBoletim(StrEnum):
    CONSISTENTE = "CONSISTENTE"
    INCONSISTENTE = "INCONSISTENTE"  # sem equipe: não há como dividir a produção


class TipoDiaria(StrEnum):
    COMPLETA = "COMPLETA"
    MEIA = "MEIA"  # conta 0,5 no cálculo


@dataclass(frozen=True)
class LinhaProducao:
    """Uma linha do boletim: as três modalidades de movimentação de um tipo de item."""

    preco_unitario: Decimal
    descarga: int = 0
    remocao: int = 0
    transferencia: int = 0

    def __post_init__(self) -> None:
        if min(self.descarga, self.remocao, self.transferencia) < 0:
            raise ValueError("As quantidades do boletim não podem ser negativas")
        if self.preco_unitario < 0:
            raise ValueError("O preço unitário não pode ser negativo")

    @property
    def quantidade_total(self) -> int:
        return self.descarga + self.remocao + self.transferencia

    @property
    def valor(self) -> Decimal:
        return self.quantidade_total * self.preco_unitario


@dataclass(frozen=True)
class ResultadoBoletim:
    situacao: SituacaoBoletim
    producao_total: Decimal
    diarias_equivalentes: Decimal
    valor_por_diaria: Decimal | None
    total_a_pagar: Decimal | None
    complemento: Decimal | None
    abaixo_do_piso: bool | None


def _quatro_casas(valor: Decimal) -> Decimal:
    return valor.quantize(_QUATRO_CASAS, rounding=ROUND_HALF_UP)


def arredondar_exibicao(valor: Decimal) -> Decimal:
    """Duas casas, meio para cima: só para mostrar ao usuário (R$ 918,1952 -> R$ 918,20)."""
    return valor.quantize(_DUAS_CASAS, rounding=ROUND_HALF_UP)


def diarias_equivalentes(completas: int, meias: int) -> Decimal:
    if completas < 0 or meias < 0:
        raise ValueError("A quantidade de chapas não pode ser negativa")
    return Decimal(completas) + _MEIA * meias


def producao_total(linhas: Sequence[LinhaProducao]) -> Decimal:
    return sum((linha.valor for linha in linhas), Decimal(0))


def calcular_piso(
    producao: Decimal, completas: int, meias: int, piso: Decimal = PISO_DIARIA_COMPLETA
) -> ResultadoBoletim:
    """Aplica a regra do piso. `completas` e `meias` são quantos chapas fizeram cada tipo de diária."""
    if producao is None or producao < 0:
        raise ValueError("Produção total inválida")
    diarias = diarias_equivalentes(completas, meias)
    if diarias == 0:
        return ResultadoBoletim(
            situacao=SituacaoBoletim.INCONSISTENTE,
            producao_total=_quatro_casas(producao),
            diarias_equivalentes=diarias,
            valor_por_diaria=None,
            total_a_pagar=None,
            complemento=None,
            abaixo_do_piso=None,
        )
    valor_por_diaria = producao / diarias
    abaixo = valor_por_diaria < piso
    total = _quatro_casas(piso * diarias) if abaixo else _quatro_casas(producao)
    return ResultadoBoletim(
        situacao=SituacaoBoletim.CONSISTENTE,
        producao_total=_quatro_casas(producao),
        diarias_equivalentes=diarias,
        valor_por_diaria=_quatro_casas(valor_por_diaria),
        total_a_pagar=total,
        complemento=total - _quatro_casas(producao) if abaixo else Decimal("0.0000"),
        abaixo_do_piso=abaixo,
    )


def calcular_boletim(
    linhas: Sequence[LinhaProducao], completas: int, meias: int, piso: Decimal = PISO_DIARIA_COMPLETA
) -> ResultadoBoletim:
    """Do lançamento (linhas + equipe) ao valor a pagar."""
    return calcular_piso(producao_total(linhas), completas, meias, piso)


def validar_equipe(matriculas: Sequence[str]) -> None:
    """Até 20 chapas por boletim, sem repetir a matrícula DENTRO do boletim. A mesma matrícula pode
    aparecer em boletins de outros armazéns no mesmo dia (a unicidade é só dentro do boletim)."""
    if len(matriculas) > MAX_CHAPAS_POR_BOLETIM:
        raise ValueError(f"Um boletim aceita no máximo {MAX_CHAPAS_POR_BOLETIM} chapas")
    if len(set(matriculas)) != len(matriculas):
        raise ValueError("A mesma matrícula não pode aparecer duas vezes no mesmo boletim")
