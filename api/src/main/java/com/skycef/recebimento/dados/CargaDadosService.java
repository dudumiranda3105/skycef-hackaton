package com.skycef.recebimento.dados;

import java.io.BufferedReader;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Date;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CargaDadosService {
    private static final Pattern CHAPA = Pattern.compile("CHAPA_\\d{1,4}");
    private static final Pattern CHAVE = Pattern.compile("[0-9]{44}");
    private static final LocalDate EPOCA_EXCEL = LocalDate.of(1899, 12, 30);
    private static final String MOVIMENTACAO = "03_movimentacao/pedido_recebimento_notafiscal.xlsx";
    private static final String FOLHA_CSV = "04_mao_de_obra/chapas_por_dia.csv";
    private static final List<String> FOLHAS_CHAPAS = List.of(
            "04_mao_de_obra/chapas_por_dia_2025.xlsx", "04_mao_de_obra/chapas_por_dia_2026.xlsx");
    private static final String BOLETIM = "05_operacao/boletim_diario_chapas.xlsx";
    private static final Map<String, String> CABECALHOS = Map.ofEntries(
            Map.entry("Pedido Compra", "pedido"), Map.entry("Data Lançamento", "data_lancamento"),
            Map.entry("Data do Documento", "data_documento"), Map.entry("Cod PN", "fornecedor_codigo"),
            Map.entry("Nome", "fornecedor_nome"), Map.entry("Cod Item", "item_codigo"),
            Map.entry("Desc Item", "descricao"), Map.entry("Qtd", "quantidade"),
            Map.entry("Peso", "peso"), Map.entry("Deposito", "deposito"),
            Map.entry("Nº Recebimento", "nr_recebimento"), Map.entry("Data Recebimento", "data_recebimento"),
            Map.entry("Nota Fiscal de Entrada", "nf_numero"), Map.entry("Chave de Acesso", "nf_chave"));

    public record Resumo(int linhasLidas, int duplicadasDescartadas, int parciaisAgrupados, int recebimentosInseridos,
            int sabadosComRecebimento, int recebimentoAntesDoDocumento, int semChaveDeAcesso,
            int chaveDeAcessoMalformada, int diasDaFolha, int chapasDistintos, int chapasNovos) {}

    private record Recebimento(String pedido, String item, String fornecedor, String fornecedorNome,
            String descricao, BigDecimal quantidade, BigDecimal peso, String deposito, String nr,
            LocalDate documento, LocalDate recebimento, String nf, String chave) {}
    private record Folha(LocalDate data, String diaSemana, int presentes, int cafe, BigDecimal valor) {}

    private final JdbcTemplate jdbc;
    public CargaDadosService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(rollbackFor = Exception.class)
    public Resumo carregar(Path caminho) throws IOException {
        try (FonteDados fonte = new FonteDados(caminho)) {
            Set<String> chapas = new HashSet<>();
            for (String arquivo : FOLHAS_CHAPAS) {
                try (InputStream in = fonte.abrir(arquivo)) { chapas.addAll(extrairChapas(in, 1)); }
            }
            try (InputStream in = fonte.abrir(BOLETIM)) { chapas.addAll(extrairChapas(in, 14)); }
            int novos = 0;
            for (String chapa : chapas.stream().sorted().toList()) {
                novos += jdbc.update("insert into chapa (matricula, nome) values (?, ?) on conflict do nothing", chapa, chapa);
            }

            Map<String, Recebimento> recebimentosAgrupados = new LinkedHashMap<>();
            int duplicadas = 0, parciaisAgrupados = 0, sabados = 0, antes = 0, semChave = 0, chaveRuim = 0;
            try (InputStream in = new BufferedInputStream(fonte.abrir(MOVIMENTACAO)); Workbook workbook = WorkbookFactory.create(in)) {
                Sheet sheet = workbook.getSheetAt(0);
                Row header = sheet.getRow(0);
                if (header == null) throw new IllegalArgumentException("Planilha de movimentação sem cabeçalho.");
                Map<String, Integer> colunas = new HashMap<>();
                for (Cell c : header) {
                    String campo = CABECALHOS.get(texto(c).trim());
                    if (campo != null) colunas.put(campo, c.getColumnIndex());
                }
                if (!colunas.keySet().containsAll(CABECALHOS.values())) {
                    Set<String> faltando = new HashSet<>(CABECALHOS.values()); faltando.removeAll(colunas.keySet());
                    throw new IllegalArgumentException("Colunas ausentes na movimentação: " + faltando);
                }
                Set<List<String>> vistas = new HashSet<>();
                List<String> ordem = CABECALHOS.values().stream().sorted().toList();
                for (int n = 1; n <= sheet.getLastRowNum(); n++) {
                    Row row = sheet.getRow(n);
                    if (row == null) continue;
                    Map<String, String> r = new HashMap<>();
                    for (Map.Entry<String, Integer> c : colunas.entrySet()) {
                        r.put(c.getKey(), texto(row.getCell(c.getValue(), Row.MissingCellPolicy.RETURN_BLANK_AS_NULL)));
                    }
                    List<String> chaveLinha = ordem.stream().map(r::get).toList();
                    if (!vistas.add(chaveLinha)) { duplicadas++; continue; }
                    LocalDate recebimento = serial(r.get("data_recebimento"));
                    LocalDate documento = serial(r.get("data_documento"));
                    if (recebimento != null && recebimento.getDayOfWeek() == DayOfWeek.SATURDAY) sabados++;
                    if (recebimento != null && documento != null && recebimento.isBefore(documento)) antes++;
                    String chave = r.get("nf_chave").trim();
                    if (chave.isEmpty()) semChave++;
                    else if (!CHAVE.matcher(chave).matches()) { chaveRuim++; chave = ""; }
                    String chaveParcial = r.get("pedido") + "|" + nulo(r.get("item_codigo")) + "|"
                        + numeroTexto(r.get("nr_recebimento")) + "|" + (recebimento == null ? "" : recebimento.toString());
                    Recebimento rec = new Recebimento(numeroTexto(r.get("pedido")), nulo(r.get("item_codigo")),
                        nulo(r.get("fornecedor_codigo")), nulo(r.get("fornecedor_nome")),
                        nulo(truncar(r.get("descricao"), 300)), decimal(r.get("quantidade")),
                        decimal(r.get("peso")), nulo(r.get("deposito")), numeroTexto(r.get("nr_recebimento")),
                        documento, recebimento, numeroTexto(r.get("nf_numero")), nulo(chave));
                    if (recebimentosAgrupados.putIfAbsent(chaveParcial, rec) != null) parciaisAgrupados++;
                }
            }

            List<Folha> dias = new ArrayList<>();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(fonte.abrir(FOLHA_CSV), StandardCharsets.UTF_8))) {
                String header = reader.readLine();
                if (header == null) throw new IllegalArgumentException("Folha CSV vazia.");
                header = header.replace("\uFEFF", "");
                List<String> nomes = parseCsv(header);
                Map<String, Integer> pos = new HashMap<>();
                for (int i = 0; i < nomes.size(); i++) pos.put(nomes.get(i), i);
                String line;
                while ((line = reader.readLine()) != null) {
                    List<String> campos = parseCsv(line);
                    dias.add(new Folha(LocalDate.parse(campos.get(pos.get("data"))), campos.get(pos.get("dia_semana")),
                            Integer.parseInt(campos.get(pos.get("chapas_presentes"))),
                            Integer.parseInt(campos.get(pos.get("chapas_operacao_cafe"))),
                            new BigDecimal(campos.get(pos.get("valor_pago_dia")))));
                }
            }

            List<Recebimento> recebimentos = new ArrayList<>(recebimentosAgrupados.values());
            // A exclusão e as inserções fazem parte da mesma transação. Reexecutar produz o mesmo histórico.
            jdbc.update("delete from hist_recebimento_item");
            jdbc.update("delete from hist_chapa_dia");
            jdbc.batchUpdate("""
                    insert into hist_recebimento_item (pedido_compra, item_codigo, fornecedor_codigo,
                        fornecedor_nome, descricao, quantidade, peso_kg, deposito, nr_recebimento,
                        data_documento, data_recebimento, nf_numero, nf_chave)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, recebimentos, 1000, (ps, r) -> {
                ps.setString(1, r.pedido); ps.setString(2, r.item); ps.setString(3, r.fornecedor);
                ps.setString(4, r.fornecedorNome); ps.setString(5, r.descricao);
                ps.setBigDecimal(6, r.quantidade); ps.setBigDecimal(7, r.peso); ps.setString(8, r.deposito);
                ps.setString(9, r.nr); ps.setDate(10, r.documento == null ? null : Date.valueOf(r.documento));
                ps.setDate(11, r.recebimento == null ? null : Date.valueOf(r.recebimento));
                ps.setString(12, r.nf); ps.setString(13, r.chave);
            });
            jdbc.batchUpdate("""
                    insert into hist_chapa_dia (data, dia_semana, qtd_presentes, qtd_cafe, valor_pago)
                    values (?, ?, ?, ?, ?)
                    """, dias, 1000, (ps, d) -> {
                ps.setDate(1, Date.valueOf(d.data)); ps.setString(2, d.diaSemana);
                ps.setInt(3, d.presentes); ps.setInt(4, d.cafe); ps.setBigDecimal(5, d.valor);
            });
            return new Resumo(recebimentos.size() + duplicadas + parciaisAgrupados, duplicadas, parciaisAgrupados, recebimentos.size(), sabados,
                    antes, semChave, chaveRuim, dias.size(), chapas.size(), novos);
        }
    }

    private static Set<String> extrairChapas(InputStream in, int coluna) throws IOException {
        Set<String> encontrados = new HashSet<>();
        try (Workbook workbook = WorkbookFactory.create(new BufferedInputStream(in))) {
            for (Sheet sheet : workbook) for (Row row : sheet) {
                String chapa = texto(row.getCell(coluna, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL)).trim();
                if (CHAPA.matcher(chapa).matches()) encontrados.add(chapa);
            }
        }
        return encontrados;
    }

    private static String texto(Cell cell) {
        if (cell == null) return "";
        if (cell.getCellType() == CellType.NUMERIC) return BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString();
        return new DataFormatter().formatCellValue(cell);
    }

    private static LocalDate serial(String valor) {
        if (valor == null || valor.isBlank()) return null;
        try { return EPOCA_EXCEL.plusDays(new BigDecimal(valor.trim()).intValue()); }
        catch (NumberFormatException ex) { return null; }
    }
    private static BigDecimal decimal(String valor) {
        if (valor == null || valor.isBlank()) return null;
        try { return new BigDecimal(valor.trim()); } catch (NumberFormatException ex) { return null; }
    }
    private static String numeroTexto(String valor) {
        if (valor == null || valor.isBlank()) return null;
        try { return new BigDecimal(valor.trim()).toBigInteger().toString(); }
        catch (NumberFormatException ex) { return valor.trim(); }
    }
    private static String nulo(String valor) { return valor == null || valor.trim().isEmpty() ? null : valor.trim(); }
    private static String truncar(String valor, int max) { return valor == null ? null : valor.substring(0, Math.min(max, valor.length())); }

    /** CSV RFC 4180 suficiente para campos com vírgulas e aspas no pacote de dados. */
    private static List<String> parseCsv(String linha) {
        List<String> out = new ArrayList<>(); StringBuilder campo = new StringBuilder(); boolean aspas = false;
        for (int i = 0; i < linha.length(); i++) {
            char c = linha.charAt(i);
            if (c == '"') {
                if (aspas && i + 1 < linha.length() && linha.charAt(i + 1) == '"') { campo.append('"'); i++; }
                else aspas = !aspas;
            } else if (c == ',' && !aspas) { out.add(campo.toString()); campo.setLength(0); }
            else campo.append(c);
        }
        out.add(campo.toString()); return out;
    }
}
