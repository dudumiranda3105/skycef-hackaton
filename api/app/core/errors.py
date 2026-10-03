import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

log = logging.getLogger(__name__)


class ErroDeAplicacao(Exception):
    status = 500
    codigo = "ERRO_INTERNO"

    def __init__(self, mensagem: str) -> None:
        super().__init__(mensagem)
        self.mensagem = mensagem


class RegraDeNegocioError(ErroDeAplicacao):
    """Violação de regra de negócio (ex.: data em fim de semana). HTTP 422."""

    status = 422
    codigo = "REGRA_DE_NEGOCIO"


class ConflitoError(ErroDeAplicacao):
    """Conflito com o estado atual (ex.: horário sem vaga, NF já agendada). HTTP 409."""

    status = 409
    codigo = "CONFLITO"


class NaoEncontradoError(ErroDeAplicacao):
    """Recurso inexistente. HTTP 404."""

    status = 404
    codigo = "NAO_ENCONTRADO"


def problema(status: int, codigo: str, detalhe: str, **extra: object) -> JSONResponse:
    """Formato único de erro (RFC 7807) com `codigo` estável para o front."""
    corpo = {"status": status, "codigo": codigo, "detail": detalhe, **extra}
    return JSONResponse(corpo, status_code=status, media_type="application/problem+json")


def registrar_handlers(app: FastAPI) -> None:
    @app.exception_handler(ErroDeAplicacao)
    async def _erro_de_aplicacao(_: Request, e: ErroDeAplicacao) -> JSONResponse:
        return problema(e.status, e.codigo, e.mensagem)

    @app.exception_handler(RequestValidationError)
    async def _validacao(_: Request, e: RequestValidationError) -> JSONResponse:
        erros = [
            {"campo": ".".join(str(p) for p in err["loc"] if p != "body"), "mensagem": err["msg"]}
            for err in e.errors()
        ]
        return problema(400, "REQUISICAO_INVALIDA", "Dados da requisição inválidos.", erros=erros)

    @app.exception_handler(IntegrityError)
    async def _integridade(_: Request, e: IntegrityError) -> JSONResponse:
        log.warning("Violação de integridade: %s", e.orig)
        return problema(
            409,
            "VIOLACAO_DE_INTEGRIDADE",
            "A operação viola uma regra de integridade dos dados (registro duplicado ou inválido).",
        )

    @app.exception_handler(StaleDataError)
    async def _versao(_: Request, __: StaleDataError) -> JSONResponse:
        return problema(
            409,
            "CONFLITO_DE_VERSAO",
            "O registro foi alterado por outra pessoa. Atualize a tela e tente novamente.",
        )

    @app.exception_handler(Exception)
    async def _inesperado(_: Request, e: Exception) -> JSONResponse:
        log.exception("Erro inesperado", exc_info=e)
        return problema(500, "ERRO_INTERNO", "Erro interno. Tente novamente; se persistir, avise a equipe.")
