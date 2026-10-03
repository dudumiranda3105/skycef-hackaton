from datetime import date
from json import JSONDecodeError
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from . import schemas, service
from .config import get_settings
from .database import get_db
from .models import Appointment, AppointmentStatus, Equipment, NonReceipt, Supplier, Warehouse

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(service.BusinessError)
async def business_error_handler(_, exc: service.BusinessError):
    return JSONResponse(content={"detail": str(exc)}, status_code=exc.status_code)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(_, __):
    return JSONResponse(
        content={"detail": "Os dados violam uma regra de integridade"}, status_code=422,
    )


@app.exception_handler(OperationalError)
async def concurrency_error_handler(_, __):
    return JSONResponse(
        content={"detail": "Conflito concorrente; consulte a disponibilidade e tente novamente"},
        status_code=409,
    )


@app.get("/health", tags=["infra"])
def health():
    return {"status": "UP"}


@app.post("/api/cadastros/fornecedores", response_model=schemas.Reference, status_code=201, tags=["cadastros"])
def create_supplier(data: schemas.SupplierCreate, db: Session = Depends(get_db)):
    item = Supplier(code=data.code, corporate_name=data.corporate_name, cnpj=data.cnpj)
    db.add(item)
    db.commit()
    return service.reference(item)


@app.get("/api/cadastros/fornecedores", response_model=list[schemas.Reference], tags=["cadastros"])
def list_suppliers(db: Session = Depends(get_db)):
    return [service.reference(item) for item in db.scalars(select(Supplier).order_by(Supplier.corporate_name))]


@app.get("/api/cadastros/armazens", response_model=list[schemas.Reference], tags=["cadastros"])
def list_warehouses(db: Session = Depends(get_db)):
    return [service.reference(item) for item in db.scalars(select(Warehouse).order_by(Warehouse.id))]


@app.get("/api/cadastros/equipamentos", response_model=list[schemas.EquipmentOut], tags=["cadastros"])
def list_equipment(warehouse_id: int | None = None, db: Session = Depends(get_db)):
    query = select(Equipment).order_by(Equipment.id)
    if warehouse_id is not None:
        query = query.where(Equipment.warehouse_id == warehouse_id)
    return [service.equipment_out(item) for item in db.scalars(query)]


@app.get("/api/disponibilidade", response_model=list[schemas.SlotAvailability], tags=["agendamentos"])
def availability(target_date: date = Query(alias="data"), db: Session = Depends(get_db)):
    result = []
    for slot in service.SLOTS:
        current = service.occupants(db, target_date, slot)
        result.append(schemas.SlotAvailability(
            date=target_date, time=slot, occupants=current,
            accepts_loose=service.slot_accepts(current, service.Conditioning.BATIDO),
            accepts_mechanized=service.slot_accepts(current, service.Conditioning.PALETIZADO),
        ))
    return result


@app.post("/api/agendamentos", response_model=schemas.AppointmentDetail, status_code=201, tags=["agendamentos"])
async def create_appointment(
    dados: str = Form(...), nota_fiscal: UploadFile = File(...), db: Session = Depends(get_db),
):
    try:
        data = schemas.AppointmentCreate.model_validate_json(dados)
    except (ValidationError, JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    filename = nota_fiscal.filename or "nota-fiscal"
    if not filename.lower().endswith((".pdf", ".xml")):
        raise HTTPException(status_code=422, detail="A nota fiscal deve ser PDF ou XML")
    content = await nota_fiscal.read(settings.max_invoice_bytes + 1)
    if not content:
        raise HTTPException(status_code=422, detail="O arquivo da nota fiscal e obrigatorio")
    if len(content) > settings.max_invoice_bytes:
        raise HTTPException(status_code=413, detail="A nota fiscal deve ter no maximo 10 MB")
    item = service.create_appointment(
        db, data, filename, nota_fiscal.content_type or "application/octet-stream", content,
    )
    db.commit()
    return service.appointment_detail(item)


@app.get("/api/agendamentos", response_model=list[schemas.AppointmentSummary], tags=["agendamentos"])
def list_appointments(
    target_date: date | None = Query(None, alias="data"),
    status: AppointmentStatus | None = None,
    db: Session = Depends(get_db),
):
    query = select(Appointment).order_by(Appointment.scheduled_date, Appointment.scheduled_time, Appointment.id)
    if target_date is not None:
        query = query.where(Appointment.scheduled_date == target_date)
    if status is not None:
        query = query.where(Appointment.status == status)
    return [service.appointment_detail(item).appointment for item in db.scalars(query)]


@app.get("/api/agendamentos/{appointment_id}", response_model=schemas.AppointmentDetail, tags=["agendamentos"])
def get_appointment(appointment_id: int, db: Session = Depends(get_db)):
    return service.appointment_detail(service.get_appointment(db, appointment_id))


@app.get("/api/agendamentos/{appointment_id}/nota-fiscal", tags=["agendamentos"])
def download_invoice(appointment_id: int, db: Session = Depends(get_db)):
    item = service.get_appointment(db, appointment_id)
    return Response(
        content=item.attachment.content, media_type=item.attachment.content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(item.attachment.filename)}"},
    )


