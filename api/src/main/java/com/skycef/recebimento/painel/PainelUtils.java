package com.skycef.recebimento.painel;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;

final class PainelUtils {
    private PainelUtils() {}

    static Map<String, Object> map(Object... entries) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < entries.length; i += 2) result.put((String) entries[i], entries[i + 1]);
        return result;
    }

    static BigDecimal decimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        return value instanceof BigDecimal d ? d : new BigDecimal(value.toString());
    }

    static long number(Object value) { return value == null ? 0 : ((Number) value).longValue(); }
    static String money(BigDecimal value) { return value.setScale(4, RoundingMode.HALF_EVEN).toPlainString(); }
    static String decimalText(BigDecimal value, int scale) { return value.setScale(scale, RoundingMode.HALF_EVEN).toPlainString(); }
    static double round(double value, int places) {
        return BigDecimal.valueOf(value).setScale(places, RoundingMode.HALF_EVEN).doubleValue();
    }
}
