package com.skycef.recebimento.agendamento;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skycef.recebimento.RecebimentoApplication;
import com.skycef.recebimento.auth.AuthInterceptor;
import com.skycef.recebimento.auth.AuthService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
    @Autowired FluxoService fluxo;
    @Autowired PortariaService portaria;
    @Autowired AgendamentoService agendamentos;
    @Autowired NotaArquivoService arquivos;

    @Test
    void portariaEnviaDocumentosEInsumosDirecionaAtomicamente() throws Exception {
        try (var tempo = org.mockito.Mockito.mockStatic(AgendamentoService.class, org.mockito.Mockito.CALLS_REAL_METHODS)) {
        tempo.when(AgendamentoService::agora).thenReturn(java.time.OffsetDateTime.parse("2026-10-05T08:05:00-03:00"));
        AuthService.Usuario porteiro = usuarioOperacional("PORTEIRO");
        AuthService.Usuario insumo = usuarioOperacional("INSUMO");
        long id = caminhaoNaPortaria();
        long nota = db.queryForObject("select id from nota_fiscal where agendamento_id=?", Long.class, id);
        var conferencia = new PortariaService.ConferenciaIn("abc-1d23", true, java.util.List.of(nota));
        assertEquals("AGUARDANDO_DOCUMENTOS", ((Map<?, ?>) portaria.conferir(id, conferencia, porteiro).get("portaria")).get("situacao"));
        assertEquals("ABC1D23", db.queryForObject("select placa from portaria_recebimento where agendamento_id=?", String.class, id));
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> portaria.conferir(id, conferencia, porteiro)).getStatusCode().value());
        assertEquals(422, assertThrows(ResponseStatusException.class, () -> portaria.enviar(id, porteiro)).getStatusCode().value());
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> agendamentos.destinos(id, new AgendamentoService.DestinosIn(java.util.List.of(1L), null))).getStatusCode().value());
        arquivos.anexar(id, nota, new org.springframework.mock.web.MockMultipartFile("arquivo", "nf.pdf", "application/pdf", "%PDF-1.4 documento teste".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        mvc.perform(post("/api/agendamentos/{id}/portaria/enviar", id)
                        .requestAttr(AuthInterceptor.ATRIBUTO, porteiro).contentType("application/json").content("{}"))
                .andExpect(status().isOk());
        assertEquals("PENDENTE_INSUMOS", db.queryForObject("select situacao from portaria_recebimento where agendamento_id=?", String.class, id));
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> arquivos.anexar(id, nota, new org.springframework.mock.web.MockMultipartFile("arquivo", "nf.pdf", "application/pdf", "%PDF-1.4 troca".getBytes()))).getStatusCode().value());
        mvc.perform(get("/api/insumos/recebimentos").requestAttr(AuthInterceptor.ATRIBUTO, insumo))
                .andExpect(status().isOk()).andExpect(result -> assertFalse(json.readTree(result.getResponse().getContentAsString()).isEmpty()));
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> portaria.decidir(id, new PortariaService.DecisaoIn("APROVAR", java.util.List.of(9999L), null), insumo)).getStatusCode().value());
        assertEquals("PENDENTE_INSUMOS", db.queryForObject("select situacao from portaria_recebimento where agendamento_id=?", String.class, id), "Destino inválido deve reverter a decisão inteira");
        assertEquals(0, db.queryForObject("select count(*) from descarga where agendamento_id=?", Integer.class, id));
        String aprovado = mvc.perform(post("/api/insumos/recebimentos/{id}/decisao", id)
                        .requestAttr(AuthInterceptor.ATRIBUTO, insumo).contentType("application/json")
                        .content("{\"decisao\":\"APROVAR\",\"armazemIds\":[1,2],\"observacao\":\"Notas conferidas\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("DIRECIONADO", json.readTree(aprovado).path("portaria").path("situacao").asText());
        assertEquals(2, json.readTree(aprovado).path("descargas").size());
        assertEquals(insumo.id(), db.queryForObject("select decidido_por_usuario_id from portaria_recebimento where agendamento_id=?", Long.class, id));
        long descarga = json.readTree(aprovado).path("descargas").get(0).get("id").asLong();
        assertEquals("EM_DESCARGA", fluxo.entrada(descarga, null).get("status"));
        }
    }

    @Test
    void conferenciaConfereDiaPlacaNotasEPerfilERecusaFicaAuditada() {
        try (var tempo = org.mockito.Mockito.mockStatic(AgendamentoService.class, org.mockito.Mockito.CALLS_REAL_METHODS)) {
        tempo.when(AgendamentoService::agora).thenReturn(java.time.OffsetDateTime.parse("2026-10-05T08:15:00-03:00"));
        AuthService.Usuario porteiro = usuarioOperacional("PORTEIRO");
        AuthService.Usuario insumo = usuarioOperacional("INSUMO");
        long id = caminhaoNaPortaria();
        long nota = db.queryForObject("select id from nota_fiscal where agendamento_id=?", Long.class, id);
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> portaria.conferir(id,
                new PortariaService.ConferenciaIn("ABC1D23", true, java.util.List.of(nota)), insumo)).getStatusCode().value());
        assertEquals(422, assertThrows(ResponseStatusException.class, () -> portaria.conferir(id,
                new PortariaService.ConferenciaIn("XYZ1D23", true, java.util.List.of(nota)), porteiro)).getStatusCode().value());
        assertEquals(422, assertThrows(ResponseStatusException.class, () -> portaria.conferir(id,
                new PortariaService.ConferenciaIn("ABC1D23", false, java.util.List.of(nota)), porteiro)).getStatusCode().value());
        assertEquals(422, assertThrows(ResponseStatusException.class, () -> portaria.conferir(id,
                new PortariaService.ConferenciaIn("ABC1D23", true, java.util.List.of(nota, nota)), porteiro)).getStatusCode().value());
        db.update("update agendamento set data_agendada=? where id=?", AgendamentoService.agora().toLocalDate().plusDays(1), id);
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> portaria.conferir(id,
                new PortariaService.ConferenciaIn("ABC1D23", true, java.util.List.of(nota)), porteiro)).getStatusCode().value());
        db.update("update agendamento set data_agendada=? where id=?", AgendamentoService.agora().toLocalDate(), id);
        db.update("update agendamento set chegada_em=null where id=?", id);
        portaria.conferir(id, new PortariaService.ConferenciaIn("ABC1D23", true, java.util.List.of(nota)), porteiro);
        assertEquals(Boolean.TRUE, db.queryForObject("select chegada_em=? from agendamento where id=?", Boolean.class, AgendamentoService.agora(), id));
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> fluxo.reagendar(id,
                new AgendamentoService.ReagendamentoIn(AgendamentoService.agora().toLocalDate().plusDays(1), java.time.LocalTime.of(10,0), "Trocar horário", false))).getStatusCode().value());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> fluxo.solicitar(id,
                new AgendamentoService.CancelamentoIn("Cancelar chegada"))).getStatusCode().value());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> portaria.conferir(id,
                new PortariaService.ConferenciaIn("ABC1D23", true, java.util.List.of(nota)), porteiro)).getStatusCode().value());
        // Mesmo que um destino seja inserido indevidamente, a descarga ainda exige a decisão de Insumos.
        long descarga = db.queryForObject("insert into descarga(agendamento_id,armazem_id,chegada_em) values (?,1,?) returning id", Long.class, id, AgendamentoService.agora());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> fluxo.entrada(descarga, null)).getStatusCode().value());
        db.update("delete from descarga where id=?", descarga);
        db.update("update nota_fiscal set conteudo=?,arquivo_nome='nf.pdf' where id=?", "%PDF-teste".getBytes(), nota);
        portaria.enviar(id, porteiro);
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> portaria.decidir(id, new PortariaService.DecisaoIn("RECUSAR", null, "Nota divergente"), porteiro)).getStatusCode().value());
        assertEquals(422, assertThrows(ResponseStatusException.class,
                () -> portaria.decidir(id, new PortariaService.DecisaoIn("RECUSAR", null, null), insumo)).getStatusCode().value());
        assertEquals("NAO_RECEBIDO", portaria.decidir(id, new PortariaService.DecisaoIn("RECUSAR", null, "Nota divergente"), insumo).get("status"));
        assertEquals("RECUSADO", db.queryForObject("select situacao from portaria_recebimento where agendamento_id=?", String.class, id));
        assertEquals(1, db.queryForObject("select count(*) from nao_recebimento where agendamento_id=? and motivo='DIVERGENCIA_NF_PEDIDO'", Integer.class, id));
        assertFalse(db.queryForObject("select ativa from nota_fiscal where id=?", Boolean.class, nota));

        tempo.when(AgendamentoService::agora).thenReturn(java.time.OffsetDateTime.parse("2026-10-05T08:30:00-03:00"));
        long atrasado = caminhaoNaPortaria();
        db.update("update agendamento set chegada_em=null where id=?", atrasado);
        long notaAtrasada = db.queryForObject("select id from nota_fiscal where agendamento_id=?", Long.class, atrasado);
        assertEquals("NAO_RECEBIDO", portaria.conferir(atrasado,
                new PortariaService.ConferenciaIn("ABC1D23", true, java.util.List.of(notaAtrasada)), porteiro).get("status"));
        assertEquals(0, db.queryForObject("select count(*) from portaria_recebimento where agendamento_id=?", Integer.class, atrasado));
        assertEquals(1, db.queryForObject("select count(*) from nao_recebimento where agendamento_id=? and motivo='ATRASO_AGENDAMENTO'", Integer.class, atrasado));
        }
    }

    private AuthService.Usuario usuarioOperacional(String papel) {
        String login = papel.toLowerCase() + "-" + UUID.randomUUID().toString().substring(0, 20);
        long id = db.queryForObject("insert into usuario(login,nome,papel,senha_hash) values (?,?,?,'teste') returning id", Long.class, login, papel, papel);
        return new AuthService.Usuario(id, login, papel, papel);
    }

    private long caminhaoNaPortaria() {
        long supplier = db.queryForObject("insert into fornecedor(razao_social) values ('Fornecedor portaria teste') returning id", Long.class);
        long id = db.queryForObject("""
                insert into agendamento(fornecedor_id,data_agendada,horario,acondicionamento,status,origem,placa_veiculo,chegada_em,exige_conferencia_portaria)
                values (?,?,'08:00','PALETIZADO','AUTORIZADO','TESTE','ABC1D23',?,true) returning id
                """, Long.class, supplier, AgendamentoService.agora().toLocalDate(), AgendamentoService.agora());
        db.update("insert into nota_fiscal(agendamento_id,nf_numero) values (?,'NF-PORTARIA')", id);
        return id;
    }

    @Test
    void capacidadeComprasDestinosEMarcosNoPostgres() throws Exception {
        long supplier = db.queryForObject("insert into fornecedor(razao_social) values ('Fornecedor T1') returning id", Long.class);
        LocalDate day = LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusYears(2)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));

        JsonNode first = create(supplier, day);
        long firstId = first.get("id").asLong();
        long noteId = first.path("notas").get(0).get("id").asLong();
        assertEquals("PENDENTE_COMPRAS", first.get("status").asText());
        assertEquals(true, first.get("portariaObrigatoria").asBoolean());
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

        // Um registro novo não pode contornar a portaria por uma chamada direta de destinos.
        mvc.perform(post("/api/agendamentos/{id}/destinos", firstId)
                        .contentType("application/json").content("{\"armazemIds\":[1]}"))
                .andExpect(status().isConflict());
        assertEquals(0, db.queryForObject("select count(*) from descarga where agendamento_id=?", Integer.class, firstId));
        // O restante deste cenário preserva e exercita explicitamente a operação legada.
        db.update("update agendamento set exige_conferencia_portaria=false where id=?", firstId);

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

    @Test
    void fornecedorSoConsultaAgendamentosCriadosPeloProprioUsuario() throws Exception {
        long supplier = db.queryForObject("insert into fornecedor(razao_social) values ('Fornecedor com escopo') returning id", Long.class);
        long dona = usuarioFornecedor("fornecedor-a");
        long outro = usuarioFornecedor("fornecedor-b");
        LocalDate day = LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusYears(3)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        String body = mvc.perform(post("/api/agendamentos")
                        .requestAttr(AuthInterceptor.ATRIBUTO, new AuthService.Usuario(dona, "fornecedor-a", "Fornecedor A", "FORNECEDOR"))
                        .contentType("application/json").content(json.writeValueAsBytes(request(supplier, day))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long appointment = json.readTree(body).get("id").asLong();

        String list = mvc.perform(get("/api/agendamentos")
                        .requestAttr(AuthInterceptor.ATRIBUTO, new AuthService.Usuario(dona, "fornecedor-a", "Fornecedor A", "FORNECEDOR")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(1, json.readTree(list).size());
        mvc.perform(get("/api/agendamentos")
                        .requestAttr(AuthInterceptor.ATRIBUTO, new AuthService.Usuario(outro, "fornecedor-b", "Fornecedor B", "FORNECEDOR")))
                .andExpect(status().isOk()).andExpect(result -> assertEquals(0, json.readTree(result.getResponse().getContentAsString()).size()));
        mvc.perform(get("/api/agendamentos/{id}", appointment)
                        .requestAttr(AuthInterceptor.ATRIBUTO, new AuthService.Usuario(outro, "fornecedor-b", "Fornecedor B", "FORNECEDOR")))
                .andExpect(status().isNotFound());
    }

    @Test
    void agendaSemChegadaPerdeVagaAutomaticamenteAposTrintaMinutos() throws Exception {
        long supplier = db.queryForObject("insert into fornecedor(razao_social) values ('Fornecedor atraso') returning id", Long.class);
        LocalDate future = LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusYears(2)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        long appointment = create(supplier, future).get("id").asLong();
        LocalDate pastBusinessDay = LocalDate.now(ZoneId.of("America/Sao_Paulo")).minusWeeks(1)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        db.update("update agendamento set data_agendada=?,horario='08:00' where id=?", pastBusinessDay, appointment);

        fluxo.encerrarAgendamentosAtrasados();

        assertEquals("NAO_RECEBIDO", db.queryForObject("select status from agendamento where id=?", String.class, appointment));
        assertEquals(1, db.queryForObject("select count(*) from nao_recebimento where agendamento_id=? and motivo='ATRASO_AGENDAMENTO'", Integer.class, appointment));
    }

    @Test
    void equipamentoFixoNaoSaiDoArmazemEUnidadeOcupadaNaoPodeSerReutilizada() {
        long supplier = db.queryForObject("insert into fornecedor(razao_social) values ('Fornecedor equipamento') returning id", Long.class);
        Long equipamentoFixo = db.queryForObject("select id from equipamento where armazem_id=3 and tipo='Empilhadeira a gás'", Long.class);
        LocalDate day = LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusYears(4)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        java.time.OffsetDateTime entrada = AgendamentoService.agora().minusMinutes(5);
        java.time.OffsetDateTime saida = AgendamentoService.agora();
        long primeira = descargaEmAndamento(supplier, day, 3, entrada);
        long segunda = descargaEmAndamento(supplier, day, 3, entrada);
        fluxo.saida(primeira, new AgendamentoService.SaidaIn(1, java.util.List.of(equipamentoFixo), saida));
        ResponseStatusException ocupado = assertThrows(ResponseStatusException.class,
                () -> fluxo.saida(segunda, new AgendamentoService.SaidaIn(1, java.util.List.of(equipamentoFixo), saida)));
        assertEquals(409, ocupado.getStatusCode().value());

        long outroArmazem = descargaEmAndamento(supplier, day, 2, entrada);
        ResponseStatusException alocacao = assertThrows(ResponseStatusException.class,
                () -> fluxo.saida(outroArmazem, new AgendamentoService.SaidaIn(1, java.util.List.of(equipamentoFixo), saida)));
        assertEquals(422, alocacao.getStatusCode().value());

        Long transitavel = db.queryForObject("select id from equipamento where identificacao='INS-PALE-01'", Long.class);
        long transferenciaPermitida = descargaEmAndamento(supplier, day, 2, entrada);
        assertEquals("CONCLUIDO", fluxo.saida(transferenciaPermitida,
                new AgendamentoService.SaidaIn(1, java.util.List.of(transitavel), saida)).get("status"));
    }

    private long descargaEmAndamento(long supplier, LocalDate day, int armazem, java.time.OffsetDateTime marco) {
        long appointment = db.queryForObject("""
                insert into agendamento(fornecedor_id,data_agendada,horario,acondicionamento,status,origem)
                values (?,?,'08:00','PALETIZADO','EM_DESCARGA','PLATAFORMA') returning id
                """, Long.class, supplier, day);
        db.update("insert into validacao_compras(agendamento_id,decisao,pedido_referencia,decidido_em) values (?,'AUTORIZADO','PED-TESTE',?)",
                appointment, marco);
        return db.queryForObject("""
                insert into descarga(agendamento_id,armazem_id,chegada_em,entrada_em)
                values (?,?,?,?) returning id
                """, Long.class, appointment, armazem, marco, marco);
    }

    private long usuarioFornecedor(String login) {
        return db.queryForObject("insert into usuario(login,nome,papel,senha_hash) values (?,?,'FORNECEDOR','teste') returning id",
                Long.class, login, login);
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
