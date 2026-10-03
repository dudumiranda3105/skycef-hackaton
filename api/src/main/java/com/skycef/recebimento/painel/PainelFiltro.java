package com.skycef.recebimento.painel;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

record PainelFiltro(LocalDate de, LocalDate ate, Integer armazemId, String origem) {
    String sql(String data, String armazem, String origemCol, List<Object> args) {
        StringBuilder s = new StringBuilder();
        if (de != null) { s.append(" and ").append(data).append(" >= ?"); args.add(de); }
        if (ate != null) { s.append(" and ").append(data).append(" <= ?"); args.add(ate); }
        if (armazemId != null && armazem != null) { s.append(" and ").append(armazem).append(" = ?"); args.add(armazemId); }
        if (origem != null && origemCol != null) { s.append(" and ").append(origemCol).append(" = ?"); args.add(origem); }
        return s.toString();
    }

    List<Object> args() { return new ArrayList<>(); }

    Map<String, Object> json() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("de", de); m.put("ate", ate); m.put("armazemId", armazemId);
        m.put("origem", origem == null ? "TODAS" : origem);
        return m;
    }
}
