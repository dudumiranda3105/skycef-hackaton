from datetime import date, datetime, time, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import schemas
from .models import (
    Appointment, AppointmentAttachment, AppointmentEvent, AppointmentStatus,
    Conditioning, Equipment, Holiday, NonReceipt, NonReceiptReason, Supplier,
    Unload, Warehouse,
)

SLOTS = (time(8), time(10), time(13), time(15))
NEXT_STATUS = {
    AppointmentStatus.AGENDADO: {
        AppointmentStatus.VALIDADO_COMPRAS, AppointmentStatus.CANCELADO,
        AppointmentStatus.NAO_RECEBIDO,
    },
    AppointmentStatus.VALIDADO_COMPRAS: {
        AppointmentStatus.AUTORIZADO, AppointmentStatus.CANCELADO,
        AppointmentStatus.NAO_RECEBIDO,
    },
    AppointmentStatus.AUTORIZADO: {
        AppointmentStatus.CHEGOU, AppointmentStatus.CANCELADO,
        AppointmentStatus.NAO_RECEBIDO,
    },
    AppointmentStatus.CHEGOU: {
        AppointmentStatus.EM_DESCARGA, AppointmentStatus.NAO_RECEBIDO,
    },
    AppointmentStatus.EM_DESCARGA: {AppointmentStatus.CONCLUIDO},
    AppointmentStatus.CONCLUIDO: set(),
    AppointmentStatus.CANCELADO: set(),
    AppointmentStatus.NAO_RECEBIDO: set(),
}


class BusinessError(Exception):
    status_code = 422


class ConflictError(BusinessError):
    status_code = 409


class NotFoundError(BusinessError):
    status_code = 404


