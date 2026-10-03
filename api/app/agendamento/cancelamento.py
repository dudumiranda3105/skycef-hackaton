"""Cancelamento (solicitação -> efetivação) e destino da vaga liberada.

Ao efetivar o cancelamento a vaga é liberada, mas NÃO é entregue a ninguém automaticamente: ela
fica ABERTA (e continua contando como ocupada) até o responsável do armazém decidir quem a ocupa
ou devolvê-la ao público.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agendamento import domain
from app.agendamento.domain import SituacaoCancelamento, StatusAgendamento, StatusVagaLiberada, TipoEvento
from app.agendamento.models import (
    Agendamento,
    Cancelamento,
    EventoAgendamento,
    Reagendamento,
    VagaLiberada,
)
from app.agendamento.service import AgendamentoService, motivo_sem_vaga, texto_livre, travar_slot
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError

ANTES_DA_DESCARGA = (StatusAgendamento.PENDENTE_COMPRAS, StatusAgendamento.AUTORIZADO)


class CancelamentoService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.base = AgendamentoService(session, relogio)

    # ------------------------------------------------------------------ cancelamento

    def solicitar(self, agendamento_id: int, motivo: str | None) -> Agendamento:
        """O fornecedor (ou o armazém) solicita o cancelamento. Nada muda no horário ainda."""
        motivo = texto_livre(motivo, 300)
        if motivo is None:
            raise RegraDeNegocioError("Informe o motivo do cancelamento.")
        with transacao(self.session):
            agendamento = self.base.carregar_travado(agendamento_id)
            self._exigir_antes_da_descarga(agendamento)
            if self.session.get(Cancelamento, agendamento.id) is not None:
                raise ConflitoError("Já existe uma solicitação de cancelamento para este agendamento.")
            agora = self.relogio.agora()
            self.session.add(
                Cancelamento(
                    agendamento_id=agendamento.id,
                    motivo=motivo,
                    situacao=SituacaoCancelamento.SOLICITADO,
                    solicitado_em=agora,
                )
            )
            self._evento(agendamento, TipoEvento.CANCELAMENTO, f"Cancelamento solicitado: {motivo}", agora)
        return agendamento

    def efetivar(self, agendamento_id: int) -> Agendamento:
        """Efetiva o cancelamento: o agendamento vira Cancelado, as notas ficam livres e a vaga é
        liberada para decisão do armazém."""
        with transacao(self.session):
            agendamento = self.base.carregar_com_slots(agendamento_id)
            cancelamento = self.session.get(Cancelamento, agendamento.id)
            if cancelamento is None:
                raise RegraDeNegocioError("Não há solicitação de cancelamento para efetivar.")
            if cancelamento.situacao == SituacaoCancelamento.EFETIVADO:
                raise ConflitoError("Este cancelamento já foi efetivado.")
            agora = self.relogio.agora()
            self.base.mudar_status(
                agendamento,
                StatusAgendamento.CANCELADO,
                agora,
                f"Cancelamento efetivado: {cancelamento.motivo}",
            )
            cancelamento.situacao = SituacaoCancelamento.EFETIVADO
            cancelamento.efetivado_em = agora
            vaga = VagaLiberada(
                data_vaga=agendamento.data_agendada,
                horario=agendamento.horario,
                acondicionamento=agendamento.acondicionamento,
                origem_agendamento_id=agendamento.id,
                status=StatusVagaLiberada.ABERTA,
                criado_em=agora,
            )
            self.session.add(vaga)
            self.session.flush()
            self._evento(
                agendamento,
                TipoEvento.VAGA,
                "Vaga liberada; o armazém decide quem a ocupa",
                agora,
                {"vagaId": vaga.id},
            )
        return agendamento

    # ------------------------------------------------------------------ vaga liberada

    def listar_vagas(self, status: StatusVagaLiberada | None = None) -> list[VagaLiberada]:
        consulta = select(VagaLiberada).order_by(
            VagaLiberada.data_vaga, VagaLiberada.horario, VagaLiberada.id
        )
        if status is not None:
            consulta = consulta.where(VagaLiberada.status == status)
        return list(self.session.scalars(consulta))

    def candidatos(self, vaga_id: int) -> list[Agendamento]:
        """Agendamentos ainda não iniciados, de outros horários, que caberiam nesta vaga."""
        vaga = self._obter_vaga(vaga_id)
        if vaga.status != StatusVagaLiberada.ABERTA:
            return []
        ocupantes = self.base.ocupantes_do_slot(vaga.data_vaga, vaga.horario, excluir_vaga_id=vaga.id)
        consulta = (
            select(Agendamento)
            .where(
                Agendamento.status.in_(ANTES_DA_DESCARGA),
                Agendamento.data_agendada >= self.relogio.agora().date(),
            )
            .order_by(Agendamento.data_agendada, Agendamento.horario, Agendamento.id)
        )
        return [
            a
            for a in self.session.scalars(consulta)
            if (a.data_agendada, a.horario) != (vaga.data_vaga, vaga.horario)
            and domain.cabe(ocupantes, a.acondicionamento)
        ]

    def atribuir(self, vaga_id: int, agendamento_id: int) -> Agendamento:
        """O responsável do armazém escolhe quem ocupa a vaga: o agendamento é movido para ela."""
        vaga_lida = self._obter_vaga(vaga_id)
        with transacao(self.session):
            agendamento = self.base.carregar_com_slots(
                agendamento_id, extras=[(vaga_lida.data_vaga, vaga_lida.horario)]
            )
            vaga = self._vaga_travada(vaga_id)
            if vaga.status != StatusVagaLiberada.ABERTA:
                raise ConflitoError("Esta vaga já teve o destino decidido.")
            if agendamento.status not in ANTES_DA_DESCARGA:
                raise ConflitoError(
                    f"O agendamento está '{agendamento.status.rotulo}' e não pode ocupar a vaga."
                )
            if (agendamento.data_agendada, agendamento.horario) == (vaga.data_vaga, vaga.horario):
                raise RegraDeNegocioError("O agendamento já está neste horário.")
            self.base.validar_data_horario(vaga.data_vaga, vaga.horario)
            ocupantes = self.base.ocupantes_do_slot(vaga.data_vaga, vaga.horario, excluir_vaga_id=vaga.id)
            if not domain.cabe(ocupantes, agendamento.acondicionamento):
                raise ConflitoError(motivo_sem_vaga(ocupantes, agendamento.acondicionamento))

            agora = self.relogio.agora()
            anterior = (agendamento.data_agendada, agendamento.horario)
            self.session.add(
                Reagendamento(
                    agendamento_id=agendamento.id,
                    data_anterior=anterior[0],
                    horario_anterior=anterior[1],
                    data_nova=vaga.data_vaga,
                    horario_novo=vaga.horario,
                    motivo="Ocupa a vaga liberada por cancelamento",
                    limite_excedido=False,
                    criado_em=agora,
                )
            )
            agendamento.data_agendada = vaga.data_vaga
            agendamento.horario = vaga.horario
            vaga.status = StatusVagaLiberada.ATRIBUIDA
            vaga.atribuida_a_agendamento_id = agendamento.id
            vaga.decidido_em = agora
            self._evento(
                agendamento,
                TipoEvento.REAGENDAMENTO,
                "Movido para a vaga liberada por cancelamento",
                agora,
                {
                    "vagaId": vaga.id,
                    "de": {"data": anterior[0].isoformat(), "horario": anterior[1].strftime("%H:%M")},
                    "para": {"data": vaga.data_vaga.isoformat(), "horario": vaga.horario.strftime("%H:%M")},
                },
            )
        return agendamento

    def liberar_geral(self, vaga_id: int) -> VagaLiberada:
        """O responsável do armazém devolve a vaga: ela volta a ficar disponível para agendar."""
        vaga_lida = self._obter_vaga(vaga_id)
        with transacao(self.session):
            travar_slot(self.session, vaga_lida.data_vaga, vaga_lida.horario)
            vaga = self._vaga_travada(vaga_id)
            if vaga.status != StatusVagaLiberada.ABERTA:
                raise ConflitoError("Esta vaga já teve o destino decidido.")
            vaga.status = StatusVagaLiberada.LIBERADA_GERAL
            vaga.decidido_em = self.relogio.agora()
        return vaga

    # ------------------------------------------------------------------ internos

    @staticmethod
    def _exigir_antes_da_descarga(agendamento: Agendamento) -> None:
        if agendamento.status not in ANTES_DA_DESCARGA:
            raise ConflitoError(
                f"O agendamento está '{agendamento.status.rotulo}' e não pode mais ser cancelado."
            )

    def _obter_vaga(self, vaga_id: int) -> VagaLiberada:
        vaga = self.session.get(VagaLiberada, vaga_id)
        if vaga is None:
            raise NaoEncontradoError(f"Vaga liberada não encontrada: {vaga_id}")
        return vaga

    def _vaga_travada(self, vaga_id: int) -> VagaLiberada:
        consulta = (
            select(VagaLiberada)
            .where(VagaLiberada.id == vaga_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        vaga = self.session.scalar(consulta)
        if vaga is None:
            raise NaoEncontradoError(f"Vaga liberada não encontrada: {vaga_id}")
        return vaga

    def _evento(
        self, agendamento: Agendamento, tipo: TipoEvento, texto: str, agora, detalhe: dict | None = None
    ) -> None:
        self.session.add(
            EventoAgendamento(
                agendamento_id=agendamento.id,
                de_status=agendamento.status,
                para_status=agendamento.status,
                tipo=tipo,
                observacao=texto[:300],
                detalhe=detalhe,
                ocorrido_em=agora,
            )
        )
