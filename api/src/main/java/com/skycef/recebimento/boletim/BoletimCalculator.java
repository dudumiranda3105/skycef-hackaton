package com.skycef.recebimento.boletim;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/** Cálculo monetário do boletim; nunca usa ponto flutuante. */
public final class BoletimCalculator {
    private BoletimCalculator() {}

    public record Linha(BigDecimal precoUnitario, int descarga, int remocao, int transferencia) {
        public int quantidadeTotal() { return Math.addExact(Math.addExact(descarga, remocao), transferencia); }
        public BigDecimal valor() { return precoUnitario.multiply(BigDecimal.valueOf(quantidadeTotal())); }
    }

    public record Resultado(String situacao, BigDecimal producaoTotal, BigDecimal diariasEquivalentes,
            BigDecimal valorPorDiaria, BigDecimal totalAPagar, BigDecimal complemento, Boolean abaixoDoPiso) {}

    public static Resultado calcular(List<Linha> linhas, int completas, int meias, BigDecimal piso) {
        if (completas < 0 || meias < 0 || piso.signum() < 0) throw new IllegalArgumentException("Equipe ou piso inválido.");
        BigDecimal producao = linhas.stream().map(Linha::valor).reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(4, RoundingMode.HALF_UP);
        BigDecimal diarias = BigDecimal.valueOf(completas).add(BigDecimal.valueOf(meias).multiply(new BigDecimal("0.5")))
                .setScale(1, RoundingMode.UNNECESSARY);
        if (diarias.signum() == 0) {
            return new Resultado("INCONSISTENTE", producao, diarias, null, null, null, null);
        }
        BigDecimal porDiaria = producao.divide(diarias, 12, RoundingMode.HALF_UP);
        boolean abaixo = porDiaria.compareTo(piso) < 0;
        BigDecimal total = (abaixo ? piso.multiply(diarias) : producao).setScale(4, RoundingMode.HALF_UP);
        BigDecimal complemento = abaixo ? total.subtract(producao) : new BigDecimal("0.0000");
        return new Resultado("CONSISTENTE", producao, diarias,
                porDiaria.setScale(4, RoundingMode.HALF_UP), total, complemento, abaixo);
    }

    public static String quatro(BigDecimal valor) {
        return valor == null ? null : valor.setScale(4, RoundingMode.HALF_UP).toPlainString();
    }

    public static String duas(BigDecimal valor) {
        return valor == null ? null : valor.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
