package com.skycef.recebimento.auth;

import java.security.SecureRandom;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Cria os usuários iniciais (um por perfil) na primeira subida, só se a tabela estiver vazia.
 * A senha vem de SENHA_INICIAL; sem ela, uma senha aleatória é gerada e aparece uma única vez no log da API.
 */
@Component
public class UsuarioSeeder implements ApplicationRunner {
    private static final Logger LOG = LoggerFactory.getLogger(UsuarioSeeder.class);

    private final AuthService auth;
    private final boolean ativa;
    private final String senhaInicial;

    public UsuarioSeeder(AuthService auth, @Value("${app.auth.ativa:true}") boolean ativa,
            @Value("${app.senha-inicial:}") String senhaInicial) {
        this.auth = auth;
        this.ativa = ativa;
        this.senhaInicial = senhaInicial;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!ativa) return;
        boolean gerada = senhaInicial == null || senhaInicial.isBlank();
        String senha = gerada ? gerarSenha() : senhaInicial;
        if (!auth.semear(senha)) return;
        if (gerada) {
            LOG.warn("Usuarios iniciais criados (admin, diretoria, compras, armazem, encarregado, fornecedor). "
                    + "Senha inicial gerada: {}  (troque em Alterar senha; defina SENHA_INICIAL para fixar uma)", senha);
        } else {
            LOG.info("Usuarios iniciais criados (admin, diretoria, compras, armazem, encarregado, fornecedor) "
                    + "com a senha de SENHA_INICIAL. Troque-a em Alterar senha.");
        }
    }

    private static String gerarSenha() {
        byte[] bytes = new byte[9];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
