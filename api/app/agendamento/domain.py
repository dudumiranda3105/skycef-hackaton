"""Regras puras do agendamento: sem banco, sem FastAPI. É o que os testes unitários cobrem."""

from collections.abc import Sequence
from datetime import time
from enum import StrEnum


class Acondicionamento(StrEnum):
    """Como a carga vem acondicionada. Um caminhão traz sempre um único tipo (não há carga mista)."""

    BATIDO = "BATIDO"  # solto, movimentado manualmente saco a saco
    PALETIZADO = "PALETIZADO"  # sacaria em paletes, descarregada com empilhadeira
    BIG_BAG = "BIG_BAG"  # descarregado com empilhadeira


class StatusAgendamento(StrEnum):
    """Máquina de estados do agendamento (decisão técnica nossa, não regra da Cocapec).

    Chegada, entrada e saída são marcos de cada Descarga, não status do agendamento.
    Reagendar e definir destinos não mudam o status: ficam na trilha de eventos."""

    PENDENTE_COMPRAS = "PENDENTE_COMPRAS"  # agendado; aguardando a decisão de Compras
    AUTORIZADO = "AUTORIZADO"  # Compras autorizou: a nota confere com o pedido
    NAO_AUTORIZADO = "NAO_AUTORIZADO"  # Compras recusou: a nota diverge do pedido
    EM_DESCARGA = "EM_DESCARGA"  # alguma descarga começou (marco de entrada)
    CONCLUIDO = "CONCLUIDO"  # todas as descargas terminaram
    CANCELADO = "CANCELADO"
    NAO_RECEBIDO = "NAO_RECEBIDO"

    def proximos(self) -> frozenset["StatusAgendamento"]:
        return _TRANSICOES[self]

    def pode_ir(self, destino: "StatusAgendamento") -> bool:
        return destino in _TRANSICOES[self]

    def ocupa_vaga(self) -> bool:
        """Cancelado e não recebido liberam a vaga do horário."""
        return self not in STATUS_QUE_LIBERAM_VAGA

    @property
    def rotulo(self) -> str:
        """Nome exibido ao usuário; é o mesmo vocabulário do front."""
        return _ROTULOS[self]


_S = StatusAgendamento
_TRANSICOES: dict[StatusAgendamento, frozenset[StatusAgendamento]] = {
    _S.PENDENTE_COMPRAS: frozenset({_S.AUTORIZADO, _S.NAO_AUTORIZADO, _S.CANCELADO, _S.NAO_RECEBIDO}),
    _S.AUTORIZADO: frozenset({_S.EM_DESCARGA, _S.CANCELADO, _S.NAO_RECEBIDO}),
    _S.EM_DESCARGA: frozenset({_S.CONCLUIDO}),  # descarga iniciada não é interrompida
    _S.NAO_AUTORIZADO: frozenset(),
    _S.CONCLUIDO: frozenset(),
    _S.CANCELADO: frozenset(),
    _S.NAO_RECEBIDO: frozenset(),
}

_ROTULOS: dict[StatusAgendamento, str] = {
    _S.PENDENTE_COMPRAS: "Aguardando Compras",
    _S.AUTORIZADO: "Autorizado",
    _S.NAO_AUTORIZADO: "Não autorizado",
    _S.EM_DESCARGA: "Descarregando",
    _S.CONCLUIDO: "Concluído",
    _S.CANCELADO: "Cancelado",
    _S.NAO_RECEBIDO: "Não recebido",
}

# Cancelado, recusado por Compras e não recebido não vão mais descarregar: liberam a vaga e a NF
STATUS_QUE_LIBERAM_VAGA: frozenset[StatusAgendamento] = frozenset(
    {_S.CANCELADO, _S.NAO_AUTORIZADO, _S.NAO_RECEBIDO}
)


class TipoEvento(StrEnum):
    """Natureza de um registro na trilha de auditoria."""

    STATUS = "STATUS"
    REAGENDAMENTO = "REAGENDAMENTO"
    DESTINO = "DESTINO"
    VAGA = "VAGA"


class StatusVagaLiberada(StrEnum):
    """Situação de uma vaga liberada por cancelamento."""

    ABERTA = "ABERTA"  # aguardando o responsável do armazém; continua contando como ocupada
    ATRIBUIDA = "ATRIBUIDA"  # o responsável escolheu quem a ocupa
    LIBERADA_GERAL = "LIBERADA_GERAL"  # devolvida para novos agendamentos


class MotivoNaoRecebimento(StrEnum):
    """Motivos de não recebimento definidos no regulamento (Tarefa 1)."""

    DIVERGENCIA_NF_PEDIDO = "DIVERGENCIA_NF_PEDIDO"
    SEM_AGENDAMENTO_SEM_VAGA = "SEM_AGENDAMENTO_SEM_VAGA"
    CASO_FORTUITO = "CASO_FORTUITO"
    OUTRO = "OUTRO"  # exige descrição


class DecisaoCompras(StrEnum):
    """Decisão do setor de Compras ao conferir a nota fiscal contra o pedido."""

    AUTORIZADO = "AUTORIZADO"
    NAO_AUTORIZADO = "NAO_AUTORIZADO"


class SituacaoCancelamento(StrEnum):
    """Cancelamento: solicitação, depois efetivação (que é quando a vaga é liberada)."""

    SOLICITADO = "SOLICITADO"
    EFETIVADO = "EFETIVADO"


# Os quatro horários disponíveis (dossiê, seção 4)
HORARIOS: tuple[time, ...] = (time(8, 0), time(10, 0), time(13, 0), time(15, 0))


def horario_valido(horario: time | None) -> bool:
    return horario is not None and horario in HORARIOS


MAX_NAO_BATIDO_POR_HORARIO = 2


def cabe(
    ocupantes: Sequence[Acondicionamento],
    novo: Acondicionamento,
    ignorar_limite: bool = False,
) -> bool:
    """Regra de ocupação de horário (dossiê, seção 4).

    - Carga batida reserva o horário somente para si.
    - Sem carga batida, cabem até 2 caminhões (paletizados ou big bag).
    - O limite vale para a cooperativa inteira, não por armazém: quem chama passa os
      ocupantes de TODOS os armazéns naquele (data, horário).
    - No reagendamento por caso fortuito o limite pode ser desconsiderado.
    """
    if ignorar_limite:
        return True
    if Acondicionamento.BATIDO in ocupantes:
        return False
    if novo == Acondicionamento.BATIDO:
        return len(ocupantes) == 0
    return len(ocupantes) < MAX_NAO_BATIDO_POR_HORARIO
