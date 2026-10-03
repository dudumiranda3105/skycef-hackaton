"""Marcos do caminhão: chegada (encosta e entra na fila), entrada (início da descarga) e saída.

A chegada é do caminhão e pode vir antes da autorização (caminhão sem aviso prévio); entrada e
saída são de cada Descarga (uma por armazém de destino). Entre chegada e entrada está a espera;
entre entrada e saída, a descarga.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.agendamento.domain import StatusAgendamento, TipoEvento
from app.agendamento.models import Agendamento, Descarga, DescargaEquipamento, EventoAgendamento
from app.agendamento.service import AgendamentoService
from app.cadastros.models import Equipamento
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError

# Tolerância para relógios levemente adiantados entre o navegador e o servidor
_TOLERANCIA_FUTURO = timedelta(minutes=5)


class MarcosService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.base = AgendamentoService(session, relogio)

    # ------------------------------------------------------------------ chegada

    def registrar_chegada(self, agendamento_id: int, ocorrido_em: datetime | None = None) -> Agendamento:
        """Marco 1: o caminhão encostou e entrou na fila. Vale para o caminhão todo e é copiado
        para as descargas já criadas; as descargas criadas depois herdam este instante."""
        instante = self._instante(ocorrido_em)
        with transacao(self.session):
            agendamento = self.base.carregar_travado(agendamento_id)
            ativos = (StatusAgendamento.PENDENTE_COMPRAS, StatusAgendamento.AUTORIZADO)
            if agendamento.status not in ativos:
                raise ConflitoError(
                    f"O agendamento está '{agendamento.status.rotulo}' e não aceita a chegada do caminhão."
                )
            if agendamento.chegada_em is not None:
                raise ConflitoError("A chegada deste caminhão já foi registrada.")
            agendamento.chegada_em = instante
            self.session.execute(
                update(Descarga)
                .where(Descarga.agendamento_id == agendamento.id, Descarga.chegada_em.is_(None))
                .values(chegada_em=instante)
            )
            self._evento(agendamento, "CHEGADA", "Chegada do caminhão", instante)
        return agendamento

    def registrar_chegada_descarga(
        self, descarga_id: int, ocorrido_em: datetime | None = None
    ) -> Agendamento:
        """Corrige/define a chegada de UMA descarga (ex.: o caminhão seguiu para o 2º armazém e
        voltou à fila). Só antes de a descarga começar."""
        instante = self._instante(ocorrido_em)
        with transacao(self.session):
            descarga, agendamento = self._carregar_descarga(descarga_id)
            self._exigir_autorizado(agendamento)
            if descarga.entrada_em is not None:
                raise ConflitoError("Esta descarga já começou; a chegada não pode mais ser alterada.")
            descarga.chegada_em = instante
            self._evento(agendamento, "CHEGADA", "Chegada registrada para a descarga", instante, descarga)
        return agendamento

    # ------------------------------------------------------------------ entrada

    def registrar_entrada(self, descarga_id: int, ocorrido_em: datetime | None = None) -> Agendamento:
        """Marco 2: o caminhão é liberado e a descarga começa. Exige agendamento autorizado por
        Compras: ninguém descarrega sem agendamento válido."""
        instante = self._instante(ocorrido_em)
        with transacao(self.session):
            descarga, agendamento = self._carregar_descarga(descarga_id)
            self._exigir_autorizado(agendamento)
            if descarga.entrada_em is not None:
                raise ConflitoError("A entrada desta descarga já foi registrada.")
            if descarga.chegada_em is None:
                raise RegraDeNegocioError("Registre a chegada do caminhão antes da entrada.")
            if instante < descarga.chegada_em:
                raise RegraDeNegocioError("A entrada não pode ser anterior à chegada.")
            descarga.entrada_em = instante
            if agendamento.status == StatusAgendamento.AUTORIZADO:
                self.base.mudar_status(
                    agendamento,
                    StatusAgendamento.EM_DESCARGA,
                    self.relogio.agora(),
                    "Início da primeira descarga",
                )
            self._evento(agendamento, "ENTRADA", "Início da descarga", instante, descarga)
        return agendamento

    # ------------------------------------------------------------------ saída

    def registrar_saida(
        self,
        descarga_id: int,
        quantidade_chapas: int,
        equipamento_ids: Sequence[int] = (),
        ocorrido_em: datetime | None = None,
    ) -> Agendamento:
        """Marco 3: a descarga terminou. Registra também quantos chapas atuaram NESTA descarga
        (nunca somar ao longo do dia) e quais equipamentos foram usados. Quando todas as
        descargas do agendamento têm saída, ele passa a Concluído."""
        if quantidade_chapas is None or quantidade_chapas < 0:
            raise RegraDeNegocioError("Informe a quantidade de chapas (zero se a carga não exigiu).")
        equipamentos = sorted(set(equipamento_ids))
        instante = self._instante(ocorrido_em)
        with transacao(self.session):
            descarga, agendamento = self._carregar_descarga(descarga_id)
            if agendamento.status != StatusAgendamento.EM_DESCARGA:
                raise ConflitoError(
                    f"O agendamento está '{agendamento.status.rotulo}'; registre a entrada antes da saída."
                )
            if descarga.entrada_em is None:
                raise RegraDeNegocioError("Registre a entrada antes da saída.")
            if descarga.saida_em is not None:
                raise ConflitoError("A saída desta descarga já foi registrada.")
            if instante < descarga.entrada_em:
                raise RegraDeNegocioError("A saída não pode ser anterior à entrada.")
            self._exigir_equipamentos(equipamentos)

            descarga.saida_em = instante
            descarga.quantidade_chapas = quantidade_chapas
            self.session.add_all(
                DescargaEquipamento(descarga_id=descarga.id, equipamento_id=e) for e in equipamentos
            )
            self._evento(
                agendamento,
                "SAIDA",
                "Fim da descarga",
                instante,
                descarga,
                {"quantidadeChapas": quantidade_chapas, "equipamentoIds": equipamentos},
            )
            self.session.flush()
            pendentes = self.session.scalar(
                select(func.count())
                .select_from(Descarga)
                .where(Descarga.agendamento_id == agendamento.id, Descarga.saida_em.is_(None))
            )
            if pendentes == 0:
                self.base.mudar_status(
                    agendamento,
                    StatusAgendamento.CONCLUIDO,
                    self.relogio.agora(),
                    "Todas as descargas foram concluídas",
                )
        return agendamento

    # ------------------------------------------------------------------ internos

    def _instante(self, ocorrido_em: datetime | None) -> datetime:
        agora = self.relogio.agora()
        if ocorrido_em is None:
            return agora
        if ocorrido_em.tzinfo is None:
            raise RegraDeNegocioError("O instante informado precisa ter fuso horário.")
        if ocorrido_em > agora + _TOLERANCIA_FUTURO:
            raise RegraDeNegocioError("O instante informado está no futuro.")
        return ocorrido_em

    def _carregar_descarga(self, descarga_id: int) -> tuple[Descarga, Agendamento]:
        """Trava o agendamento dono da descarga e devolve a descarga já atualizada."""
        lida = self.session.get(Descarga, descarga_id)
        if lida is None:
            raise NaoEncontradoError(f"Descarga não encontrada: {descarga_id}")
        agendamento = self.base.carregar_travado(lida.agendamento_id)
        descarga = self.session.scalar(
            select(Descarga).where(Descarga.id == descarga_id).execution_options(populate_existing=True)
        )
        return descarga, agendamento

    @staticmethod
    def _exigir_autorizado(agendamento: Agendamento) -> None:
        if agendamento.status == StatusAgendamento.PENDENTE_COMPRAS:
            raise ConflitoError("Compras precisa autorizar o agendamento antes de iniciar a descarga.")
        if agendamento.status not in (StatusAgendamento.AUTORIZADO, StatusAgendamento.EM_DESCARGA):
            raise ConflitoError(f"O agendamento está '{agendamento.status.rotulo}' e não aceita descarga.")

    def _exigir_equipamentos(self, ids: Sequence[int]) -> None:
        if not ids:
            return
        achados = set(self.session.scalars(select(Equipamento.id).where(Equipamento.id.in_(ids))))
        faltando = sorted(set(ids) - achados)
        if faltando:
            raise RegraDeNegocioError(f"Equipamento inválido: {', '.join(str(i) for i in faltando)}.")

    def _evento(
        self,
        agendamento: Agendamento,
        marco: str,
        texto: str,
        instante: datetime,
        descarga: Descarga | None = None,
        extra: dict | None = None,
    ) -> None:
        detalhe = {"marco": marco, "instante": instante.isoformat(), **(extra or {})}
        if descarga is not None:
            detalhe["descargaId"] = descarga.id
            detalhe["armazemId"] = descarga.armazem_id
        self.session.add(
            EventoAgendamento(
                agendamento_id=agendamento.id,
                de_status=agendamento.status,
                para_status=agendamento.status,
                tipo=TipoEvento.MARCO,
                observacao=texto,
                detalhe=detalhe,
                ocorrido_em=self.relogio.agora(),
            )
        )
