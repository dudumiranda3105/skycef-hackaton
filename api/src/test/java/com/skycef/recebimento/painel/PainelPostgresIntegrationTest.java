package com.skycef.recebimento.painel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Date;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Executa somente com TEST_DB_URL; usa um schema próprio e remove-o ao terminar. */
@EnabledIfEnvironmentVariable(named = "TEST_DB_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PainelPostgresIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private final String schema = "it_painel_" + UUID.randomUUID().toString().replace("-", "");
    private JdbcTemplate admin;
    private JdbcTemplate db;
    private PainelController controller;

    @BeforeAll
    void prepare() {
        ConnectionInfo info = connection(System.getenv("TEST_DB_URL"));
        DriverManagerDataSource adminSource = source(info.url, info.user, info.password);
        admin = new JdbcTemplate(adminSource);
        // schema é composto exclusivamente de prefixo fixo e UUID hexadecimal.
        admin.execute("create schema " + schema);
        DriverManagerDataSource isolated = source(info.url + (info.url.contains("?") ? "&" : "?")
            + "currentSchema=" + schema, info.user, info.password);
        db = new JdbcTemplate(isolated);
        Flyway.configure().dataSource(isolated).defaultSchema(schema).schemas(schema)
            .locations("classpath:db/migration").load().migrate();
        PlataformaPainelService platform = new PlataformaPainelService(db);
        controller = new PainelController(platform, new HistoricoPainelService(db, platform));
        operationalData();
        historicalData();
    }

    @AfterAll
    void cleanup() {
        if (admin != null) admin.execute("drop schema if exists " + schema + " cascade");
    }

    @Test
    void operationalAndBulletinNumbersUsePostgresAndPreserveMoneyAsText() {
        LocalDate day = LocalDate.of(2026, 9, 14);
        Map<String,Object> operation = controller.operacao(day, day, 1, null);
        Map<String,Object> loads = object(operation.get("cargasRecebidas"));
        assertEquals(1, ((Number) loads.get("total")).intValue());
        assertEquals(15.0, ((Number)object(operation.get("tempoMedioEsperaMin")).get("media")).doubleValue());
        assertEquals("180.3462", object(operation.get("custoDaOperacao")).get("totalAPagar"));
        assertEquals(1, ((Number) object(operation.get("origens")).get("PLATAFORMA")).intValue());

        Map<String,Object> dimension = controller.dimensionamentoPlataforma(day,day,1,null,"dia");
        Map<String,Object> total = object(dimension.get("total"));
        assertEquals("80.3462", total.get("sobraReais"));
        assertEquals("0.0000", total.get("faltaReais"));
        assertEquals(1, ((Number) total.get("diasComComplemento")).intValue());
        assertEquals(1, ((Number) total.get("boletinsComComplemento")).intValue());
        assertEquals("SOBRA", total.get("situacao"));
        assertEquals(1, ((List<?>) dimension.get("efetivoDistintoPorDia")).size());
    }

    @Test
    void historicalIndicatorsCountReceiptsRatherThanItemRowsAndDimensionMonths() {
        Map<String,Object> indicators = controller.indicadoresHistorico(null,null);
        List<?> annual = (List<?>) indicators.get("porAnoEArmazem");
        assertEquals(1, annual.size());
        assertEquals(40, ((Number)object(annual.get(0)).get("recebimentos")).intValue());

        Map<String,Object> dimension = controller.dimensionamentoHistorico(null,null);
        List<?> months = (List<?>) dimension.get("meses");
        assertEquals(2, months.size());
        assertEquals("SOBRA", object(months.get(0)).get("situacao"));
        assertEquals("FALTA", object(months.get(1)).get("situacao"));
        assertTrue(((Number)object(dimension.get("equilibrio")).get("diasUteisAnalisados")).intValue() >= 20);
        assertFalse(((List<?>)dimension.get("limitacoes")).isEmpty());
        assertEquals("HISTORICO", dimension.get("origem"));
    }

    private void operationalData() {
        LocalDate day = LocalDate.of(2026,9,14);
        long supplier = db.queryForObject("insert into fornecedor(codigo,razao_social) values ('IT_PAINEL','Fornecedor teste') returning id",Long.class);
        OffsetDateTime arrival = day.atTime(8,0).atZone(ZONE).toOffsetDateTime();
        long appointment = db.queryForObject("insert into agendamento(fornecedor_id,data_agendada,horario,"
            + "acondicionamento,status,origem,chegada_em) values (?,?,?,'PALETIZADO','CONCLUIDO','PLATAFORMA',?) returning id",
            Long.class,supplier,Date.valueOf(day),java.sql.Time.valueOf("08:00:00"),arrival);
        db.update("insert into descarga(agendamento_id,armazem_id,chegada_em,entrada_em,saida_em,quantidade_chapas) "
            + "values (?,1,?,?,?,2)",appointment,arrival,arrival.plusMinutes(15),arrival.plusMinutes(60));
        long bulletin=db.queryForObject("insert into boletim(armazem_id,data,producao_total,diarias_equivalentes,"
            + "valor_por_diaria,total_a_pagar,complemento,situacao,origem) "
            + "values (1,?,100.0000,2.0,50.0000,180.3462,80.3462,'CONSISTENTE','PLATAFORMA') returning id",
            Long.class,Date.valueOf(day));
        db.update("insert into chapa(matricula,nome) values ('IT_01','Teste 1'),('IT_02','Teste 2')");
        db.update("insert into boletim_equipe(boletim_id,matricula,tipo_diaria) values (?,'IT_01','COMPLETA'),(?,'IT_02','COMPLETA')",
            bulletin,bulletin);
    }

    private void historicalData() {
        for(int month : List.of(4,5)){
            LocalDate day=LocalDate.of(2026,month,1);
            int working=0;
            while(working<10){
                if(day.getDayOfWeek().getValue()<=5){
                    int count=month==4?1:3;
                    db.update("insert into hist_chapa_dia(data,qtd_presentes,qtd_cafe) values (?,5,0)",Date.valueOf(day));
                    for(int receipt=0;receipt<count;receipt++){
                        String number=month+"-"+working+"-"+receipt;
                        // Duas linhas do mesmo recebimento testam a deduplicação por evento.
                        for(int item=0;item<2;item++)
                            db.update("insert into hist_recebimento_item(data_recebimento,nr_recebimento,deposito,"
                                + "fornecedor_codigo,item_codigo) values (?,?,'MATDefe','IT_FORN',?)",
                                Date.valueOf(day),number,"ITEM_"+item);
                    }
                    working++;
                }
                day=day.plusDays(1);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String,Object> object(Object value) { return (Map<String,Object>)value; }

    private static DriverManagerDataSource source(String url,String user,String password){
        DriverManagerDataSource ds=new DriverManagerDataSource();ds.setUrl(url);
        if(user!=null)ds.setUsername(user);if(password!=null)ds.setPassword(password);
        return ds;
    }

    private record ConnectionInfo(String url,String user,String password) {}

    private static ConnectionInfo connection(String value){
        String user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD");
        if(value.startsWith("jdbc:postgresql:"))return new ConnectionInfo(value,user,password);
        throw new IllegalArgumentException("TEST_DB_URL deve ser uma URL JDBC PostgreSQL");
    }
}
