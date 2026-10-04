/** Autorização por endpoint. Rotas sem regra explícita são negadas. */
package com.skycef.recebimento.auth;

import java.util.Set;

public final class Permissoes {
    private static final Set<String> AGENDA = Set.of(
            "ADMIN", "DIRETORIA", "COMPRAS", "ARMAZEM", "ENCARREGADO", "FORNECEDOR", "INSUMO", "PORTEIRO");
    private static final Set<String> BOLETIM = Set.of("ADMIN", "DIRETORIA", "ARMAZEM", "ENCARREGADO");
    private static final Set<String> LANCAR_BOLETIM = Set.of("ADMIN", "ARMAZEM", "ENCARREGADO");
    private static final Set<String> PAINEL = Set.of("ADMIN", "DIRETORIA", "ARMAZEM");
    private static final Set<String> HISTORICO = Set.of("ADMIN", "COMPRAS", "ARMAZEM", "INSUMO");
    private static final Set<String> CADASTROS = Set.of(
            "ADMIN", "DIRETORIA", "COMPRAS", "ARMAZEM", "ENCARREGADO", "FORNECEDOR", "INSUMO", "PORTEIRO");
    private static final Set<String> OPERACAO_AGENDA = Set.of(
            "ADMIN", "DIRETORIA", "COMPRAS", "ARMAZEM", "FORNECEDOR", "INSUMO", "PORTEIRO");

    private Permissoes() { }

    public static boolean permite(String papel, String metodo, String caminho) {
        if ("ADMIN".equals(papel)) return true;
        if (caminho.startsWith("/api/auth/")) return true;
        if (caminho.startsWith("/api/usuarios")) return false;

        boolean leitura = "GET".equals(metodo) || "HEAD".equals(metodo);
        if (caminho.startsWith("/api/painel")) return leitura && PAINEL.contains(papel);
        if (caminho.startsWith("/api/historico/")) return leitura && HISTORICO.contains(papel);
        if (caminho.equals("/api/armazens")) return leitura && CADASTROS.contains(papel);
        if (caminho.equals("/api/fornecedores"))
            return leitura ? CADASTROS.contains(papel) : Set.of("FORNECEDOR", "ARMAZEM", "PORTEIRO").contains(papel);
        if (caminho.equals("/api/equipamentos") || caminho.equals("/api/estoques")
                || caminho.equals("/api/equipamentos/catalogo-oficial"))
            return leitura && Set.of("ARMAZEM", "INSUMO").contains(papel);
        if (caminho.equals("/api/boletim/tipos-item") || caminho.equals("/api/chapas"))
            return leitura && BOLETIM.contains(papel);
        if (caminho.equals("/api/boletins")) return leitura && BOLETIM.contains(papel);
        if (caminho.matches("/api/boletins/\\d+")) return leitura && BOLETIM.contains(papel);
        if (caminho.equals("/api/boletins/calculo")) return !leitura && LANCAR_BOLETIM.contains(papel);
        if (caminho.equals("/api/boletins/dia")) return !leitura && LANCAR_BOLETIM.contains(papel);

        if (caminho.equals("/api/agenda")) return leitura && AGENDA.contains(papel);
        if (caminho.equals("/api/agendamentos"))
            return leitura ? AGENDA.contains(papel) : Set.of("FORNECEDOR", "ARMAZEM", "PORTEIRO").contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+")) return leitura && AGENDA.contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/eventos")) return leitura && AGENDA.contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/notas/\\d+/arquivo"))
            return Set.of("FORNECEDOR", "ARMAZEM", "PORTEIRO", "COMPRAS").contains(papel) || (leitura && "INSUMO".equals(papel));
        if (caminho.matches("/api/agendamentos/\\d+/portaria/(conferencia|enviar)"))
            return "POST".equals(metodo) && "PORTEIRO".equals(papel);
        if (caminho.equals("/api/insumos/recebimentos")) return leitura && "INSUMO".equals(papel);
        if (caminho.matches("/api/insumos/recebimentos/\\d+/decisao")) return "POST".equals(metodo) && "INSUMO".equals(papel);
        if (caminho.matches("/api/agendamentos/\\d+/validacao-compras")) return !leitura && "COMPRAS".equals(papel);
        if (caminho.matches("/api/agendamentos/\\d+/destinos")) return !leitura && Set.of("ARMAZEM", "INSUMO").contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/chegada") || caminho.matches("/api/descargas/\\d+/chegada"))
            return !leitura && Set.of("ARMAZEM", "PORTEIRO").contains(papel);
        if (caminho.matches("/api/descargas/\\d+/(entrada|saida)")) return !leitura && "ARMAZEM".equals(papel);
        if (caminho.matches("/api/agendamentos/\\d+/(reagendamento|cancelamento)"))
            return !leitura && Set.of("FORNECEDOR", "ARMAZEM").contains(papel);
        if (caminho.matches("/api/agendamentos/\\d+/cancelamento/efetivacao")) return !leitura && "ARMAZEM".equals(papel);
        if (caminho.equals("/api/vagas-liberadas")) return leitura && OPERACAO_AGENDA.contains(papel);
        if (caminho.matches("/api/vagas-liberadas/\\d+/candidatos")) return leitura && "ARMAZEM".equals(papel);
        if (caminho.matches("/api/vagas-liberadas/\\d+/(atribuicao|liberacao-geral)")) return !leitura && "ARMAZEM".equals(papel);
        if (caminho.equals("/api/nao-recebimentos"))
            return leitura ? Set.of("DIRETORIA", "COMPRAS", "ARMAZEM", "INSUMO", "PORTEIRO").contains(papel)
                    : Set.of("ARMAZEM", "PORTEIRO").contains(papel);
        return false;
    }
}
