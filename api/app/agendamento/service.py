import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import exists, func, select, update
from sqlalchemy.orm import Session

from app.agendamento import domain
from app.agendamento.domain import (
    HORARIOS,
    STATUS_QUE_LIBERAM_VAGA,
    Acondicionamento,
    DecisaoCompras,
    MotivoNaoRecebimento,
    StatusAgendamento,
    StatusVagaLiberada,
    TipoEvento,
)
from app.agendamento.models import (
    Agendamento,
    Descarga,
    DescargaEquipamento,
    EventoAgendamento,
    NaoRecebimento,
    NotaFiscal,
    VagaLiberada,
    ValidacaoCompras,
)
from app.cadastros.service import ArmazemService, CalendarioService, FornecedorService
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.shared.domain import Origem

_CHAVE_NFE = re.compile(r"[0-9]{44}")


@dataclass(frozen=True)
class NotaFiscalCmd:
    """Uma nota anexada ao agendamento; os dados vêm do parser do módulo nfe (ou do formulário)."""

    nf_chave: str | None = None
    nf_numero: str | None = None
    peso_total_kg: Decimal | None = None
    arquivo_nome: str | None = None
    content_type: str | None = None
    conteudo: bytes | None = None


@dataclass(frozen=True)
class AgendarCommand:
    """Pedido de agendamento já interpretado. O serviço nunca aceita status nem origem vindos
    do cliente."""

    fornecedor_id: int
    data: date
    horario: time
    acondicionamento: Acondicionamento
    notas: tuple[NotaFiscalCmd, ...] = ()
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


