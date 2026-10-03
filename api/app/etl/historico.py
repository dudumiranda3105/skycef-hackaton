"""Carga do histórico da Cocapec no banco (origem HISTORICO) para o painel gerencial.

Fontes (dentro do pacote de dados, que NUNCA vai para o Git):
  * 03_movimentacao/pedido_recebimento_notafiscal.xlsx  -> hist_recebimento_item
  * 04_mao_de_obra/chapas_por_dia.csv                    -> hist_chapa_dia

Tratamentos aplicados (e contados no resumo, para constar do relatório):
  * linhas 100% duplicadas são descartadas (540 no pacote original);
  * datas do Excel (número de série) convertidas para data;
  * os demais problemas (sábados com recebimento, recebimento antes do documento, depósitos fora do
    dossiê, peso inutilizável) são CONTADOS e preservados: quem analisa decide o que fazer.

A carga é idempotente: substitui o conteúdo das duas tabelas.

    uv run python -m app.etl.historico --dados C:/caminho/DADOS_HACKATHON_2026.zip
"""

import argparse
import csv
import io
import os
import re
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.core.db import get_sessionmaker
from app.etl.fonte import Fonte
from app.etl.xlsx import ler_xlsx
from app.painel.models import HistChapaDia, HistRecebimentoItem

ARQUIVO_MOVIMENTACAO = "03_movimentacao/pedido_recebimento_notafiscal.xlsx"
ARQUIVO_FOLHA = "04_mao_de_obra/chapas_por_dia.csv"

_CABECALHOS = {
    "Pedido Compra": "pedido",
    "Data Lançamento": "data_lancamento",
    "Data do Documento": "data_documento",
    "Cod PN": "fornecedor_codigo",
    "Nome": "fornecedor_nome",
    "Cod Item": "item_codigo",
    "Desc Item": "descricao",
    "Qtd": "quantidade",
    "Peso": "peso",
    "Deposito": "deposito",
    "Nº Recebimento": "nr_recebimento",
    "Data Recebimento": "data_recebimento",
    "Nota Fiscal de Entrada": "nf_numero",
    "Chave de Acesso": "nf_chave",
}
_EPOCA_EXCEL = date(1899, 12, 30)
_CHAVE_NFE = re.compile(r"[0-9]{44}")


@dataclass
class ResumoCarga:
    linhas_lidas: int = 0
    duplicadas_descartadas: int = 0
    recebimentos_inseridos: int = 0
    sabados_com_recebimento: int = 0
    recebimento_antes_do_documento: int = 0
    sem_chave_de_acesso: int = 0
    chave_de_acesso_malformada: int = 0  # nao tem 44 digitos: guardada como nula
    dias_da_folha: int = 0


def serial_para_data(valor: str | None) -> date | None:
    """Número de série do Excel (ex.: '45397' ou '45397.0') -> data."""
    if valor is None or not valor.strip():
        return None
    try:
        return _EPOCA_EXCEL + timedelta(days=int(float(valor)))
    except ValueError:
        return None


def _numero(valor: str | None) -> Decimal | None:
    if valor is None or not valor.strip():
        return None
    try:
        return Decimal(valor.strip())
    except InvalidOperation:
        return None


def _inteiro_como_texto(valor: str | None) -> str | None:
    """'52576' e '52576.0' viram '52576' (códigos numéricos guardados como texto)."""
    if valor is None or not valor.strip():
        return None
    try:
        return str(int(float(valor)))
    except ValueError:
        return valor.strip()


def ler_movimentacao(conteudo_xlsx: bytes) -> tuple[list[dict[str, str]], int]:
    """Linhas da planilha como {campo: texto cru}. Devolve (linhas, duplicadas descartadas)."""
    abas = ler_xlsx(conteudo_xlsx)
    celulas = next(iter(abas.values()))
    por_linha: dict[int, dict[str, str]] = {}
    for referencia, valor in celulas.items():
        m = re.fullmatch(r"([A-Z]+)(\d+)", referencia)
        por_linha.setdefault(int(m.group(2)), {})[m.group(1)] = valor
    cabecalho = por_linha.pop(1)
    coluna_do_campo = {
        _CABECALHOS[nome.strip()]: col for col, nome in cabecalho.items() if nome.strip() in _CABECALHOS
    }
    faltando = set(_CABECALHOS.values()) - coluna_do_campo.keys()
    if faltando:
        raise ValueError(f"Colunas ausentes na planilha de movimentação: {sorted(faltando)}")

    vistas: set[tuple[str, ...]] = set()
    linhas: list[dict[str, str]] = []
    duplicadas = 0
    for numero in sorted(por_linha):
        bruto = por_linha[numero]
        linha = {campo: bruto.get(col, "") for campo, col in coluna_do_campo.items()}
        chave = tuple(linha[campo] for campo in sorted(linha))
        if chave in vistas:
            duplicadas += 1
            continue
        vistas.add(chave)
        linhas.append(linha)
    return linhas, duplicadas


