package com.skycef.recebimento.agendamento.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import org.junit.jupiter.api.Test;

class GradeDeHorariosTest {

    @Test
    void aceitaApenasOsQuatroHorarios() {
        assertThat(GradeDeHorarios.valido(LocalTime.of(8, 0))).isTrue();
        assertThat(GradeDeHorarios.valido(LocalTime.of(10, 0))).isTrue();
        assertThat(GradeDeHorarios.valido(LocalTime.of(13, 0))).isTrue();
        assertThat(GradeDeHorarios.valido(LocalTime.of(15, 0))).isTrue();
    }

    @Test
    void rejeitaQualquerOutroHorario() {
        assertThat(GradeDeHorarios.valido(LocalTime.of(9, 0))).isFalse();
        assertThat(GradeDeHorarios.valido(LocalTime.of(8, 30))).isFalse();
        assertThat(GradeDeHorarios.valido(LocalTime.of(14, 0))).isFalse();
    }

    @Test
    void horarioNuloNaoEValidoENaoLancaExcecao() {
        assertThat(GradeDeHorarios.valido(null)).isFalse();
    }
}
