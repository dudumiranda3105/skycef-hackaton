package com.skycef.recebimento.boletim;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class BoletimController {
    private static final Set<String> CAMPOS = Set.of("armazemId", "data", "linhas", "equipe");
    private static final Set<String> LINHA = Set.of("tipoItem", "descarga", "remocao", "transferencia");
    private static final Set<String> MEMBRO = Set.of("matricula", "tipoDiaria");
    private final BoletimService service;
    public BoletimController(BoletimService service) { this.service = service; }

    @GetMapping("/boletim/tipos-item")
    public List<Map<String, Object>> tipos() { return service.tipos(); }

    @GetMapping("/chapas")
    public List<Map<String, Object>> chapas() { return service.chapas(); }

    @PostMapping("/boletins/calculo")
    public Map<String, Object> calcular(@RequestBody JsonNode body) { return service.calcular(entrada(body)); }

    @PostMapping("/boletins")
    public ResponseEntity<Map<String, Object>> lancar(@RequestBody JsonNode body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.lancar(entrada(body)));
    }

    @GetMapping("/boletins")
    public List<Map<String, Object>> listar(@RequestParam(required = false) Integer armazemId,
            @RequestParam(required = false) LocalDate de, @RequestParam(required = false) LocalDate ate) {
        return service.listar(armazemId, de, ate);
    }

    @GetMapping("/boletins/{id}")
    public Map<String, Object> obter(@PathVariable long id) { return service.obter(id); }

    @ExceptionHandler(BoletimService.Erro.class)
    public ResponseEntity<Map<String, Object>> erro(BoletimService.Erro e) {
        String codigo = switch (e.status()) {
            case 400 -> "REQUISICAO_INVALIDA";
            case 404 -> "NAO_ENCONTRADO";
            case 409 -> "CONFLITO";
            default -> "REGRA_DE_NEGOCIO";
        };
        return ResponseEntity.status(e.status()).contentType(MediaType.valueOf("application/problem+json"))
                .body(Map.of("status", e.status(), "codigo", codigo, "detail", e.getMessage()));
    }

    private static BoletimService.Entrada entrada(JsonNode node) {
        campos(node, CAMPOS);
        int armazem = inteiroObrigatorio(node, "armazemId");
        LocalDate data;
        try { data = LocalDate.parse(textoObrigatorio(node, "data")); }
        catch (DateTimeParseException ex) { throw invalida("Data inválida."); }
        JsonNode linhasNode = lista(node, "linhas");
        JsonNode equipeNode = lista(node, "equipe");
        if (linhasNode.size() > 100 || equipeNode.size() > 100) throw invalida("Lista excede 100 itens.");
        List<BoletimService.LinhaInput> linhas = new ArrayList<>();
        for (JsonNode l : linhasNode) {
            campos(l, LINHA);
            String tipo = textoObrigatorio(l, "tipoItem");
            if (tipo.length() > 30) throw invalida("tipoItem excede 30 caracteres.");
            linhas.add(new BoletimService.LinhaInput(tipo, quantidade(l, "descarga"),
                    quantidade(l, "remocao"), quantidade(l, "transferencia")));
        }
        List<BoletimService.MembroInput> equipe = new ArrayList<>();
        for (JsonNode m : equipeNode) {
            campos(m, MEMBRO);
            String matricula = textoObrigatorio(m, "matricula");
            if (matricula.length() > 20) throw invalida("matricula excede 20 caracteres.");
            String tipo = textoObrigatorio(m, "tipoDiaria");
            if (!Set.of("COMPLETA", "MEIA").contains(tipo)) throw invalida("tipoDiaria inválido.");
            equipe.add(new BoletimService.MembroInput(matricula, tipo));
        }
        return new BoletimService.Entrada(armazem, data, linhas, equipe);
    }

    private static JsonNode lista(JsonNode node, String key) {
        JsonNode child = node.get(key);
        if (child == null) return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        if (!child.isArray()) throw invalida(key + " deve ser uma lista.");
        return child;
    }

    private static void campos(JsonNode node, Set<String> permitidos) {
        if (node == null || !node.isObject()) throw invalida("Objeto JSON inválido.");
        node.fieldNames().forEachRemaining(nome -> {
            if (!permitidos.contains(nome)) throw invalida("Campo não permitido: " + nome);
        });
    }

    private static int inteiroObrigatorio(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) throw invalida(key + " deve ser inteiro.");
        return value.intValue();
    }

    private static int quantidade(JsonNode node, String key) {
        if (!node.has(key)) return 0;
        int value = inteiroObrigatorio(node, key);
        if (value < 0 || value > 10_000_000) throw invalida(key + " deve estar entre 0 e 10000000.");
        return value;
    }

    private static String textoObrigatorio(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) throw invalida(key + " é obrigatório.");
        return value.textValue();
    }

    private static BoletimService.Erro invalida(String message) { return new BoletimService.Erro(400, message); }
}
