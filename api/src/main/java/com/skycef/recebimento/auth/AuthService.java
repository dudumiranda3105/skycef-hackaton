package com.skycef.recebimento.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Usuários, sessões e troca de senha. O token da sessão só existe no cookie; no banco fica o SHA-256 dele. */
@Service
public class AuthService {
    public static final String COOKIE = "RI_SESSAO";
    public static final int HORAS_DE_SESSAO = 12;
    public static final Set<String> PAPEIS = Set.of("ADMIN", "DIRETORIA", "COMPRAS", "ARMAZEM", "ENCARREGADO", "FORNECEDOR");
    private static final int MAX_FALHAS = 5;
    private static final long SEGUNDOS_DE_BLOQUEIO = 60;
    /** Usado para gastar o mesmo tempo quando o usuário não existe (não revela quem existe). */
    private static final String HASH_FALSO = Senhas.hash("senha-que-ninguem-usa");

    public record Usuario(long id, String login, String nome, String papel) { }

    public record Entrada(Usuario usuario, String token) { }

    public static final class Erro extends RuntimeException {
        private final int status;
        private final String codigo;

        public Erro(int status, String codigo, String mensagem) {
            super(mensagem);
            this.status = status;
            this.codigo = codigo;
        }

        public int status() { return status; }

        public String codigo() { return codigo; }
    }

    private static final class Tentativas {
        int falhas;
        Instant bloqueadoAte = Instant.EPOCH;
    }

    private final JdbcTemplate db;
    private final SecureRandom aleatorio = new SecureRandom();
    private final Map<String, Tentativas> tentativas = new ConcurrentHashMap<>();

    public AuthService(JdbcTemplate db) {
        this.db = db;
    }

