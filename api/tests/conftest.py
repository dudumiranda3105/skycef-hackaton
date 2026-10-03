"""Testes de integração rodam contra o PostgreSQL real (nada de mock do banco).

Cada execução cria um schema próprio, aplica as migrations nele e o remove no final;
as tabelas do banco de desenvolvimento não são tocadas. Sem PostgreSQL acessível, os
testes de integração são ignorados (os de domínio rodam sempre).

Para apontar para outro banco: TEST_DB_DSN=postgresql://usuario:senha@host:5432/banco
"""

import os
import uuid
from collections.abc import Callable, Iterator
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.cadastros.models import Fornecedor
from app.core.clock import RelogioFixo
from app.core.config import get_settings
from app.core.migrate import aplicar

FUSO = ZoneInfo("America/Sao_Paulo")
# Segunda-feira, 05/10/2026, 10h00
SEGUNDA_10H = datetime(2026, 10, 5, 10, 0, tzinfo=FUSO)

FabricaSessao = Callable[[], Session]


@pytest.fixture(scope="session")
def banco() -> Iterator[tuple[str, str]]:
    dsn = os.environ.get("TEST_DB_DSN", get_settings().db_dsn)
    schema = f"t_{uuid.uuid4().hex[:10]}"
    try:
        with psycopg.connect(dsn, autocommit=True, connect_timeout=3) as conn:
            conn.execute(f'create schema "{schema}"')
    except psycopg.OperationalError as erro:
        pytest.skip(f"PostgreSQL indisponível ({type(erro).__name__}); testes de integração ignorados")
    aplicar(dsn, schema)
    yield dsn, schema
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(f'drop schema "{schema}" cascade')


@pytest.fixture(scope="session")
def sessionmaker_teste(banco: tuple[str, str]) -> sessionmaker[Session]:
    dsn, schema = banco
    engine = create_engine(
        dsn.replace("postgresql://", "postgresql+psycopg://", 1),
        connect_args={"options": f"-csearch_path={schema}"},
        pool_size=15,
    )
    return sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def db(sessionmaker_teste: sessionmaker[Session]) -> FabricaSessao:
    """Fábrica de sessões; as tabelas de movimento começam vazias em cada teste."""
    with sessionmaker_teste() as sessao:
        sessao.execute(text("truncate fornecedor, agendamento restart identity cascade"))
        sessao.commit()
    return sessionmaker_teste


@pytest.fixture
def relogio() -> RelogioFixo:
    return RelogioFixo(SEGUNDA_10H)


@pytest.fixture
def fornecedor_id(db: FabricaSessao) -> int:
    with db() as sessao:
        fornecedor = Fornecedor(razao_social="Fornecedor Teste", cnpj="00000000000191")
        sessao.add(fornecedor)
        sessao.commit()
        return fornecedor.id
