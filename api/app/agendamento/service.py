import re
from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.agendamento import domain
from app.agendamento.domain import (
    HORARIOS,
    STATUS_QUE_LIBERAM_VAGA,
    Acondicionamento,
    StatusAgendamento,
    StatusVagaLiberada,
    TipoEvento,
)
from app.agendamento.models import Agendamento, EventoAgendamento, VagaLiberada
from app.cadastros.service import CalendarioService, FornecedorService
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.shared.domain import Origem

_CHAVE_NFE = re.compile(r"[0-9]{44}")


@dataclass(frozen=True)
class AgendarCommand:
    """Pedido de agendamento já interpretado. A nota (chave, número, peso) vem do parser do
    módulo nfe; o serviço nunca aceita status nem origem vindos do cliente."""

    fornecedor_id: int
    data: date
    horario: time
    acondicionamento: Acondicionamento
    nf_chave: str | None = None
    nf_numero: str | None = None
    peso_total_kg: Decimal | None = None
    agendado_na_hora: bool = False


@dataclass(frozen=True)
class Slot:
    horario: time
    ocupados: int  # inclui vagas canceladas ainda em aberto
    aceita_batido: bool
    aceita_paletizado_ou_big_bag: bool


@dataclass(frozen=True)
class GradeDoDia:
    data: date
    dia_util: bool
    motivo_indisponivel: str | None
    slots: list[Slot]


def travar_slot(session: Session, data: date, horario: time) -> None:
    """Serializa as reservas de um mesmo (data, horário) com um advisory lock do PostgreSQL.

    A regra de ocupação é verificada em código e o banco não a garante: sem esta trava, dois
    fornecedores que reservam o mesmo horário ao mesmo tempo leem a mesma ocupação e ambos
    passam. O lock é liberado no commit/rollback; deve ser pedido ANTES de ler a ocupação.
    """
    try:
        indice = HORARIOS.index(horario)
    except ValueError:
        raise ValueError(f"Horário fora da grade: {horario}") from None
    session.execute(select(func.pg_advisory_xact_lock(data.toordinal() * 10 + indice)))