    static String hashToken(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException erro) {
            throw new IllegalStateException(erro);
        }
    }

    private String novoToken() {
        byte[] bytes = new byte[32];
        aleatorio.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String normalizar(String login) {
        return login == null ? "" : login.trim().toLowerCase(Locale.ROOT);
    }

    private boolean bloqueado(String chave) {
        Tentativas t = tentativas.get(chave);
        return t != null && t.bloqueadoAte.isAfter(Instant.now());
    }

    private void registrarFalha(String chave) {
        tentativas.compute(chave, (k, t) -> {
            Tentativas atual = t == null ? new Tentativas() : t;
            atual.falhas++;
            if (atual.falhas >= MAX_FALHAS) {
                atual.bloqueadoAte = Instant.now().plusSeconds(SEGUNDOS_DE_BLOQUEIO);
                atual.falhas = 0;
            }
            return atual;
        });
    }

    /** Entra com usuário e senha. Erro genérico para usuário ou senha errados; 5 falhas bloqueiam por 1 minuto. */
    public Entrada entrar(String login, String senha, String ip) {
        String l = normalizar(login);
        String chave = l + "|" + ip;
        if (bloqueado(chave)) {
            throw new Erro(429, "MUITAS_TENTATIVAS", "Muitas tentativas de entrada. Aguarde um minuto e tente de novo.");
        }
        List<Map<String, Object>> linhas = db.queryForList(
                "select id, login, nome, papel, senha_hash, ativo from usuario where login = ?", l);
        Map<String, Object> u = linhas.isEmpty() ? null : linhas.get(0);
        String guardado = u == null ? HASH_FALSO : (String) u.get("senha_hash");
        boolean confere = Senhas.confere(senha == null ? "" : senha, guardado);
        if (u == null || !confere || !Boolean.TRUE.equals(u.get("ativo"))) {
            registrarFalha(chave);
            throw new Erro(401, "CREDENCIAIS_INVALIDAS", "Usuário ou senha incorretos.");
        }
        tentativas.remove(chave);
        long id = ((Number) u.get("id")).longValue();
        String token = novoToken();
        db.update("delete from sessao where expira_em < now()");
        db.update("insert into sessao (token_hash, usuario_id, expira_em) values (?, ?, now() + interval '"
                + HORAS_DE_SESSAO + " hours')", hashToken(token), id);
        db.update("update usuario set ultimo_acesso_em = now() where id = ?", id);
        return new Entrada(new Usuario(id, (String) u.get("login"), (String) u.get("nome"), (String) u.get("papel")), token);
    }

    public Optional<Usuario> autenticar(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        List<Usuario> achados = db.query(
                "select u.id, u.login, u.nome, u.papel from sessao s join usuario u on u.id = s.usuario_id "
                        + "where s.token_hash = ? and s.expira_em > now() and u.ativo",
                (rs, n) -> new Usuario(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4)),
                hashToken(token));
        return achados.stream().findFirst();
    }

    public void encerrar(String token) {
        if (token == null || token.isBlank()) return;
        db.update("delete from sessao where token_hash = ?", hashToken(token));
    }

    private static void validarSenha(String senha) {
        if (senha == null || senha.length() < 8 || senha.length() > 100) {
            throw new Erro(422, "SENHA_FRACA", "A senha precisa ter de 8 a 100 caracteres.");
        }
    }

    /** Troca a própria senha e encerra as outras sessões do usuário (a atual continua). */
    @Transactional
    public void trocarSenha(Usuario usuario, String tokenAtual, String atual, String nova) {
        String guardado = db.queryForObject("select senha_hash from usuario where id = ?", String.class, usuario.id());
        if (!Senhas.confere(atual == null ? "" : atual, guardado)) {
            throw new Erro(422, "SENHA_ATUAL_INCORRETA", "A senha atual não confere.");
        }
        validarSenha(nova);
        if (nova.equals(atual)) {
            throw new Erro(422, "SENHA_IGUAL", "A nova senha precisa ser diferente da atual.");
        }
        db.update("update usuario set senha_hash = ? where id = ?", Senhas.hash(nova), usuario.id());
        db.update("delete from sessao where usuario_id = ? and token_hash <> ?", usuario.id(),
                tokenAtual == null ? "" : hashToken(tokenAtual));
    }

    /* ---------- administração de usuários (só ADMIN, garantido no filtro e no controller) ---------- */

    public List<Map<String, Object>> listar() {
        return db.query("select id, login, nome, papel, ativo, criado_em, ultimo_acesso_em from usuario order by login",
                (rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong(1));
                    m.put("login", rs.getString(2));
                    m.put("nome", rs.getString(3));
                    m.put("papel", rs.getString(4));
                    m.put("ativo", rs.getBoolean(5));
                    m.put("criadoEm", rs.getObject(6, OffsetDateTime.class));
                    m.put("ultimoAcessoEm", rs.getObject(7, OffsetDateTime.class));
                    return m;
                });
    }

    public Map<String, Object> criar(String login, String nome, String papel, String senha) {
        String l = normalizar(login);
        if (!l.matches("[a-z0-9._-]{3,40}")) {
            throw new Erro(422, "LOGIN_INVALIDO",
                    "O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.");
        }
        if (nome == null || nome.isBlank() || nome.trim().length() > 120) {
            throw new Erro(422, "NOME_INVALIDO", "Informe o nome (até 120 caracteres).");
        }
        if (papel == null || !PAPEIS.contains(papel)) {
            throw new Erro(422, "PAPEL_INVALIDO", "Perfil inválido.");
        }
        validarSenha(senha);
        try {
            db.update("insert into usuario (login, nome, papel, senha_hash) values (?, ?, ?, ?)",
                    l, nome.trim(), papel, Senhas.hash(senha));
        } catch (DuplicateKeyException erro) {
            throw new Erro(409, "USUARIO_EXISTENTE", "Já existe um usuário com este login.");
        }
        return listar().stream().filter(m -> l.equals(m.get("login"))).findFirst().orElseThrow();
    }

    @Transactional
    public void definirAtivo(long id, boolean ativo, long quemPede) {
        List<Map<String, Object>> linhas = db.queryForList("select papel from usuario where id = ?", id);
        if (linhas.isEmpty()) throw new Erro(404, "NAO_ENCONTRADO", "Usuário não encontrado.");
        if (!ativo) {
            if (id == quemPede) {
                throw new Erro(422, "AUTOBLOQUEIO", "Você não pode desativar o seu próprio usuário.");
            }
            if ("ADMIN".equals(linhas.get(0).get("papel"))) {
                Integer outros = db.queryForObject(
                        "select count(*) from usuario where papel = 'ADMIN' and ativo and id <> ?", Integer.class, id);
                if (outros == null || outros == 0) {
                    throw new Erro(422, "ULTIMO_ADMIN", "É preciso manter ao menos um administrador ativo.");
                }
            }
        }
        db.update("update usuario set ativo = ? where id = ?", ativo, id);
        if (!ativo) db.update("delete from sessao where usuario_id = ?", id);
    }

    @Transactional
    public void redefinirSenha(long id, String nova) {
        validarSenha(nova);
        int n = db.update("update usuario set senha_hash = ? where id = ?", Senhas.hash(nova), id);
        if (n == 0) throw new Erro(404, "NAO_ENCONTRADO", "Usuário não encontrado.");
        db.update("delete from sessao where usuario_id = ?", id);
    }

    /** Cria os usuários iniciais só quando a tabela está vazia. Devolve true se criou. */
    public boolean semear(String senha) {
        Integer total = db.queryForObject("select count(*) from usuario", Integer.class);
        if (total != null && total > 0) return false;
        String[][] iniciais = {
            {"admin", "Administrador", "ADMIN"},
            {"diretoria", "Diretoria", "DIRETORIA"},
            {"compras", "Setor de Compras", "COMPRAS"},
            {"armazem", "Responsável pelo armazém", "ARMAZEM"},
            {"encarregado", "Encarregado dos chapas", "ENCARREGADO"},
            {"fornecedor", "Fornecedor (demonstração)", "FORNECEDOR"}
        };
        for (String[] u : iniciais) {
            db.update("insert into usuario (login, nome, papel, senha_hash) values (?, ?, ?, ?)",
                    u[0], u[1], u[2], Senhas.hash(senha));
        }
        return true;
    }
}