def carregar_movimentacao(session: Session, conteudo_xlsx: bytes, resumo: ResumoCarga) -> None:
    linhas, duplicadas = ler_movimentacao(conteudo_xlsx)
    resumo.linhas_lidas = len(linhas) + duplicadas
    resumo.duplicadas_descartadas = duplicadas
    registros = []
    for r in linhas:
        recebimento = serial_para_data(r["data_recebimento"])
        documento = serial_para_data(r["data_documento"])
        if recebimento is not None and recebimento.weekday() == 5:
            resumo.sabados_com_recebimento += 1
        if recebimento and documento and recebimento < documento:
            resumo.recebimento_antes_do_documento += 1
        chave = r["nf_chave"].strip()
        if not chave:
            resumo.sem_chave_de_acesso += 1
        elif not _CHAVE_NFE.fullmatch(chave):
            resumo.chave_de_acesso_malformada += 1
            chave = ""
        registros.append(
            {
                "pedido_compra": _inteiro_como_texto(r["pedido"]),
                "item_codigo": r["item_codigo"].strip() or None,
                "fornecedor_codigo": r["fornecedor_codigo"].strip() or None,
                "fornecedor_nome": r["fornecedor_nome"].strip() or None,
                "descricao": r["descricao"].strip()[:300] or None,
                "quantidade": _numero(r["quantidade"]),
                "peso_kg": _numero(r["peso"]),
                "deposito": r["deposito"].strip() or None,
                "nr_recebimento": _inteiro_como_texto(r["nr_recebimento"]),
                "data_documento": documento,
                "data_recebimento": recebimento,
                "nf_numero": _inteiro_como_texto(r["nf_numero"]),
                "nf_chave": chave or None,
            }
        )
    session.execute(delete(HistRecebimentoItem))
    for i in range(0, len(registros), 5000):
        session.execute(insert(HistRecebimentoItem), registros[i : i + 5000])
    resumo.recebimentos_inseridos = len(registros)


def carregar_folha(session: Session, conteudo_csv: bytes, resumo: ResumoCarga) -> None:
    leitor = csv.DictReader(io.StringIO(conteudo_csv.decode("utf-8-sig")))
    registros = [
        {
            "data": date.fromisoformat(r["data"]),
            "dia_semana": r["dia_semana"],
            "qtd_presentes": int(r["chapas_presentes"]),
            "qtd_cafe": int(r["chapas_operacao_cafe"]),
            "valor_pago": Decimal(r["valor_pago_dia"]),
        }
        for r in leitor
    ]
    session.execute(delete(HistChapaDia))
    if registros:
        session.execute(insert(HistChapaDia), registros)
    resumo.dias_da_folha = len(registros)


def carregar(session: Session, fonte: Fonte) -> ResumoCarga:
    resumo = ResumoCarga()
    carregar_movimentacao(session, fonte.ler(ARQUIVO_MOVIMENTACAO), resumo)
    carregar_folha(session, fonte.ler(ARQUIVO_FOLHA), resumo)
    session.commit()
    return resumo


def main() -> None:
    parser = argparse.ArgumentParser(description="Carrega o histórico da Cocapec para o painel.")
    parser.add_argument(
        "--dados", default=os.environ.get("DADOS_DIR", "data"), help="pasta ou .zip da Cocapec"
    )
    args = parser.parse_args()
    with get_sessionmaker()() as session:
        resumo = carregar(session, Fonte(args.dados))
        total = session.scalar(select(func.count()).select_from(HistRecebimentoItem))
    for campo, valor in vars(resumo).items():
        print(f"{campo}: {valor}")
    print(f"linhas em hist_recebimento_item: {total}")


if __name__ == "__main__":
    main()
