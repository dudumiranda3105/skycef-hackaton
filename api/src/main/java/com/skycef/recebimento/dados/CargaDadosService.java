package com.skycef.recebimento.dados;

import java.io.BufferedReader;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Date;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.text.Normalizer;
import java.util.regex.Pattern;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.skycef.recebimento.boletim.BoletimCalculator;

@Service
public class CargaDadosService {
    private static final Pattern CHAPA = Pattern.compile("CHAPA_\\d{1,4}");
    private static final Pattern CHAVE = Pattern.compile("[0-9]{44}");
    private static final LocalDate EPOCA_EXCEL = LocalDate.of(1899, 12, 30);
    private static final String MOVIMENTACAO = "03_movimentacao/pedido_recebimento_notafiscal.xlsx";
    private static final String FORNECEDORES = "02_cadastros/fornecedores.xlsx";
    private static final String PRODUTOS = "02_cadastros/produtos.xlsx";
    private static final Map<String, String> ESTOQUES = Map.of(
            "02_cadastros/estoque_por_armazem/estoque_defensivos.xlsx", "INSUMOS",
            "02_cadastros/estoque_por_armazem/estoque_fertilizantes.xlsx", "ADUBO",
            "02_cadastros/estoque_por_armazem/estoque_geral.xlsx", "LOJA",
            "02_cadastros/estoque_por_armazem/estoque_maquinas.xlsx", "PATIO_MAQUINAS");
    private static final String FOLHA_CSV = "04_mao_de_obra/chapas_por_dia.csv";
    private static final List<String> FOLHAS_CHAPAS = List.of(
            "04_mao_de_obra/chapas_por_dia_2025.xlsx", "04_mao_de_obra/chapas_por_dia_2026.xlsx");
    private static final String BOLETIM = "05_operacao/boletim_diario_chapas.xlsx";
    private static final String EQUIPAMENTOS = "05_operacao/equipamentos_descarga.xlsx";
    private static final String REGISTRO_MANUAL = "05_operacao/registro_manual_recebimento.pdf";
    private static final Map<String, String> CABECALHOS = Map.ofEntries(
            Map.entry("Pedido Compra", "pedido"), Map.entry("Data Lançamento", "data_lancamento"),
            Map.entry("Data do Documento", "data_documento"), Map.entry("Cod PN", "fornecedor_codigo"),
            Map.entry("Nome", "fornecedor_nome"), Map.entry("Cod Item", "item_codigo"),
            Map.entry("Desc Item", "descricao"), Map.entry("Qtd", "quantidade"),
            Map.entry("Peso", "peso"), Map.entry("Deposito", "deposito"),
            Map.entry("Nº Recebimento", "nr_recebimento"), Map.entry("Data Recebimento", "data_recebimento"),
            Map.entry("Nota Fiscal de Entrada", "nf_numero"), Map.entry("Chave de Acesso", "nf_chave"));

    public record Resumo(int fornecedoresImportados, int produtosImportados, int estoquesImportados,
            int notasFiscaisImportadas, int itensFiscaisImportados, int danfesImportados,
            int danfesSemXml, int xmlSemDanfe, int registrosManuaisArquivados, int equipamentosCatalogados,
            int linhasLidas, int duplicadasDescartadas,
            int parciaisAgrupados, int recebimentosInseridos,
            int sabadosComRecebimento, int recebimentoAntesDoDocumento, int semChaveDeAcesso,
            int chaveDeAcessoMalformada, int diasDaFolha, int chapasDistintos, int chapasNovos) {}

    private record Recebimento(int linhaOrigem, String pedido, String item, String fornecedor, String fornecedorNome,
            String descricao, BigDecimal quantidade, BigDecimal peso, String deposito, String nr,
            LocalDate documento, LocalDate recebimento, String nf, String chave) {}
    private record Folha(LocalDate data, String diaSemana, int presentes, int cafe, BigDecimal valor) {}
    private record Fornecedor(String codigo, String razaoSocial, String cnpj) {}
    private record Produto(String codigo, String descricao, String unidade, BigDecimal peso, String grupo, String deposito) {}
    private record Estoque(String arquivo, int linha, int armazemId, String codigo, String descricao, BigDecimal quantidade) {}
    private record ItemFiscal(int numero, String codigoFornecedor, String descricao, String ncm, String unidade,
            BigDecimal quantidade, BigDecimal valorUnitario, BigDecimal valorTotal) {}
    private record NotaFiscal(String arquivo, String chave, String numero, OffsetDateTime emissao,
            String emitenteCnpj, String emitenteNome, String destinatarioCnpj, String destinatarioNome,
            BigDecimal valorTotal, BigDecimal pesoBruto, BigDecimal pesoLiquido, String modalidadeFrete,
            String sha256, byte[] xml, List<ItemFiscal> itens) {}
    private record CargaFiscal(int notas, int itens, int danfes, int danfesSemXml, int xmlSemDanfe, int manuais) {}
    private record EquipamentoOficial(String tipo, String utilizacao) {}