class AgendamentoService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.calendario = CalendarioService(session)
        self.fornecedores = FornecedorService(session)

    # ------------------------------------------------------------------ agendar

    def agendar(self, cmd: AgendarCommand) -> Agendamento:
        """Cria um agendamento respeitando a regra de ocupação do horário. A contagem de
        ocupantes e o insert acontecem na mesma transação, sob a trava do slot."""
        self._validar_entrada(cmd)
        with transacao(self.session):
            self._validar_calendario(cmd)
            self.fornecedores.exigir_existente(cmd.fornecedor_id)

            if cmd.nf_chave is not None and self._nf_ja_agendada(cmd.nf_chave):
                raise ConflitoError("Esta nota fiscal já está agendada.")

            travar_slot(self.session, cmd.data, cmd.horario)

            ocupantes = self._ocupantes_do_slot(cmd.data, cmd.horario)
            if not domain.cabe(ocupantes, cmd.acondicionamento):
                raise ConflitoError(_motivo_sem_vaga(ocupantes, cmd.acondicionamento))

            agora = self.relogio.agora()
            agendamento = Agendamento(
                fornecedor_id=cmd.fornecedor_id,
                data_agendada=cmd.data,
                horario=cmd.horario,
                acondicionamento=cmd.acondicionamento,
                status=StatusAgendamento.AGENDADO,
                nf_chave=cmd.nf_chave,
                nf_numero=cmd.nf_numero,
                peso_total_kg=cmd.peso_total_kg,
                agendado_na_hora=cmd.agendado_na_hora,
                limite_ignorado=False,
                origem=Origem.PLATAFORMA,
                criado_em=agora,
            )
            self.session.add(agendamento)
            self.session.flush()  # gera o id para a trilha de auditoria
            self.session.add(
                EventoAgendamento(
                    agendamento_id=agendamento.id,
                    de_status=None,
                    para_status=StatusAgendamento.AGENDADO,
                    tipo=TipoEvento.STATUS,
                    observacao=(
                        "Agendado na hora pelo caminhão sem aviso prévio"
                        if cmd.agendado_na_hora
                        else "Agendamento criado"
                    ),
                    ocorrido_em=agora,
                )
            )
        return agendamento

    # ------------------------------------------------------------------ consultas

    def consultar_grade(self, data: date) -> GradeDoDia:
        """Disponibilidade dos quatro horários de um dia (leitura; não reserva nada)."""
        motivo = self.calendario.motivo_dia_nao_util(data)
        if motivo is not None:
            return GradeDoDia(data, False, motivo, [])
        slots = []
        for horario in HORARIOS:
            ocupantes = self._ocupantes_do_slot(data, horario)
            slots.append(
                Slot(
                    horario=horario,
                    ocupados=len(ocupantes),
                    aceita_batido=domain.cabe(ocupantes, Acondicionamento.BATIDO),
                    aceita_paletizado_ou_big_bag=domain.cabe(ocupantes, Acondicionamento.PALETIZADO),
                )
            )
        return GradeDoDia(data, True, None, slots)

    def obter(self, agendamento_id: int) -> Agendamento:
        agendamento = self.session.get(Agendamento, agendamento_id)
        if agendamento is None:
            raise NaoEncontradoError(f"Agendamento não encontrado: {agendamento_id}")
        return agendamento

    def listar_por_data(self, data: date) -> list[Agendamento]:
        consulta = (
            select(Agendamento)
            .where(Agendamento.data_agendada == data)
            .order_by(Agendamento.horario, Agendamento.id)
        )
        return list(self.session.scalars(consulta))

    def eventos(self, agendamento_id: int) -> list[EventoAgendamento]:
        self.obter(agendamento_id)
        consulta = (
            select(EventoAgendamento)
            .where(EventoAgendamento.agendamento_id == agendamento_id)
            .order_by(EventoAgendamento.ocorrido_em, EventoAgendamento.id)
        )
        return list(self.session.scalars(consulta))

    # ------------------------------------------------------------------ internos

    def _ocupantes_do_slot(self, data: date, horario: time) -> list[Acondicionamento]:
        """Quem ocupa o horário: agendamentos ativos e vagas canceladas ainda em aberto."""
        ativos = self.session.scalars(
            select(Agendamento.acondicionamento).where(
                Agendamento.data_agendada == data,
                Agendamento.horario == horario,
                Agendamento.status.not_in(STATUS_QUE_LIBERAM_VAGA),
            )
        )
        abertas = self.session.scalars(
            select(VagaLiberada.acondicionamento).where(
                VagaLiberada.data_vaga == data,
                VagaLiberada.horario == horario,
                VagaLiberada.status == StatusVagaLiberada.ABERTA,
            )
        )
        return [*ativos, *abertas]

    def _nf_ja_agendada(self, nf_chave: str) -> bool:
        consulta = select(
            exists().where(
                Agendamento.nf_chave == nf_chave,
                Agendamento.status.not_in(STATUS_QUE_LIBERAM_VAGA),
            )
        )
        return bool(self.session.scalar(consulta))

    @staticmethod
    def _validar_entrada(cmd: AgendarCommand) -> None:
        if not domain.horario_valido(cmd.horario):
            raise RegraDeNegocioError("Horário inválido. Escolha entre 08h00, 10h00, 13h00 e 15h00.")
        if cmd.nf_chave is not None and not _CHAVE_NFE.fullmatch(cmd.nf_chave):
            raise RegraDeNegocioError("A chave de acesso da nota fiscal deve ter 44 dígitos.")
        if cmd.peso_total_kg is not None and cmd.peso_total_kg < 0:
            raise RegraDeNegocioError("O peso da carga não pode ser negativo.")

    def _validar_calendario(self, cmd: AgendarCommand) -> None:
        agora = self.relogio.agora()
        if cmd.data < agora.date():
            raise RegraDeNegocioError("Não é possível agendar em uma data passada.")
        motivo = self.calendario.motivo_dia_nao_util(cmd.data)
        if motivo is not None:
            raise RegraDeNegocioError(motivo)
        # O caminhão sem aviso pode agendar "na hora", mesmo em horário já iniciado
        if cmd.data == agora.date() and cmd.horario < agora.time().replace(tzinfo=None):
            if not cmd.agendado_na_hora:
                raise RegraDeNegocioError("Este horário já passou. Escolha um horário posterior.")


def _motivo_sem_vaga(ocupantes: list[Acondicionamento], novo: Acondicionamento) -> str:
    if Acondicionamento.BATIDO in ocupantes:
        return "Horário sem vaga: já há uma carga batida, que reserva o horário inteiro."
    if novo == Acondicionamento.BATIDO:
        return "Horário sem vaga: carga batida exige o horário livre, e já há caminhões agendados."
    return "Horário sem vaga: o limite de 2 caminhões por horário foi atingido."
