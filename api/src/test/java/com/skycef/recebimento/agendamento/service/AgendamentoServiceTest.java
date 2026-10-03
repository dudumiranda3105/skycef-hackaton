package com.skycef.recebimento.agendamento.service;

import static com.skycef.recebimento.agendamento.domain.Acondicionamento.BATIDO;
import static com.skycef.recebimento.agendamento.domain.Acondicionamento.BIG_BAG;
import static com.skycef.recebimento.agendamento.domain.Acondicionamento.PALETIZADO;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.skycef.recebimento.agendamento.domain.Acondicionamento;
import com.skycef.recebimento.agendamento.domain.StatusAgendamento;
import com.skycef.recebimento.agendamento.entity.Agendamento;
import com.skycef.recebimento.agendamento.entity.EventoAgendamento;
import com.skycef.recebimento.agendamento.repository.AgendamentoRepository;
import com.skycef.recebimento.agendamento.repository.EventoAgendamentoRepository;
import com.skycef.recebimento.agendamento.repository.OcupacaoSlot;
import com.skycef.recebimento.agendamento.repository.VagaLiberadaRepository;
import com.skycef.recebimento.cadastros.service.CalendarioService;
import com.skycef.recebimento.cadastros.service.FornecedorService;
import com.skycef.recebimento.shared.domain.Origem;
import com.skycef.recebimento.shared.error.ConflitoException;
import com.skycef.recebimento.shared.error.RecursoNaoEncontradoException;
import com.skycef.recebimento.shared.error.RegraDeNegocioException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/** Relogio fixo: segunda-feira, 05/10/2026, 10h00 (fuso de Sao Paulo). */
@ExtendWith(MockitoExtension.class)
class AgendamentoServiceTest {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final Clock RELOGIO =
            Clock.fixed(ZonedDateTime.of(2026, 10, 5, 10, 0, 0, 0, FUSO).toInstant(), FUSO);

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 5);
    private static final LocalDate AMANHA = LocalDate.of(2026, 10, 6);
    private static final LocalTime H08 = LocalTime.of(8, 0);
    private static final LocalTime H10 = LocalTime.of(10, 0);
    private static final LocalTime H13 = LocalTime.of(13, 0);

    @Mock AgendamentoRepository agendamentos;
    @Mock EventoAgendamentoRepository eventos;
    @Mock VagaLiberadaRepository vagasLiberadas;
    @Mock CalendarioService calendario;
    @Mock FornecedorService fornecedores;
    @Mock TravaDeSlot trava;

    AgendamentoService service;

    @BeforeEach
    void setUp() {
        service = new AgendamentoService(agendamentos, eventos, vagasLiberadas, calendario, fornecedores,
                trava, RELOGIO);
        lenient().when(calendario.motivoDiaNaoUtil(any())).thenReturn(Optional.empty());
        lenient().when(agendamentos.ocupacoesDoDia(any())).thenReturn(List.of());
        lenient().when(vagasLiberadas.ocupacoesAbertasDoDia(any())).thenReturn(List.of());
        lenient().when(agendamentos.save(any(Agendamento.class))).thenAnswer(inv -> {
            Agendamento a = inv.getArgument(0);
            ReflectionTestUtils.setField(a, "id", 1L);
            return a;
        });
    }

    private static AgendarCommand cmd(LocalDate data, LocalTime horario, Acondicionamento acond) {
        return new AgendarCommand(1L, data, horario, acond, null, null, null, false);
    }

    private static OcupacaoSlot ocupa(LocalTime horario, Acondicionamento acond) {
        return new OcupacaoSlot(horario, acond);
    }

    @Test
    void agendaComSucesso_gravaAgendamentoEEventoDeAuditoria() {
        Agendamento criado = service.agendar(cmd(AMANHA, H08, PALETIZADO));

        assertThat(criado.getStatus()).isEqualTo(StatusAgendamento.AGENDADO);
        assertThat(criado.getOrigem()).isEqualTo(Origem.PLATAFORMA);
        assertThat(criado.getDataAgendada()).isEqualTo(AMANHA);
        assertThat(criado.isLimiteIgnorado()).isFalse();
        assertThat(criado.getCriadoEm()).isEqualTo(RELOGIO.instant());

        ArgumentCaptor<EventoAgendamento> evento = ArgumentCaptor.forClass(EventoAgendamento.class);
        verify(eventos).save(evento.capture());
        assertThat(evento.getValue().getDeStatus()).isNull();
        assertThat(evento.getValue().getParaStatus()).isEqualTo(StatusAgendamento.AGENDADO);
        assertThat(evento.getValue().getAgendamentoId()).isEqualTo(1L);
    }

    @Test
    void travaOSlotAntesDeLerAOcupacao() {
        service.agendar(cmd(AMANHA, H08, PALETIZADO));

        InOrder ordem = inOrder(trava, agendamentos);
        ordem.verify(trava).travar(AMANHA, H08);
        ordem.verify(agendamentos).ocupacoesDoDia(AMANHA);
    }

    @Test
    void rejeitaDataPassada_semTravarNada() {
        assertThatThrownBy(() -> service.agendar(cmd(LocalDate.of(2026, 10, 2), H08, PALETIZADO)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessageContaining("passada");
        verifyNoInteractions(trava);
    }

    @Test
    void rejeitaDiaNaoUtil() {
        LocalDate sabado = LocalDate.of(2026, 10, 10);
        lenient().when(calendario.motivoDiaNaoUtil(sabado)).thenReturn(Optional.of("Não há recebimento aos sábados e domingos."));

        assertThatThrownBy(() -> service.agendar(cmd(sabado, H08, PALETIZADO)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessageContaining("sábados");
        verifyNoInteractions(trava);
    }

    @Test
    void rejeitaHorarioForaDaGrade() {
        assertThatThrownBy(() -> service.agendar(cmd(AMANHA, LocalTime.of(9, 0), PALETIZADO)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessageContaining("Horário inválido");
        verifyNoInteractions(trava);
    }

    @Test
    void rejeitaHorarioQueJaPassouHoje() {
        assertThatThrownBy(() -> service.agendar(cmd(HOJE, H08, PALETIZADO)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessageContaining("já passou");
    }

    @Test
    void caminhaoSemAviso_podeAgendarNaHoraMesmoEmHorarioIniciado() {
        var cmd = new AgendarCommand(1L, HOJE, H08, PALETIZADO, null, null, null, true);

        Agendamento criado = service.agendar(cmd);

        assertThat(criado.isAgendadoNaHora()).isTrue();
    }

    @Test
    void rejeitaQuandoOLimiteDeDoisCaminhoesFoiAtingido() {
        lenient().when(agendamentos.ocupacoesDoDia(AMANHA))
                .thenReturn(List.of(ocupa(H08, PALETIZADO), ocupa(H08, BIG_BAG)));

        assertThatThrownBy(() -> service.agendar(cmd(AMANHA, H08, PALETIZADO)))
                .isInstanceOf(ConflitoException.class)
                .hasMessageContaining("limite de 2");
        verify(agendamentos, never()).save(any());
    }

    @Test
    void ocupacaoDeOutroHorarioNaoContaParaEste() {
        lenient().when(agendamentos.ocupacoesDoDia(AMANHA))
                .thenReturn(List.of(ocupa(H10, PALETIZADO), ocupa(H10, BIG_BAG)));

        Agendamento criado = service.agendar(cmd(AMANHA, H08, PALETIZADO));

        assertThat(criado.getHorario()).isEqualTo(H08);
    }

    @Test
    void cargaBatidaExigeOHorarioLivre() {
        lenient().when(agendamentos.ocupacoesDoDia(AMANHA)).thenReturn(List.of(ocupa(H08, PALETIZADO)));

        assertThatThrownBy(() -> service.agendar(cmd(AMANHA, H08, BATIDO)))
                .isInstanceOf(ConflitoException.class)
                .hasMessageContaining("carga batida exige");
    }

    @Test
    void horarioComCargaBatidaFicaReservadoSomenteParaEla() {
        lenient().when(agendamentos.ocupacoesDoDia(AMANHA)).thenReturn(List.of(ocupa(H08, BATIDO)));

        assertThatThrownBy(() -> service.agendar(cmd(AMANHA, H08, PALETIZADO)))
                .isInstanceOf(ConflitoException.class)
                .hasMessageContaining("carga batida");
    }

    @Test
    void vagaCanceladaAindaEmAbertoContaComoOcupada() {
        lenient().when(vagasLiberadas.ocupacoesAbertasDoDia(AMANHA)).thenReturn(List.of(ocupa(H08, BATIDO)));

        assertThatThrownBy(() -> service.agendar(cmd(AMANHA, H08, PALETIZADO)))
                .isInstanceOf(ConflitoException.class);
    }

    @Test
    void rejeitaFornecedorInexistente() {
        doThrow(new RecursoNaoEncontradoException("Fornecedor não encontrado: 1"))
                .when(fornecedores).exigirExistente(1L);

        assertThatThrownBy(() -> service.agendar(cmd(AMANHA, H08, PALETIZADO)))
                .isInstanceOf(RecursoNaoEncontradoException.class);
        verifyNoInteractions(trava);
    }

    @Test
    void rejeitaNotaFiscalJaAgendada() {
        String chave = "1".repeat(44);
        lenient().when(agendamentos.existsByNfChaveAndStatusNotIn(eq(chave), any())).thenReturn(true);

        var cmd = new AgendarCommand(1L, AMANHA, H08, PALETIZADO, chave, "123", null, false);

        assertThatThrownBy(() -> service.agendar(cmd))
                .isInstanceOf(ConflitoException.class)
                .hasMessageContaining("nota fiscal");
        verifyNoInteractions(trava);
    }

    @Test
    void rejeitaChaveDeAcessoComTamanhoErrado() {
        var cmd = new AgendarCommand(1L, AMANHA, H08, PALETIZADO, "1".repeat(43), null, null, false);

        assertThatThrownBy(() -> service.agendar(cmd))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessageContaining("44 dígitos");
    }

    @Test
    void consultaDaGrade_mostraOQueCabeEmCadaHorario() {
        lenient().when(agendamentos.ocupacoesDoDia(AMANHA))
                .thenReturn(List.of(ocupa(H08, PALETIZADO), ocupa(H08, BIG_BAG), ocupa(H10, BATIDO)));

        GradeDoDia grade = service.consultarGrade(AMANHA);

        assertThat(grade.diaUtil()).isTrue();
        assertThat(grade.slots()).hasSize(4);
        var h08 = grade.slots().get(0);
        assertThat(h08.ocupados()).isEqualTo(2);
        assertThat(h08.aceitaBatido()).isFalse();
        assertThat(h08.aceitaPaletizadoOuBigBag()).isFalse();
        var h10 = grade.slots().get(1);
        assertThat(h10.aceitaBatido()).isFalse();
        assertThat(h10.aceitaPaletizadoOuBigBag()).isFalse();   // batido reserva o horario inteiro
        var h13 = grade.slots().get(2);
        assertThat(h13.horario()).isEqualTo(H13);
        assertThat(h13.aceitaBatido()).isTrue();
        assertThat(h13.aceitaPaletizadoOuBigBag()).isTrue();
    }

    @Test
    void consultaDaGrade_emDiaNaoUtilNaoOfereceHorarios() {
        LocalDate domingo = LocalDate.of(2026, 10, 11);
        lenient().when(calendario.motivoDiaNaoUtil(domingo)).thenReturn(Optional.of("Não há recebimento aos sábados e domingos."));

        GradeDoDia grade = service.consultarGrade(domingo);

        assertThat(grade.diaUtil()).isFalse();
        assertThat(grade.slots()).isEmpty();
        assertThat(grade.motivoIndisponivel()).contains("sábados");
    }
}
