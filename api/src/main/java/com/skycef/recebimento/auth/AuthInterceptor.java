package com.skycef.recebimento.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Exige login em toda a /api, exceto entrar e sair. Com app.auth.ativa=false (usado nos testes de integração e
 * em desenvolvimento) não exige nada, e /api/auth/me responde como "acesso livre".
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {
    public static final String ATRIBUTO = "ri.usuario";
    private static final Set<String> PUBLICAS = Set.of("/api/auth/login", "/api/auth/logout");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AuthService auth;
    private final boolean ativa;

    public AuthInterceptor(AuthService auth, @Value("${app.auth.ativa:true}") boolean ativa) {
        this.auth = auth;
        this.ativa = ativa;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws IOException {
        if (!ativa || "OPTIONS".equals(req.getMethod())) return true;
        String caminho = req.getRequestURI();
        if (PUBLICAS.contains(caminho)) return true;
        Optional<AuthService.Usuario> usuario = auth.autenticar(token(req));
        if (usuario.isEmpty()) {
            responder(res, 401, "NAO_AUTENTICADO", "Entre com seu usuário e senha para continuar.");
            return false;
        }
        AuthService.Usuario u = usuario.get();
        if (!Permissoes.permite(u.papel(), req.getMethod(), caminho)) {
            responder(res, 403, "SEM_PERMISSAO", "O seu perfil (" + u.papel() + ") não pode fazer esta ação.");
            return false;
        }
        req.setAttribute(ATRIBUTO, u);
        return true;
    }

    static String token(HttpServletRequest req) {
        Cookie[] cookies = req.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (AuthService.COOKIE.equals(c.getName())) return c.getValue();
        }
        return null;
    }

    private static void responder(HttpServletResponse res, int status, String codigo, String detalhe) throws IOException {
        res.setStatus(status);
        res.setContentType("application/problem+json");
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write(JSON.writeValueAsString(Map.of("status", status, "codigo", codigo, "detail", detalhe)));
    }
}
