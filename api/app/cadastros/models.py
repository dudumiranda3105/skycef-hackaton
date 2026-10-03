from datetime import date

from sqlalchemy import BigInteger, Date, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


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
