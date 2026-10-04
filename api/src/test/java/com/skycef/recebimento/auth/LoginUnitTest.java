package com.skycef.recebimento.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class LoginUnitTest {
    @Test
    void senhaConfereSoComAOriginalECadaHashTemSalProprio() {
        String hash = Senhas.hash("segredo-forte-1");
        assertTrue(Senhas.confere("segredo-forte-1", hash));
        assertFalse(Senhas.confere("segredo-forte-2", hash));
        assertNotEquals(hash, Senhas.hash("segredo-forte-1"));
        assertTrue(hash.startsWith("pbkdf2$"));
    }

    @Test
    void hashInvalidoOuNuloNuncaConfere() {
        assertFalse(Senhas.confere("x", "lixo"));
        assertFalse(Senhas.confere("x", "pbkdf2$1$a$b"));
        assertFalse(Senhas.confere(null, Senhas.hash("abc12345")));
        assertFalse(Senhas.confere("abc12345", null));
    }

    @Test
    void tokenGuardadoComoSha256ENuncaEmTextoPuro() {
        String hash = AuthService.hashToken("token-de-teste");
        assertEquals(64, hash.length());
        assertEquals(hash, AuthService.hashToken("token-de-teste"));
        assertNotEquals(hash, AuthService.hashToken("outro-token"));
    }

    @Test
    void cadaPerfilSoFazOQueOProcessoPermite() {
        // Compras só valida; fornecedor não valida nem recebe
        assertTrue(Permissoes.permite("COMPRAS", "POST", "/api/agendamentos/5/validacao-compras"));
        assertFalse(Permissoes.permite("FORNECEDOR", "POST", "/api/agendamentos/5/validacao-compras"));
        assertFalse(Permissoes.permite("ARMAZEM", "POST", "/api/agendamentos/5/validacao-compras"));
        // fornecedor agenda e anexa a nota; não registra descarga
        assertTrue(Permissoes.permite("FORNECEDOR", "POST", "/api/agendamentos"));
        assertTrue(Permissoes.permite("FORNECEDOR", "POST", "/api/agendamentos/5/notas/9/arquivo"));
        assertFalse(Permissoes.permite("FORNECEDOR", "POST", "/api/descargas/3/entrada"));
        assertFalse(Permissoes.permite("FORNECEDOR", "POST", "/api/agendamentos/5/destinos"));
        // armazém recebe; encarregado fecha o boletim e só isso
        assertTrue(Permissoes.permite("ARMAZEM", "POST", "/api/descargas/3/saida"));
        assertTrue(Permissoes.permite("ENCARREGADO", "POST", "/api/boletins"));
        assertTrue(Permissoes.permite("ENCARREGADO", "POST", "/api/boletins/calculo"));
        assertFalse(Permissoes.permite("ENCARREGADO", "POST", "/api/descargas/3/saida"));
        assertFalse(Permissoes.permite("COMPRAS", "POST", "/api/boletins"));
        // painel: direção e armazém; usuários: só administrador
        assertTrue(Permissoes.permite("DIRETORIA", "GET", "/api/painel/operacao"));
        assertFalse(Permissoes.permite("FORNECEDOR", "GET", "/api/painel/operacao"));
        assertFalse(Permissoes.permite("DIRETORIA", "POST", "/api/boletins"));
        assertFalse(Permissoes.permite("ARMAZEM", "GET", "/api/usuarios"));
        assertTrue(Permissoes.permite("ADMIN", "GET", "/api/usuarios"));
        // qualquer perfil lê a agenda e cuida da própria conta
        assertTrue(Permissoes.permite("DIRETORIA", "GET", "/api/agendamentos"));
        assertTrue(Permissoes.permite("FORNECEDOR", "POST", "/api/auth/senha"));
    }
}
