"""Leitura da NF-e (XML) anexada pelo fornecedor: chave, número, CNPJ do emitente e pesos.

O XML vem de um fornecedor externo, então é lido com `defusedxml`: DTD, entidades e recursos
externos são recusados (XXE, billion laughs). O código de produto dentro da nota é do
FORNECEDOR e não casa com o catálogo da Cocapec; por isso os itens não são lidos aqui.
"""

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from xml.etree.ElementTree import Element, ParseError

from defusedxml import ElementTree as DefusedET
from defusedxml.common import DefusedXmlException

_ID_INFNFE = re.compile(r"^NFe(\d{44})$")
_CNPJ = re.compile(r"^\d{14}$")


class XmlInvalidoError(ValueError):
    """O arquivo não é um XML válido, ou usa recursos não permitidos."""


@dataclass(frozen=True)
class DadosNfe:
    chave: str | None
    numero: str | None
    cnpj_emitente: str | None
    peso_bruto_kg: Decimal | None
    peso_liquido_kg: Decimal | None


def _nome(elemento: Element) -> str:
    """Nome da tag sem o namespace ({http://www.portalfiscal.inf.br/nfe}infNFe -> infNFe)."""
    return elemento.tag.rsplit("}", 1)[-1]


def _decimal(texto: str | None) -> Decimal | None:
    try:
        return Decimal(texto.strip()) if texto and texto.strip() else None
    except InvalidOperation:
        return None


def ler_nfe(conteudo: bytes) -> DadosNfe:
    try:
        raiz = DefusedET.fromstring(conteudo, forbid_dtd=True)
    except (ParseError, DefusedXmlException, UnicodeDecodeError) as erro:
        raise XmlInvalidoError("O XML é inválido ou usa recursos não permitidos (DTD/entidades).") from erro

    chave = numero = cnpj = None
    bruto = liquido = None
    achou_nfe = False
    for elemento in raiz.iter():
        nome = _nome(elemento)
        if nome == "infNFe":
            achou_nfe = True
            correspondencia = _ID_INFNFE.match(elemento.get("Id", ""))
            chave = correspondencia.group(1) if correspondencia else None
        elif nome == "nNF" and numero is None:
            numero = (elemento.text or "").strip() or None
        elif nome == "CNPJ" and cnpj is None and _CNPJ.match((elemento.text or "").strip()):
            cnpj = elemento.text.strip()  # o primeiro CNPJ da nota é o do emitente
        elif nome == "pesoB":
            valor = _decimal(elemento.text)
            if valor is not None:
                bruto = (bruto or Decimal(0)) + valor
        elif nome == "pesoL":
            valor = _decimal(elemento.text)
            if valor is not None:
                liquido = (liquido or Decimal(0)) + valor
    if not achou_nfe:
        raise XmlInvalidoError("O XML não parece ser uma NF-e (não há o grupo infNFe).")
    return DadosNfe(chave, numero, cnpj, bruto, liquido)
