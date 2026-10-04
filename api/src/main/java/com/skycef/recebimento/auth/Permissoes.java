package com.skycef.recebimento.auth;

import java.util.Set;

/**
 * Quem pode chamar o quê. Regra simples e num lugar só:
 * ADMIN faz tudo; ler (GET) é liberado para quem entrou, exceto o painel gerencial e os usuários;
 * cada gravação pertence ao perfil do processo (Compras valida, armazém recebe, encarregado fecha o boletim...).
 */
public final class Permissoes {
    private static final Set<String> PAINEL = Set.of("DIRETORIA", "ARMAZEM");
    private static final Set<String> BOLETIM = Set.of("ENCARREGADO", "ARMAZEM");
    private static final Set<String> AGENDAR = Set.of("FORNECEDOR", "ARMAZEM", "PORTEIRO");

    private Permissoes() { }

    public static boolean permite(String papel, String metodo, String caminho) {
        if ("ADMIN".equals(papel)) return true;
        if (caminho.startsWith("/api/auth/")) return true;
        if (caminho.startsWith("/api/usuarios")) return false;
        if (caminho.startsWith("/api/painel")) return PAINEL.contains(papel);
        boolean leitura = "GET".equals(metodo) || "HEAD".equals(metodo);
        if (leitura) return true;
        if (caminho.endsWith("/validacao-compras")) return "COMPRAS".equals(papel);
        if (caminho.startsWith("/api/boletins")) return BOLETIM.contains(papel);
        if (caminho.equals("/api/fornecedores")) return Set.of("FORNECEDOR", "ARMAZEM").contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/notas/\\d+/arquivo")) return Set.of("FORNECEDOR", "ARMAZEM", "PORTEIRO").contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/(reagendamento|cancelamento)")) return Set.of("FORNECEDOR", "ARMAZEM").contains(papel);
        if (caminho.equals("/api/agendamentos")) return AGENDAR.contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/destinos")) return Set.of("ARMAZEM", "INSUMO").contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/chegada") || caminho.matches("/api/descargas/\\d+/chegada"))
            return Set.of("ARMAZEM", "PORTEIRO").contains(papel);
        /* destinos, chegada, descargas, vagas liberadas, efetivação de cancelamento e não recebimentos */
        return "ARMAZEM".equals(papel);
    }
}
