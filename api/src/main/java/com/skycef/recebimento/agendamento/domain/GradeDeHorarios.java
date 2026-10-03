package com.skycef.recebimento.agendamento.domain;

import java.time.LocalTime;
import java.util.List;

/** Os quatro horarios disponiveis para agendamento (dossie, secao 4). */
public final class GradeDeHorarios {

    public static final List<LocalTime> HORARIOS = List.of(
            LocalTime.of(8, 0),
            LocalTime.of(10, 0),
            LocalTime.of(13, 0),
            LocalTime.of(15, 0));

    private GradeDeHorarios() {
    }

    public static boolean valido(LocalTime horario) {
        return HORARIOS.contains(horario);
    }
}
