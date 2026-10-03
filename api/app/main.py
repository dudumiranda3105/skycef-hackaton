import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.agendamento.router import router as agendamento_router
from app.agendamento.router_fluxo import router as fluxo_router
from app.boletim.router import router as boletim_router
from app.cadastros.router import router as cadastros_router
from app.core.config import get_settings
from app.core.db import get_engine
from app.core.errors import registrar_handlers
from app.core.migrate import aplicar
from app.painel.router import pagina as painel_pagina
from app.painel.router import router as painel_router

log = logging.getLogger("skycef")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.migrar_ao_iniciar:
        aplicadas = aplicar(settings.db_dsn)
        log.info("Migrations aplicadas na inicialização: %s", aplicadas or "nenhuma")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Recebimento Inteligente - Cocapec",
        description="Agendamento de recebimento de mercadorias, boletim dos chapas e painel gerencial.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_lista,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    registrar_handlers(app)
    app.include_router(agendamento_router)
    app.include_router(fluxo_router)
    app.include_router(cadastros_router)
    app.include_router(boletim_router)
    app.include_router(painel_router)
    app.include_router(painel_pagina)
    app.mount(
        "/app",
        StaticFiles(directory=Path(__file__).with_name("static"), html=True),
        name="tarefa-1",
    )

    @app.get("/", include_in_schema=False)
    def inicio() -> RedirectResponse:
        return RedirectResponse("/app/")

    @app.get("/health", tags=["Infra"], summary="Saúde da aplicação e do banco")
    def health() -> dict[str, str]:
        with get_engine().connect() as conn:
            conn.execute(text("select 1"))
        return {"status": "ok"}

    return app


app = create_app()
