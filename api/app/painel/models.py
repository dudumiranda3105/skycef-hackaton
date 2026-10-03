"""Tabelas do histórico da Cocapec (origem sempre HISTORICO), carregadas pelo ETL `app.etl.historico`."""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class HistRecebimentoItem(Base):
    """Uma linha de `pedido_recebimento_notafiscal.xlsx` (um item de um pedido de compra).

    Não é um caminhão: o evento de carga é (data, nº do recebimento, armazém)."""

    __tablename__ = "hist_recebimento_item"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    pedido_compra: Mapped[str | None] = mapped_column(String(20))
    item_codigo: Mapped[str | None] = mapped_column(String(20))
    fornecedor_codigo: Mapped[str | None] = mapped_column(String(20))
    fornecedor_nome: Mapped[str | None] = mapped_column(String(200))
    descricao: Mapped[str | None] = mapped_column(String(300))
    quantidade: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    peso_kg: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    deposito: Mapped[str | None] = mapped_column(String(12))
    nr_recebimento: Mapped[str | None] = mapped_column(String(20))
    data_documento: Mapped[date | None] = mapped_column(Date)
    data_recebimento: Mapped[date | None] = mapped_column(Date)
    nf_numero: Mapped[str | None] = mapped_column(String(20))
    nf_chave: Mapped[str | None] = mapped_column(String(44))


class HistChapaDia(Base):
    """Folha diária consolidada (`chapas_por_dia.csv`): uma linha por data. Sem ago/dez de 2025."""

    __tablename__ = "hist_chapa_dia"

    data: Mapped[date] = mapped_column(Date, primary_key=True)
    dia_semana: Mapped[str | None] = mapped_column(String(15))
    qtd_presentes: Mapped[int | None] = mapped_column(SmallInteger)
    qtd_cafe: Mapped[int | None] = mapped_column(SmallInteger)
    valor_pago: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
