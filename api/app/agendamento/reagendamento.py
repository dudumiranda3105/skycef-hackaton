"""Reagendamento. Por caso fortuito (ex.: chuva) pode exceder a capacidade do horário."""

from datetime import date, time

from sqlalchemy.orm import Session

from app.agendamento import domain
from app.agendamento.domain import StatusAgendamento, TipoEvento
from app.agendamento.models import Agendamento, EventoAgendamento, Reagendamento
from app.agendamento.service import AgendamentoService, motivo_sem_vaga, texto_livre
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ConflitoError, RegraDeNegocioError

ANTES_DA_DESCARGA = (StatusAgendamento.PENDENTE_COMPRAS, StatusAgendamento.AUTORIZADO)


class ReagendamentoService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.base = AgendamentoService(session, relogio)

    def reagendar(
        self,
        agendamento_id: int,
        nova_data: date,
        novo_horario: time,
        motivo: str | None,
        caso_fortuito: bool = False,
    ) -> Agendamento:
        """Muda a data e/ou o horário. Só antes de a descarga começar.

        Em regra o novo horário precisa ter vaga. Por caso fortuito (que impede a descarga) o limite
        de caminhões pode ser desconsiderado; `limite_excedido` só é marcado se de fato excedeu."""
        if not domain.horario_valido(novo_horario):
            raise RegraDeNegocioError("Horário inválido. Escolha entre 08h00, 10h00, 13h00 e 15h00.")
        motivo = texto_livre(motivo, 300)
        if motivo is None:
            raise RegraDeNegocioError("Informe o motivo do reagendamento.")

        with transacao(self.session):
            agendamento = self.base.carregar_com_slots(agendamento_id, extras=[(nova_data, novo_horario)])
            if agendamento.status not in ANTES_DA_DESCARGA:
                raise ConflitoError(
                    f"O agendamento está '{agendamento.status.rotulo}'; "
                    "só é possível reagendar antes da descarga."
                )
            anterior = (agendamento.data_agendada, agendamento.horario)
            if (nova_data, novo_horario) == anterior:
                raise RegraDeNegocioError("Escolha uma data ou um horário diferente do atual.")
            self.base.validar_data_horario(nova_data, novo_horario)

            ocupantes = self.base.ocupantes_do_slot(
                nova_data, novo_horario, excluir_agendamento_id=agendamento.id
            )
            cabe = domain.cabe(ocupantes, agendamento.acondicionamento)
            if not cabe and not caso_fortuito:
                raise ConflitoError(motivo_sem_vaga(ocupantes, agendamento.acondicionamento))
            excedeu = not cabe

            agora = self.relogio.agora()
            self.session.add(
                Reagendamento(
                    agendamento_id=agendamento.id,
                    data_anterior=anterior[0],
                    horario_anterior=anterior[1],
                    data_nova=nova_data,
                    horario_novo=novo_horario,
                    motivo=motivo,
                    limite_excedido=excedeu,
                    criado_em=agora,
                )
            )
            agendamento.data_agendada = nova_data
            agendamento.horario = novo_horario
            if excedeu:
                agendamento.limite_ignorado = True
            self.session.add(
                EventoAgendamento(
                    agendamento_id=agendamento.id,
                    de_status=agendamento.status,
                    para_status=agendamento.status,
                    tipo=TipoEvento.REAGENDAMENTO,
                    observacao=("Reagendado por caso fortuito: " if caso_fortuito else "Reagendado: ")
                    + motivo,
                    detalhe={
                        "de": {"data": anterior[0].isoformat(), "horario": anterior[1].strftime("%H:%M")},
                        "para": {"data": nova_data.isoformat(), "horario": novo_horario.strftime("%H:%M")},
                        "casoFortuito": caso_fortuito,
                        "limiteExcedido": excedeu,
                    },
                    ocorrido_em=agora,
                )
            )
        return agendamento
