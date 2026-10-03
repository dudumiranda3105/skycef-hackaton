"""Contratos da API do boletim (JSON em camelCase).

O cliente envia só as linhas de produção e a equipe: situação, origem e todos os totais são
calculados pelo servidor (`extra="forbid"` recusa qualquer outro campo). Valores em R$ vão com
4 casas, como strings decimais (nunca float); `exibicao` traz o arredondamento de 2 casas.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field

from app.boletim.domain import SituacaoBoletim, TipoDiaria, arredondar_exibicao
from app.boletim.models import Boletim, TipoItem
from app.boletim.service import (
    Calculo,
    DetalhesBoletim,
    LancarCommand,
    LinhaCalculada,
    LinhaCmd,
    MembroCmd,
    MembroEquipe,
)
from app.cadastros.models import Chapa
from app.shared.domain import Origem
from app.shared.schemas import EsquemaBase, EsquemaEntrada

# Quantidade por modalidade: inteiro não negativo, com folga para o pico mas sem estourar o INTEGER
Quantidade = Annotated[int, Field(ge=0, le=10_000_000)]


class LinhaIn(EsquemaEntrada):
    tipo_item: Annotated[
        str, Field(min_length=1, max_length=30, description="código de GET /api/boletim/tipos-item")
    ]
    descarga: Quantidade = 0
    remocao: Quantidade = 0
    transferencia: Quantidade = 0


class MembroIn(EsquemaEntrada):
    matricula: Annotated[str, Field(min_length=1, max_length=20, description="de GET /api/chapas")]
    tipo_diaria: TipoDiaria


class BoletimIn(EsquemaEntrada):
    """Lançamento do boletim de UM armazém em UM dia. Até 20 chapas (validado no serviço, com 422)."""

    armazem_id: int
    data: Annotated[date, Field(description="dia a que o boletim se refere (normalmente o dia anterior)")]
    linhas: Annotated[list[LinhaIn], Field(max_length=100)] = []
    equipe: Annotated[list[MembroIn], Field(max_length=100)] = []

    def comando(self) -> LancarCommand:
        return LancarCommand(
            armazem_id=self.armazem_id,
            data=self.data,
            linhas=tuple(LinhaCmd(x.tipo_item, x.descarga, x.remocao, x.transferencia) for x in self.linhas),
            equipe=tuple(MembroCmd(m.matricula, m.tipo_diaria) for m in self.equipe),
        )


# ---------------------------------------------------------------- cadastros de apoio


class TipoItemOut(EsquemaBase):
    codigo: str
    descricao: str
    preco_unitario: Decimal

    @classmethod
    def desde(cls, t: TipoItem) -> "TipoItemOut":
        return cls(codigo=t.codigo, descricao=t.descricao, preco_unitario=t.preco_unitario)


class ChapaOut(EsquemaBase):
    matricula: str
    nome: str | None

    @classmethod
    def desde(cls, c: Chapa) -> "ChapaOut":
        return cls(matricula=c.matricula, nome=c.nome)


# ---------------------------------------------------------------- apuração


class LinhaOut(EsquemaBase):
    tipo_item: str
    descricao: str
    descarga: int
    remocao: int
    transferencia: int
    quantidade_total: int
    preco_unitario: Decimal
    valor: Decimal

    @classmethod
    def desde(cls, x: LinhaCalculada) -> "LinhaOut":
        return cls(
            tipo_item=x.tipo_item,
            descricao=x.descricao,
            descarga=x.descarga,
            remocao=x.remocao,
            transferencia=x.transferencia,
            quantidade_total=x.quantidade_total,
            preco_unitario=x.preco_unitario,
            valor=x.valor,
        )


class MembroOut(EsquemaBase):
    matricula: str
    nome: str | None
    tipo_diaria: TipoDiaria

    @classmethod
    def desde(cls, m: MembroEquipe) -> "MembroOut":
        return cls(matricula=m.matricula, nome=m.nome, tipo_diaria=m.tipo_diaria)


class ExibicaoOut(EsquemaBase):
    """Os mesmos valores arredondados para 2 casas, só para mostrar ao usuário."""

    producao_total: Decimal
    valor_por_diaria: Decimal | None
    total_a_pagar: Decimal | None
    complemento: Decimal | None


def _exibir(valor: Decimal | None) -> Decimal | None:
    return None if valor is None else arredondar_exibicao(valor)


class ApuracaoOut(EsquemaBase):
    situacao: SituacaoBoletim
    linhas: list[LinhaOut]
    equipe: list[MembroOut]
    quantidade_chapas: int
    chapas_diaria_completa: int
    chapas_meia_diaria: int
    diarias_equivalentes: Decimal
    producao_total: Decimal
    # nulos quando a situação é INCONSISTENTE (sem equipe: não há como dividir a produção)
    valor_por_diaria: Decimal | None
    total_a_pagar: Decimal | None
    complemento: Decimal | None
    abaixo_do_piso: bool | None
    exibicao: ExibicaoOut


def _apuracao(
    *,
    situacao: SituacaoBoletim,
    linhas: list[LinhaCalculada],
    equipe: list[MembroEquipe],
    producao_total: Decimal,
    diarias_equivalentes: Decimal,
    valor_por_diaria: Decimal | None,
    total_a_pagar: Decimal | None,
    complemento: Decimal | None,
) -> dict[str, object]:
    meias = sum(1 for m in equipe if m.tipo_diaria is TipoDiaria.MEIA)
    return {
        "situacao": situacao,
        "linhas": [LinhaOut.desde(x) for x in linhas],
        "equipe": [MembroOut.desde(m) for m in equipe],
        "quantidade_chapas": len(equipe),
        "chapas_diaria_completa": len(equipe) - meias,
        "chapas_meia_diaria": meias,
        "diarias_equivalentes": diarias_equivalentes.quantize(Decimal("0.1")),
        "producao_total": producao_total,
        "valor_por_diaria": valor_por_diaria,
        "total_a_pagar": total_a_pagar,
        "complemento": complemento,
        "abaixo_do_piso": None if complemento is None else complemento > 0,
        "exibicao": ExibicaoOut(
            producao_total=arredondar_exibicao(producao_total),
            valor_por_diaria=_exibir(valor_por_diaria),
            total_a_pagar=_exibir(total_a_pagar),
            complemento=_exibir(complemento),
        ),
    }


class CalculoOut(ApuracaoOut):
    """Prévia: o que o boletim daria, sem gravar. Traz o piso usado no cálculo."""

    piso: Decimal

    @classmethod
    def desde(cls, c: Calculo) -> "CalculoOut":
        r = c.resultado
        return cls(
            piso=c.piso,
            **_apuracao(
                situacao=r.situacao,
                linhas=c.linhas,
                equipe=c.equipe,
                producao_total=r.producao_total,
                diarias_equivalentes=r.diarias_equivalentes,
                valor_por_diaria=r.valor_por_diaria,
                total_a_pagar=r.total_a_pagar,
                complemento=r.complemento,
            ),
        )


class BoletimOut(ApuracaoOut):
    """Boletim gravado. Os valores são os do dia do lançamento (preços e totais congelados)."""

    id: int
    armazem_id: int
    armazem_nome: str | None
    data: date
    origem: Origem
    criado_em: datetime

    @classmethod
    def desde(cls, b: Boletim, detalhes: DetalhesBoletim, armazem_nome: str | None) -> "BoletimOut":
        return cls(
            id=b.id,
            armazem_id=b.armazem_id,
            armazem_nome=armazem_nome,
            data=b.data,
            origem=b.origem,
            criado_em=b.criado_em,
            **_apuracao(
                situacao=b.situacao,
                linhas=detalhes.linhas,
                equipe=detalhes.equipe,
                producao_total=b.producao_total,
                diarias_equivalentes=b.diarias_equivalentes,
                valor_por_diaria=b.valor_por_diaria,
                total_a_pagar=b.total_a_pagar,
                complemento=b.complemento,
            ),
        )
