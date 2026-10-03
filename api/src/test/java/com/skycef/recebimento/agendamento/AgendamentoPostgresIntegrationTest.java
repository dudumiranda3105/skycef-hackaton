package com.skycef.recebimento.agendamento;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skycef.recebimento.RecebimentoApplication;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Executado apenas com TEST_DB_URL (URL JDBC PostgreSQL). Cada execução cria e remove seu próprio
 * schema; nenhuma tabela do schema público ou da base de desenvolvimento é alterada.
 */
@SpringBootTest(classes = RecebimentoApplication.class)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "TEST_DB_URL", matches = "jdbc:postgresql:.*")
class AgendamentoPostgresIntegrationTest {
    private static final String DB_URL = System.getenv("TEST_DB_URL");
    private static final String DB_USER = System.getenv().getOrDefault("TEST_DB_USER", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "skycef"));
    private static final String DB_PASSWORD = System.getenv().getOrDefault("TEST_DB_PASSWORD", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "skycef"));
    private static final String SCHEMA = "test_t1_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean created;

    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry props) throws Exception {
        Class.forName("org.postgresql.Driver");
        try (Connection connection = DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
             Statement statement = connection.createStatement()) {
            statement.execute("create schema " + SCHEMA);
            created = true;
        }
        String separator = DB_URL.contains("?") ? "&" : "?";
        props.add("spring.datasource.url", () -> DB_URL + separator + "currentSchema=" + SCHEMA);
        props.add("spring.datasource.username", () -> DB_USER);
        props.add("spring.datasource.password", () -> DB_PASSWORD);
        props.add("spring.datasource.hikari.maximum-pool-size", () -> "2");
        props.add("spring.flyway.schemas", () -> SCHEMA);
        props.add("spring.flyway.default-schema", () -> SCHEMA);
    }

    @AfterAll
    static void removeSchema() throws Exception {
        if (!created) return;
        try (Connection connection = DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
             Statement statement = connection.createStatement()) {
            statement.execute("drop schema " + SCHEMA + " cascade");
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;

    @Test
    void capacidadeComprasDestinosEMarcosNoPostgres() throws Exception {
        long supplier = db.queryForObject("insert into fornecedor(razao_social) values ('Fornecedor T1') returning id", Long.class);
        LocalDate day = LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusYears(2)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));

        JsonNode first = create(supplier, day);
        long firstId = first.get("id").asLong();
        long noteId = first.path("notas").get(0).get("id").asLong();
        assertEquals("PENDENTE_COMPRAS", first.get("status").asText());
        assertEquals(1, first.path("notas").size());
        assertEquals(noteId, db.queryForObject("select id from nota_fiscal where agendamento_id=?", Long.class, firstId));

        JsonNode second = create(supplier, day);
        assertEquals("PENDENTE_COMPRAS", second.get("status").asText());
        mvc.perform(post("/api/agendamentos").contentType("application/json")
                        .content(json.writeValueAsBytes(request(supplier, day))))
                .andExpect(status().isConflict());
        assertEquals(2, db.queryForObject("select count(*) from agendamento where data_agendada=? and horario='08:00'", Integer.class, day));

        mvc.perform(post("/api/agendamentos/{id}/chegada", firstId).contentType("application/json").content("{}"))
                .andExpect(status().isOk());
        String bought = mvc.perform(post("/api/agendamentos/{id}/validacao-compras", firstId)
                        .contentType("application/json")
                        .content("{\"decisao\":\"AUTORIZADO\",\"pedidoReferencia\":\"PED-001\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("AUTORIZADO", json.readTree(bought).get("status").asText());

        String destinations = mvc.perform(post("/api/agendamentos/{id}/destinos", firstId)
                        .contentType("application/json").content("{\"armazemIds\":[1]}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode discharge = json.readTree(destinations).path("descargas").get(0);
        assertNotNull(discharge);
        assertFalse(discharge.path("chegadaEm").isNull(), "Chegada anterior a Compras deve ser copiada para a descarga");
        long dischargeId = discharge.get("id").asLong();

        String entered = mvc.perform(post("/api/descargas/{id}/entrada", dischargeId)
                        .contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("EM_DESCARGA", json.readTree(entered).get("status").asText());
        String finished = mvc.perform(post("/api/descargas/{id}/saida", dischargeId)
                        .contentType("application/json").content("{\"quantidadeChapas\":2,\"equipamentoIds\":[]}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("CONCLUIDO", json.readTree(finished).get("status").asText());
        assertEquals(2, db.queryForObject("select quantidade_chapas from descarga where id=?", Integer.class, dischargeId));
    }

    private JsonNode create(long supplier, LocalDate day) throws Exception {
        String body = mvc.perform(post("/api/agendamentos").contentType("application/json")
                        .content(json.writeValueAsBytes(request(supplier, day))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private Map<String, Object> request(long supplier, LocalDate day) {
        return Map.of("fornecedorId", supplier, "data", day.toString(), "horario", "08:00",
                "acondicionamento", "PALETIZADO", "notas", new Object[]{Map.of("nfNumero", "NF-" + UUID.randomUUID().toString().substring(0, 12))});
    }
}
