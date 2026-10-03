from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.agendamento.schemas import AgendamentoOut, AgendarIn, EventoOut, GradeOut
from app.agendamento.service import AgendamentoService, AgendarCommand
from app.core.clock import Relogio, get_relogio
from app.core.db import get_session

router = APIRouter(prefix="/api", tags=["Agendamento"])


def get_service(
    session: Annotated[Session, Depends(get_session)],
    relogio: Annotated[Relogio, Depends(get_relogio)],
) -> AgendamentoService:
    return AgendamentoService(session, relogio)


Servico = Annotated[AgendamentoService, Depends(get_service)]


@router.get("/agenda", response_model=GradeOut, summary="Disponibilidade dos 4 horários de um dia")
def consultar_agenda(servico: Servico, data: Annotated[date, Query(description="AAAA-MM-DD")]) -> GradeOut:
    return GradeOut.desde(servico.consultar_grade(data))


@router.post(
    "/agendamentos",
    response_model=AgendamentoOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agendar uma entrega",
)
def agendar(corpo: AgendarIn, servico: Servico) -> AgendamentoOut:
    criado = servico.agendar(
        AgendarCommand(
            fornecedor_id=corpo.fornecedor_id,
            data=corpo.data,
            horario=corpo.horario,
            acondicionamento=corpo.acondicionamento,
            nf_chave=corpo.nf_chave,
            nf_numero=corpo.nf_numero,
            peso_total_kg=corpo.peso_total_kg,
            agendado_na_hora=corpo.agendado_na_hora,
        )
    )
    return AgendamentoOut.desde(criado)


@router.get("/agendamentos", response_model=list[AgendamentoOut], summary="Agendamentos de um dia")
def listar(servico: Servico, data: Annotated[date, Query(description="AAAA-MM-DD")]) -> list[AgendamentoOut]:
    return [AgendamentoOut.desde(a) for a in servico.listar_por_data(data)]


@router.get(
    "/agendamentos/{agendamento_id}", response_model=AgendamentoOut, summary="Detalhe de um agendamento"
)
def obter(agendamento_id: int, servico: Servico) -> AgendamentoOut:
    return AgendamentoOut.desde(servico.obter(agendamento_id))


@router.get(
    "/agendamentos/{agendamento_id}/eventos",
    response_model=list[EventoOut],
    summary="Trilha de auditoria do agendamento",
)
def eventos(agendamento_id: int, servico: Servico) -> list[EventoOut]:
    return [EventoOut.desde(e) for e in servico.eventos(agendamento_id)]
