package com.skycef.recebimento.boletim;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BoletimService {
    public record LinhaInput(String tipoItem, int descarga, int remocao, int transferencia) {}
    public record MembroInput(String matricula, String tipoDiaria) {}
    public record Entrada(int armazemId, LocalDate data, List<LinhaInput> linhas, List<MembroInput> equipe) {}
    public static final class Erro extends RuntimeException {
        private final int status;
        public Erro(int status, String message) { super(message); this.status = status; }
        public int status() { return status; }
    }

    private final JdbcTemplate jdbc;
    public BoletimService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Map<String, Object>> tipos() {
        return jdbc.query("select codigo, descricao, preco_unitario from tipo_item order by codigo", (rs, row) -> Map.of(
                "codigo", rs.getString(1), "descricao", rs.getString(2),
                "precoUnitario", BoletimCalculator.quatro(rs.getBigDecimal(3))));
    }

    public List<Map<String, Object>> chapas() {
        return jdbc.query("select matricula, nome from chapa order by matricula", (rs, row) -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("matricula", rs.getString(1)); out.put("nome", rs.getString(2)); return out;
        });
    }

    public Map<String, Object> calcular(Entrada entrada) { return apurar(entrada).saida(); }

    /** Fecha o boletim diário dos quatro armazéns numa única transação. */
    @Transactional
    public List<Map<String, Object>> lancarDia(List<Entrada> entradas) {
        if (entradas == null || entradas.size() != 4) throw new Erro(422, "Informe o boletim dos quatro armazéns.");
        if (entradas.getFirst() == null || entradas.getFirst().data() == null) throw new Erro(400, "Informe a data do boletim.");
        LocalDate data = entradas.getFirst().data();
        Set<Integer> ids = new HashSet<>();
        List<Apuracao> apuracoes = new ArrayList<>();
        for (Entrada entrada : entradas) {
            if (entrada == null || !data.equals(entrada.data()) || !ids.add(entrada.armazemId()))
                throw new Erro(422, "O boletim deve conter uma única data e cada armazém uma vez.");
            apuracoes.add(apurar(entrada, true));
            if (existe(entrada.armazemId(), data)) throw new Erro(409, "Já existe um boletim para o armazém " + entrada.armazemId() + " nesta data.");
        }
        Integer quantidadeArmazens = jdbc.queryForObject("select count(*) from armazem", Integer.class);
        Set<Integer> oficiais = new HashSet<>(jdbc.query("select id from armazem", (rs, row) -> rs.getInt(1)));
        if (quantidadeArmazens == null || quantidadeArmazens != 4 || !ids.equals(oficiais))
            throw new Erro(422, "O fechamento diário precisa incluir exatamente os quatro armazéns cadastrados.");
        List<Map<String, Object>> salvos = new ArrayList<>();
        try {
            for (int i = 0; i < entradas.size(); i++) salvos.add(gravar(entradas.get(i), apuracoes.get(i)));
        } catch (DuplicateKeyException ex) {
            throw new Erro(409, "O boletim diário já foi fechado por outro usuário.");
        }
        return salvos;
    }

    private Map<String, Object> gravar(Entrada entrada, Apuracao apuracao) {
        BoletimCalculator.Resultado r = apuracao.resultado;
        Long id;
        try {
            id = jdbc.queryForObject("""
                    insert into boletim (armazem_id, data, producao_total, diarias_equivalentes,
                        valor_por_diaria, total_a_pagar, complemento, situacao, origem)
                    values (?, ?, ?, ?, ?, ?, ?, ?, 'PLATAFORMA') returning id
                    """, Long.class, entrada.armazemId(), Date.valueOf(entrada.data()), r.producaoTotal(),
                    r.diariasEquivalentes(), r.valorPorDiaria(), r.totalAPagar(), r.complemento(), r.situacao());
        } catch (DuplicateKeyException ex) {
            throw new Erro(409, "Já existe um boletim deste armazém nesta data.");
        }
        for (Map<String, Object> l : apuracao.linhas) {
            jdbc.update("""
                    insert into boletim_producao (boletim_id, tipo_item, qtd_descarga, qtd_remocao,
                        qtd_transferencia, preco_unitario) values (?, ?, ?, ?, ?, ?)
                    """, id, l.get("tipoItem"), l.get("descarga"), l.get("remocao"),
                    l.get("transferencia"), new BigDecimal((String) l.get("precoUnitario")));
        }
        for (Map<String, Object> m : apuracao.equipe) {
            jdbc.update("insert into boletim_equipe (boletim_id, matricula, tipo_diaria) values (?, ?, ?)",
                    id, m.get("matricula"), m.get("tipoDiaria"));
        }
        return obter(id);
    }

    public List<Map<String, Object>> listar(Integer armazemId, LocalDate de, LocalDate ate) {
        if (de != null && ate != null && de.isAfter(ate)) throw new Erro(422, "A data inicial não pode ser posterior à data final.");
        StringBuilder sql = new StringBuilder("select id from boletim where 1=1");
        List<Object> args = new ArrayList<>();
        if (armazemId != null) { sql.append(" and armazem_id = ?"); args.add(armazemId); }
        if (de != null) { sql.append(" and data >= ?"); args.add(Date.valueOf(de)); }
        if (ate != null) { sql.append(" and data <= ?"); args.add(Date.valueOf(ate)); }
        sql.append(" order by data desc, armazem_id");
        return jdbc.queryForList(sql.toString(), Long.class, args.toArray()).stream().map(this::obter).toList();
    }

    public Map<String, Object> obter(long id) {
        List<Map<String, Object>> headers = jdbc.query("""
                select b.id, b.armazem_id, a.nome, b.data, b.situacao, b.origem, b.criado_em,
                       b.producao_total, b.diarias_equivalentes, b.valor_por_diaria, b.total_a_pagar, b.complemento
                  from boletim b join armazem a on a.id = b.armazem_id where b.id = ?
                """, (rs, row) -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", rs.getLong(1)); out.put("armazemId", rs.getInt(2)); out.put("armazemNome", rs.getString(3));
            out.put("data", rs.getDate(4).toLocalDate()); out.put("situacao", rs.getString(5));
            out.put("origem", rs.getString(6)); out.put("criadoEm", rs.getObject(7, OffsetDateTime.class));
            out.put("producaoTotal", BoletimCalculator.quatro(rs.getBigDecimal(8)));
            out.put("diariasEquivalentes", rs.getBigDecimal(9).setScale(1).toPlainString());
            out.put("valorPorDiaria", BoletimCalculator.quatro(rs.getBigDecimal(10)));
            out.put("totalAPagar", BoletimCalculator.quatro(rs.getBigDecimal(11)));
            out.put("complemento", BoletimCalculator.quatro(rs.getBigDecimal(12)));
            return out;
        }, id);
        if (headers.isEmpty()) throw new Erro(404, "Boletim não encontrado: " + id);
        Map<String, Object> out = headers.getFirst();
        List<Map<String, Object>> linhas = jdbc.query("""
                select p.tipo_item, t.descricao, p.qtd_descarga, p.qtd_remocao, p.qtd_transferencia, p.preco_unitario
                  from boletim_producao p join tipo_item t on t.codigo = p.tipo_item
                 where p.boletim_id = ? order by p.tipo_item
                """, (rs, row) -> linhaSaida(rs.getString(1), rs.getString(2), rs.getInt(3),
                        rs.getInt(4), rs.getInt(5), rs.getBigDecimal(6)), id);
        List<Map<String, Object>> equipe = jdbc.query("""
                select e.matricula, c.nome, e.tipo_diaria from boletim_equipe e
                  join chapa c on c.matricula = e.matricula where e.boletim_id = ? order by e.matricula
                """, (rs, row) -> membroSaida(rs.getString(1), rs.getString(2), rs.getString(3)), id);
        out.put("linhas", linhas); out.put("equipe", equipe);
        adicionarContagens(out, equipe);
        BigDecimal valor = out.get("valorPorDiaria") == null ? null : new BigDecimal((String) out.get("valorPorDiaria"));
        BigDecimal total = out.get("totalAPagar") == null ? null : new BigDecimal((String) out.get("totalAPagar"));
        BigDecimal complemento = out.get("complemento") == null ? null : new BigDecimal((String) out.get("complemento"));
        out.put("abaixoDoPiso", complemento == null ? null : complemento.signum() > 0);
        out.put("exibicao", exibicao(new BigDecimal((String) out.get("producaoTotal")), valor, total, complemento));
        return out;
    }

    private boolean existe(int armazemId, LocalDate data) {
        Integer count = jdbc.queryForObject("select count(*) from boletim where armazem_id = ? and data = ?",
                Integer.class, armazemId, Date.valueOf(data));
        return count != null && count > 0;
    }

    private Apuracao apurar(Entrada entrada) { return apurar(entrada, false); }

    private Apuracao apurar(Entrada entrada, boolean permitirSemAtividade) {
        if (entrada == null || entrada.data() == null || entrada.linhas() == null || entrada.equipe() == null)
            throw new Erro(400, "Informe data, linhas e equipe do boletim.");
        if (entrada.data().isAfter(LocalDate.now())) throw new Erro(422, "A data não pode estar no futuro.");
        if (jdbc.queryForObject("select count(*) from armazem where id = ?", Integer.class, entrada.armazemId()) == 0)
            throw new Erro(422, "Armazém inválido.");
        Map<String, Map<String, Object>> tipos = new HashMap<>();
        jdbc.query("select codigo, descricao, preco_unitario from tipo_item", rs -> {
            tipos.put(rs.getString(1), Map.of("descricao", rs.getString(2), "preco", rs.getBigDecimal(3)));
        });
        Set<String> vistos = new HashSet<>();
        List<Map<String, Object>> linhas = new ArrayList<>();
        List<BoletimCalculator.Linha> calculoLinhas = new ArrayList<>();
        for (LinhaInput l : entrada.linhas()) {
            if (!vistos.add(l.tipoItem())) throw new Erro(422, "Tipo de item repetido: " + l.tipoItem());
            Map<String, Object> t = tipos.get(l.tipoItem());
            if (t == null) throw new Erro(422, "Tipo de item inválido: " + l.tipoItem());
            if (l.descarga() < 0 || l.remocao() < 0 || l.transferencia() < 0) throw new Erro(400, "Quantidade negativa.");
            BoletimCalculator.Linha linha = new BoletimCalculator.Linha((BigDecimal) t.get("preco"), l.descarga(), l.remocao(), l.transferencia());
            if (linha.quantidadeTotal() > 0) {
                linhas.add(linhaSaida(l.tipoItem(), (String) t.get("descricao"), l.descarga(), l.remocao(),
                        l.transferencia(), linha.precoUnitario()));
                calculoLinhas.add(linha);
            }
        }
        if (entrada.equipe().size() > 20) throw new Erro(422, "Um boletim aceita no máximo 20 chapas.");
        if (!permitirSemAtividade && linhas.isEmpty() && entrada.equipe().isEmpty()) throw new Erro(422, "Informe a produção do dia e/ou a equipe.");
        Set<String> matriculas = new HashSet<>();
        List<Map<String, Object>> equipe = new ArrayList<>();
        int completas = 0;
        for (MembroInput m : entrada.equipe()) {
            if (!matriculas.add(m.matricula())) throw new Erro(422, "Matrícula repetida: " + m.matricula());
            List<String> nomes = jdbc.query("select nome from chapa where matricula = ?", (rs, row) -> rs.getString(1), m.matricula());
            if (nomes.isEmpty()) throw new Erro(422, "Matrícula não cadastrada: " + m.matricula());
            equipe.add(membroSaida(m.matricula(), nomes.getFirst(), m.tipoDiaria()));
            if ("COMPLETA".equals(m.tipoDiaria())) completas++;
        }
        BigDecimal piso = jdbc.query("select valor from parametro where chave = 'DIARIA_COMPLETA'",
                (rs, row) -> rs.getBigDecimal(1)).stream().findFirst().orElse(new BigDecimal("90.1731"));
        BoletimCalculator.Resultado resultado = BoletimCalculator.calcular(calculoLinhas, completas,
                equipe.size() - completas, piso);
        return new Apuracao(piso, resultado, linhas, equipe);
    }

    private record Apuracao(BigDecimal piso, BoletimCalculator.Resultado resultado,
            List<Map<String, Object>> linhas, List<Map<String, Object>> equipe) {
        Map<String, Object> saida() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("piso", BoletimCalculator.quatro(piso)); out.put("situacao", resultado.situacao());
            out.put("linhas", linhas); out.put("equipe", equipe); adicionarContagens(out, equipe);
            out.put("diariasEquivalentes", resultado.diariasEquivalentes().toPlainString());
            out.put("producaoTotal", BoletimCalculator.quatro(resultado.producaoTotal()));
            out.put("valorPorDiaria", BoletimCalculator.quatro(resultado.valorPorDiaria()));
            out.put("totalAPagar", BoletimCalculator.quatro(resultado.totalAPagar()));
            out.put("complemento", BoletimCalculator.quatro(resultado.complemento()));
            out.put("abaixoDoPiso", resultado.abaixoDoPiso());
            out.put("exibicao", exibicao(resultado.producaoTotal(), resultado.valorPorDiaria(),
                    resultado.totalAPagar(), resultado.complemento()));
            return out;
        }
    }

    private static Map<String, Object> linhaSaida(String tipo, String descricao, int descarga, int remocao,
            int transferencia, BigDecimal preco) {
        BoletimCalculator.Linha linha = new BoletimCalculator.Linha(preco, descarga, remocao, transferencia);
        return Map.of("tipoItem", tipo, "descricao", descricao, "descarga", descarga, "remocao", remocao,
                "transferencia", transferencia, "quantidadeTotal", linha.quantidadeTotal(),
                "precoUnitario", BoletimCalculator.quatro(preco), "valor", BoletimCalculator.quatro(linha.valor()));
    }

    private static Map<String, Object> membroSaida(String matricula, String nome, String tipoDiaria) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("matricula", matricula); out.put("nome", nome); out.put("tipoDiaria", tipoDiaria); return out;
    }

    private static void adicionarContagens(Map<String, Object> out, List<Map<String, Object>> equipe) {
        long meias = equipe.stream().filter(m -> "MEIA".equals(m.get("tipoDiaria"))).count();
        out.put("quantidadeChapas", equipe.size()); out.put("chapasDiariaCompleta", equipe.size() - meias);
        out.put("chapasMeiaDiaria", meias);
    }

    private static Map<String, Object> exibicao(BigDecimal producao, BigDecimal porDiaria,
            BigDecimal total, BigDecimal complemento) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("producaoTotal", BoletimCalculator.duas(producao));
        out.put("valorPorDiaria", BoletimCalculator.duas(porDiaria));
        out.put("totalAPagar", BoletimCalculator.duas(total));
        out.put("complemento", BoletimCalculator.duas(complemento)); return out;
    }
}
