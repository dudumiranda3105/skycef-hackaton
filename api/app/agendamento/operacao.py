"""Casos de uso da execução da Tarefa 1.

Este módulo é intencionalmente separado do boletim diário (Tarefa 2). Ele registra o que
acontece em cada recebimento: marcos da descarga, equipamentos, exceções e mudanças da
agenda. A quantidade de chapas daqui mede apenas a intensidade de uma descarga.
"""

from collections.abc import Sequence
from datetime import date, datetime, time, timedelta

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.agendamento import domain
from app.agendamento.domain import (
    HORARIOS,
    Acondicionamento,
    MotivoNaoRecebimento,
    SituacaoCancelamento,
    StatusAgendamento,
    StatusVagaLiberada,
    TipoEvento,
)
from app.agendamento.models import (
    Agendamento,
    Cancelamento,
    Descarga,
    DescargaEquipamento,
    EventoAgendamento,
    NaoRecebimento,
    Reagendamento,
    VagaLiberada,
)
from app.agendamento.service import AgendamentoService, travar_slot
from app.cadastros.models import Equipamento
from app.cadastros.service import CalendarioService, FornecedorService
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.shared.domain import Origem


class OperacaoAgendamentoService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.agendamentos = AgendamentoService(session, relogio)
        self.calendario = CalendarioService(session)
        self.fornecedores = FornecedorService(session)

    # -------------------------------------------------------------- descarga

    def registrar_chegada(self, descarga_id: int, ocorrido_em: datetime | None) -> Descarga:
        with transacao(self.session):
            descarga = self._descarga_travada(descarga_id)
            agendamento = self.agendamentos._carregar_travado(descarga.agendamento_id)
            if agendamento.status not in (
                StatusAgendamento.AUTORIZADO,
                StatusAgendamento.EM_DESCARGA,
            ):
                raise ConflitoError("A chegada só pode ser registrada após a autorização de Compras.")
            if descarga.chegada_em is not None:
                raise ConflitoError("A chegada desta descarga já foi registrada.")
            descarga.chegada_em = self._instante(ocorrido_em)
        return descarga

    def registrar_entrada(self, descarga_id: int, ocorrido_em: datetime | None) -> Descarga:
        with transacao(self.session):
            descarga = self._descarga_travada(descarga_id)
            agendamento = self.agendamentos._carregar_travado(descarga.agendamento_id)
            if agendamento.status not in (
                StatusAgendamento.AUTORIZADO,
                StatusAgendamento.EM_DESCARGA,
            ):
                raise ConflitoError("A entrada exige um agendamento autorizado e válido.")
            if descarga.chegada_em is None:
                raise ConflitoError("Registre a chegada antes do início da descarga.")
            if descarga.entrada_em is not None:
                raise ConflitoError("A entrada desta descarga já foi registrada.")
            instante = self._instante(ocorrido_em)
            if instante < descarga.chegada_em:
                raise RegraDeNegocioError("A entrada não pode ocorrer antes da chegada.")
            descarga.entrada_em = instante
            if agendamento.status == StatusAgendamento.AUTORIZADO:
                self.agendamentos._mudar_status(
                    agendamento,
                    StatusAgendamento.EM_DESCARGA,
                    self.relogio.agora(),
                    "Primeira descarga iniciada",
                )
        return descarga

    def registrar_saida(
        self,
        descarga_id: int,
        quantidade_chapas: int,
        equipamento_ids: Sequence[int],
        ocorrido_em: datetime | None,
    ) -> Descarga:
        if quantidade_chapas < 0:
            raise RegraDeNegocioError("A quantidade de chapas não pode ser negativa.")
        equipamentos = sorted(set(equipamento_ids))
        with transacao(self.session):
            descarga = self._descarga_travada(descarga_id)
            agendamento = self.agendamentos._carregar_travado(descarga.agendamento_id)
            if agendamento.status != StatusAgendamento.EM_DESCARGA:
                raise ConflitoError("A saída exige uma descarga iniciada.")
            if descarga.entrada_em is None:
                raise ConflitoError("Registre a entrada antes de finalizar a descarga.")
            if descarga.saida_em is not None:
                raise ConflitoError("A saída desta descarga já foi registrada.")
            instante = self._instante(ocorrido_em)
            if instante < descarga.entrada_em:
                raise RegraDeNegocioError("A saída não pode ocorrer antes da entrada.")
            self._exigir_equipamentos(equipamentos)
            descarga.saida_em = instante
            descarga.quantidade_chapas = quantidade_chapas
            self.session.add_all(
                DescargaEquipamento(descarga_id=descarga.id, equipamento_id=equipamento_id)
                for equipamento_id in equipamentos
            )
            self.session.flush()
            ha_pendente = self.session.scalar(
                select(
                    exists().where(
                        Descarga.agendamento_id == agendamento.id,
                        Descarga.saida_em.is_(None),
                    )
                )
            )
            if not ha_pendente:
                self.agendamentos._mudar_status(
                    agendamento,
                    StatusAgendamento.CONCLUIDO,
                    self.relogio.agora(),
                    "Todas as descargas foram concluídas",
                )
        return descarga

    # ----------------------------------------------------------- cancelamento

    def solicitar_cancelamento(self, agendamento_id: int, motivo: str) -> Cancelamento:
        motivo = self._texto_obrigatorio(motivo, 300, "Informe o motivo do cancelamento.")
        with transacao(self.session):
            agendamento = self.agendamentos._carregar_travado(agendamento_id)
            if agendamento.status not in (
                StatusAgendamento.PENDENTE_COMPRAS,
                StatusAgendamento.AUTORIZADO,
            ):
                raise ConflitoError("Este agendamento não pode mais ser cancelado.")
            if self.session.get(Cancelamento, agendamento_id) is not None:
                raise ConflitoError("O cancelamento deste agendamento já foi solicitado.")
            cancelamento = Cancelamento(
                agendamento_id=agendamento_id,
                motivo=motivo,
                situacao=SituacaoCancelamento.SOLICITADO,
                solicitado_em=self.relogio.agora(),
            )
            self.session.add(cancelamento)
        return cancelamento

    def efetivar_cancelamento(self, agendamento_id: int) -> tuple[Cancelamento, VagaLiberada]:
        with transacao(self.session):
            agendamento = self.agendamentos._carregar_travado(agendamento_id)
            cancelamento = self.session.scalar(
                select(Cancelamento)
                .where(Cancelamento.agendamento_id == agendamento_id)
                .with_for_update()
            )
            if cancelamento is None:
                raise NaoEncontradoError("Solicitação de cancelamento não encontrada.")
            if cancelamento.situacao != SituacaoCancelamento.SOLICITADO:
                raise ConflitoError("O cancelamento já foi efetivado.")
            agora = self.relogio.agora()
            self.agendamentos._mudar_status(
                agendamento, StatusAgendamento.CANCELADO, agora, cancelamento.motivo
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
        return cancelamento, vaga

    def decidir_vaga(
        self,
        vaga_id: int,
        agendamento_id: int | None,
        liberar_geral: bool,
    ) -> VagaLiberada:
        if (agendamento_id is None) == (not liberar_geral):
            raise RegraDeNegocioError(
                "Informe um agendamento para a vaga ou escolha liberá-la para a agenda geral."
            )
        with transacao(self.session):
            vaga = self.session.scalar(
                select(VagaLiberada).where(VagaLiberada.id == vaga_id).with_for_update()
            )
            if vaga is None:
                raise NaoEncontradoError(f"Vaga liberada não encontrada: {vaga_id}")
            if vaga.status != StatusVagaLiberada.ABERTA:
                raise ConflitoError("Esta vaga já recebeu uma decisão.")
            agora = self.relogio.agora()
            if liberar_geral:
                vaga.status = StatusVagaLiberada.LIBERADA_GERAL
            else:
                candidato = self.agendamentos._carregar_travado(agendamento_id)  # type: ignore[arg-type]
                if candidato.status not in (
                    StatusAgendamento.PENDENTE_COMPRAS,
                    StatusAgendamento.AUTORIZADO,
                ):
                    raise ConflitoError("O agendamento escolhido não pode ocupar esta vaga.")
                if self.session.scalar(
                    select(exists().where(
                        Descarga.agendamento_id == candidato.id,
                        Descarga.entrada_em.is_not(None),
                    ))
                ):
                    raise ConflitoError("O agendamento escolhido já iniciou uma descarga.")
                anterior = {"data": str(candidato.data_agendada), "horario": str(candidato.horario)}
                candidato.data_agendada = vaga.data_vaga
                candidato.horario = vaga.horario
                vaga.status = StatusVagaLiberada.ATRIBUIDA
                vaga.atribuida_a_agendamento_id = candidato.id
                self.session.add(
                    EventoAgendamento(
                        agendamento_id=candidato.id,
                        de_status=candidato.status,
                        para_status=candidato.status,
                        tipo=TipoEvento.VAGA,
                        observacao="Vaga de cancelamento atribuída pelo responsável do armazém",
                        detalhe={**anterior, "vagaLiberadaId": vaga.id},
                        ocorrido_em=agora,
                    )
                )
            vaga.decidido_em = agora
        return vaga

    # ------------------------------------------------------------ reagendar

    def reagendar(
        self,
        agendamento_id: int,
        data_nova: date,
        horario_novo: time,
        motivo: str,
        caso_fortuito: bool,
    ) -> Reagendamento:
        motivo = self._texto_obrigatorio(motivo, 300, "Informe o motivo do reagendamento.")
        if horario_novo not in HORARIOS:
            raise RegraDeNegocioError("Horário inválido. Escolha 08h00, 10h00, 13h00 ou 15h00.")
        with transacao(self.session):
            agendamento = self.agendamentos._carregar_travado(agendamento_id)
            if agendamento.status not in (
                StatusAgendamento.PENDENTE_COMPRAS,
                StatusAgendamento.AUTORIZADO,
            ):
                raise ConflitoError("Este agendamento não pode mais ser reagendado.")
            agora = self.relogio.agora()
            if data_nova < agora.date():
                raise RegraDeNegocioError("Não é possível reagendar para uma data passada.")
            indisponivel = self.calendario.motivo_dia_nao_util(data_nova)
            if indisponivel:
                raise RegraDeNegocioError(indisponivel)
            if data_nova == agora.date() and horario_novo < agora.time().replace(tzinfo=None):
                raise RegraDeNegocioError("O novo horário já passou.")
            anterior = (agendamento.data_agendada, agendamento.horario)
            novo = (data_nova, horario_novo)
            for data_slot, horario_slot in sorted({anterior, novo}):
                travar_slot(self.session, data_slot, horario_slot)
            ocupantes = self._ocupantes_sem(agendamento.id, data_nova, horario_novo)
            cabe_normalmente = domain.cabe(ocupantes, agendamento.acondicionamento)
            if not cabe_normalmente and not caso_fortuito:
                raise ConflitoError("O novo horário não possui vaga disponível.")
            excedeu = not cabe_normalmente
            registro = Reagendamento(
                agendamento_id=agendamento.id,
                data_anterior=anterior[0],
                horario_anterior=anterior[1],
                data_nova=data_nova,
                horario_novo=horario_novo,
                motivo=motivo,
                limite_excedido=excedeu,
                criado_em=agora,
            )
            agendamento.data_agendada = data_nova
            agendamento.horario = horario_novo
            agendamento.limite_ignorado = excedeu
            self.session.add(registro)
            self.session.add(
                EventoAgendamento(
                    agendamento_id=agendamento.id,
                    de_status=agendamento.status,
                    para_status=agendamento.status,
                    tipo=TipoEvento.REAGENDAMENTO,
                    observacao=motivo,
                    detalhe={
                        "dataAnterior": str(anterior[0]),
                        "horarioAnterior": anterior[1].strftime("%H:%M"),
                        "dataNova": str(data_nova),
                        "horarioNovo": horario_novo.strftime("%H:%M"),
                        "casoFortuito": caso_fortuito,
                        "limiteExcedido": excedeu,
                    },
                    ocorrido_em=agora,
                )
            )
            self.session.flush()
        return registro

    # ------------------------------------------------------ não recebimento

    def registrar_nao_recebimento(
        self,
        agendamento_id: int | None,
        fornecedor_id: int | None,
        fornecedor_nome: str | None,
        data_ocorrencia: date,
        motivo: MotivoNaoRecebimento,
        descricao: str | None,
    ) -> NaoRecebimento:
        descricao = self._texto(descricao, 300)
        fornecedor_nome = self._texto(fornecedor_nome, 200)
        if motivo == MotivoNaoRecebimento.OUTRO and descricao is None:
            raise RegraDeNegocioError("Descreva o motivo do não recebimento.")
        if data_ocorrencia > self.relogio.agora().date():
            raise RegraDeNegocioError("O não recebimento não pode ser registrado no futuro.")
        with transacao(self.session):
            agendamento = None
            if agendamento_id is not None:
                agendamento = self.agendamentos._carregar_travado(agendamento_id)
                if agendamento.status not in (
                    StatusAgendamento.PENDENTE_COMPRAS,
                    StatusAgendamento.AUTORIZADO,
                ):
                    raise ConflitoError("O estado atual não permite registrar o não recebimento.")
                fornecedor_id = agendamento.fornecedor_id
                self.agendamentos._mudar_status(
                    agendamento,
                    StatusAgendamento.NAO_RECEBIDO,
                    self.relogio.agora(),
                    descricao or motivo.value,
                )
            elif fornecedor_id is None and fornecedor_nome is None:
                raise RegraDeNegocioError(
                    "Informe o fornecedor ou seu nome para um caminhão sem agendamento."
                )
            if fornecedor_id is not None:
                self.fornecedores.exigir_existente(fornecedor_id)
            registro = NaoRecebimento(
                agendamento_id=agendamento_id,
                fornecedor_id=fornecedor_id,
                fornecedor_nome=fornecedor_nome,
                data=data_ocorrencia,
                motivo=motivo,
                descricao=descricao,
                origem=Origem.PLATAFORMA,
                criado_em=self.relogio.agora(),
            )
            self.session.add(registro)
            self.session.flush()
        return registro

    def listar_nao_recebimentos(self, data_ocorrencia: date | None) -> list[NaoRecebimento]:
        consulta = select(NaoRecebimento)
        if data_ocorrencia is not None:
            consulta = consulta.where(NaoRecebimento.data == data_ocorrencia)
        return list(self.session.scalars(consulta.order_by(NaoRecebimento.data.desc(), NaoRecebimento.id)))

    # --------------------------------------------------------------- internos

    def _descarga_travada(self, descarga_id: int) -> Descarga:
        descarga = self.session.scalar(
            select(Descarga).where(Descarga.id == descarga_id).with_for_update()
        )
        if descarga is None:
            raise NaoEncontradoError(f"Descarga não encontrada: {descarga_id}")
        return descarga

    def _instante(self, informado: datetime | None) -> datetime:
        agora = self.relogio.agora()
        instante = informado or agora
        if instante.tzinfo is None:
            instante = instante.replace(tzinfo=agora.tzinfo)
        if instante > agora + timedelta(minutes=1):
            raise RegraDeNegocioError("O momento informado não pode estar no futuro.")
        return instante

    def _exigir_equipamentos(self, ids: Sequence[int]) -> None:
        if not ids:
            return
        encontrados = set(self.session.scalars(select(Equipamento.id).where(Equipamento.id.in_(ids))))
        faltando = sorted(set(ids) - encontrados)
        if faltando:
            raise RegraDeNegocioError(
                f"Equipamento inválido: {', '.join(str(i) for i in faltando)}."
            )

    def _ocupantes_sem(
        self, agendamento_id: int, data_slot: date, horario_slot: time
    ) -> list[Acondicionamento]:
        ativos = self.session.scalars(
            select(Agendamento.acondicionamento).where(
                Agendamento.id != agendamento_id,
                Agendamento.data_agendada == data_slot,
                Agendamento.horario == horario_slot,
                Agendamento.status.not_in(self._status_que_liberam()),
            )
        )
        abertas = self.session.scalars(
            select(VagaLiberada.acondicionamento).where(
                VagaLiberada.data_vaga == data_slot,
                VagaLiberada.horario == horario_slot,
                VagaLiberada.status == StatusVagaLiberada.ABERTA,
            )
        )
        return [*ativos, *abertas]

    @staticmethod
    def _status_que_liberam() -> tuple[StatusAgendamento, ...]:
        return (
            StatusAgendamento.CANCELADO,
            StatusAgendamento.NAO_AUTORIZADO,
            StatusAgendamento.NAO_RECEBIDO,
        )

    @staticmethod
    def _texto(valor: str | None, limite: int) -> str | None:
        if valor is None or not valor.strip():
            return None
        limpo = valor.strip()
        if len(limpo) > limite:
            raise RegraDeNegocioError(f"O texto excede {limite} caracteres.")
        return limpo

    @classmethod
    def _texto_obrigatorio(cls, valor: str, limite: int, mensagem: str) -> str:
        texto = cls._texto(valor, limite)
        if texto is None:
            raise RegraDeNegocioError(mensagem)
        return texto
