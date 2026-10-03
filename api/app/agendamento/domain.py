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
    """Máquina de estados do agendamento. Reagendar e trocar destino não mudam o status:
    ficam registrados na trilha de eventos."""

    AGENDADO = "AGENDADO"
    VALIDADO_COMPRAS = "VALIDADO_COMPRAS"  # Compras confirmou nota x pedido
    AUTORIZADO = "AUTORIZADO"  # o armazém verificou a autorização e definiu o(s) destino(s)
    CHEGOU = "CHEGOU"  # marco 1: encostou e entrou na fila
    EM_DESCARGA = "EM_DESCARGA"  # marco 2: liberado, descarga iniciada
    CONCLUIDO = "CONCLUIDO"  # marco 3: descarga terminada
    CANCELADO = "CANCELADO"
    NAO_RECEBIDO = "NAO_RECEBIDO"

    def proximos(self) -> frozenset["StatusAgendamento"]:
        return _TRANSICOES[self]

    def pode_ir(self, destino: "StatusAgendamento") -> bool:
        return destino in _TRANSICOES[self]

    def ocupa_vaga(self) -> bool:
        """Cancelado e não recebido liberam a vaga do horário."""
        return self not in STATUS_QUE_LIBERAM_VAGA


_S = StatusAgendamento
_TRANSICOES: dict[StatusAgendamento, frozenset[StatusAgendamento]] = {
    _S.AGENDADO: frozenset({_S.VALIDADO_COMPRAS, _S.CANCELADO, _S.NAO_RECEBIDO}),
    _S.VALIDADO_COMPRAS: frozenset({_S.AUTORIZADO, _S.CANCELADO, _S.NAO_RECEBIDO}),
    # o caminhão pode chegar antes de ser autorizado (sem aviso prévio): ver o dossiê, seção 4
    _S.AUTORIZADO: frozenset({_S.CHEGOU, _S.CANCELADO, _S.NAO_RECEBIDO}),
    _S.CHEGOU: frozenset({_S.EM_DESCARGA, _S.NAO_RECEBIDO}),
    _S.EM_DESCARGA: frozenset({_S.CONCLUIDO}),  # descarga iniciada não é interrompida
    _S.CONCLUIDO: frozenset(),
    _S.CANCELADO: frozenset(),
    _S.NAO_RECEBIDO: frozenset(),
}

STATUS_QUE_LIBERAM_VAGA: frozenset[StatusAgendamento] = frozenset({_S.CANCELADO, _S.NAO_RECEBIDO})


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
