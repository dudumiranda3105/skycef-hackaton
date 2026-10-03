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


class Chapa(Base):
    """Ensacador. A matrícula é o identificador `CHAPA_nn` da folha (nome anonimizado)."""

    __tablename__ = "chapa"

    matricula: Mapped[str] = mapped_column(String(20), primary_key=True)
    nome: Mapped[str | None] = mapped_column(String(120))


class DataNaoOperacional(Base):
    """Dias sem recebimento além dos fins de semana (feriados), cadastrados manualmente."""

    __tablename__ = "data_nao_operacional"

    data: Mapped[date] = mapped_column(Date, primary_key=True)
    descricao: Mapped[str] = mapped_column(String(80))


class Equipamento(Base):
    """Cada unidade é um equipamento (ex.: INS-EMPG-01). Não há número patrimonial oficial:
    as identificações foram geradas pela equipe."""

    __tablename__ = "equipamento"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    armazem_id: Mapped[int] = mapped_column(SmallInteger)
    identificacao: Mapped[str] = mapped_column(String(20))
    tipo: Mapped[str] = mapped_column(String(60))
    observacao: Mapped[str | None] = mapped_column(String(200))
