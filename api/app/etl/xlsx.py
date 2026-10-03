"""Leitor mínimo de .xlsx (somente texto e números), sem dependências extras.

Suficiente para extrair cadastros das planilhas da Cocapec. Para análises maiores (histórico de
41 mil linhas) prefira pandas + openpyxl.
"""

import io
import re
import zipfile
from xml.etree.ElementTree import Element, fromstring

_M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _texto(si: Element) -> str:
    return "".join(t.text or "" for t in si.iter(_M + "t"))


def ler_xlsx(conteudo: bytes) -> dict[str, dict[str, str]]:
    """Devolve {nome_da_aba: {"B6": "CHAPA_01", ...}} com o valor de cada célula preenchida."""
    pacote = zipfile.ZipFile(io.BytesIO(conteudo))
    compartilhadas: list[str] = []
    if "xl/sharedStrings.xml" in pacote.namelist():
        compartilhadas = [
            _texto(si) for si in fromstring(pacote.read("xl/sharedStrings.xml")).iter(_M + "si")
        ]
    destino = {
        r.get("Id"): "xl/" + r.get("Target").lstrip("/").removeprefix("xl/")
        for r in fromstring(pacote.read("xl/_rels/workbook.xml.rels")).iter(_REL + "Relationship")
    }
    abas: dict[str, dict[str, str]] = {}
    for aba in fromstring(pacote.read("xl/workbook.xml")).iter(_M + "sheet"):
        celulas: dict[str, str] = {}
        for c in fromstring(pacote.read(destino[aba.get(_R + "id")])).iter(_M + "c"):
            tipo, valor, inline = c.get("t"), c.find(_M + "v"), c.find(_M + "is")
            if tipo == "s" and valor is not None:
                celulas[c.get("r")] = compartilhadas[int(valor.text)]
            elif tipo == "inlineStr" and inline is not None:
                celulas[c.get("r")] = _texto(inline)
            elif valor is not None and valor.text is not None:
                celulas[c.get("r")] = valor.text
        abas[aba.get("name")] = celulas
    return abas


def coluna(referencia: str) -> str:
    return re.match(r"[A-Z]+", referencia).group()


def linha(referencia: str) -> int:
    return int(re.search(r"\d+", referencia).group())
