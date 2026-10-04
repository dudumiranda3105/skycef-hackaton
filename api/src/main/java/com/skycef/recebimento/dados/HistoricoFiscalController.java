package com.skycef.recebimento.dados;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/** Consulta os arquivos fiscais do pacote como arquivo histórico, sem os converter em agenda ou descarga. */
@RestController
@RequestMapping("/api/historico")
public class HistoricoFiscalController {
    public record NotaOut(long id, String chaveAcesso, String numero, OffsetDateTime dataEmissao,
            String emitenteCnpj, String emitenteNome, String destinatarioCnpj, String destinatarioNome,
            BigDecimal valorTotal, BigDecimal pesoBrutoKg, BigDecimal pesoLiquidoKg,
            int quantidadeItens, boolean danfeDisponivel, String arquivoOrigem) { }
    public record AnexoOut(long id, String arquivoOrigem, String sha256) { }

    private final JdbcTemplate db;
    public HistoricoFiscalController(JdbcTemplate db) { this.db = db; }

    @GetMapping("/notas-fiscais")
    public List<NotaOut> notas(@RequestParam(required = false) String busca) {
        String sql = """
                select n.id, n.chave_acesso, n.numero, n.data_emissao, n.emitente_cnpj, n.emitente_nome,
                       n.destinatario_cnpj, n.destinatario_nome, n.valor_total, n.peso_bruto_kg,
                       n.peso_liquido_kg, (select count(*) from hist_nota_fiscal_item i where i.nota_fiscal_id=n.id),
                       exists (select 1 from hist_documento_anexo a where a.nota_fiscal_id=n.id and a.tipo='DANFE_PDF'),
                       n.arquivo_origem
                  from hist_nota_fiscal n
                 where (?::text is null or concat_ws(' ', n.chave_acesso, n.numero, n.emitente_cnpj, n.emitente_nome,
                       n.destinatario_cnpj, n.destinatario_nome) ilike ?)
                 order by n.data_emissao desc nulls last, n.numero, n.id
                """;
        String filtro = busca == null || busca.isBlank() ? null : "%" + busca.trim() + "%";
        return db.query(sql, (rs, row) -> new NotaOut(rs.getLong(1), rs.getString(2), rs.getString(3),
                rs.getObject(4, OffsetDateTime.class), rs.getString(5), rs.getString(6), rs.getString(7),
                rs.getString(8), rs.getBigDecimal(9), rs.getBigDecimal(10), rs.getBigDecimal(11),
                rs.getInt(12), rs.getBoolean(13), rs.getString(14)), filtro, filtro);
    }

    @GetMapping("/danfes-sem-vinculo")
    public List<AnexoOut> danfesSemVinculo() {
        return db.query("select id, arquivo_origem, sha256 from hist_documento_anexo "
                        + "where tipo='DANFE_PDF' and nota_fiscal_id is null order by arquivo_origem",
                (rs, row) -> new AnexoOut(rs.getLong(1), rs.getString(2), rs.getString(3)));
    }

    @GetMapping(value = "/anexos/{id}", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> anexo(@PathVariable long id) {
        List<byte[]> arquivos = db.query("select conteudo from hist_documento_anexo where id = ? and tipo='DANFE_PDF'",
                (rs, row) -> rs.getBytes(1), id);
        if (arquivos.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "DANFE histórico não encontrado.");
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .contentType(MediaType.APPLICATION_PDF).body(arquivos.getFirst());
    }

    @GetMapping(value = "/notas-fiscais/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> danfe(@PathVariable long id) {
        return arquivo(id, "DANFE_PDF", MediaType.APPLICATION_PDF);
    }

    @GetMapping(value = "/notas-fiscais/{id}/xml", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<byte[]> xml(@PathVariable long id) {
        List<byte[]> arquivos = db.query("select conteudo_xml from hist_nota_fiscal where id = ?",
                (rs, row) -> rs.getBytes(1), id);
        if (arquivos.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "XML histórico não encontrado.");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_XML).body(arquivos.getFirst());
    }

    @GetMapping(value = "/registro-manual", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> registroManual() {
        List<byte[]> arquivos = db.query("select conteudo from hist_documento_anexo where tipo='REGISTRO_MANUAL_PDF'",
                (rs, row) -> rs.getBytes(1));
        if (arquivos.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Digitalização do registro manual não encontrada.");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(arquivos.getFirst());
    }

    private ResponseEntity<byte[]> arquivo(long id, String tipo, MediaType mediaType) {
        List<byte[]> arquivos = db.query("select conteudo from hist_documento_anexo where nota_fiscal_id = ? and tipo = ?",
                (rs, row) -> rs.getBytes(1), id, tipo);
        if (arquivos.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "DANFE não localizado para este XML.");
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "inline").contentType(mediaType).body(arquivos.getFirst());
    }
}