@dataclass
class DetalhesAgendamento:
    """O que acompanha um agendamento: notas, decisão de Compras e descargas (uma por destino)."""

    notas: list[NotaFiscal] = field(default_factory=list)
    validacao: ValidacaoCompras | None = None
    descargas: list[Descarga] = field(default_factory=list)
    equipamentos_por_descarga: dict[int, list[int]] = field(default_factory=dict)


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
        self.armazens = ArmazemService(session)

    # ------------------------------------------------------------------ agendar

    def agendar(self, cmd: AgendarCommand) -> Agendamento:
        """Cria um agendamento respeitando a regra de ocupação do horário. A contagem de
        ocupantes e o insert acontecem na mesma transação, sob a trava do slot."""
        self._validar_entrada(cmd)
        with transacao(self.session):
            self._validar_calendario(cmd)
            self.fornecedores.exigir_existente(cmd.fornecedor_id)

            chaves = [n.nf_chave for n in cmd.notas if n.nf_chave]
            if chaves and self._chaves_ja_agendadas(chaves):
                raise ConflitoError("Uma das notas fiscais já está agendada.")

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
                status=StatusAgendamento.PENDENTE_COMPRAS,
                agendado_na_hora=cmd.agendado_na_hora,
                limite_ignorado=False,
                origem=Origem.PLATAFORMA,
                criado_em=agora,
            )
            self.session.add(agendamento)
            self.session.flush()  # gera o id para as notas e a trilha de auditoria
            self.session.add_all(
                NotaFiscal(
                    agendamento_id=agendamento.id,
                    nf_chave=nota.nf_chave,
                    nf_numero=nota.nf_numero,
                    peso_total_kg=nota.peso_total_kg,
                    arquivo_nome=nota.arquivo_nome,
                    content_type=nota.content_type,
                    tamanho_bytes=len(nota.conteudo) if nota.conteudo else None,
                    conteudo=nota.conteudo,
                    ativa=True,
                    criado_em=agora,
                )
                for nota in cmd.notas
            )
            self.session.add(
                EventoAgendamento(
                    agendamento_id=agendamento.id,
                    de_status=None,
                    para_status=StatusAgendamento.PENDENTE_COMPRAS,
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

    # ------------------------------------------------------------------ Compras e armazém

    def decidir_compras(
        self,
        agendamento_id: int,
        decisao: DecisaoCompras,
        pedido_referencia: str | None = None,
        observacao: str | None = None,
    ) -> Agendamento:
        """1ª etapa da dupla validação: Compras confere a nota contra o pedido de compra.

        AUTORIZADO (exige o pedido de referência) -> o agendamento segue para o armazém.
        NAO_AUTORIZADO (exige o motivo) -> a vaga e as notas são liberadas, e a divergência
        entra nos não recebimentos."""
        pedido = _texto(pedido_referencia, 20)
        nota = _texto(observacao, 250)
        if decisao == DecisaoCompras.AUTORIZADO and pedido is None:
            raise RegraDeNegocioError("Informe o pedido de compra de referência para autorizar.")
        if decisao == DecisaoCompras.NAO_AUTORIZADO and nota is None:
            raise RegraDeNegocioError("Descreva a divergência encontrada entre a nota e o pedido.")

        with transacao(self.session):
            agendamento = self._carregar_travado(agendamento_id)
            agora = self.relogio.agora()
            if decisao == DecisaoCompras.AUTORIZADO:
                self._mudar_status(
                    agendamento,
                    StatusAgendamento.AUTORIZADO,
                    agora,
                    nota or "Nota conferida com o pedido de compra",
                )
            else:
                self._mudar_status(
                    agendamento,
                    StatusAgendamento.NAO_AUTORIZADO,
                    agora,
                    f"Divergência entre nota e pedido: {nota}",
                )
                self.session.add(
                    NaoRecebimento(
                        agendamento_id=agendamento.id,
                        fornecedor_id=agendamento.fornecedor_id,
                        data=agendamento.data_agendada,
                        motivo=MotivoNaoRecebimento.DIVERGENCIA_NF_PEDIDO,
                        descricao=nota,
                        origem=Origem.PLATAFORMA,
                        criado_em=agora,
                    )
                )
            self.session.add(
                ValidacaoCompras(
                    agendamento_id=agendamento.id,
                    decisao=decisao,
                    pedido_referencia=pedido,
                    observacao=nota,
                    decidido_em=agora,
                )
            )
        return agendamento

    def definir_destinos(
        self, agendamento_id: int, armazem_ids: Sequence[int], observacao: str | None = None
    ) -> Agendamento:
        """2ª etapa: o responsável do armazém verifica a autorização de Compras e informa em
        qual(is) armazém(ns) a carga será descarregada. Cria uma Descarga por destino."""
        destinos = sorted(set(armazem_ids))
        if not destinos:
            raise RegraDeNegocioError("Informe ao menos um armazém de destino.")

        with transacao(self.session):
            agendamento = self._carregar_travado(agendamento_id)
            if agendamento.status != StatusAgendamento.AUTORIZADO:
                if agendamento.status == StatusAgendamento.PENDENTE_COMPRAS:
                    raise ConflitoError(
                        "Compras precisa autorizar o agendamento antes de definir os destinos."
                    )
                raise ConflitoError(
                    f"O agendamento está '{agendamento.status.rotulo}' e não aceita definir destinos."
                )
            self.armazens.exigir_existentes(destinos)
            ja_definidos = self.session.scalar(
                select(exists().where(Descarga.agendamento_id == agendamento.id))
            )
            if ja_definidos:
                raise ConflitoError("Os armazéns de destino já foram definidos para este agendamento.")

            agora = self.relogio.agora()
            self.session.add_all(
                Descarga(agendamento_id=agendamento.id, armazem_id=armazem, criado_em=agora)
                for armazem in destinos
            )
            self.session.add(
                EventoAgendamento(
                    agendamento_id=agendamento.id,
                    de_status=agendamento.status,
                    para_status=agendamento.status,
                    tipo=TipoEvento.DESTINO,
                    observacao=_texto(observacao, 250) or "Armazém(ns) de destino definido(s)",
                    detalhe={"armazemIds": destinos},
                    ocorrido_em=agora,
                )
            )
        return agendamento

    # ------------------------------------------------------------------ consultas

    def detalhes(self, agendamento_ids: Sequence[int]) -> dict[int, DetalhesAgendamento]:
        """Notas, decisão de Compras e descargas de vários agendamentos, em 3 consultas."""
        resultado = {i: DetalhesAgendamento() for i in agendamento_ids}
        if not agendamento_ids:
            return resultado
        for nota in self.session.scalars(
            select(NotaFiscal).where(NotaFiscal.agendamento_id.in_(agendamento_ids)).order_by(NotaFiscal.id)
        ):
            resultado[nota.agendamento_id].notas.append(nota)
        for validacao in self.session.scalars(
            select(ValidacaoCompras).where(ValidacaoCompras.agendamento_id.in_(agendamento_ids))
        ):
            resultado[validacao.agendamento_id].validacao = validacao
        for descarga in self.session.scalars(
            select(Descarga)
            .where(Descarga.agendamento_id.in_(agendamento_ids))
            .order_by(Descarga.agendamento_id, Descarga.armazem_id)
        ):
            resultado[descarga.agendamento_id].descargas.append(descarga)
        ids_descargas = [
            descarga.id for detalhe in resultado.values() for descarga in detalhe.descargas
        ]
        if ids_descargas:
            descarga_para_agendamento = {
                descarga.id: agendamento_id
                for agendamento_id, detalhe in resultado.items()
                for descarga in detalhe.descargas
            }
            for vinculo in self.session.scalars(
                select(DescargaEquipamento).where(
                    DescargaEquipamento.descarga_id.in_(ids_descargas)
                )
            ):
                agendamento_id = descarga_para_agendamento[vinculo.descarga_id]
                resultado[agendamento_id].equipamentos_por_descarga.setdefault(
                    vinculo.descarga_id, []
                ).append(vinculo.equipamento_id)
        return resultado

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

    def _carregar_travado(self, agendamento_id: int) -> Agendamento:
        """Carrega o agendamento com lock de linha (SELECT ... FOR UPDATE): duas pessoas agindo
        sobre o mesmo agendamento são atendidas uma de cada vez, e a segunda vê o estado novo."""
        consulta = (
            select(Agendamento)
            .where(Agendamento.id == agendamento_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        agendamento = self.session.scalar(consulta)
        if agendamento is None:
            raise NaoEncontradoError(f"Agendamento não encontrado: {agendamento_id}")
        return agendamento

    def _mudar_status(
        self, agendamento: Agendamento, novo: StatusAgendamento, agora: datetime, observacao: str
    ) -> None:
        """Aplica uma transição válida e registra o evento; senão, 409 com o estado atual.
        Os status que liberam a vaga também liberam as notas fiscais para novo agendamento."""
        atual = agendamento.status
        if not atual.pode_ir(novo):
            if atual == novo:
                raise ConflitoError(f"Este agendamento já está '{atual.rotulo}'.")
            raise ConflitoError(
                f"O agendamento está '{atual.rotulo}' e não pode passar para '{novo.rotulo}'."
            )
        agendamento.status = novo
        if novo in STATUS_QUE_LIBERAM_VAGA:
            self.session.execute(
                update(NotaFiscal).where(NotaFiscal.agendamento_id == agendamento.id).values(ativa=False)
            )
        self.session.add(
            EventoAgendamento(
                agendamento_id=agendamento.id,
                de_status=atual,
                para_status=novo,
                tipo=TipoEvento.STATUS,
                observacao=observacao[:300],
                ocorrido_em=agora,
            )
        )

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

    def _chaves_ja_agendadas(self, chaves: Sequence[str]) -> bool:
        consulta = select(exists().where(NotaFiscal.nf_chave.in_(chaves), NotaFiscal.ativa.is_(True)))
        return bool(self.session.scalar(consulta))

    @staticmethod
    def _validar_entrada(cmd: AgendarCommand) -> None:
        if not domain.horario_valido(cmd.horario):
            raise RegraDeNegocioError("Horário inválido. Escolha entre 08h00, 10h00, 13h00 e 15h00.")
        chaves = [n.nf_chave for n in cmd.notas if n.nf_chave]
        if any(not _CHAVE_NFE.fullmatch(c) for c in chaves):
            raise RegraDeNegocioError("A chave de acesso da nota fiscal deve ter 44 dígitos.")
        if len(chaves) != len(set(chaves)):
            raise RegraDeNegocioError("A mesma nota fiscal foi informada mais de uma vez.")
        if any(n.peso_total_kg is not None and n.peso_total_kg < 0 for n in cmd.notas):
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


def _texto(valor: str | None, limite: int) -> str | None:
    """Texto livre do usuário: sem espaços nas pontas; vazio vira None; respeita o tamanho da coluna."""
    if valor is None or not valor.strip():
        return None
    limpo = valor.strip()
    if len(limpo) > limite:
        raise RegraDeNegocioError(f"O texto excede {limite} caracteres.")
    return limpo


def _motivo_sem_vaga(ocupantes: list[Acondicionamento], novo: Acondicionamento) -> str:
    if Acondicionamento.BATIDO in ocupantes:
        return "Horário sem vaga: já há uma carga batida, que reserva o horário inteiro."
    if novo == Acondicionamento.BATIDO:
        return "Horário sem vaga: carga batida exige o horário livre, e já há caminhões agendados."
    return "Horário sem vaga: o limite de 2 caminhões por horário foi atingido."
