package com.skycef.recebimento.agendamento;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Objects;

@Service
public class NotaArquivoService {
    public static final int LIMIT = 10 * 1024 * 1024;
    private final AgendamentoService base;
    private final JdbcTemplate db;

    public NotaArquivoService(AgendamentoService base, JdbcTemplate db) { this.base = base; this.db = db; }

    public record Download(byte[] content, String name, String type) {}
    private record XmlData(String key, String number, BigDecimal gross, BigDecimal net) {}

    @Transactional
    public Map<String, Object> anexar(long appointment, long note, MultipartFile file) throws IOException {
        String name = safeName(file.getOriginalFilename());
        String lower = name.toLowerCase();
        boolean xml = lower.endsWith(".xml"), pdf = lower.endsWith(".pdf");
        boolean jpeg = lower.endsWith(".jpg") || lower.endsWith(".jpeg");
        boolean png = lower.endsWith(".png"), webp = lower.endsWith(".webp");
        if (!xml && !pdf && !jpeg && !png && !webp) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "A nota fiscal deve ser XML, PDF, JPG, PNG ou WebP.");
        if (file.isEmpty()) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "O arquivo da nota fiscal está vazio.");
        if (file.getSize() > LIMIT) throw AgendamentoService.erro(HttpStatus.PAYLOAD_TOO_LARGE, "A nota fiscal deve ter no máximo 10 MB.");
        byte[] content = file.getBytes();
        if (content.length > LIMIT) throw AgendamentoService.erro(HttpStatus.PAYLOAD_TOO_LARGE, "A nota fiscal deve ter no máximo 10 MB.");
        if (pdf && (content.length < 4 || content[0] != '%' || content[1] != 'P' || content[2] != 'D' || content[3] != 'F'))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "O arquivo não parece ser um PDF válido.");
        if (jpeg && (content.length < 3 || (content[0] & 0xff) != 0xff || (content[1] & 0xff) != 0xd8 || (content[2] & 0xff) != 0xff))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "O arquivo não parece ser uma foto JPEG válida.");
        if (png && (content.length < 8 || (content[0] & 0xff) != 0x89 || content[1] != 'P' || content[2] != 'N' || content[3] != 'G'))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "O arquivo não parece ser uma foto PNG válida.");
        if (webp && (content.length < 12 || !new String(content, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF") || !new String(content, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "O arquivo não parece ser uma foto WebP válida.");
        XmlData parsed = xml ? parseXml(content) : null;
        Map<String, Object> a = base.agendamento(appointment, true);
        if (AgendamentoService.LIBERADOS.contains(AgendamentoService.status(a)) || "CONCLUIDO".equals(AgendamentoService.status(a)))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "Este agendamento não aceita novos arquivos.");
        Map<String, Object> n = base.one("select * from nota_fiscal where id=? and agendamento_id=?", note, appointment);
        if (n == null) throw AgendamentoService.erro(HttpStatus.NOT_FOUND, "Nota fiscal não encontrada neste agendamento: " + note);
        if (parsed != null && parsed.key() != null) {
            if (n.get("nf_chave") != null && !Objects.equals(n.get("nf_chave"), parsed.key()))
                throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "A chave informada no agendamento não confere com a chave do arquivo XML.");
            if (n.get("nf_chave") == null && base.one("select id from nota_fiscal where nf_chave=? and ativa=true and id<>?", parsed.key(), note) != null)
                throw AgendamentoService.erro(HttpStatus.CONFLICT, "Esta nota fiscal já está agendada.");
        }
        db.update("update nota_fiscal set nf_chave=coalesce(nf_chave,?), nf_numero=coalesce(nf_numero,?), peso_total_kg=coalesce(peso_total_kg,?), arquivo_nome=?, content_type=?, tamanho_bytes=?, conteudo=? where id=?",
                parsed == null ? null : parsed.key(), parsed == null ? null : parsed.number(), parsed == null ? null : (parsed.gross() != null ? parsed.gross() : parsed.net()),
                name, xml ? "application/xml" : pdf ? "application/pdf" : jpeg ? "image/jpeg" : png ? "image/png" : "image/webp", content.length, content, note);
        return base.detalhe(appointment);
    }

    public Download baixar(long appointment, long note) {
        Map<String, Object> n = base.one("select arquivo_nome, content_type, conteudo from nota_fiscal where id=? and agendamento_id=?", note, appointment);
        if (n == null || n.get("conteudo") == null) throw AgendamentoService.erro(HttpStatus.NOT_FOUND, "Esta nota fiscal não tem arquivo anexado.");
        return new Download((byte[]) n.get("conteudo"), (String) n.get("arquivo_nome"), (String) n.get("content_type"));
    }

    static String safeName(String value) {
        String normalized = (value == null ? "nota" : value).replace('\\', '/');
        normalized = normalized.substring(normalized.lastIndexOf('/') + 1).replaceAll("[\\x00-\\x1f\\x7f\"]", "").trim();
        if (normalized.isEmpty()) normalized = "nota";
        return normalized.length() > 200 ? normalized.substring(normalized.length() - 200) : normalized;
    }

    private static XmlData parseXml(byte[] content) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            Document doc = factory.newDocumentBuilder().parse(new ByteArrayInputStream(content));
            NodeList infos = doc.getElementsByTagNameNS("*", "infNFe");
            if (infos.getLength() == 0) throw new IllegalArgumentException("O XML não parece ser uma NF-e (não há o grupo infNFe).");
            String id = ((Element) infos.item(0)).getAttribute("Id");
            String key = id.matches("NFe[0-9]{44}") ? id.substring(3) : null;
            return new XmlData(key, first(doc, "nNF"), sum(doc, "pesoB"), sum(doc, "pesoL"));
        } catch (IllegalArgumentException e) { throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage()); }
        catch (Exception e) { throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "O XML é inválido ou usa recursos não permitidos (DTD/entidades)."); }
    }

    private static String first(Document document, String name) {
        NodeList nodes = document.getElementsByTagNameNS("*", name);
        return nodes.getLength() == 0 ? null : nodes.item(0).getTextContent().trim();
    }

    private static BigDecimal sum(Document document, String name) {
        NodeList nodes = document.getElementsByTagNameNS("*", name);
        BigDecimal total = null;
        for (int i = 0; i < nodes.getLength(); i++) {
            try {
                BigDecimal value = new BigDecimal(nodes.item(i).getTextContent().trim());
                total = total == null ? value : total.add(value);
            } catch (NumberFormatException ignored) { }
        }
        return total;
    }
}
