package com.skycef.recebimento.agendamento.service;

import static com.skycef.recebimento.agendamento.domain.Acondicionamento.BATIDO;
import static com.skycef.recebimento.agendamento.domain.Acondicionamento.PALETIZADO;
import static org.assertj.core.api.Assertions.assertThat;

import com.skycef.recebimento.agendamento.domain.Acondicionamento;
import com.skycef.recebimento.cadastros.service.CalendarioService;
import com.skycef.recebimento.shared.error.ConflitoException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Prova a regra de ocupacao de horario sob concorrencia, contra um PostgreSQL real.
 * Tambem valida as migrations V1-V4 e o mapeamento JPA (ddl-auto=validate).
 * Requer Docker; sem ele o teste e ignorado.
 */
@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class AgendamentoConcorrenciaTest {

    private static final LocalTime H08 = LocalTime.of(8, 0);

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired AgendamentoService service;
    @Autowired CalendarioService calendario;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;

    private Long fornecedorId;

    @BeforeEach
    void criaFornecedor() {
        fornecedorId = jdbc.queryForObject(
                "insert into fornecedor (razao_social, cnpj) values ('Fornecedor Teste', '00000000000191') returning id",
                Long.class);
    }

    @Test
    void dezFornecedoresNoMesmoHorario_sobramExatamenteDuasVagas() throws Exception {
        LocalDate data = diaUtilAPartirDeHoje(10);

        Resultado r = dispararEmParalelo(data, H08, List.of(
                PALETIZADO, PALETIZADO, PALETIZADO, PALETIZADO, PALETIZADO,
                PALETIZADO, PALETIZADO, PALETIZADO, PALETIZADO, PALETIZADO));

        assertThat(r.sucessos()).isEqualTo(2);
        assertThat(r.conflitos()).isEqualTo(8);
        assertThat(ocupantes(data, H08)).hasSize(2);
    }

    @Test
    void cargaBatidaCompetindoComPaletizados_nuncaConvivem() throws Exception {
        LocalDate data = diaUtilAPartirDeHoje(20);

        dispararEmParalelo(data, H08, List.of(
                BATIDO, PALETIZADO, PALETIZADO, PALETIZADO, PALETIZADO, PALETIZADO));

        List<String> ocupantes = ocupantes(data, H08);
        assertThat(ocupantes).isNotEmpty();
        if (ocupantes.contains("BATIDO")) {
            assertThat(ocupantes).hasSize(1);
        } else {
            assertThat(ocupantes).hasSizeLessThanOrEqualTo(2);
        }
    }

    @Test
    void horariosDiferentesNaoSeBloqueiam() throws Exception {
        LocalDate data = diaUtilAPartirDeHoje(30);
        List<Callable<Boolean>> tarefas = new ArrayList<>();
        for (LocalTime horario : List.of(LocalTime.of(8, 0), LocalTime.of(10, 0),
                LocalTime.of(13, 0), LocalTime.of(15, 0))) {
            tarefas.add(() -> tentar(data, horario, BATIDO));
        }

        List<Boolean> resultados = executarEmParalelo(tarefas);

        assertThat(resultados).containsOnly(true);
    }

    @Test
    void agendamentoGravaEventoDeAuditoria() {
        LocalDate data = diaUtilAPartirDeHoje(40);

        service.agendar(new AgendarCommand(fornecedorId, data, H08, PALETIZADO, null, null, null, false));

        Integer eventos = jdbc.queryForObject("""
                select count(*) from evento_agendamento e join agendamento a on a.id = e.agendamento_id
                where a.data_agendada = ? and e.para_status = 'AGENDADO'
                """, Integer.class, data);
        assertThat(eventos).isEqualTo(1);
    }

    // ------------------------------------------------------------------

    private record Resultado(long sucessos, long conflitos) {
    }

    private Resultado dispararEmParalelo(LocalDate data, LocalTime horario, List<Acondicionamento> tipos)
            throws Exception {
        List<Callable<Boolean>> tarefas = new ArrayList<>();
        for (Acondicionamento tipo : tipos) {
            tarefas.add(() -> tentar(data, horario, tipo));
        }
        List<Boolean> resultados = executarEmParalelo(tarefas);
        long ok = resultados.stream().filter(b -> b).count();
        return new Resultado(ok, resultados.size() - ok);
    }

    /** true = agendou; false = recusado por falta de vaga. Qualquer outro erro derruba o teste. */
    private boolean tentar(LocalDate data, LocalTime horario, Acondicionamento tipo) {
        try {
            service.agendar(new AgendarCommand(fornecedorId, data, horario, tipo, null, null, null, false));
            return true;
        } catch (ConflitoException semVaga) {
            return false;
        }
    }

    private List<Boolean> executarEmParalelo(List<Callable<Boolean>> tarefas) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tarefas.size());
        CountDownLatch largada = new CountDownLatch(1);
        try {
            List<Future<Boolean>> futuros = new ArrayList<>();
            for (Callable<Boolean> t : tarefas) {
                futuros.add(pool.submit(() -> {
                    largada.await();
                    return t.call();
                }));
            }
            largada.countDown();
            List<Boolean> resultados = new ArrayList<>();
            for (Future<Boolean> f : futuros) {
                try {
                    resultados.add(f.get());
                } catch (ExecutionException e) {
                    throw new AssertionError("Falha inesperada em uma das reservas", e.getCause());
                }
            }
            return resultados;
        } finally {
            pool.shutdownNow();
        }
    }

    private List<String> ocupantes(LocalDate data, LocalTime horario) {
        return jdbc.queryForList("""
                select acondicionamento from agendamento
                where data_agendada = ? and horario = ? and status not in ('CANCELADO', 'NAO_RECEBIDO')
                """, String.class, data, horario);
    }

    private LocalDate diaUtilAPartirDeHoje(int dias) {
        LocalDate d = LocalDate.now(clock).plusDays(dias);
        while (calendario.motivoDiaNaoUtil(d).isPresent()) {
            d = d.plusDays(1);
        }
        return d;
    }
}
