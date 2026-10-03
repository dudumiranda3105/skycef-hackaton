package com.skycef.recebimento.agendamento.domain;

import static com.skycef.recebimento.agendamento.domain.Acondicionamento.BATIDO;
import static com.skycef.recebimento.agendamento.domain.Acondicionamento.BIG_BAG;
import static com.skycef.recebimento.agendamento.domain.Acondicionamento.PALETIZADO;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class PoliticaDeVagasTest {

    @Test
    void horarioVazio_aceitaQualquerTipo() {
        assertThat(PoliticaDeVagas.cabe(List.of(), BATIDO, false)).isTrue();
        assertThat(PoliticaDeVagas.cabe(List.of(), PALETIZADO, false)).isTrue();
        assertThat(PoliticaDeVagas.cabe(List.of(), BIG_BAG, false)).isTrue();
    }

    @Test
    void cargaBatida_reservaOHorarioSomenteParaSi() {
        assertThat(PoliticaDeVagas.cabe(List.of(BATIDO), PALETIZADO, false)).isFalse();
        assertThat(PoliticaDeVagas.cabe(List.of(BATIDO), BATIDO, false)).isFalse();
        assertThat(PoliticaDeVagas.cabe(List.of(PALETIZADO), BATIDO, false)).isFalse();
    }

    @Test
    void semBatido_aceitaAteDoisCaminhoes() {
        assertThat(PoliticaDeVagas.cabe(List.of(PALETIZADO), BIG_BAG, false)).isTrue();
        assertThat(PoliticaDeVagas.cabe(List.of(PALETIZADO, BIG_BAG), PALETIZADO, false)).isFalse();
    }

    @Test
    void casoFortuito_desconsideraOLimite() {
        assertThat(PoliticaDeVagas.cabe(List.of(PALETIZADO, BIG_BAG), PALETIZADO, true)).isTrue();
        assertThat(PoliticaDeVagas.cabe(List.of(BATIDO), BATIDO, true)).isTrue();
    }
}
