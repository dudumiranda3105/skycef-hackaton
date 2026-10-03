from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import AppointmentStatus, Conditioning, NonReceiptReason


class SupplierCreate(BaseModel):
    code: str | None = Field(None, max_length=20)
    corporate_name: str = Field(min_length=1, max_length=200)
    cnpj: str | None = Field(None, pattern=r"^\d{14}$")


class Reference(BaseModel):
    id: int
    code: str | None
    name: str


class EquipmentOut(BaseModel):
    id: int
    kind: str
    quantity: int | None
    notes: str | None
    warehouse: Reference


class AppointmentCreate(BaseModel):
    supplier_id: int
    scheduled_date: date
    scheduled_time: time
    conditioning: Conditioning
    invoice_number: str | None = Field(None, max_length=20)
    invoice_key: str | None = Field(None, pattern=r"^\d{44}$")
    weight_kg: Decimal | None = Field(None, ge=0)
    scheduled_on_arrival: bool = False


class PurchaseValidation(BaseModel):
    compliant: bool
    purchase_order: str | None = Field(None, max_length=20)
    notes: str | None = Field(None, max_length=300)

    @model_validator(mode="after")
    def purchase_order_required(self):
        if self.compliant and not self.purchase_order:
            raise ValueError("purchase_order e obrigatorio quando a nota esta conforme")
        return self


class WarehouseAuthorization(BaseModel):
    warehouse_ids: list[int] = Field(min_length=1)


class TimestampInput(BaseModel):
    occurred_at: datetime

    @field_validator("occurred_at")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("o instante deve conter fuso horario")
        return value


class CompleteUnload(TimestampInput):
    worker_count: int = Field(ge=0)
    equipment_ids: list[int] = Field(default_factory=list)


class Cancellation(BaseModel):
    reason: str = Field(min_length=1, max_length=300)


class Reschedule(BaseModel):
    date: date
    time: time
    force_majeure_reason: str = Field(min_length=1, max_length=300)


class NonReceiptCreate(BaseModel):
    appointment_id: int | None = None
    supplier_id: int | None = None
    supplier_name: str | None = Field(None, max_length=200)
    date: date
    reason: NonReceiptReason
    description: str | None = Field(None, max_length=300)

    @model_validator(mode="after")
    def description_for_other(self):
        if self.reason == NonReceiptReason.OUTRO and not self.description:
            raise ValueError("description e obrigatoria para o motivo OUTRO")
        return self


class EventOut(BaseModel):
    id: int
    from_status: AppointmentStatus | None
    to_status: AppointmentStatus
    notes: str | None
    occurred_at: datetime


class UnloadOut(BaseModel):
    arrived_at: datetime | None
    entered_at: datetime | None
    departed_at: datetime | None
    worker_count: int | None
    equipment: list[EquipmentOut]


class AppointmentSummary(BaseModel):
    id: int
    supplier: Reference
    scheduled_date: date
    scheduled_time: time
    conditioning: Conditioning
    status: AppointmentStatus
    invoice_number: str | None
    invoice_key: str | None
    weight_kg: Decimal | None
    purchase_order: str | None
    scheduled_on_arrival: bool
    limit_ignored: bool
    attachment_filename: str
    created_at: datetime


class AppointmentDetail(BaseModel):
    appointment: AppointmentSummary
    destinations: list[Reference]
    unload: UnloadOut | None
    events: list[EventOut]


class SlotAvailability(BaseModel):
    date: date
    time: time
    occupants: list[Conditioning]
    accepts_loose: bool
    accepts_mechanized: bool


class NonReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    appointment_id: int | None
    supplier_id: int | None
    supplier_name: str | None
    date: date
    reason: NonReceiptReason
    description: str | None
