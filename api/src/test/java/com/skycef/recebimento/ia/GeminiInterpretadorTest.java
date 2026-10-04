package com.skycef.recebimento.ia;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class GeminiInterpretadorTest {
    @Test
    void semChaveRetornaControleParaFallbackLocal() {
        GeminiInterpretador interpretador = new GeminiInterpretador("", new ObjectMapper());

        GeminiInterpretador.Resultado resultado = interpretador.interpretar("Qual foi o custo da operação?");

        assertFalse(resultado.iaAtiva());
        assertNull(resultado.metrica());
        assertNull(resultado.tokensTotal());
    }
}