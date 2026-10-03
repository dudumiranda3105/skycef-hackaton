package com.skycef.recebimento.boletim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class BoletimCalculatorTest {
    private final BigDecimal piso = new BigDecimal("90.1731");
    private final List<BoletimCalculator.Linha> linhas = List.of(
            new BoletimCalculator.Linha(new BigDecimal("0.3224"), 2778, 0, 0),
            new BoletimCalculator.Linha(new BigDecimal("0.3224"), 70, 0, 0));

    @Test void pisoComOnzeDiarias() {
        var r = BoletimCalculator.calcular(linhas, 11, 0, piso);
        assertEquals("918.1952", BoletimCalculator.quatro(r.producaoTotal()));
        assertEquals("991.9041", BoletimCalculator.quatro(r.totalAPagar()));
        assertEquals("73.7089", BoletimCalculator.quatro(r.complemento()));
        assertEquals("83.4723", BoletimCalculator.quatro(r.valorPorDiaria()));
    }

    @Test void meiaDiaria() {
        var r = BoletimCalculator.calcular(linhas, 10, 1, piso);
        assertEquals("10.5", r.diariasEquivalentes().toPlainString());
        assertEquals("946.8176", BoletimCalculator.quatro(r.totalAPagar()));
        assertEquals("946.82", BoletimCalculator.duas(r.totalAPagar()));
    }

    @Test void semEquipeFicaInconsistente() {
        var r = BoletimCalculator.calcular(linhas, 0, 0, piso);
        assertEquals("INCONSISTENTE", r.situacao());
        assertNull(r.valorPorDiaria());
        assertNull(r.totalAPagar());
    }

    @Test void acimaDoPisoNaoTemTeto() {
        var r = BoletimCalculator.calcular(linhas, 1, 0, piso);
        assertEquals("918.1952", BoletimCalculator.quatro(r.totalAPagar()));
        assertEquals("0.0000", BoletimCalculator.quatro(r.complemento()));
    }
}
