package com.skycef.recebimento.boletim.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** Casos do dossie: Armazem de Adubo, 17/11/2025 (secao 8). */
class PisoCalculatorTest {

    // 2.848 unidades x R$ 0,3224
    private static final BigDecimal PRODUCAO_ADUBO = new BigDecimal("2848").multiply(new BigDecimal("0.3224"));

    @Test
    void exemploDoDossie_11chapasDiariaCompleta_pagaPisoComComplemento() {
        var r = PisoCalculator.calcular(PRODUCAO_ADUBO, 11, 0);

        assertThat(r.producaoTotal()).isEqualByComparingTo("918.20");
        assertThat(r.diariasEquivalentes()).isEqualByComparingTo("11");
        assertThat(r.valorPorDiaria()).isEqualByComparingTo("83.47");
        assertThat(r.totalAPagar()).isEqualByComparingTo("991.90");
        assertThat(r.complemento()).isEqualByComparingTo("73.71");
        assertThat(r.abaixoDoPiso()).isTrue();
    }

    @Test
    void variacaoDoDossie_umaMeiaDiaria() {
        var r = PisoCalculator.calcular(PRODUCAO_ADUBO, 11, 1);

        assertThat(r.diariasEquivalentes()).isEqualByComparingTo("10.5");
        assertThat(r.valorPorDiaria()).isEqualByComparingTo("87.45");
        assertThat(r.totalAPagar()).isEqualByComparingTo("946.82");
        assertThat(r.complemento()).isEqualByComparingTo("28.62");
    }

    @Test
    void acimaDoPiso_naoHaTeto_pagaProducaoSemComplemento() {
        var r = PisoCalculator.calcular(new BigDecimal("2000.00"), 11, 0);

        assertThat(r.abaixoDoPiso()).isFalse();
        assertThat(r.totalAPagar()).isEqualByComparingTo("2000.00");
        assertThat(r.complemento()).isEqualByComparingTo("0");
    }

    @Test
    void rejeitaBoletimSemChapas() {
        assertThatThrownBy(() -> PisoCalculator.calcular(PRODUCAO_ADUBO, 0, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejeitaMaisMeiasQueChapas() {
        assertThatThrownBy(() -> PisoCalculator.calcular(PRODUCAO_ADUBO, 2, 3))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
