from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey,
    Index, Integer, LargeBinary, Numeric, SmallInteger, String, Table, Text,
    Time, UniqueConstraint, Column, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

PK_BIGINT = BigInteger().with_variant(Integer, "sqlite")


class Conditioning(StrEnum):
    BATIDO = "BATIDO"
    PALETIZADO = "PALETIZADO"
    BIG_BAG = "BIG_BAG"


class AppointmentStatus(StrEnum):
    AGENDADO = "AGENDADO"
    VALIDADO_COMPRAS = "VALIDADO_COMPRAS"
    AUTORIZADO = "AUTORIZADO"
    CHEGOU = "CHEGOU"
    EM_DESCARGA = "EM_DESCARGA"
    CONCLUIDO = "CONCLUIDO"
    CANCELADO = "CANCELADO"
    NAO_RECEBIDO = "NAO_RECEBIDO"

    @property
    def occupies_slot(self) -> bool:
        return self not in {self.CANCELADO, self.NAO_RECEBIDO}


class NonReceiptReason(StrEnum):
    DIVERGENCIA_NF_PEDIDO = "DIVERGENCIA_NF_PEDIDO"
    SEM_AGENDAMENTO_SEM_VAGA = "SEM_AGENDAMENTO_SEM_VAGA"
    CASO_FORTUITO = "CASO_FORTUITO"
    OUTRO = "OUTRO"


appointment_destination = Table(
    "appointment_destination", Base.metadata,
    Column("appointment_id", ForeignKey("appointment.id", ondelete="CASCADE"), primary_key=True),
    Column("warehouse_id", ForeignKey("warehouse.id"), primary_key=True),
)

unload_equipment = Table(
    "unload_equipment", Base.metadata,
    Column("unload_id", ForeignKey("unload.appointment_id", ondelete="CASCADE"), primary_key=True),
    Column("equipment_id", ForeignKey("equipment.id"), primary_key=True),
)


class Supplier(Base):
    __tablename__ = "supplier"
    id: Mapped[int] = mapped_column(PK_BIGINT, primary_key=True, autoincrement=True)
    code: Mapped[str | None] = mapped_column(String(20), index=True)
    corporate_name: Mapped[str] = mapped_column(String(200), index=True)
    cnpj: Mapped[str | None] = mapped_column(String(14), index=True)


class Warehouse(Base):
    __tablename__ = "warehouse"
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(60))


class Equipment(Base):
    __tablename__ = "equipment"
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouse.id"))
    kind: Mapped[str] = mapped_column(String(80))
    quantity: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None] = mapped_column(String(250))
    warehouse: Mapped[Warehouse] = relationship(lazy="joined")


class Holiday(Base):
    __tablename__ = "holiday"
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    description: Mapped[str] = mapped_column(String(100))


class Appointment(Base):
    __tablename__ = "appointment"
    __table_args__ = (
        Index("ix_appointment_slot", "scheduled_date", "scheduled_time"),
        CheckConstraint("weight_kg is null or weight_kg >= 0", name="ck_appointment_weight"),
    )

    id: Mapped[int] = mapped_column(PK_BIGINT, primary_key=True, autoincrement=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("supplier.id"), index=True)
    scheduled_date: Mapped[date] = mapped_column(Date)
    scheduled_time: Mapped[time] = mapped_column(Time)
    conditioning: Mapped[Conditioning] = mapped_column(Enum(Conditioning, native_enum=False, length=12))
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, native_enum=False, length=20),
        default=AppointmentStatus.AGENDADO, index=True,
    )
    invoice_number: Mapped[str | None] = mapped_column(String(20))
    invoice_key: Mapped[str | None] = mapped_column(String(44))
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    purchase_order: Mapped[str | None] = mapped_column(String(20))
    scheduled_on_arrival: Mapped[bool] = mapped_column(Boolean, default=False)
    limit_ignored: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    supplier: Mapped[Supplier] = relationship(lazy="joined")
    destinations: Mapped[list[Warehouse]] = relationship(secondary=appointment_destination, lazy="selectin")
    attachment: Mapped[AppointmentAttachment] = relationship(
        back_populates="appointment", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )
    unload: Mapped[Unload | None] = relationship(
        back_populates="appointment", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )
    events: Mapped[list[AppointmentEvent]] = relationship(
        back_populates="appointment", cascade="all, delete-orphan",
        order_by="AppointmentEvent.id", lazy="selectin",
    )


class AppointmentAttachment(Base):
    __tablename__ = "appointment_attachment"
    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointment.id", ondelete="CASCADE"), primary_key=True
    )
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    appointment: Mapped[Appointment] = relationship(back_populates="attachment")


class AppointmentEvent(Base):
    __tablename__ = "appointment_event"
    id: Mapped[int] = mapped_column(PK_BIGINT, primary_key=True, autoincrement=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointment.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[AppointmentStatus | None] = mapped_column(
        Enum(AppointmentStatus, native_enum=False, length=20)
    )
    to_status: Mapped[AppointmentStatus] = mapped_column(Enum(AppointmentStatus, native_enum=False, length=20))
    notes: Mapped[str | None] = mapped_column(String(300))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    appointment: Mapped[Appointment] = relationship(back_populates="events")


class Unload(Base):
    __tablename__ = "unload"
    __table_args__ = (CheckConstraint("worker_count is null or worker_count >= 0", name="ck_unload_workers"),)
    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointment.id", ondelete="CASCADE"), primary_key=True
    )
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    departed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    worker_count: Mapped[int | None] = mapped_column(SmallInteger)
    appointment: Mapped[Appointment] = relationship(back_populates="unload")
    equipment: Mapped[list[Equipment]] = relationship(secondary=unload_equipment, lazy="selectin")


class NonReceipt(Base):
    __tablename__ = "non_receipt"
    __table_args__ = (UniqueConstraint("appointment_id", name="uq_non_receipt_appointment"),)
    id: Mapped[int] = mapped_column(PK_BIGINT, primary_key=True, autoincrement=True)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointment.id"))
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("supplier.id"))
    supplier_name: Mapped[str | None] = mapped_column(String(200))
    date: Mapped[date] = mapped_column(Date, index=True)
    reason: Mapped[NonReceiptReason] = mapped_column(Enum(NonReceiptReason, native_enum=False, length=30))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
