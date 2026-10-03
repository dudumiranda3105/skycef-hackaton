"""Runner de migrations SQL, no estilo do Flyway.

Aplica api/migrations/V<n>__<nome>.sql em ordem, uma única vez, registrando em
`schema_migrations`. Os arquivos V1–V4 são a fonte da verdade do modelo de dados (DER).

    uv run python -m app.core.migrate
"""

import logging
import re
from pathlib import Path

import psycopg

from app.core.config import get_settings

log = logging.getLogger(__name__)

PASTA = Path(__file__).resolve().parents[2] / "migrations"
_PADRAO = re.compile(r"^V(\d+)__(.+)\.sql$")
_LOCK_MIGRACAO = 7_316_001  # evita duas instâncias migrando ao mesmo tempo


def _arquivos() -> list[tuple[int, str, Path]]:
    achados = []
    for caminho in PASTA.glob("V*.sql"):
        m = _PADRAO.match(caminho.name)
        if m:
            achados.append((int(m.group(1)), m.group(2), caminho))
    return sorted(achados)


def aplicar(dsn: str, schema: str | None = None) -> list[int]:
    """Aplica as migrations pendentes e devolve as versões aplicadas.

    `schema` isola a execução num schema próprio (usado nos testes).
    """
    opcoes = {"options": f"-csearch_path={schema}"} if schema else {}
    aplicadas_agora: list[int] = []
    # `with` faz commit no fim: todas as migrations pendentes entram numa única transação
    with psycopg.connect(dsn, **opcoes) as conn:
        conn.execute("select pg_advisory_xact_lock(%s)", (_LOCK_MIGRACAO,))
        conn.execute(
            """
            create table if not exists schema_migrations (
                versao      integer      primary key,
                nome        varchar(200) not null,
                aplicado_em timestamptz  not null default now()
            )
            """
        )
        ja_aplicadas = {linha[0] for linha in conn.execute("select versao from schema_migrations")}
        for versao, nome, caminho in _arquivos():
            if versao in ja_aplicadas:
                continue
            log.info("Aplicando migration V%s (%s)", versao, nome)
            conn.execute(caminho.read_text(encoding="utf-8"))  # sem parâmetros: aceita vários comandos
            conn.execute("insert into schema_migrations (versao, nome) values (%s, %s)", (versao, nome))
            aplicadas_agora.append(versao)
    return aplicadas_agora


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    versoes = aplicar(get_settings().db_dsn)
    print(f"Migrations aplicadas: {versoes or 'nenhuma (banco já atualizado)'}")
