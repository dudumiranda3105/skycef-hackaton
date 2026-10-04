package com.skycef.recebimento.agendamento;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import jakarta.servlet.http.HttpServletRequest;
import com.skycef.recebimento.auth.AuthInterceptor;
import com.skycef.recebimento.auth.AuthService;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AgendamentoController {
    private final AgendamentoService appointments;
    private final FluxoService flow;
    private final NotaArquivoService files;

    public AgendamentoController(AgendamentoService appointments, FluxoService flow, NotaArquivoService files) {
        this.appointments = appointments; this.flow = flow; this.files = files;
    }

    @GetMapping("/agenda")
    public Map<String, Object> agenda(@RequestParam LocalDate data) { return appointments.agenda(data); }

    @GetMapping("/agendamentos")
    public List<Map<String, Object>> listar(@RequestParam(required = false) LocalDate data, @RequestParam(required = false, name = "status") String status,
            HttpServletRequest request) {
        AuthService.Usuario usuario = usuario(request);
        return appointments.listar(data, status, usuario != null && "FORNECEDOR".equals(usuario.papel()) ? usuario.id() : null);
    }

    @PostMapping("/agendamentos")
    public ResponseEntity<Map<String, Object>> agendar(@RequestBody AgendamentoService.AgendarIn body, HttpServletRequest request) {
        AuthService.Usuario usuario = usuario(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(appointments.agendar(body, usuario == null ? null : usuario.id()));
    }

    @GetMapping("/agendamentos/{id}")
    public Map<String, Object> obter(@PathVariable long id, HttpServletRequest request) {
        exigirDonoSeFornecedor(id, request); return appointments.detalhe(id);
    }

    @GetMapping("/agendamentos/{id}/eventos")
    public List<Map<String, Object>> eventos(@PathVariable long id, HttpServletRequest request) {
        exigirDonoSeFornecedor(id, request); return appointments.eventos(id);
    }

    @PostMapping("/agendamentos/{id}/validacao-compras")
    public Map<String, Object> compras(@PathVariable long id, @RequestBody AgendamentoService.ComprasIn body) { return appointments.compras(id, body); }

    @PostMapping("/agendamentos/{id}/destinos")
    public Map<String, Object> destinos(@PathVariable long id, @RequestBody AgendamentoService.DestinosIn body) { return appointments.destinos(id, body); }

    @PostMapping("/agendamentos/{id}/chegada")
    public Map<String, Object> chegada(@PathVariable long id, @RequestBody(required = false) AgendamentoService.MarcoIn body) { return flow.chegada(id, body); }

    @PostMapping("/descargas/{id}/chegada")
    public Map<String, Object> chegadaDescarga(@PathVariable long id, @RequestBody(required = false) AgendamentoService.MarcoIn body) { return flow.chegadaDescarga(id, body); }

    @PostMapping("/descargas/{id}/entrada")
    public Map<String, Object> entrada(@PathVariable long id, @RequestBody(required = false) AgendamentoService.MarcoIn body) { return flow.entrada(id, body); }

    @PostMapping("/descargas/{id}/saida")
    public Map<String, Object> saida(@PathVariable long id, @RequestBody AgendamentoService.SaidaIn body) { return flow.saida(id, body); }

    @PostMapping("/agendamentos/{id}/reagendamento")
    public Map<String, Object> reagendar(@PathVariable long id, @RequestBody AgendamentoService.ReagendamentoIn body, HttpServletRequest request) {
        exigirDonoSeFornecedor(id, request); return flow.reagendar(id, body);
    }

    @PostMapping("/agendamentos/{id}/cancelamento")
    public Map<String, Object> cancelar(@PathVariable long id, @RequestBody AgendamentoService.CancelamentoIn body, HttpServletRequest request) {
        exigirDonoSeFornecedor(id, request); return flow.solicitar(id, body);
    }

    @PostMapping("/agendamentos/{id}/cancelamento/efetivacao")
    public Map<String, Object> efetivar(@PathVariable long id) { return flow.efetivar(id); }

    @GetMapping("/vagas-liberadas")
    public List<Map<String, Object>> vagas(@RequestParam(required = false) String situacao) { return flow.vagas(situacao); }

    @GetMapping("/vagas-liberadas/{id}/candidatos")
    public List<Map<String, Object>> candidatos(@PathVariable long id) { return flow.candidatos(id); }

    @PostMapping("/vagas-liberadas/{id}/atribuicao")
    public Map<String, Object> atribuir(@PathVariable long id, @RequestBody AgendamentoService.AtribuicaoIn body) { return flow.atribuir(id, body); }

    @PostMapping("/vagas-liberadas/{id}/liberacao-geral")
    public Map<String, Object> liberar(@PathVariable long id) { return flow.liberar(id); }

    @PostMapping("/nao-recebimentos")
    public ResponseEntity<Map<String, Object>> naoRecebimento(@RequestBody AgendamentoService.NaoRecebimentoIn body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(flow.naoRecebimento(body));
    }

    @GetMapping("/nao-recebimentos")
    public List<Map<String, Object>> naoRecebimentos(@RequestParam(required = false) LocalDate data, @RequestParam(required = false) String motivo) {
        return flow.naoRecebimentos(data, motivo);
    }

    @PostMapping(value = "/agendamentos/{id}/notas/{note}/arquivo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> anexar(@PathVariable long id, @PathVariable long note, @RequestParam MultipartFile arquivo, HttpServletRequest request) throws IOException {
        exigirDonoSeFornecedor(id, request);
        return files.anexar(id, note, arquivo);
    }

    @GetMapping("/agendamentos/{id}/notas/{note}/arquivo")
    public ResponseEntity<byte[]> baixar(@PathVariable long id, @PathVariable long note, HttpServletRequest request) {
        exigirDonoSeFornecedor(id, request);
        NotaArquivoService.Download download = files.baixar(id, note);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(download.type()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(download.name(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(download.content());
    }

    private static AuthService.Usuario usuario(HttpServletRequest request) {
        Object value = request.getAttribute(AuthInterceptor.ATRIBUTO);
        return value instanceof AuthService.Usuario usuario ? usuario : null;
    }

    private void exigirDonoSeFornecedor(long appointment, HttpServletRequest request) {
        AuthService.Usuario usuario = usuario(request);
        if (usuario != null && "FORNECEDOR".equals(usuario.papel())) appointments.exigirDono(appointment, usuario.id());
    }
}
