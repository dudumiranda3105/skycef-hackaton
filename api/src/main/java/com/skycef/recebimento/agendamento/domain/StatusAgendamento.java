package com.skycef.recebimento.agendamento.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Maquina de estados do agendamento. Reagendamento e troca de destino nao mudam o
 * status: ficam registrados em evento_agendamento.
 */
public enum StatusAgendamento {
    AGENDADO,
    VALIDADO_COMPRAS,   // Compras confirmou nota x pedido
    AUTORIZADO,         // armazem verificou a autorizacao e definiu o(s) destino(s)
    CHEGOU,             // marco 1: encostou e entrou na fila
    EM_DESCARGA,        // marco 2: liberado, descarga iniciada
    CONCLUIDO,          // marco 3: descarga terminada
    CANCELADO,
    NAO_RECEBIDO;

    public Set<StatusAgendamento> proximos() {
        return switch (this) {
            case AGENDADO -> EnumSet.of(VALIDADO_COMPRAS, CANCELADO, NAO_RECEBIDO);
            case VALIDADO_COMPRAS -> EnumSet.of(AUTORIZADO, CANCELADO, NAO_RECEBIDO);
            case AUTORIZADO -> EnumSet.of(CHEGOU, CANCELADO, NAO_RECEBIDO);
            case CHEGOU -> EnumSet.of(EM_DESCARGA, NAO_RECEBIDO);
            case EM_DESCARGA -> EnumSet.of(CONCLUIDO);   // descarga iniciada nao e interrompida
            case CONCLUIDO, CANCELADO, NAO_RECEBIDO -> EnumSet.noneOf(StatusAgendamento.class);
        };
    }

    public boolean podeIr(StatusAgendamento destino) {
        return proximos().contains(destino);
    }

    /** Ocupa vaga no horario: nao cancelado nem nao recebido. */
    public boolean ocupaVaga() {
        return this != CANCELADO && this != NAO_RECEBIDO;
    }
}
