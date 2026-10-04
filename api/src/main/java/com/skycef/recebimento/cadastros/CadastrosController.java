package com.skycef.recebimento.cadastros;

import java.util.List;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import com.skycef.recebimento.auth.AuthInterceptor;
import com.skycef.recebimento.auth.AuthService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class CadastrosController {
    public record FornecedorIn(@NotBlank @Size(max = 200) String razaoSocial,
                               @NotBlank @Pattern(regexp = "[0-9]{14}") String cnpj) { }
    public record FornecedorOut(long id, String razaoSocial, String cnpj) { }
    public record ArmazemOut(int id, String codigo, String nome) { }
    public record EquipamentoOut(int id, int armazemId, String identificacao, String tipo, String observacao) { }
    public record EquipamentoCatalogoOut(String tipo, String utilizacao, String arquivoOrigem) { }
    public record EstoqueOut(int armazemId, String armazem, String codigo, String descricao,
                             java.math.BigDecimal quantidade, String arquivoOrigem, int linhaOrigem) { }

    private final JdbcTemplate db;

    public CadastrosController(JdbcTemplate db) {
        this.db = db;
    }

    @GetMapping("/fornecedores")
    public List<FornecedorOut> fornecedores(HttpServletRequest request) {
        Object autenticado = request.getAttribute(AuthInterceptor.ATRIBUTO);
        boolean fornecedor = autenticado instanceof AuthService.Usuario u && "FORNECEDOR".equals(u.papel());
        return db.query("select id, razao_social, cnpj from fornecedor order by razao_social",
                (rs, row) -> new FornecedorOut(rs.getLong(1), rs.getString(2), fornecedor ? null : rs.getString(3)));
    }

    @PostMapping("/fornecedores")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public FornecedorOut cadastrar(@Valid @RequestBody FornecedorIn corpo) {
        if (!cnpjValido(corpo.cnpj())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Informe um CNPJ válido com 14 dígitos.");
        }
        Integer existentes = db.queryForObject("select count(*) from fornecedor where cnpj = ?", Integer.class, corpo.cnpj());
        if (existentes != null && existentes > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Já existe um fornecedor cadastrado com este CNPJ.");
        }
        try {
            return db.queryForObject("insert into fornecedor (razao_social, cnpj) values (?, ?) "
                            + "returning id, razao_social, cnpj",
                    (rs, row) -> new FornecedorOut(rs.getLong(1), rs.getString(2), rs.getString(3)),
                    corpo.razaoSocial().trim(), corpo.cnpj());
        } catch (DuplicateKeyException erro) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Fornecedor já cadastrado.", erro);
        }
    }

    private static boolean cnpjValido(String cnpj) {
        if (cnpj == null || !cnpj.matches("[0-9]{14}") || cnpj.chars().distinct().count() == 1) return false;
        int[] pesos1 = {5,4,3,2,9,8,7,6,5,4,3,2};
        int[] pesos2 = {6,5,4,3,2,9,8,7,6,5,4,3,2};
        int soma = 0;
        for (int i = 0; i < 12; i++) soma += (cnpj.charAt(i) - '0') * pesos1[i];
        int d1 = soma % 11 < 2 ? 0 : 11 - soma % 11;
        soma = 0;
        for (int i = 0; i < 13; i++) soma += (cnpj.charAt(i) - '0') * pesos2[i];
        int d2 = soma % 11 < 2 ? 0 : 11 - soma % 11;
        return cnpj.charAt(12) - '0' == d1 && cnpj.charAt(13) - '0' == d2;
    }

    @GetMapping("/armazens")
    public List<ArmazemOut> armazens() {
        return db.query("select id, codigo, nome from armazem order by id",
                (rs, row) -> new ArmazemOut(rs.getInt(1), rs.getString(2), rs.getString(3)));
    }

    @GetMapping("/estoques")
    public List<EstoqueOut> estoques(@RequestParam(required = false) Integer armazemId) {
        String sql = "select h.armazem_id, a.nome, h.produto_codigo, h.descricao, h.quantidade, "
                + "h.arquivo_origem, h.linha_origem from hist_estoque_item h "
                + "join armazem a on a.id = h.armazem_id";
        if (armazemId != null) sql += " where h.armazem_id = ?";
        sql += " order by a.id, h.descricao, h.produto_codigo";
        return armazemId == null
                ? db.query(sql, (rs, row) -> new EstoqueOut(rs.getInt(1), rs.getString(2), rs.getString(3),
                        rs.getString(4), rs.getBigDecimal(5), rs.getString(6), rs.getInt(7)))
                : db.query(sql, (rs, row) -> new EstoqueOut(rs.getInt(1), rs.getString(2), rs.getString(3),
                        rs.getString(4), rs.getBigDecimal(5), rs.getString(6), rs.getInt(7)), armazemId);
    }

    @GetMapping("/equipamentos")
    public List<EquipamentoOut> equipamentos(@RequestParam(required = false) Integer armazemId) {
        String sql = "select id, armazem_id, identificacao, tipo, observacao from equipamento";
        if (armazemId != null) {
            sql += " where armazem_id = ?";
        }
        sql += " order by armazem_id, identificacao";
        return armazemId == null
                ? db.query(sql, (rs, row) -> equipamento(rs.getInt(1), rs.getInt(2), rs.getString(3),
                        rs.getString(4), rs.getString(5)))
                : db.query(sql, (rs, row) -> equipamento(rs.getInt(1), rs.getInt(2), rs.getString(3),
                        rs.getString(4), rs.getString(5)), armazemId);
    }

    @GetMapping("/equipamentos/catalogo-oficial")
    public List<EquipamentoCatalogoOut> catalogoEquipamentosOficial() {
        return db.query("select tipo, utilizacao, arquivo_origem from equipamento_catalogo_oficial order by tipo",
                (rs, row) -> new EquipamentoCatalogoOut(rs.getString(1), rs.getString(2), rs.getString(3)));
    }

    private EquipamentoOut equipamento(int id, int armazemId, String identificacao, String tipo,
                                        String observacao) {
        return new EquipamentoOut(id, armazemId, identificacao, tipo, observacao);
    }
}
