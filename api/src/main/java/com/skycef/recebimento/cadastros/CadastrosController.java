package com.skycef.recebimento.cadastros;

import java.util.List;
import java.util.Map;

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

    private final JdbcTemplate db;

    public CadastrosController(JdbcTemplate db) {
        this.db = db;
    }

    @GetMapping("/fornecedores")
    public List<FornecedorOut> fornecedores() {
        return db.query("select id, razao_social, cnpj from fornecedor order by razao_social",
                (rs, row) -> new FornecedorOut(rs.getLong(1), rs.getString(2), rs.getString(3)));
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

    private EquipamentoOut equipamento(int id, int armazemId, String identificacao, String tipo,
                                        String observacao) {
        return new EquipamentoOut(id, armazemId, identificacao, tipo, observacao);
    }
}
