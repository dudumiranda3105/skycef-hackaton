"""Tabelas do boletim (V1 + V5). Um boletim por armazém por dia; até 20 chapas por boletim."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, Enum, Integer, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.boletim.domain import SituacaoBoletim, TipoDiaria
from app.core.db import Base
from app.shared.domain import Origem


def _enum(tipo: type, tamanho: int) -> Enum:
    return Enum(tipo, native_enum=False, length=tamanho, create_constraint=False, validate_strings=True)


class TipoItem(Base):
    """Um dos 14 tipos de item do boletim e seu preço unitário (editável)."""

    __tablename__ = "tipo_item"

    codigo: Mapped[str] = mapped_column(String(30), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(60))
    preco_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 4))


class Boletim(Base):
    """Boletim Diário de Serviços dos Ensacadores: UNIQUE(armazem_id, data)."""

    __tablename__ = "boletim"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    armazem_id: Mapped[int] = mapped_column(SmallInteger)
    data: Mapped[date] = mapped_column(Date)  # data a que o boletim se refere (o dia anterior)
    producao_total: Mapped[Decimal] = mapped_column(Numeric(14, 4))
    diarias_equivalentes: Mapped[Decimal] = mapped_column(Numeric(6, 1))
    # nulos quando a situação é INCONSISTENTE (sem equipe: não há como dividir a produção)
    valor_por_diaria: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    total_a_pagar: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    complemento: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    situacao: Mapped[SituacaoBoletim] = mapped_column(
        _enum(SituacaoBoletim, 14), default=SituacaoBoletim.CONSISTENTE
    )
    origem: Mapped[Origem] = mapped_column(_enum(Origem, 12), default=Origem.PLATAFORMA)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BoletimProducao(Base):
    """Uma linha do boletim: quantidades por modalidade e o preço vigente no dia (congelado)."""

    __tablename__ = "boletim_producao"

    boletim_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tipo_item: Mapped[str] = mapped_column(String(30), primary_key=True)
    qtd_descarga: Mapped[int] = mapped_column(Integer, default=0)
    qtd_remocao: Mapped[int] = mapped_column(Integer, default=0)
    qtd_transferencia: Mapped[int] = mapped_column(Integer, default=0)
    preco_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 4))


class BoletimEquipe(Base):
    """Participação de um chapa no boletim. A mesma matrícula PODE aparecer em boletins de outros
    armazéns no mesmo dia: a unicidade vale só dentro do boletim."""

    __tablename__ = "boletim_equipe"

    boletim_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    matricula: Mapped[str] = mapped_column(String(20), primary_key=True)
    tipo_diaria: Mapped[TipoDiaria] = mapped_column(_enum(TipoDiaria, 8))
