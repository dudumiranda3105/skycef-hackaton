package com.skycef.recebimento.agendamento.domain;

/** Natureza de um registro na trilha de auditoria do agendamento. */
public enum TipoEvento {
    STATUS,         // mudanca de status
    REAGENDAMENTO,  // mudanca de data/horario (guarda os valores anteriores em `detalhe`)
    DESTINO,        // definicao/alteracao dos armazens de destino
    VAGA            // vaga liberada ou atribuida
}
