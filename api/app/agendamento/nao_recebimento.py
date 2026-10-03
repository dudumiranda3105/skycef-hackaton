"""Não recebimento: o caminhão não descarregou. Pode existir sem agendamento (chegou sem aviso e
sem vaga disponível)."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agendamento.domain import MotivoNaoRecebimento, StatusAgendamento
from app.agendamento.models import NaoRecebimento
from app.agendamento.service import AgendamentoService, texto_livre
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import RegraDeNegocioError
from app.shared.domain import Origem

_ROTULO = {
    MotivoNaoRecebimento.DIVERGENCIA_NF_PEDIDO: "divergência entre nota e pedido",
    MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA: "chegada sem agendamento e sem vaga disponível",
    MotivoNaoRecebimento.CASO_FORTUITO: "caso fortuito",
    MotivoNaoRecebimento.OUTRO: "outro motivo",
}


class NaoRecebimentoService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.base = AgendamentoService(session, relogio)

    def registrar(
        self,
        motivo: MotivoNaoRecebimento,
        *,
        data: date | None = None,
        agendamento_id: int | None = None,
        fornecedor_id: int | None = None,
        fornecedor_nome: str | None = None,
        descricao: str | None = None,
    ) -> NaoRecebimento:
        """Registra o não recebimento. Com agendamento, ele passa a Não recebido (e a vaga é
        liberada). Sem agendamento, informe o fornecedor cadastrado ou ao menos o nome."""
        descricao = texto_livre(descricao, 300)
        nome = texto_livre(fornecedor_nome, 200)
        if motivo == MotivoNaoRecebimento.OUTRO and descricao is None:
            raise RegraDeNegocioError("Descreva o motivo do não recebimento.")
        if motivo == MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA and agendamento_id is not None:
            raise RegraDeNegocioError("Este motivo vale para o caminhão que chegou sem agendamento.")

        with transacao(self.session):
            agora = self.relogio.agora()
            if agendamento_id is not None:
                agendamento = self.base.carregar_travado(agendamento_id)
                self.base.mudar_status(
                    agendamento,
                    StatusAgendamento.NAO_RECEBIDO,
                    agora,
                    f"Não recebido: {_ROTULO[motivo]}" + (f" ({descricao})" if descricao else ""),
                )
                fornecedor_id = agendamento.fornecedor_id
                data = data or agendamento.data_agendada
            else:
                if fornecedor_id is None and nome is None:
                    raise RegraDeNegocioError("Informe o fornecedor (cadastrado ou pelo nome).")
                if fornecedor_id is not None:
                    self.base.fornecedores.exigir_existente(fornecedor_id)
                data = data or agora.date()

            registro = NaoRecebimento(
                agendamento_id=agendamento_id,
                fornecedor_id=fornecedor_id,
                fornecedor_nome=nome,
                data=data,
                motivo=motivo,
                descricao=descricao,
                origem=Origem.PLATAFORMA,
                criado_em=agora,
            )
            self.session.add(registro)
            self.session.flush()
        return registro

    def listar(
        self, data: date | None = None, motivo: MotivoNaoRecebimento | None = None
    ) -> list[NaoRecebimento]:
        consulta = select(NaoRecebimento).order_by(NaoRecebimento.data.desc(), NaoRecebimento.id.desc())
        if data is not None:
            consulta = consulta.where(NaoRecebimento.data == data)
        if motivo is not None:
            consulta = consulta.where(NaoRecebimento.motivo == motivo)
        return list(self.session.scalars(consulta))
