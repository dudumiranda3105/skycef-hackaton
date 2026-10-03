package com.skycef.recebimento.agendamento.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** Disponibilidade da grade de um dia, para o fornecedor escolher o horario. */
public record GradeDoDia(LocalDate data, boolean diaUtil, String motivoIndisponivel, List<Slot> slots) {

    /**
     * @param ocupados            caminhoes que ocupam o horario (inclui vagas canceladas ainda em aberto)
     * @param aceitaBatido        cabe uma carga batida (exige o horario vazio)
     * @param aceitaPaletizadoOuBigBag cabe uma carga paletizada ou em big bag
     */
    public record Slot(LocalTime horario, int ocupados, boolean aceitaBatido, boolean aceitaPaletizadoOuBigBag) {
    }
}
