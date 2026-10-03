"""Rotas do painel gerencial (Tarefa 3): indicadores, sobra/falta de chapas e a página do painel."""

from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.boletim.service import BoletimService
from app.core.clock import Relogio
from app.core.db import get_session
from app.painel import historico, plataforma
from app.painel.plataforma import Filtro

router = APIRouter(prefix="/api/painel", tags=["Painel gerencial"])
pagina = APIRouter(tags=["Painel gerencial"])

SessaoDep = Annotated[Session, Depends(get_session)]
Origem = Literal["PLATAFORMA", "TESTE", "HISTORICO"]
ARQUIVO_PAGINA = Path(__file__).parent / "static" / "painel.html"


def _json(corpo: dict[str, Any]) -> JSONResponse:
    """Dinheiro (Decimal) sai como texto, sem passar por float, igual ao resto da API."""
    return JSONResponse(jsonable_encoder(corpo, custom_encoder={Decimal: lambda d: format(d, "f")}))


def _piso(session: Session) -> Decimal:
    return BoletimService(session, Relogio()).piso()


def _filtro(
    de: Annotated[date | None, Query(description="AAAA-MM-DD, inclusive")] = None,
    ate: Annotated[date | None, Query(description="AAAA-MM-DD, inclusive")] = None,
    armazem_id: Annotated[int | None, Query(alias="armazemId")] = None,
    origem: Annotated[Origem | None, Query(description="omitido = todas as origens")] = None,
) -> Filtro:
    return Filtro(de=de, ate=ate, armazem_id=armazem_id, origem=origem)


FiltroDep = Annotated[Filtro, Depends(_filtro)]


@router.get(
    "/operacao",
    summary="Indicadores operacionais (cargas, espera, descarga, chapas por recebimento, fornecedores, "
    "horários, não recebimentos, custo) sobre os registros da plataforma",
)
def operacao(session: SessaoDep, filtro: FiltroDep) -> JSONResponse:
    return _json(plataforma.indicadores_operacionais(session, filtro))


@router.get(
    "/dimensionamento/plataforma",
    summary="Sobra/falta de chapas em R$, por armazém e período, a partir dos boletins",
)
def dimensionamento_plataforma(
    session: SessaoDep,
    filtro: FiltroDep,
    agrupar: Annotated[Literal["dia", "semana", "mes"], Query()] = "mes",
) -> JSONResponse:
    return _json(plataforma.dimensionamento_plataforma(session, filtro, agrupar, _piso(session)))


@router.get(
    "/historico/indicadores",
    summary="Indicadores de recebimento do histórico (por recebimento): fornecedores, dia da semana, ano",
)
def indicadores_historico(
    session: SessaoDep,
    de: Annotated[date | None, Query(description="AAAA-MM-DD, inclusive")] = None,
    ate: Annotated[date | None, Query(description="AAAA-MM-DD, inclusive")] = None,
) -> JSONResponse:
    return _json(historico.indicadores(session, de, ate))


@router.get(
    "/dimensionamento/historico",
    summary="Sobra/falta de chapas em R$ sobre o histórico da Cocapec (2025-2026), mês a mês",
)
def dimensionamento_historico(
    session: SessaoDep,
    de: Annotated[date | None, Query(description="o mês de AAAA-MM-DD em diante")] = None,
    ate: Annotated[date | None, Query(description="até o mês de AAAA-MM-DD")] = None,
) -> JSONResponse:
    carga = historico.carregar(session)
    return _json(historico.analisar(carga, _piso(session), de, ate))


@pagina.get("/painel", include_in_schema=False)
def painel() -> FileResponse:
    return FileResponse(ARQUIVO_PAGINA, media_type="text/html; charset=utf-8")