    private final JdbcTemplate jdbc;
    public CargaDadosService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(rollbackFor = Exception.class)
    public Resumo carregar(Path caminho) throws IOException {
        try (FonteDados fonte = new FonteDados(caminho)) {
            int fornecedoresImportados = importarFornecedores(fonte);
            int produtosImportados = importarProdutos(fonte);
            int estoquesImportados = importarEstoques(fonte);
            CargaFiscal fiscais = importarNotasFiscais(fonte);
            int equipamentosCatalogados = importarCatalogoEquipamentos(fonte);
            Set<String> chapas = new HashSet<>();
            for (String arquivo : FOLHAS_CHAPAS) {
                try (InputStream in = fonte.abrir(arquivo)) { chapas.addAll(extrairChapas(in, 1)); }
            }
            try (InputStream in = fonte.abrir(BOLETIM)) { chapas.addAll(extrairChapas(in, 14)); }
            int novos = 0;
            for (String chapa : chapas.stream().sorted().toList()) {
                novos += jdbc.update("insert into chapa (matricula, nome) values (?, ?) on conflict do nothing", chapa, chapa);
            }
            importarBoletimHistorico(fonte);

            List<Recebimento> recebimentos = new ArrayList<>();
            Map<String, Integer> contagemParciais = new HashMap<>();
            int duplicadas = 0, sabados = 0, antes = 0, semChave = 0, chaveRuim = 0;
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
                    if (r.values().stream().allMatch(String::isBlank)) continue;
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
                    Recebimento rec = new Recebimento(n, numeroTexto(r.get("pedido")), nulo(r.get("item_codigo")),
                        nulo(r.get("fornecedor_codigo")), nulo(r.get("fornecedor_nome")),
                        nulo(truncar(r.get("descricao"), 300)), decimal(r.get("quantidade")),
                        decimal(r.get("peso")), nulo(r.get("deposito")), numeroTexto(r.get("nr_recebimento")),
                        documento, recebimento, numeroTexto(r.get("nf_numero")), nulo(chave));
                    recebimentos.add(rec);
                    contagemParciais.merge(chaveParcial, 1, Integer::sum);
                }
            }

            int parciaisAgrupados = (int) contagemParciais.values().stream().filter(qtd -> qtd > 1).count();

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

