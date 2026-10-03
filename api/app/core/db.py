from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Base dos modelos. O esquema é criado pelas migrations SQL, nunca por create_all."""


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().db_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    # expire_on_commit=False: o objeto devolvido após o commit continua legível na resposta
    return sessionmaker(get_engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """Dependência do FastAPI: uma sessão por requisição."""
    with get_sessionmaker()() as session:
        yield session


@contextmanager
def transacao(session: Session) -> Iterator[Session]:
    """Fronteira de transação: commit no sucesso, rollback em qualquer exceção.

    Locks de transação (pg_advisory_xact_lock) são liberados aqui, no commit/rollback.
    """
    try:
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
