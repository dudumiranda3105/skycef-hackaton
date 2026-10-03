from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.agendamento.models import Agendamento
from app.agendamento.schemas import (
    AgendamentoOut,
    AgendarIn,
    DecisaoComprasIn,
    DestinosIn,
    EventoOut,
    GradeOut,
)
from app.agendamento.service import AgendamentoService, AgendarCommand, NotaFiscalCmd
from app.core.clock import Relogio, get_relogio
from app.core.db import get_session

router = APIRouter(prefix="/api", tags=["Agendamento"])


def get_service(
    session: Annotated[Session, Depends(get_session)],
    relogio: Annotated[Relogio, Depends(get_relogio)],
) -> AgendamentoService:
    return AgendamentoService(session, relogio)


Servico = Annotated[AgendamentoService, Depends(get_service)]
DataConsulta = Annotated[date, Query(description="AAAA-MM-DD")]


def _saida(servico: AgendamentoService, agendamento: Agendamento) -> AgendamentoOut:
    return AgendamentoOut.desde(agendamento, servico.detalhes([agendamento.id])[agendamento.id])


@router.get("/agenda", response_model=GradeOut, summary="Disponibilidade dos 4 horários de um dia")
def consultar_agenda(servico: Servico, data: DataConsulta) -> GradeOut:
    return GradeOut.desde(servico.consultar_grade(data))


@router.post(
    "/agendamentos",
    response_model=AgendamentoOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agendar uma entrega (uma ou mais notas fiscais)",
)
def agendar(corpo: AgendarIn, servico: Servico) -> AgendamentoOut:
    criado = servico.agendar(
        AgendarCommand(
            fornecedor_id=corpo.fornecedor_id,
            data=corpo.data,
            horario=corpo.horario,
            acondicionamento=corpo.acondicionamento,
            notas=tuple(
                NotaFiscalCmd(nf_chave=n.nf_chave, nf_numero=n.nf_numero, peso_total_kg=n.peso_total_kg)
                for n in corpo.notas
            ),
            agendado_na_hora=corpo.agendado_na_hora,
        )
    )
    return _saida(servico, criado)


@router.get("/agendamentos", response_model=list[AgendamentoOut], summary="Agendamentos de um dia")
def listar(servico: Servico, data: DataConsulta) -> list[AgendamentoOut]:
    agendamentos = servico.listar_por_data(data)
    detalhes = servico.detalhes([a.id for a in agendamentos])
    return [AgendamentoOut.desde(a, detalhes[a.id]) for a in agendamentos]


@router.get(
    "/agendamentos/{agendamento_id}",
    response_model=AgendamentoOut,
    summary="Detalhe de um agendamento",
)
def obter(agendamento_id: int, servico: Servico) -> AgendamentoOut:
    return _saida(servico, servico.obter(agendamento_id))


@router.get(
    "/agendamentos/{agendamento_id}/eventos",
    response_model=list[EventoOut],
    summary="Trilha de auditoria do agendamento",
)
def eventos(agendamento_id: int, servico: Servico) -> list[EventoOut]:
    return [EventoOut.desde(e) for e in servico.eventos(agendamento_id)]


@router.post(
    "/agendamentos/{agendamento_id}/validacao-compras",
    response_model=AgendamentoOut,
    summary="Compras: autorizar (nota confere com o pedido) ou não autorizar (divergência)",
)
def decidir_compras(agendamento_id: int, corpo: DecisaoComprasIn, servico: Servico) -> AgendamentoOut:
    decidido = servico.decidir_compras(
        agendamento_id, corpo.decisao, corpo.pedido_referencia, corpo.observacao
    )
    return _saida(servico, decidido)


@router.post(
    "/agendamentos/{agendamento_id}/destinos",
    response_model=AgendamentoOut,
    summary="Armazém: definir o(s) armazém(ns) de destino (uma descarga por destino)",
)
def definir_destinos(agendamento_id: int, corpo: DestinosIn, servico: Servico) -> AgendamentoOut:
    definido = servico.definir_destinos(agendamento_id, corpo.armazem_ids, corpo.observacao)
    return _saida(servico, definido)
