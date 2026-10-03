"""Carga do cadastro de chapas (ensacadores).

Fonte: a folha diária dos ensacadores (04_mao_de_obra/chapas_por_dia_2025.xlsx e _2026.xlsx), onde
cada pessoa aparece como `CHAPA_nn` (nome anonimizado). O boletim de exemplo também usa matrículas
numéricas (ex.: 158), mas só 12 delas têm correspondência conhecida com `CHAPA_nn`; por isso o
identificador do chapa na plataforma é o próprio `CHAPA_nn`, que existe para todos.

    uv run python -m app.etl.chapas --dados C:/caminho/DADOS_HACKATHON_2026.zip
"""

import argparse
import os
import re
from collections.abc import Iterable

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.cadastros.models import Chapa
from app.core.db import get_sessionmaker
from app.etl.fonte import Fonte
from app.etl.xlsx import coluna, ler_xlsx

ARQUIVOS_FOLHA = (
    "04_mao_de_obra/chapas_por_dia_2025.xlsx",
    "04_mao_de_obra/chapas_por_dia_2026.xlsx",
)
BOLETIM_EXEMPLO = "05_operacao/boletim_diario_chapas.xlsx"
_CHAPA = re.compile(r"^CHAPA_\d{1,4}$")


def extrair_chapas(conteudo_xlsx: bytes) -> set[str]:
    """Todos os `CHAPA_nn` da coluna NOME (B) de todas as abas de uma folha."""
    encontrados: set[str] = set()
    for celulas in ler_xlsx(conteudo_xlsx).values():
        for referencia, valor in celulas.items():
            if coluna(referencia) == "B" and _CHAPA.match(valor.strip()):
                encontrados.add(valor.strip())
    return encontrados


def extrair_chapas_do_boletim(conteudo_xlsx: bytes) -> set[str]:
    """`CHAPA_nn` da tabela matrícula -> funcionário (coluna O) do boletim de exemplo.

    Dois deles (CHAPA_48 e CHAPA_49) não aparecem na folha de 2025/2026."""
    encontrados: set[str] = set()
    for celulas in ler_xlsx(conteudo_xlsx).values():
        for referencia, valor in celulas.items():
            if coluna(referencia) == "O" and _CHAPA.match(valor.strip()):
                encontrados.add(valor.strip())
    return encontrados


def carregar(session: Session, matriculas: Iterable[str]) -> int:
    """Insere os chapas que ainda não existem (idempotente). Devolve quantos eram novos."""
    matriculas = sorted(set(matriculas))
    if not matriculas:
        return 0
    antes = session.query(Chapa).count()
    session.execute(
        insert(Chapa).values([{"matricula": m, "nome": m} for m in matriculas]).on_conflict_do_nothing()
    )
    session.commit()
    return session.query(Chapa).count() - antes


def main() -> None:
    parser = argparse.ArgumentParser(description="Carrega o cadastro de chapas a partir da folha diária.")
    parser.add_argument(
        "--dados", default=os.environ.get("DADOS_DIR", "data"), help="pasta ou .zip da Cocapec"
    )
    args = parser.parse_args()

    fonte = Fonte(args.dados)
    chapas: set[str] = set()
    for arquivo in ARQUIVOS_FOLHA:
        achados = extrair_chapas(fonte.ler(arquivo))
        print(f"{arquivo}: {len(achados)} chapas")
        chapas |= achados
    do_boletim = extrair_chapas_do_boletim(fonte.ler(BOLETIM_EXEMPLO))
    print(f"{BOLETIM_EXEMPLO}: {len(do_boletim)} chapas ({len(do_boletim - chapas)} fora da folha)")
    chapas |= do_boletim
    with get_sessionmaker()() as session:
        novos = carregar(session, chapas)
    print(f"Total distinto: {len(chapas)} | novos no banco: {novos}")


if __name__ == "__main__":
    main()
