"""Rotas do fluxo da descarga e de seus desvios (marcos, cancelamento, reagendamento...)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agendamento.marcos import MarcosService
from app.agendamento.router import montar_saida
from app.agendamento.schemas import AgendamentoOut
from app.agendamento.schemas_fluxo import MarcoIn, SaidaIn
from app.core.clock import Relogio, get_relogio
from app.core.db import get_session

router = APIRouter(prefix="/api", tags=["Fluxo da descarga"])

SessaoDep = Annotated[Session, Depends(get_session)]
RelogioDep = Annotated[Relogio, Depends(get_relogio)]


def get_marcos(session: SessaoDep, relogio: RelogioDep) -> MarcosService:
    return MarcosService(session, relogio)


Marcos = Annotated[MarcosService, Depends(get_marcos)]


@router.post(
    "/agendamentos/{agendamento_id}/chegada",
    response_model=AgendamentoOut,
    summary="Marco 1: o caminhão encostou e entrou na fila",
)
def chegada(agendamento_id: int, corpo: MarcoIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(marcos.base, marcos.registrar_chegada(agendamento_id, corpo.ocorrido_em))


@router.post(
    "/descargas/{descarga_id}/chegada",
    response_model=AgendamentoOut,
    summary="Chegada de uma descarga específica (ex.: caminhão voltou à fila para o 2º armazém)",
)
def chegada_descarga(descarga_id: int, corpo: MarcoIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(marcos.base, marcos.registrar_chegada_descarga(descarga_id, corpo.ocorrido_em))


@router.post(
    "/descargas/{descarga_id}/entrada",
    response_model=AgendamentoOut,
    summary="Marco 2: o caminhão é liberado e a descarga começa",
)
def entrada(descarga_id: int, corpo: MarcoIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(marcos.base, marcos.registrar_entrada(descarga_id, corpo.ocorrido_em))


@router.post(
    "/descargas/{descarga_id}/saida",
    response_model=AgendamentoOut,
    summary="Marco 3: a descarga terminou; informa chapas e equipamentos usados",
)
def saida(descarga_id: int, corpo: SaidaIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(
        marcos.base,
        marcos.registrar_saida(
            descarga_id, corpo.quantidade_chapas, corpo.equipamento_ids, corpo.ocorrido_em
        ),
    )