            // A exclusão e as inserções fazem parte da mesma transação. Reexecutar produz o mesmo histórico.
            jdbc.update("delete from hist_recebimento_item");
            jdbc.update("delete from hist_chapa_dia");
            jdbc.batchUpdate("""
                    insert into hist_recebimento_item (linha_origem, pedido_compra, item_codigo, fornecedor_codigo,
                        fornecedor_nome, descricao, quantidade, peso_kg, deposito, nr_recebimento,
                        data_documento, data_recebimento, nf_numero, nf_chave)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, recebimentos, 1000, (ps, r) -> {
                ps.setInt(1, r.linhaOrigem); ps.setString(2, r.pedido); ps.setString(3, r.item); ps.setString(4, r.fornecedor);
                ps.setString(5, r.fornecedorNome); ps.setString(6, r.descricao);
                ps.setBigDecimal(7, r.quantidade); ps.setBigDecimal(8, r.peso); ps.setString(9, r.deposito);
                ps.setString(10, r.nr); ps.setDate(11, r.documento == null ? null : Date.valueOf(r.documento));
                ps.setDate(12, r.recebimento == null ? null : Date.valueOf(r.recebimento));
                ps.setString(13, r.nf); ps.setString(14, r.chave);
            });
            jdbc.batchUpdate("""
                    insert into hist_chapa_dia (data, dia_semana, qtd_presentes, qtd_cafe, valor_pago)
                    values (?, ?, ?, ?, ?)
                    """, dias, 1000, (ps, d) -> {
                ps.setDate(1, Date.valueOf(d.data)); ps.setString(2, d.diaSemana);
                ps.setInt(3, d.presentes); ps.setInt(4, d.cafe); ps.setBigDecimal(5, d.valor);
            });
            return new Resumo(fornecedoresImportados, produtosImportados, estoquesImportados,
                    fiscais.notas, fiscais.itens, fiscais.danfes, fiscais.danfesSemXml,
                    fiscais.xmlSemDanfe, fiscais.manuais, equipamentosCatalogados,
                    recebimentos.size() + duplicadas, duplicadas, parciaisAgrupados, recebimentos.size(), sabados,
                    antes, semChave, chaveRuim, dias.size(), chapas.size(), novos);
        }
    }

    /** Importa os cadastros oficiais por chave de origem, preservando fornecedores sem código cadastrados no sistema. */
    private int importarFornecedores(FonteDados fonte) throws IOException {
        List<Fornecedor> registros = new ArrayList<>();
        try (InputStream in = new BufferedInputStream(fonte.abrir(FORNECEDORES)); Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            Row header = sheet.getRow(0);
            if (header == null || !texto(header.getCell(0)).trim().equalsIgnoreCase("COD")
                    || !texto(header.getCell(1)).trim().equalsIgnoreCase("FORNECEDOR")
                    || !texto(header.getCell(2)).trim().equalsIgnoreCase("CNPJ")) {
                throw new IllegalArgumentException("Cabeçalho inesperado na planilha oficial de fornecedores.");
            }
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                String codigo = texto(row.getCell(0)).trim();
                String nome = texto(row.getCell(1)).trim();
                String cnpj = texto(row.getCell(2)).replaceAll("\\D", "");
                if (codigo.isEmpty() && nome.isEmpty() && cnpj.isEmpty()) continue;
                if (codigo.isEmpty() || nome.isEmpty() || cnpj.length() != 14) {
                    throw new IllegalArgumentException("Registro incompleto/inválido na planilha oficial de fornecedores, linha " + (i + 1) + ".");
                }
                registros.add(new Fornecedor(codigo, truncar(nome, 200), cnpj));
            }
        }
        for (Fornecedor f : registros) {
            int atualizados = jdbc.update("update fornecedor set razao_social = ?, cnpj = ? where codigo = ?",
                    f.razaoSocial, f.cnpj, f.codigo);
            if (atualizados == 0) {
                jdbc.update("insert into fornecedor (codigo, razao_social, cnpj) values (?, ?, ?)",
                        f.codigo, f.razaoSocial, f.cnpj);
            }
        }
        return registros.size();
    }

    /** Importa cada código por depósito; o mesmo produto pode existir em mais de um depósito. */
    private int importarProdutos(FonteDados fonte) throws IOException {
        List<Produto> registros = new ArrayList<>();
        try (InputStream in = new BufferedInputStream(fonte.abrir(PRODUTOS)); Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            Row header = sheet.getRow(0);
            if (header == null || sheet.getRow(1) == null || header.getLastCellNum() < 8) {
                throw new IllegalArgumentException("Estrutura inesperada na planilha oficial de produtos.");
            }
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                String codigo = texto(row.getCell(0)).trim();
                String descricao = texto(row.getCell(1)).trim();
                String unidade = texto(row.getCell(2)).trim();
                BigDecimal peso = decimal(texto(row.getCell(3)).trim());
                String grupo = texto(row.getCell(5)).trim();
                String deposito = texto(row.getCell(7)).trim();
                if (codigo.isEmpty() && descricao.isEmpty()) continue;
                if (codigo.isEmpty() || descricao.isEmpty() || deposito.isEmpty() || grupo.length() > 3
                        || unidade.length() > 10 || deposito.length() > 12 || peso == null) {
                    throw new IllegalArgumentException("Registro incompleto/inválido na planilha oficial de produtos, linha " + (i + 1) + ".");
                }
                registros.add(new Produto(codigo, truncar(descricao, 300), nulo(unidade), peso, nulo(grupo), deposito));
            }
        }
        for (Produto p : registros) {
            int atualizados = jdbc.update("update produto set descricao = ?, unidade = ?, peso_unitario = ?, grupo = ? "
                    + "where codigo = ? and deposito = ?", p.descricao, p.unidade, p.peso, p.grupo, p.codigo, p.deposito);
            if (atualizados == 0) {
                jdbc.update("insert into produto (codigo, descricao, unidade, peso_unitario, grupo, deposito) values (?, ?, ?, ?, ?, ?)",
                        p.codigo, p.descricao, p.unidade, p.peso, p.grupo, p.deposito);
            }
        }
        return registros.size();
    }

    /** Persiste os saldos tal como aparecem nos arquivos, sem atribuir data de referência inexistente. */
    private int importarEstoques(FonteDados fonte) throws IOException {
        List<Estoque> registros = new ArrayList<>();
        for (Map.Entry<String, String> arquivo : ESTOQUES.entrySet()) {
            Integer armazemId = jdbc.queryForObject("select id from armazem where codigo = ?", Integer.class, arquivo.getValue());
            if (armazemId == null) throw new IllegalArgumentException("Armazém oficial não cadastrado: " + arquivo.getValue());
            try (InputStream in = new BufferedInputStream(fonte.abrir(arquivo.getKey())); Workbook wb = WorkbookFactory.create(in)) {
                Sheet sheet = wb.getSheetAt(0);
                Row header = sheet.getRow(2);
                if (header == null || header.getLastCellNum() < 3) {
                    throw new IllegalArgumentException("Cabeçalho inesperado no arquivo de estoque: " + arquivo.getKey());
                }
                for (int i = 3; i <= sheet.getLastRowNum(); i++) {
                    Row row = sheet.getRow(i);
                    if (row == null) continue;
                    String codigo = texto(row.getCell(0)).trim();
                    String descricao = texto(row.getCell(1)).trim();
                    String qtdTexto = texto(row.getCell(2)).trim();
                    if (codigo.isEmpty() && descricao.isEmpty() && qtdTexto.isEmpty()) continue;
                    // Algumas planilhas incluem linhas de agrupamento que só têm descrição, sem item/saldo.
                    if (codigo.isEmpty() && !qtdTexto.isEmpty()) {
                        throw new IllegalArgumentException("Saldo sem código no arquivo " + arquivo.getKey() + ", linha " + (i + 1) + ".");
                    }
                    if (codigo.isEmpty() || descricao.isEmpty() || qtdTexto.isEmpty()) continue;
                    BigDecimal quantidade = decimalPlanilha(qtdTexto);
                    if (quantidade == null) {
                        throw new IllegalArgumentException("Quantidade inválida no arquivo " + arquivo.getKey() + ", linha " + (i + 1) + ".");
                    }
                    registros.add(new Estoque(arquivo.getKey(), i + 1, armazemId,
                            truncar(codigo, 20), truncar(descricao, 300), quantidade));
                }
            }
        }
        jdbc.update("delete from hist_estoque_item");
        jdbc.batchUpdate("""
                insert into hist_estoque_item (arquivo_origem, linha_origem, armazem_id, produto_codigo, descricao, quantidade)
                values (?, ?, ?, ?, ?, ?)
                """, registros, 500, (ps, e) -> {
            ps.setString(1, e.arquivo); ps.setInt(2, e.linha); ps.setInt(3, e.armazemId);
            ps.setString(4, e.codigo); ps.setString(5, e.descricao); ps.setBigDecimal(6, e.quantidade);
        });
        return registros.size();
    }

    private static BigDecimal decimalPlanilha(String valor) {
        if (valor == null || valor.isBlank()) return null;
        String normal = valor.trim().replace(" ", "");
        if (normal.contains(",")) normal = normal.replace(".", "").replace(',', '.');
        try { return new BigDecimal(normal); } catch (NumberFormatException ex) { return null; }
    }

    /** Importa XMLs fiscais como histórico documental, com itens estruturados e bytes originais preservados. */
    private CargaFiscal importarNotasFiscais(FonteDados fonte) throws IOException {
        List<String> xmls = fonte.listar("01_notas_fiscais/xml", ".xml");
        List<String> pdfs = fonte.listar("01_notas_fiscais/danfe_pdf", ".pdf");
        Map<String, Long> idsPorNome = new HashMap<>();
        Set<String> nomesXml = new HashSet<>(), nomesPdf = new HashSet<>();
        int totalItens = 0;
        jdbc.update("delete from hist_documento_anexo");
        jdbc.update("delete from hist_nota_fiscal");
        for (String arquivo : xmls) {
            byte[] bytes;
            try (InputStream in = fonte.abrir(arquivo)) { bytes = in.readAllBytes(); }
            NotaFiscal nota = lerNotaFiscal(arquivo, bytes);
            Long id = jdbc.queryForObject("""
                    insert into hist_nota_fiscal (arquivo_origem, chave_acesso, numero, data_emissao,
                        emitente_cnpj, emitente_nome, destinatario_cnpj, destinatario_nome, valor_total,
                        peso_bruto_kg, peso_liquido_kg, modalidade_frete, sha256, conteudo_xml)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id
                    """, Long.class, nota.arquivo, nota.chave, nota.numero, nota.emissao,
                    nota.emitenteCnpj, nota.emitenteNome, nota.destinatarioCnpj, nota.destinatarioNome,
                    nota.valorTotal, nota.pesoBruto, nota.pesoLiquido, nota.modalidadeFrete,
                    nota.sha256, nota.xml);
            idsPorNome.put(nomeSemExtensao(arquivo), id);
            nomesXml.add(nomeSemExtensao(arquivo));
            if (!nota.itens.isEmpty()) {
                jdbc.batchUpdate("""
                        insert into hist_nota_fiscal_item (nota_fiscal_id, numero_item, codigo_fornecedor,
                            descricao, ncm, unidade, quantidade, valor_unitario, valor_total)
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, nota.itens, 200, (ps, item) -> {
                    ps.setLong(1, id); ps.setInt(2, item.numero); ps.setString(3, item.codigoFornecedor);
                    ps.setString(4, item.descricao); ps.setString(5, item.ncm); ps.setString(6, item.unidade);
                    ps.setBigDecimal(7, item.quantidade); ps.setBigDecimal(8, item.valorUnitario);
                    ps.setBigDecimal(9, item.valorTotal);
                });
                totalItens += nota.itens.size();
            }
        }
        List<AnexoFiscal> anexos = new ArrayList<>();
        int semXml = 0;
        for (String arquivo : pdfs) {
            byte[] bytes;
            try (InputStream in = fonte.abrir(arquivo)) { bytes = in.readAllBytes(); }
            String base = nomeSemExtensao(arquivo);
            Long notaId = idsPorNome.get(base);
            if (notaId == null) semXml++;
            else nomesPdf.add(base);
            anexos.add(new AnexoFiscal(notaId, arquivo, "DANFE_PDF", sha256(bytes), bytes));
        }
        int xmlSemPdf = (int) nomesXml.stream().filter(n -> !nomesPdf.contains(n)).count();
        String manual = REGISTRO_MANUAL;
        byte[] manualBytes;
        try (InputStream in = fonte.abrir(manual)) { manualBytes = in.readAllBytes(); }
        anexos.add(new AnexoFiscal(null, manual, "REGISTRO_MANUAL_PDF", sha256(manualBytes), manualBytes));
        jdbc.batchUpdate("""
                insert into hist_documento_anexo (nota_fiscal_id, arquivo_origem, tipo, sha256, conteudo)
                values (?, ?, ?, ?, ?)
                """, anexos, 10, (ps, a) -> {
            if (a.notaFiscalId == null) ps.setNull(1, java.sql.Types.BIGINT); else ps.setLong(1, a.notaFiscalId);
            ps.setString(2, a.arquivo); ps.setString(3, a.tipo); ps.setString(4, a.sha256); ps.setBytes(5, a.conteudo);
        });
        return new CargaFiscal(xmls.size(), totalItens, pdfs.size(), semXml, xmlSemPdf, 1);
    }

    private record AnexoFiscal(Long notaFiscalId, String arquivo, String tipo, String sha256, byte[] conteudo) {}

    private NotaFiscal lerNotaFiscal(String arquivo, byte[] bytes) throws IOException {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            Document doc = factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
            Element root = doc.getDocumentElement();
            Element infNfe = elemento(root, "infNFe");
            Element ide = elemento(root, "ide"), emit = elemento(root, "emit"), dest = elemento(root, "dest");
            Element total = elemento(root, "ICMSTot"), transp = elemento(root, "transp"), vol = elemento(root, "vol");
            String chave = textoElemento(root, "chNFe");
            if ((chave == null || chave.isBlank()) && infNfe != null) {
                chave = infNfe.getAttribute("Id").replaceFirst("^NFe", "");
            }
            String emissaoTexto = textoElemento(ide, "dhEmi");
            if (emissaoTexto == null) emissaoTexto = textoElemento(ide, "dEmi");
            List<ItemFiscal> itens = new ArrayList<>();
            if (infNfe != null) {
                NodeList dets = infNfe.getElementsByTagNameNS("*", "det");
                for (int i = 0; i < dets.getLength(); i++) {
                    Node node = dets.item(i);
                    if (!(node instanceof Element det)) continue;
                    Element prod = elemento(det, "prod");
                    if (prod == null) continue;
                    int n = inteiro(det.getAttribute("nItem"), i + 1);
                    itens.add(new ItemFiscal(n, limite(textoElemento(prod, "cProd"), 60),
                            limite(textoElemento(prod, "xProd"), 500), limite(textoElemento(prod, "NCM"), 10),
                            limite(textoElemento(prod, "uCom"), 20), decimal(textoElemento(prod, "qCom")),
                            decimal(textoElemento(prod, "vUnCom")), decimal(textoElemento(prod, "vProd"))));
                }
            }
            return new NotaFiscal(arquivo, limite(chave, 44), limite(textoElemento(ide, "nNF"), 20),
                    dataHora(emissaoTexto), cnpj(textoElemento(emit, "CNPJ")),
                    limite(textoElemento(emit, "xNome"), 200), cnpj(textoElemento(dest, "CNPJ")),
                    limite(textoElemento(dest, "xNome"), 200), decimal(textoElemento(total, "vNF")),
                    decimal(textoElemento(vol, "pesoB")), decimal(textoElemento(vol, "pesoL")),
                    limite(textoElemento(transp, "modFrete"), 10), sha256(bytes), bytes, itens);
        } catch (Exception ex) {
            throw new IOException("Não foi possível interpretar XML fiscal: " + arquivo, ex);
        }
    }

    /** Importa apenas o catálogo e a utilização informados na fonte; local e quantidade não são presumidos. */
    private int importarCatalogoEquipamentos(FonteDados fonte) throws IOException {
        List<EquipamentoOficial> registros = new ArrayList<>();
        try (InputStream in = new BufferedInputStream(fonte.abrir(EQUIPAMENTOS)); Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            int cabecalho = -1;
            for (int i = 0; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row != null && normalizar(texto(row.getCell(0))).equals("equipamento")
                        && normalizar(texto(row.getCell(1))).startsWith("utiliza")) { cabecalho = i; break; }
            }
            if (cabecalho < 0) throw new IllegalArgumentException("Cabeçalho não encontrado na lista oficial de equipamentos.");
            for (int i = cabecalho + 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                String tipo = texto(row.getCell(0)).trim(), utilizacao = texto(row.getCell(1)).trim();
                if (tipo.isEmpty() && utilizacao.isEmpty()) continue;
                if (tipo.isEmpty() || utilizacao.isEmpty()) throw new IllegalArgumentException("Equipamento sem utilização na linha " + (i + 1) + ".");
                registros.add(new EquipamentoOficial(limite(tipo, 120), limite(utilizacao, 300)));
            }
        }
        jdbc.update("delete from equipamento_catalogo_oficial");
        jdbc.batchUpdate("insert into equipamento_catalogo_oficial (tipo, utilizacao, arquivo_origem) values (?, ?, ?)",
                registros, 100, (ps, e) -> {
                    ps.setString(1, e.tipo); ps.setString(2, e.utilizacao); ps.setString(3, EQUIPAMENTOS);
                });
        return registros.size();
    }

    /** Carrega somente o boletim preenchido que consta na planilha oficial; não cria linhas para outros armazéns/dias. */
    private void importarBoletimHistorico(FonteDados fonte) throws IOException {
        try (InputStream in = new BufferedInputStream(fonte.abrir(BOLETIM)); Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            Row dataRow = sheet.getRow(4);
            LocalDate data = dataRow == null ? null : serial(texto(dataRow.getCell(8)));
            if (data == null) throw new IllegalArgumentException("Data ausente no boletim oficial.");

            Map<String, String> chapasPorMatricula = new HashMap<>();
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                String matricula = numeroTexto(texto(row.getCell(13)));
                String chapa = texto(row.getCell(14)).trim();
                if (matricula != null && !matricula.isBlank() && CHAPA.matcher(chapa).matches())
                    chapasPorMatricula.put(matricula, chapa);
            }

            Map<String, String> tipos = Map.ofEntries(
                    Map.entry("sacaria malas c/25", "SACARIA_MALAS_25"),
                    Map.entry("sacaria malas c/40", "SACARIA_MALAS_40"),
                    Map.entry("sacaria malas c/50", "SACARIA_MALAS_50"),
                    Map.entry("sacaria fardo c/250", "SACARIA_FARDO_250"),
                    Map.entry("sacaria fardo c/500", "SACARIA_FARDO_500"),
                    Map.entry("peças", "PECAS"), Map.entry("pecas", "PECAS"),
                    Map.entry("máquinas / equipamentos", "MAQUINAS"), Map.entry("maquinas / equipamentos", "MAQUINAS"),
                    Map.entry("agroquimico", "AGROQUIMICO"), Map.entry("fertilizantes", "FERTILIZANTES"),
                    Map.entry("sementes", "SEMENTES"), Map.entry("medicamentos", "MEDICAMENTOS"),
                    Map.entry("alimentação animal", "ALIMENTACAO_ANIMAL"), Map.entry("alimentacao animal", "ALIMENTACAO_ANIMAL"),
                    Map.entry("acessorios agropec", "ACESSORIOS"), Map.entry("serviços diversos", "SERVICOS_DIVERSOS"),
                    Map.entry("servicos diversos", "SERVICOS_DIVERSOS"));
            List<String> descricoes = jdbc.query("select codigo, descricao from tipo_item", (rs, row) -> rs.getString(1));
            Set<String> codigosValidos = new HashSet<>(descricoes);
            List<BoletimCalculator.Linha> linhasCalculo = new ArrayList<>();
            List<LinhaBoletimHistorico> linhas = new ArrayList<>();
            for (int i = 9; i <= 36; i += 2) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                String descricao = normalizar(texto(row.getCell(0)));
                String codigo = tipos.get(descricao);
                if (codigo == null) continue;
                int descarga = inteiro(texto(row.getCell(2)), 0);
                int remocao = inteiro(texto(row.getCell(3)), 0);
                int transferencia = inteiro(texto(row.getCell(5)), 0);
                BigDecimal preco = decimal(texto(row.getCell(7)));
                if (preco == null) throw new IllegalArgumentException("Preço ausente no boletim, linha " + (i + 1));
                if (descarga + remocao + transferencia == 0) continue;
                if (!codigosValidos.contains(codigo)) throw new IllegalArgumentException("Tipo de item oficial não mapeado: " + codigo);
                linhas.add(new LinhaBoletimHistorico(codigo, descarga, remocao, transferencia, preco));
                linhasCalculo.add(new BoletimCalculator.Linha(preco, descarga, remocao, transferencia));
            }

            List<MembroBoletimHistorico> equipe = new ArrayList<>();
            for (int i = 46; i <= 56; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                adicionarChapa(equipe, chapasPorMatricula, numeroTexto(texto(row.getCell(2))), texto(row.getCell(3)));
                adicionarChapa(equipe, chapasPorMatricula, numeroTexto(texto(row.getCell(7))), texto(row.getCell(8)));
            }
            Integer armazem = jdbc.query("select id from armazem where codigo = 'ADUBO'", (rs, row) -> rs.getInt(1))
                    .stream().findFirst().orElseThrow(() -> new IllegalArgumentException("Armazém ADUBO não cadastrado."));
            if (linhas.isEmpty() || equipe.isEmpty()) throw new IllegalArgumentException("Boletim oficial sem produção ou equipe identificável.");
            BigDecimal piso = jdbc.query("select valor from parametro where chave = 'DIARIA_COMPLETA'",
                    (rs, row) -> rs.getBigDecimal(1)).stream().findFirst().orElse(new BigDecimal("90.1731"));
            BoletimCalculator.Resultado calculo = BoletimCalculator.calcular(linhasCalculo, equipe.size(), 0, piso);

            jdbc.update("delete from boletim_producao where boletim_id in (select id from boletim where arquivo_origem = ?)", BOLETIM);
            jdbc.update("delete from boletim_equipe where boletim_id in (select id from boletim where arquivo_origem = ?)", BOLETIM);
            jdbc.update("delete from boletim where arquivo_origem = ?", BOLETIM);
            Long id = jdbc.queryForObject("""
                    insert into boletim (armazem_id, data, producao_total, diarias_equivalentes, valor_por_diaria,
                        total_a_pagar, complemento, situacao, origem, arquivo_origem)
                    values (?, ?, ?, ?, ?, ?, ?, ?, 'HISTORICO', ?) returning id
                    """, Long.class, armazem, Date.valueOf(data), calculo.producaoTotal(), calculo.diariasEquivalentes(),
                    calculo.valorPorDiaria(), calculo.totalAPagar(), calculo.complemento(), calculo.situacao(), BOLETIM);
            for (LinhaBoletimHistorico linha : linhas) {
                jdbc.update("""
                        insert into boletim_producao (boletim_id, tipo_item, qtd_descarga, qtd_remocao, qtd_transferencia, preco_unitario)
                        values (?, ?, ?, ?, ?, ?)
                        """, id, linha.codigo, linha.descarga, linha.remocao, linha.transferencia, linha.preco);
            }
            for (MembroBoletimHistorico membro : equipe) {
                jdbc.update("insert into boletim_equipe (boletim_id, matricula, tipo_diaria) values (?, ?, 'COMPLETA')",
                        id, membro.matricula);
            }
        }
    }

    private record LinhaBoletimHistorico(String codigo, int descarga, int remocao, int transferencia, BigDecimal preco) {}
    private record MembroBoletimHistorico(String matricula) {}

    private static void adicionarChapa(List<MembroBoletimHistorico> equipe, Map<String, String> mapa,
            String matriculaFonte, String meiaDiaria) {
        if (matriculaFonte == null || matriculaFonte.isBlank()) return;
        String chapa = mapa.get(matriculaFonte);
        if (chapa == null) throw new IllegalArgumentException("Matrícula do boletim sem correspondência oficial.");
        if (!"CHAPA_".equals(chapa.substring(0, Math.min(6, chapa.length()))))
            throw new IllegalArgumentException("Identificador de chapa inválido no boletim.");
        // A coluna de meia diária é uma marcação; vazia significa diária completa na planilha.
        if (meiaDiaria != null && !meiaDiaria.isBlank())
            throw new IllegalArgumentException("Marcação de meia diária requer conferência do formato oficial.");
        equipe.add(new MembroBoletimHistorico(chapa));
    }

    private static String nomeSemExtensao(String caminho) {
        String nome = caminho.substring(caminho.lastIndexOf('/') + 1);
        int ponto = nome.lastIndexOf('.');
        return ponto < 0 ? nome : nome.substring(0, ponto);
    }

    private static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException ex) { throw new IllegalStateException("SHA-256 indisponível.", ex); }
    }

    private static String cnpj(String valor) {
        String limpo = valor == null ? "" : valor.replaceAll("\\D", "");
        return limpo.length() == 14 ? limpo : null;
    }

    private static OffsetDateTime dataHora(String valor) {
        if (valor == null || valor.isBlank()) return null;
        try { return OffsetDateTime.parse(valor); } catch (DateTimeParseException ignorada) { }
        try { return LocalDateTime.parse(valor).atOffset(ZoneOffset.UTC); } catch (DateTimeParseException ignorada) { }
        try { return LocalDate.parse(valor).atStartOfDay().atOffset(ZoneOffset.UTC); } catch (DateTimeParseException ignorada) { return null; }
    }

    private static int inteiro(String valor, int padrao) {
        try { return Integer.parseInt(valor); } catch (NumberFormatException ex) { return padrao; }
    }

    private static Element elemento(Element parent, String nome) {
        if (parent == null) return null;
        NodeList nodes = parent.getElementsByTagNameNS("*", nome);
        if (nodes.getLength() > 0 && nodes.item(0) instanceof Element e) return e;
        nodes = parent.getElementsByTagName(nome);
        return nodes.getLength() > 0 && nodes.item(0) instanceof Element e ? e : null;
    }

    private static String textoElemento(Element parent, String nome) {
        Element elemento = elemento(parent, nome);
        return elemento == null ? null : elemento.getTextContent().trim();
    }

    private static String limite(String valor, int tamanho) {
        return valor == null || valor.isBlank() ? null : truncar(valor.trim(), tamanho);
    }

    private static String normalizar(String valor) {
        return Normalizer.normalize(valor == null ? "" : valor, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").trim().toLowerCase(java.util.Locale.ROOT);
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
