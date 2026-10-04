package com.skycef.recebimento.auth;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
    public record LoginIn(String login, String senha) { }

    public record SenhaIn(String atual, String nova) { }

    public record UsuarioIn(String login, String nome, String papel, String senha) { }

    public record AtivoIn(Boolean ativo) { }

    public record NovaSenhaIn(String nova) { }

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    private static Map<String, Object> pessoa(AuthService.Usuario u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id());
        m.put("login", u.login());
        m.put("nome", u.nome());
        m.put("papel", u.papel());
        m.put("autenticacaoAtiva", true);
        return m;
    }

    private static ResponseCookie cookie(String valor, Duration duracao, boolean seguro) {
        return ResponseCookie.from(AuthService.COOKIE, valor).httpOnly(true).secure(seguro).sameSite("Lax")
                .path("/").maxAge(duracao).build();
    }

    private static AuthService.Usuario exigir(HttpServletRequest req) {
        Object u = req.getAttribute(AuthInterceptor.ATRIBUTO);
        if (u instanceof AuthService.Usuario usuario) return usuario;
        throw new AuthService.Erro(400, "LOGIN_DESATIVADO", "Esta ação precisa do login ativado (AUTH_ATIVA).");
    }

    private static AuthService.Usuario exigirAdmin(HttpServletRequest req) {
        AuthService.Usuario u = exigir(req);
        if (!"ADMIN".equals(u.papel())) {
            throw new AuthService.Erro(403, "SEM_PERMISSAO", "Só o administrador gerencia usuários.");
        }
        return u;
    }

    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginIn in, HttpServletRequest req) {
        AuthService.Entrada e = auth.entrar(in.login(), in.senha(), req.getRemoteAddr());
        String set = cookie(e.token(), Duration.ofHours(AuthService.HORAS_DE_SESSAO), req.isSecure()).toString();
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, set).body(pessoa(e.usuario()));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = AuthService.COOKIE, required = false) String token,
            HttpServletRequest req) {
        auth.encerrar(token);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO, req.isSecure()).toString()).build();
    }

    @GetMapping("/auth/me")
    public Map<String, Object> me(HttpServletRequest req) {
        Object u = req.getAttribute(AuthInterceptor.ATRIBUTO);
        if (u instanceof AuthService.Usuario usuario) return pessoa(usuario);
        Map<String, Object> livre = new LinkedHashMap<>();
        livre.put("id", 0);
        livre.put("login", "local");
        livre.put("nome", "Acesso livre (login desativado)");
        livre.put("papel", "ADMIN");
        livre.put("autenticacaoAtiva", false);
        return livre;
    }

    @PostMapping("/auth/senha")
    public ResponseEntity<Void> senha(@RequestBody SenhaIn in, HttpServletRequest req,
            @CookieValue(name = AuthService.COOKIE, required = false) String token) {
        auth.trocarSenha(exigir(req), token, in.atual(), in.nova());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/usuarios")
    public List<Map<String, Object>> usuarios(HttpServletRequest req) {
        exigirAdmin(req);
        return auth.listar();
    }

    @PostMapping("/usuarios")
    public ResponseEntity<Map<String, Object>> criar(@RequestBody UsuarioIn in, HttpServletRequest req) {
        exigirAdmin(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(auth.criar(in.login(), in.nome(), in.papel(), in.senha()));
    }

    @PostMapping("/usuarios/{id}/ativo")
    public ResponseEntity<Void> ativo(@PathVariable long id, @RequestBody AtivoIn in, HttpServletRequest req) {
        AuthService.Usuario admin = exigirAdmin(req);
        if (in.ativo() == null) {
            throw new AuthService.Erro(400, "REQUISICAO_INVALIDA", "Informe ativo: true ou false.");
        }
        auth.definirAtivo(id, in.ativo(), admin.id());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/usuarios/{id}/senha")
    public ResponseEntity<Void> redefinir(@PathVariable long id, @RequestBody NovaSenhaIn in, HttpServletRequest req) {
        exigirAdmin(req);
        auth.redefinirSenha(id, in.nova());
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(AuthService.Erro.class)
    public ResponseEntity<Map<String, Object>> erro(AuthService.Erro e) {
        return ResponseEntity.status(e.status()).contentType(MediaType.valueOf("application/problem+json"))
                .body(Map.of("status", e.status(), "codigo", e.codigo(), "detail", e.getMessage()));
    }
}
