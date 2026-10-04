package com.skycef.recebimento.ia;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ia")
public class PergunteIaController {
    public record PerguntaIn(String pergunta) { }

    private final GeminiInterpretador gemini;

    public PergunteIaController(GeminiInterpretador gemini) {
        this.gemini = gemini;
    }

    @PostMapping("/interpretar")
    public ResponseEntity<?> interpretar(@RequestBody(required = false) PerguntaIn in) {
        String pergunta = in == null || in.pergunta() == null ? "" : in.pergunta().trim();
        if (pergunta.isEmpty() || pergunta.length() > 500) {
            return ResponseEntity.badRequest().body(Map.of("detail", "A pergunta deve ter de 1 a 500 caracteres."));
        }
        return ResponseEntity.ok(gemini.interpretar(pergunta));
    }
}