package com.skycef.recebimento.boletim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Executa somente quando TEST_DB_URL aponta para um PostgreSQL de testes acessível. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "TEST_DB_URL", matches = ".+")
class BoletimPostgresIntegrationTest {
    private static final String URL = System.getenv("TEST_DB_URL");
    private static final String USER = env("TEST_DB_USER", env("SPRING_DATASOURCE_USERNAME", "skycef"));
    private static final String PASSWORD = env("TEST_DB_PASSWORD", env("SPRING_DATASOURCE_PASSWORD", "skycef"));
    private static final String SCHEMA = "test_boletim_" + UUID.randomUUID().toString().replace("-", "");

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry properties) throws SQLException {
        if (URL == null || URL.isBlank()) return;
        if (!URL.startsWith("jdbc:postgresql:")) {
            throw new IllegalArgumentException("TEST_DB_URL deve ser uma URL JDBC PostgreSQL.");
        }
        try (Connection connection = DriverManager.getConnection(URL, USER, PASSWORD);
                var statement = connection.createStatement()) {
            statement.execute("create schema \"" + SCHEMA + "\"");
        }
        String separator = URL.contains("?") ? "&" : "?";
        properties.add("spring.datasource.url", () -> URL + separator + "currentSchema=" + SCHEMA);
        properties.add("spring.datasource.username", () -> USER);
        properties.add("spring.datasource.password", () -> PASSWORD);
        properties.add("spring.datasource.hikari.maximum-pool-size", () -> "2");
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @AfterAll
    static void limparSchema() throws SQLException {
        if (URL == null || URL.isBlank()) return;
        try (Connection connection = DriverManager.getConnection(URL, USER, PASSWORD);
                var statement = connection.createStatement()) {
            statement.execute("drop schema if exists \"" + SCHEMA + "\" cascade");
        }
    }

    @Autowired TestRestTemplate http;

    @Test
    @SuppressWarnings("unchecked")
    void exemploOficialCalculaGravaConsultaERecusaDuplicado() {
        String body = """
                {
                  "armazemId": 2,
                  "data": "2025-11-17",
                  "linhas": [
                    {"tipoItem":"FERTILIZANTES","descarga":2378,"remocao":400},
                    {"tipoItem":"AGROQUIMICO","descarga":30},
                    {"tipoItem":"SERVICOS_DIVERSOS","remocao":40}
                  ],
                  "equipe": [
                    {"matricula":"CHAPA_01","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_02","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_03","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_04","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_05","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_06","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_07","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_08","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_09","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_10","tipoDiaria":"COMPLETA"},
                    {"matricula":"CHAPA_11","tipoDiaria":"COMPLETA"}
                  ]
                }
                """;
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> request = new HttpEntity<>(body, headers);
        ResponseEntity<Map> previa = http.postForEntity("/api/boletins/calculo", request, Map.class);
        assertEquals(HttpStatus.OK, previa.getStatusCode());
        assertValores(previa.getBody());
        assertEquals("90.1731", previa.getBody().get("piso"));

        ResponseEntity<Map> criado = http.postForEntity("/api/boletins", request, Map.class);
        assertEquals(HttpStatus.CREATED, criado.getStatusCode());
        assertValores(criado.getBody());
        assertEquals("PLATAFORMA", criado.getBody().get("origem"));
        Number id = (Number) criado.getBody().get("id");
        assertNotNull(id);

        ResponseEntity<Map> consultado = http.getForEntity("/api/boletins/" + id.longValue(), Map.class);
        assertEquals(HttpStatus.OK, consultado.getStatusCode());
        assertValores(consultado.getBody());
        var linhas = (java.util.List<Map<String, Object>>) consultado.getBody().get("linhas");
        assertEquals("0.3224", linhas.getFirst().get("precoUnitario"));

        ResponseEntity<Map> duplicado = http.postForEntity("/api/boletins", request, Map.class);
        assertEquals(HttpStatus.CONFLICT, duplicado.getStatusCode());
        assertEquals("CONFLITO", duplicado.getBody().get("codigo"));
    }

    private static void assertValores(Map<String, Object> body) {
        assertNotNull(body);
        assertEquals("CONSISTENTE", body.get("situacao"));
        assertEquals("918.1952", body.get("producaoTotal"));
        assertEquals("991.9041", body.get("totalAPagar"));
        assertEquals("73.7089", body.get("complemento"));
        assertEquals("11.0", body.get("diariasEquivalentes"));
    }

    private static String env(String key, String fallback) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? fallback : value;
    }
}