def _commit_detail(db: Session, item: Appointment) -> schemas.AppointmentDetail:
    db.commit()
    return service.appointment_detail(item)


@app.post("/api/agendamentos/{appointment_id}/validacao-compras", response_model=schemas.AppointmentDetail, tags=["fluxo"])
def validate_purchase(appointment_id: int, data: schemas.PurchaseValidation, db: Session = Depends(get_db)):
    return _commit_detail(db, service.validate_purchase(db, appointment_id, data))


@app.post("/api/agendamentos/{appointment_id}/autorizacao-armazem", response_model=schemas.AppointmentDetail, tags=["fluxo"])
def authorize(appointment_id: int, data: schemas.WarehouseAuthorization, db: Session = Depends(get_db)):
    return _commit_detail(db, service.authorize(db, appointment_id, data.warehouse_ids))


@app.post("/api/agendamentos/{appointment_id}/chegada", response_model=schemas.AppointmentDetail, tags=["fluxo"])
def arrival(appointment_id: int, data: schemas.TimestampInput, db: Session = Depends(get_db)):
    return _commit_detail(db, service.mark_arrival(db, appointment_id, data.occurred_at))


@app.post("/api/agendamentos/{appointment_id}/entrada", response_model=schemas.AppointmentDetail, tags=["fluxo"])
def entry(appointment_id: int, data: schemas.TimestampInput, db: Session = Depends(get_db)):
    return _commit_detail(db, service.mark_entry(db, appointment_id, data.occurred_at))


@app.post("/api/agendamentos/{appointment_id}/saida", response_model=schemas.AppointmentDetail, tags=["fluxo"])
def departure(appointment_id: int, data: schemas.CompleteUnload, db: Session = Depends(get_db)):
    return _commit_detail(db, service.mark_departure(db, appointment_id, data))


@app.post("/api/agendamentos/{appointment_id}/cancelamento", response_model=schemas.AppointmentDetail, tags=["fluxo"])
def cancellation(appointment_id: int, data: schemas.Cancellation, db: Session = Depends(get_db)):
    return _commit_detail(db, service.cancel(db, appointment_id, data.reason))


@app.post("/api/agendamentos/{appointment_id}/reagendamento", response_model=schemas.AppointmentDetail, tags=["fluxo"])
def reschedule(appointment_id: int, data: schemas.Reschedule, db: Session = Depends(get_db)):
    return _commit_detail(db, service.reschedule(db, appointment_id, data))


@app.post("/api/nao-recebimentos", response_model=schemas.NonReceiptOut, status_code=201, tags=["fluxo"])
def non_receipt(data: schemas.NonReceiptCreate, db: Session = Depends(get_db)):
    item = service.create_non_receipt(db, data)
    db.commit()
    return item


@app.get("/api/nao-recebimentos", response_model=list[schemas.NonReceiptOut], tags=["fluxo"])
def list_non_receipts(db: Session = Depends(get_db)):
    return list(db.scalars(select(NonReceipt).order_by(NonReceipt.date.desc(), NonReceipt.id.desc())))
