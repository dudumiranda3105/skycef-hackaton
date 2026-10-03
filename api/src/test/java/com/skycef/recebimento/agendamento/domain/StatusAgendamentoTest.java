package com.skycef.recebimento.agendamento.domain;

import static com.skycef.recebimento.agendamento.domain.StatusAgendamento.*;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StatusAgendamentoTest {

    @Test
    void fluxoNormalAteConcluido() {
        assertThat(AGENDADO.podeIr(VALIDADO_COMPRAS)).isTrue();
        assertThat(VALIDADO_COMPRAS.podeIr(AUTORIZADO)).isTrue();
        assertThat(AUTORIZADO.podeIr(CHEGOU)).isTrue();
        assertThat(CHEGOU.podeIr(EM_DESCARGA)).isTrue();
        assertThat(EM_DESCARGA.podeIr(CONCLUIDO)).isTrue();
    }

    @Test
    void naoPulaEtapas() {
        assertThat(AGENDADO.podeIr(AUTORIZADO)).isFalse();
        assertThat(AGENDADO.podeIr(EM_DESCARGA)).isFalse();
    }

    @Test
    void descargaIniciadaNaoPodeSerCancelada() {
        assertThat(EM_DESCARGA.podeIr(CANCELADO)).isFalse();
        assertThat(EM_DESCARGA.podeIr(NAO_RECEBIDO)).isFalse();
    }

    @Test
    void estadosFinaisNaoTemSaida() {
        assertThat(CONCLUIDO.proximos()).isEmpty();
        assertThat(CANCELADO.proximos()).isEmpty();
        assertThat(NAO_RECEBIDO.proximos()).isEmpty();
    }

    @Test
    void cancelamentoLiberaVaga() {
        assertThat(CANCELADO.ocupaVaga()).isFalse();
        assertThat(NAO_RECEBIDO.ocupaVaga()).isFalse();
        assertThat(AGENDADO.ocupaVaga()).isTrue();
    }
}
