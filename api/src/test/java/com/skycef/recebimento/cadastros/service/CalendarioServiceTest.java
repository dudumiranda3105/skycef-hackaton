package com.skycef.recebimento.cadastros.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.skycef.recebimento.cadastros.entity.Feriado;
import com.skycef.recebimento.cadastros.repository.FeriadoRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CalendarioServiceTest {

    private FeriadoRepository feriados;
    private CalendarioService calendario;

    @BeforeEach
    void setUp() {
        feriados = mock(FeriadoRepository.class);
        calendario = new CalendarioService(feriados);
    }

    @Test
    void sabadoEDomingoNaoSaoDiasUteis_semConsultarFeriados() {
        assertThat(calendario.motivoDiaNaoUtil(LocalDate.of(2026, 10, 10))).isPresent();   // sabado
        assertThat(calendario.motivoDiaNaoUtil(LocalDate.of(2026, 10, 11))).isPresent();   // domingo
        verifyNoInteractions(feriados);
    }

    @Test
    void feriadoNaoEDiaUtil() {
        LocalDate aparecida = LocalDate.of(2026, 10, 12);   // segunda-feira
        Feriado feriado = mock(Feriado.class);
        when(feriado.getDescricao()).thenReturn("Nossa Senhora Aparecida");
        when(feriados.findById(aparecida)).thenReturn(Optional.of(feriado));

        assertThat(calendario.motivoDiaNaoUtil(aparecida))
                .hasValueSatisfying(m -> assertThat(m).contains("feriados").contains("Aparecida"));
    }

    @Test
    void diaUtilComum() {
        LocalDate terca = LocalDate.of(2026, 10, 6);
        when(feriados.findById(terca)).thenReturn(Optional.empty());

        assertThat(calendario.motivoDiaNaoUtil(terca)).isEmpty();
    }
}