def _as_utc_naive(value: datetime) -> datetime:
    """Normalize timestamps for comparisons across PostgreSQL and SQLite."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def validate_working_slot(db: Session, target_date: date, target_time: time) -> None:
    if target_time not in SLOTS:
        raise BusinessError("Horario invalido; use 08:00, 10:00, 13:00 ou 15:00")
    if target_date.weekday() >= 5:
        raise BusinessError("O recebimento acontece somente de segunda a sexta-feira")
    if db.get(Holiday, target_date):
        raise BusinessError("Nao ha recebimento em feriados")


def _slot_lock(db: Session, target_date: date, target_time: time) -> None:
    if db.bind and db.bind.dialect.name == "postgresql":
        key = f"{target_date.isoformat()}-{target_time.isoformat()}"
        db.execute(text("select pg_advisory_xact_lock(hashtext(:key))"), {"key": key})


def occupants(db: Session, target_date: date, target_time: time, ignore_id: int | None = None) -> list[Conditioning]:
    query = select(Appointment.conditioning).where(
        Appointment.scheduled_date == target_date,
        Appointment.scheduled_time == target_time,
        Appointment.status.notin_([AppointmentStatus.CANCELADO, AppointmentStatus.NAO_RECEBIDO]),
    )
    if ignore_id is not None:
        query = query.where(Appointment.id != ignore_id)
    return list(db.scalars(query))


def slot_accepts(current: list[Conditioning], new: Conditioning) -> bool:
    if Conditioning.BATIDO in current:
        return False
    if new == Conditioning.BATIDO:
        return not current
    return len(current) < 2


def create_appointment(
    db: Session, data: schemas.AppointmentCreate, filename: str,
    content_type: str, content: bytes,
) -> Appointment:
    validate_working_slot(db, data.scheduled_date, data.scheduled_time)
    supplier = db.get(Supplier, data.supplier_id)
    if supplier is None:
        raise NotFoundError(f"Fornecedor nao encontrado: {data.supplier_id}")
    _slot_lock(db, data.scheduled_date, data.scheduled_time)
    if not slot_accepts(occupants(db, data.scheduled_date, data.scheduled_time), data.conditioning):
        raise ConflictError("O horario nao possui vaga para esse acondicionamento")
    appointment = Appointment(
        supplier=supplier, scheduled_date=data.scheduled_date,
        scheduled_time=data.scheduled_time, conditioning=data.conditioning,
        status=AppointmentStatus.AGENDADO, invoice_number=data.invoice_number,
        invoice_key=data.invoice_key, weight_kg=data.weight_kg,
        scheduled_on_arrival=data.scheduled_on_arrival,
    )
    appointment.attachment = AppointmentAttachment(
        filename=filename[-200:], content_type=content_type[:80],
        size_bytes=len(content), content=content,
    )
    appointment.events.append(AppointmentEvent(
        from_status=None, to_status=AppointmentStatus.AGENDADO,
        notes="Agendamento criado",
    ))
    db.add(appointment)
    db.flush()
    return appointment


def get_appointment(db: Session, appointment_id: int, lock: bool = False) -> Appointment:
    query = select(Appointment).where(Appointment.id == appointment_id)
    if lock:
        # The supplier is joined eagerly; locking only Appointment avoids
        # PostgreSQL trying to lock the nullable side of that outer join.
        query = query.with_for_update(of=Appointment)
    appointment = db.scalar(query)
    if appointment is None:
        raise NotFoundError(f"Agendamento nao encontrado: {appointment_id}")
    return appointment


def transition(appointment: Appointment, target: AppointmentStatus, notes: str | None = None) -> None:
    if target not in NEXT_STATUS[appointment.status]:
        raise BusinessError(f"Transicao invalida de {appointment.status} para {target}")
    previous = appointment.status
    appointment.status = target
    appointment.events.append(AppointmentEvent(
        from_status=previous, to_status=target, notes=notes,
    ))


def validate_purchase(db: Session, appointment_id: int, data: schemas.PurchaseValidation) -> Appointment:
    appointment = get_appointment(db, appointment_id, lock=True)
    if data.compliant:
        appointment.purchase_order = data.purchase_order
        transition(appointment, AppointmentStatus.VALIDADO_COMPRAS, data.notes)
    else:
        notes = data.notes or "Divergencia entre nota fiscal e pedido"
        transition(appointment, AppointmentStatus.NAO_RECEBIDO, notes)
        db.add(NonReceipt(
            appointment_id=appointment.id, supplier_id=appointment.supplier_id,
            supplier_name=appointment.supplier.corporate_name,
            date=appointment.scheduled_date,
            reason=NonReceiptReason.DIVERGENCIA_NF_PEDIDO, description=notes,
        ))
    db.flush()
    return appointment


def authorize(db: Session, appointment_id: int, warehouse_ids: list[int]) -> Appointment:
    appointment = get_appointment(db, appointment_id, lock=True)
    warehouses = list(db.scalars(select(Warehouse).where(Warehouse.id.in_(set(warehouse_ids)))))
    if len(warehouses) != len(set(warehouse_ids)):
        raise NotFoundError("Um ou mais armazens nao existem")
    transition(appointment, AppointmentStatus.AUTORIZADO, "Destinos definidos pelo armazem")
    appointment.destinations = warehouses
    db.flush()
    return appointment


def mark_arrival(db: Session, appointment_id: int, occurred_at) -> Appointment:
    appointment = get_appointment(db, appointment_id, lock=True)
    transition(appointment, AppointmentStatus.CHEGOU, "Chegada do caminhao")
    appointment.unload = appointment.unload or Unload()
    appointment.unload.arrived_at = occurred_at
    db.flush()
    return appointment


def mark_entry(db: Session, appointment_id: int, occurred_at) -> Appointment:
    appointment = get_appointment(db, appointment_id, lock=True)
    if (
        not appointment.unload
        or not appointment.unload.arrived_at
        or _as_utc_naive(occurred_at) < _as_utc_naive(appointment.unload.arrived_at)
    ):
        raise BusinessError("A entrada deve ocorrer depois da chegada")
    transition(appointment, AppointmentStatus.EM_DESCARGA, "Inicio da descarga")
    appointment.unload.entered_at = occurred_at
    db.flush()
    return appointment


def mark_departure(db: Session, appointment_id: int, data: schemas.CompleteUnload) -> Appointment:
    appointment = get_appointment(db, appointment_id, lock=True)
    if (
        not appointment.unload
        or not appointment.unload.entered_at
        or _as_utc_naive(data.occurred_at) < _as_utc_naive(appointment.unload.entered_at)
    ):
        raise BusinessError("A saida deve ocorrer depois da entrada")
    equipment = list(db.scalars(select(Equipment).where(Equipment.id.in_(set(data.equipment_ids)))))
    if len(equipment) != len(set(data.equipment_ids)):
        raise NotFoundError("Um ou mais equipamentos nao existem")
    transition(appointment, AppointmentStatus.CONCLUIDO, "Descarga finalizada")
    appointment.unload.departed_at = data.occurred_at
    appointment.unload.worker_count = data.worker_count
    appointment.unload.equipment = equipment
    db.flush()
    return appointment


def cancel(db: Session, appointment_id: int, reason: str) -> Appointment:
    appointment = get_appointment(db, appointment_id, lock=True)
    transition(appointment, AppointmentStatus.CANCELADO, reason)
    db.flush()
    return appointment


def reschedule(db: Session, appointment_id: int, data: schemas.Reschedule) -> Appointment:
    appointment = get_appointment(db, appointment_id, lock=True)
    if appointment.status not in {
        AppointmentStatus.AGENDADO, AppointmentStatus.VALIDADO_COMPRAS,
        AppointmentStatus.AUTORIZADO,
    }:
        raise BusinessError("Somente uma entrega ainda nao iniciada pode ser reagendada")
    validate_working_slot(db, data.date, data.time)
    appointment.scheduled_date = data.date
    appointment.scheduled_time = data.time
    appointment.limit_ignored = True
    appointment.events.append(AppointmentEvent(
        from_status=appointment.status, to_status=appointment.status,
        notes=f"Reagendado por caso fortuito: {data.force_majeure_reason}",
    ))
    db.flush()
    return appointment


def create_non_receipt(db: Session, data: schemas.NonReceiptCreate) -> NonReceipt:
    supplier_id, supplier_name = data.supplier_id, data.supplier_name
    if data.appointment_id is not None:
        appointment = get_appointment(db, data.appointment_id, lock=True)
        transition(appointment, AppointmentStatus.NAO_RECEBIDO, data.description or data.reason)
        supplier_id, supplier_name = appointment.supplier_id, appointment.supplier.corporate_name
    elif supplier_id is not None:
        supplier = db.get(Supplier, supplier_id)
        if supplier is None:
            raise NotFoundError(f"Fornecedor nao encontrado: {supplier_id}")
        supplier_name = supplier.corporate_name
    item = NonReceipt(
        appointment_id=data.appointment_id, supplier_id=supplier_id,
        supplier_name=supplier_name, date=data.date, reason=data.reason,
        description=data.description,
    )
    db.add(item)
    db.flush()
    return item


def reference(item) -> schemas.Reference:
    return schemas.Reference(
        id=item.id, code=getattr(item, "code", None),
        name=getattr(item, "name", getattr(item, "corporate_name", "")),
    )


def equipment_out(item: Equipment) -> schemas.EquipmentOut:
    return schemas.EquipmentOut(
        id=item.id, kind=item.kind, quantity=item.quantity, notes=item.notes,
        warehouse=reference(item.warehouse),
    )


def appointment_detail(item: Appointment) -> schemas.AppointmentDetail:
    unload = None
    if item.unload:
        unload = schemas.UnloadOut(
            arrived_at=item.unload.arrived_at, entered_at=item.unload.entered_at,
            departed_at=item.unload.departed_at, worker_count=item.unload.worker_count,
            equipment=[equipment_out(eq) for eq in item.unload.equipment],
        )
    return schemas.AppointmentDetail(
        appointment=schemas.AppointmentSummary(
            id=item.id, supplier=reference(item.supplier),
            scheduled_date=item.scheduled_date, scheduled_time=item.scheduled_time,
            conditioning=item.conditioning, status=item.status,
            invoice_number=item.invoice_number, invoice_key=item.invoice_key,
            weight_kg=item.weight_kg, purchase_order=item.purchase_order,
            scheduled_on_arrival=item.scheduled_on_arrival,
            limit_ignored=item.limit_ignored,
            attachment_filename=item.attachment.filename, created_at=item.created_at,
        ),
        destinations=[reference(value) for value in item.destinations], unload=unload,
        events=[schemas.EventOut(
            id=event.id, from_status=event.from_status, to_status=event.to_status,
            notes=event.notes, occurred_at=event.occurred_at,
        ) for event in item.events],
    )
