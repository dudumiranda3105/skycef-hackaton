from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, Integer, Numeric, SmallInteger, String, Time
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.agendamento.domain import (
    Acondicionamento,
    MotivoNaoRecebimento,
    StatusAgendamento,
    StatusVagaLiberada,
    TipoEvento,
)
from app.core.db import Base
from app.shared.domain import Origem


def _enum(tipo: type, tamanho: int) -> Enum:
    """Enum guardado como texto; os CHECK das migrations garantem os valores no banco."""
    return Enum(tipo, native_enum=False, length=tamanho, create_constraint=False, validate_strings=True)


class Agendamento(Base):
    """Agendamento de recebimento. Nunca é apagado: só muda de status."""

    __tablename__ = "agendamento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fornecedor_id: Mapped[int] = mapped_column(BigInteger)
    data_agendada: Mapped[date] = mapped_column(Date)
    horario: Mapped[time] = mapped_column(Time)
    acondicionamento: Mapped[Acondicionamento] = mapped_column(_enum(Acondicionamento, 12))
    status: Mapped[StatusAgendamento] = mapped_column(_enum(StatusAgendamento, 20))
    nf_numero: Mapped[str | None] = mapped_column(String(20))
    nf_chave: Mapped[str | None] = mapped_column(String(44))
    peso_total_kg: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    pedido_compra: Mapped[str | None] = mapped_column(String(20))
    # caminhão que chegou sem aviso e agendou no ato
    agendado_na_hora: Mapped[bool] = mapped_column(Boolean, default=False)
    # reagendamento por caso fortuito que desconsiderou o limite de caminhões do horário
    limite_ignorado: Mapped[bool] = mapped_column(Boolean, default=False)
    origem: Mapped[Origem] = mapped_column(_enum(Origem, 12), default=Origem.PLATAFORMA)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    compras_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    autorizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    motivo_cancelamento: Mapped[str | None] = mapped_column(String(300))
    versao: Mapped[int] = mapped_column(Integer)

    # Evita que duas transições concorrentes sobrescrevam uma à outra
    __mapper_args__ = {"version_id_col": versao}


class EventoAgendamento(Base):
    """Trilha de auditoria do agendamento. Somente inserção."""

    __tablename__ = "evento_agendamento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agendamento_id: Mapped[int] = mapped_column(BigInteger)
    de_status: Mapped[StatusAgendamento | None] = mapped_column(_enum(StatusAgendamento, 20))
    para_status: Mapped[StatusAgendamento] = mapped_column(_enum(StatusAgendamento, 20))
    tipo: Mapped[TipoEvento] = mapped_column(_enum(TipoEvento, 20), default=TipoEvento.STATUS)
    observacao: Mapped[str | None] = mapped_column(String(300))
    detalhe: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class VagaLiberada(Base):
    """Vaga liberada por cancelamento. Cabe ao responsável do armazém decidir quem a ocupa;
    enquanto ABERTA ela continua contando como ocupada."""

    __tablename__ = "vaga_liberada"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    data_vaga: Mapped[date] = mapped_column(Date)
    horario: Mapped[time] = mapped_column(Time)
    acondicionamento: Mapped[Acondicionamento] = mapped_column(_enum(Acondicionamento, 12))
    origem_agendamento_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[StatusVagaLiberada] = mapped_column(
        _enum(StatusVagaLiberada, 15), default=StatusVagaLiberada.ABERTA
    )
    atribuida_a_agendamento_id: Mapped[int | None] = mapped_column(BigInteger)
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AgendamentoDestino(Base):
    """Armazém(ns) onde a carga será descarregada; um caminhão pode ir a mais de um."""

    __tablename__ = "agendamento_destino"

    agendamento_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    armazem_id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)


class NaoRecebimento(Base):
    """Caminhão que não descarregou. `agendamento_id` e `fornecedor_id` são nulos quando o
    caminhão chegou sem agendamento e sem vaga."""

    __tablename__ = "nao_recebimento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agendamento_id: Mapped[int | None] = mapped_column(BigInteger)
    fornecedor_id: Mapped[int | None] = mapped_column(BigInteger)
    fornecedor_nome: Mapped[str | None] = mapped_column(String(200))
    data: Mapped[date] = mapped_column(Date)
    motivo: Mapped[MotivoNaoRecebimento] = mapped_column(_enum(MotivoNaoRecebimento, 30))
    descricao: Mapped[str | None] = mapped_column(String(300))
    origem: Mapped[Origem] = mapped_column(_enum(Origem, 12), default=Origem.PLATAFORMA)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
