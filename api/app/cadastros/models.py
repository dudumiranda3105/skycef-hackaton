from datetime import date

from sqlalchemy import BigInteger, Date, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Armazem(Base):
    """Os quatro locais de descarga: Insumos, Adubo, Pátio de Máquinas e Loja."""

    __tablename__ = "armazem"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20))
    nome: Mapped[str] = mapped_column(String(40))


class Fornecedor(Base):
    __tablename__ = "fornecedor"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo: Mapped[str | None] = mapped_column(String(20))
    razao_social: Mapped[str] = mapped_column(String(200))
    cnpj: Mapped[str | None] = mapped_column(String(14))


class Feriado(Base):
    __tablename__ = "feriado"

    data: Mapped[date] = mapped_column(Date, primary_key=True)
    descricao: Mapped[str] = mapped_column(String(80))
