"""Rotas do Boletim Diário de Serviços dos Ensacadores (Tarefa 2)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.boletim.models import Boletim
from app.boletim.schemas import BoletimIn, BoletimOut, CalculoOut, ChapaOut, TipoItemOut
from app.boletim.service import BoletimService
from app.core.clock import Relogio, get_relogio
from app.core.db import get_session

router = APIRouter(prefix="/api", tags=["Boletim dos chapas"])


def get_service(
    session: Annotated[Session, Depends(get_session)],
    relogio: Annotated[Relogio, Depends(get_relogio)],
) -> BoletimService:
    return BoletimService(session, relogio)


Servico = Annotated[BoletimService, Depends(get_service)]


def montar_saida(servico: BoletimService, boletim: Boletim) -> BoletimOut:
    nomes = servico.nomes_armazens()
    detalhes = servico.detalhes([boletim.id])[boletim.id]
    return BoletimOut.desde(boletim, detalhes, nomes.get(boletim.armazem_id))


@router.get(
    "/boletim/tipos-item",
    response_model=list[TipoItemOut],
    summary="Os 14 tipos de item e o preço unitário vigente (o operador escolhe o tipo)",
)
def listar_tipos_item(servico: Servico) -> list[TipoItemOut]:
    return [TipoItemOut.desde(t) for t in servico.listar_tipos_item()]


@router.get(
    "/chapas",
    response_model=list[ChapaOut],
    summary="Cadastro de chapas, para o seletor por matrícula",
)
def listar_chapas(servico: Servico) -> list[ChapaOut]:
    return [ChapaOut.desde(c) for c in servico.listar_chapas()]


@router.post(
    "/boletins/calculo",
    response_model=CalculoOut,
    summary="Prévia do cálculo (produção, piso e complemento) sem gravar",
)
def calcular(corpo: BoletimIn, servico: Servico) -> CalculoOut:
    return CalculoOut.desde(servico.calcular(corpo.comando()))


@router.post(
    "/boletins",
    response_model=BoletimOut,
    status_code=status.HTTP_201_CREATED,
    summary="Lançar o boletim de um armazém num dia (linhas + equipe); o servidor calcula",
)
def lancar(corpo: BoletimIn, servico: Servico) -> BoletimOut:
    return montar_saida(servico, servico.lancar(corpo.comando()))


@router.get(
    "/boletins",
    response_model=list[BoletimOut],
    summary="Boletins por armazém e/ou período (mais recentes primeiro)",
)
def listar(
    servico: Servico,
    armazem_id: Annotated[int | None, Query(alias="armazemId")] = None,
    de: Annotated[date | None, Query(description="AAAA-MM-DD, inclusive")] = None,
    ate: Annotated[date | None, Query(description="AAAA-MM-DD, inclusive")] = None,
) -> list[BoletimOut]:
    boletins = servico.listar(armazem_id, de, ate)
    nomes = servico.nomes_armazens()
    detalhes = servico.detalhes([b.id for b in boletins])
    return [BoletimOut.desde(b, detalhes[b.id], nomes.get(b.armazem_id)) for b in boletins]


@router.get("/boletins/{boletim_id}", response_model=BoletimOut, summary="Detalhe de um boletim")
def obter(boletim_id: int, servico: Servico) -> BoletimOut:
    return montar_saida(servico, servico.obter(boletim_id))
