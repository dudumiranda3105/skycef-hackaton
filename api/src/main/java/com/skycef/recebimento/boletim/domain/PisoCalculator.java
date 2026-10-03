package com.skycef.recebimento.boletim.domain;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * Regra do piso do Boletim Diario de Servicos (dossie, secao 8).
 *
 * <pre>
 * diarias equivalentes = n. de chapas - 0,5 por meia diaria
 * valor por diaria     = producao total / diarias equivalentes
 * se valor por diaria menor que o piso: total = piso * diarias equivalentes; complemento = total - producao
 * senao:                                 total = producao;                    complemento = 0
 * </pre>
 *
 * Os calculos usam precisao total; so as saidas sao arredondadas (2 casas, HALF_UP).
 */
public final class PisoCalculator {

    public static final BigDecimal PISO_DIARIA_COMPLETA = new BigDecimal("90.1731");

    private static final BigDecimal MEIA = new BigDecimal("0.5");
    private static final MathContext MC = MathContext.DECIMAL128;

    private PisoCalculator() {
    }

    public record Resultado(
            BigDecimal producaoTotal,
            BigDecimal diariasEquivalentes,
            BigDecimal valorPorDiaria,
            BigDecimal totalAPagar,
            BigDecimal complemento,
            boolean abaixoDoPiso) {
    }

    public static Resultado calcular(BigDecimal producaoTotal, int totalChapas, int meiasDiarias) {
        return calcular(producaoTotal, totalChapas, meiasDiarias, PISO_DIARIA_COMPLETA);
    }

    public static Resultado calcular(BigDecimal producaoTotal, int totalChapas, int meiasDiarias,
                                     BigDecimal piso) {
        if (producaoTotal == null || producaoTotal.signum() < 0) {
            throw new IllegalArgumentException("Producao total invalida");
        }
        if (totalChapas <= 0) {
            throw new IllegalArgumentException("O boletim precisa de ao menos 1 chapa");
        }
        if (meiasDiarias < 0 || meiasDiarias > totalChapas) {
            throw new IllegalArgumentException("Meias diarias deve estar entre 0 e o total de chapas");
        }

        BigDecimal diarias = BigDecimal.valueOf(totalChapas).subtract(MEIA.multiply(BigDecimal.valueOf(meiasDiarias)));
        BigDecimal valorPorDiaria = producaoTotal.divide(diarias, MC);
        boolean abaixoDoPiso = valorPorDiaria.compareTo(piso) < 0;

        BigDecimal total = abaixoDoPiso ? piso.multiply(diarias, MC) : producaoTotal;
        BigDecimal complemento = abaixoDoPiso ? total.subtract(producaoTotal) : BigDecimal.ZERO;

        return new Resultado(
                arredonda(producaoTotal),
                diarias,
                arredonda(valorPorDiaria),
                arredonda(total),
                arredonda(complemento),
                abaixoDoPiso);
    }

    private static BigDecimal arredonda(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }
}
