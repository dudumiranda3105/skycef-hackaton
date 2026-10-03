"""Arquivo da nota fiscal anexado ao agendamento (PDF ou XML), com leitura da NF-e."""

import re
from pathlib import PurePath

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.agendamento.domain import STATUS_QUE_LIBERAM_VAGA, StatusAgendamento
from app.agendamento.models import NotaFiscal
from app.agendamento.service import AgendamentoService
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ArquivoGrandeError, ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.nfe.parser import XmlInvalidoError, ler_nfe

LIMITE_BYTES = 10 * 1024 * 1024  # 10 MB
# O tipo vem da extensão validada, nunca do cabeçalho enviado pelo cliente
TIPOS = {".xml": "application/xml", ".pdf": "application/pdf"}


def nome_seguro(nome: str | None) -> str:
    """Só informativo (exibição e download): nunca é usado para gravar em disco."""
    base = PurePath((nome or "nota").replace("\\", "/")).name
    limpo = re.sub(r"[\x00-\x1f\x7f\"]", "", base).strip()
    return (limpo or "nota")[-200:]


class ArquivoService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.base = AgendamentoService(session, relogio)

    def anexar(self, agendamento_id: int, nota_id: int, nome: str | None, conteudo: bytes) -> NotaFiscal:
        """Grava o arquivo na nota. Em XML de NF-e, confere a chave informada e preenche o que
        estiver faltando (chave, número, peso bruto ou, na falta dele, o líquido)."""
        nome = nome_seguro(nome)
        extensao = PurePath(nome).suffix.lower()
        if extensao not in TIPOS:
            raise RegraDeNegocioError("A nota fiscal deve ser um arquivo PDF ou XML.")
        if not conteudo:
            raise RegraDeNegocioError("O arquivo da nota fiscal está vazio.")
        if len(conteudo) > LIMITE_BYTES:
            raise ArquivoGrandeError("A nota fiscal deve ter no máximo 10 MB.")
        dados = None
        if extensao == ".pdf":
            if not conteudo.startswith(b"%PDF"):
                raise RegraDeNegocioError("O arquivo não parece ser um PDF válido.")
        else:
            try:
                dados = ler_nfe(conteudo)
            except XmlInvalidoError as erro:
                raise RegraDeNegocioError(str(erro)) from erro

        with transacao(self.session):
            agendamento = self.base.carregar_travado(agendamento_id)
            if (
                agendamento.status in STATUS_QUE_LIBERAM_VAGA
                or agendamento.status == StatusAgendamento.CONCLUIDO
            ):
                raise ConflitoError(
                    f"O agendamento está '{agendamento.status.rotulo}' e não aceita novos arquivos."
                )
            nota = self.session.get(NotaFiscal, nota_id)
            if nota is None or nota.agendamento_id != agendamento.id:
                raise NaoEncontradoError(f"Nota fiscal não encontrada neste agendamento: {nota_id}")
            if dados is not None:
                self._conferir_e_preencher(nota, dados)
            nota.arquivo_nome = nome
            nota.content_type = TIPOS[extensao]
            nota.tamanho_bytes = len(conteudo)
            nota.conteudo = conteudo
        return nota

    def obter(self, agendamento_id: int, nota_id: int) -> NotaFiscal:
        nota = self.session.get(NotaFiscal, nota_id)
        if nota is None or nota.agendamento_id != agendamento_id or nota.conteudo is None:
            raise NaoEncontradoError("Esta nota fiscal não tem arquivo anexado.")
        return nota

    def _conferir_e_preencher(self, nota: NotaFiscal, dados) -> None:
        if dados.chave:
            if nota.nf_chave and nota.nf_chave != dados.chave:
                raise RegraDeNegocioError(
                    "A chave informada no agendamento não confere com a chave do arquivo XML."
                )
            if not nota.nf_chave:
                repetida = self.session.scalar(
                    select(
                        exists().where(
                            NotaFiscal.nf_chave == dados.chave,
                            NotaFiscal.ativa.is_(True),
                            NotaFiscal.id != nota.id,
                        )
                    )
                )
                if repetida:
                    raise ConflitoError("Esta nota fiscal já está agendada.")
                nota.nf_chave = dados.chave
        if dados.numero and not nota.nf_numero:
            nota.nf_numero = dados.numero[:20]
        peso = dados.peso_bruto_kg if dados.peso_bruto_kg is not None else dados.peso_liquido_kg
        if peso is not None and nota.peso_total_kg is None:
            nota.peso_total_kg = peso
