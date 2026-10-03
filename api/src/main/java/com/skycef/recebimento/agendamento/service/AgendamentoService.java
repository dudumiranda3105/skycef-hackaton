package com.skycef.recebimento.agendamento.service;

import com.skycef.recebimento.agendamento.domain.Acondicionamento;
import com.skycef.recebimento.agendamento.domain.GradeDeHorarios;
import com.skycef.recebimento.agendamento.domain.PoliticaDeVagas;
import com.skycef.recebimento.agendamento.domain.StatusAgendamento;
import com.skycef.recebimento.agendamento.entity.Agendamento;
import com.skycef.recebimento.agendamento.entity.EventoAgendamento;
import com.skycef.recebimento.agendamento.repository.AgendamentoRepository;
import com.skycef.recebimento.agendamento.repository.EventoAgendamentoRepository;
import com.skycef.recebimento.agendamento.repository.OcupacaoSlot;
import com.skycef.recebimento.agendamento.repository.VagaLiberadaRepository;
import com.skycef.recebimento.cadastros.service.CalendarioService;
import com.skycef.recebimento.cadastros.service.FornecedorService;
import com.skycef.recebimento.shared.error.ConflitoException;
import com.skycef.recebimento.shared.error.RegraDeNegocioException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgendamentoService {

    private static final Pattern CHAVE_NFE = Pattern.compile("[0-9]{44}");

    /** Status que liberam a vaga (e a NF): o caminhao nao vai mais descarregar. */
    private static final EnumSet<StatusAgendamento> LIBERAM_VAGA =
            EnumSet.of(StatusAgendamento.CANCELADO, StatusAgendamento.NAO_RECEBIDO);

    private final AgendamentoRepository agendamentos;
    private final EventoAgendamentoRepository eventos;
    private final VagaLiberadaRepository vagasLiberadas;
    private final CalendarioService calendario;
    private final FornecedorService fornecedores;
    private final TravaDeSlot trava;
    private final Clock clock;

    public AgendamentoService(AgendamentoRepository agendamentos,
                              EventoAgendamentoRepository eventos,
                              VagaLiberadaRepository vagasLiberadas,
                              CalendarioService calendario,
                              FornecedorService fornecedores,
                              TravaDeSlot trava,
                              Clock clock) {
        this.agendamentos = agendamentos;
        this.eventos = eventos;
        this.vagasLiberadas = vagasLiberadas;
        this.calendario = calendario;
        this.fornecedores = fornecedores;
        this.trava = trava;
        this.clock = clock;
    }

    /**
     * Cria um agendamento respeitando a regra de ocupacao do horario. A contagem de
     * ocupantes e o insert acontecem na mesma transacao, sob a trava do slot.
     */
    @Transactional
    public Agendamento agendar(AgendarCommand cmd) {
        validarEntrada(cmd);
        validarCalendario(cmd);
        fornecedores.exigirExistente(cmd.fornecedorId());

        if (cmd.nfChave() != null
                && agendamentos.existsByNfChaveAndStatusNotIn(cmd.nfChave(), LIBERAM_VAGA)) {
            throw new ConflitoException("Esta nota fiscal já está agendada.");
        }

        trava.travar(cmd.data(), cmd.horario());

        List<Acondicionamento> ocupantes = ocupantesDoSlot(cmd.data(), cmd.horario());
        if (!PoliticaDeVagas.cabe(ocupantes, cmd.acondicionamento(), false)) {
            throw new ConflitoException(motivoSemVaga(ocupantes, cmd.acondicionamento()));
        }

        Instant agora = clock.instant();
        Agendamento criado = agendamentos.save(Agendamento.novo(
                cmd.fornecedorId(), cmd.data(), cmd.horario(), cmd.acondicionamento(),
                cmd.nfChave(), cmd.nfNumero(), cmd.pesoTotalKg(), cmd.agendadoNaHora(), agora));
        eventos.save(EventoAgendamento.status(
                criado.getId(), null, StatusAgendamento.AGENDADO,
                cmd.agendadoNaHora() ? "Agendado na hora pelo caminhão sem aviso prévio" : "Agendamento criado",
                agora));
        return criado;
    }

    /** Disponibilidade dos quatro horarios de um dia (leitura; nao reserva nada). */
    @Transactional(readOnly = true)
    public GradeDoDia consultarGrade(LocalDate data) {
        Optional<String> motivo = calendario.motivoDiaNaoUtil(data);
        if (motivo.isPresent()) {
            return new GradeDoDia(data, false, motivo.get(), List.of());
        }
        List<OcupacaoSlot> ocupacoes = new ArrayList<>(agendamentos.ocupacoesDoDia(data));
        ocupacoes.addAll(vagasLiberadas.ocupacoesAbertasDoDia(data));

        List<GradeDoDia.Slot> slots = GradeDeHorarios.HORARIOS.stream().map(horario -> {
            List<Acondicionamento> ocupantes = ocupacoes.stream()
                    .filter(o -> o.horario().equals(horario))
                    .map(OcupacaoSlot::acondicionamento)
                    .toList();
            return new GradeDoDia.Slot(horario, ocupantes.size(),
                    PoliticaDeVagas.cabe(ocupantes, Acondicionamento.BATIDO, false),
                    PoliticaDeVagas.cabe(ocupantes, Acondicionamento.PALETIZADO, false));
        }).toList();
        return new GradeDoDia(data, true, null, slots);
    }

    private List<Acondicionamento> ocupantesDoSlot(LocalDate data, LocalTime horario) {
        List<OcupacaoSlot> todos = new ArrayList<>(agendamentos.ocupacoesDoDia(data));
        todos.addAll(vagasLiberadas.ocupacoesAbertasDoDia(data));
        return todos.stream()
                .filter(o -> o.horario().equals(horario))
                .map(OcupacaoSlot::acondicionamento)
                .toList();
    }

    private void validarEntrada(AgendarCommand cmd) {
        if (cmd.data() == null || cmd.horario() == null || cmd.acondicionamento() == null) {
            throw new RegraDeNegocioException("Data, horário e acondicionamento são obrigatórios.");
        }
        if (!GradeDeHorarios.valido(cmd.horario())) {
            throw new RegraDeNegocioException("Horário inválido. Escolha entre 08h00, 10h00, 13h00 e 15h00.");
        }
        if (cmd.nfChave() != null && !CHAVE_NFE.matcher(cmd.nfChave()).matches()) {
            throw new RegraDeNegocioException("A chave de acesso da nota fiscal deve ter 44 dígitos.");
        }
        if (cmd.pesoTotalKg() != null && cmd.pesoTotalKg().signum() < 0) {
            throw new RegraDeNegocioException("O peso da carga não pode ser negativo.");
        }
    }

    private void validarCalendario(AgendarCommand cmd) {
        LocalDate hoje = LocalDate.now(clock);
        if (cmd.data().isBefore(hoje)) {
            throw new RegraDeNegocioException("Não é possível agendar em uma data passada.");
        }
        calendario.motivoDiaNaoUtil(cmd.data()).ifPresent(motivo -> {
            throw new RegraDeNegocioException(motivo);
        });
        // O caminhao sem aviso pode agendar "na hora", mesmo em horario ja iniciado
        if (cmd.data().equals(hoje) && cmd.horario().isBefore(LocalTime.now(clock)) && !cmd.agendadoNaHora()) {
            throw new RegraDeNegocioException("Este horário já passou. Escolha um horário posterior.");
        }
    }

    private static String motivoSemVaga(List<Acondicionamento> ocupantes, Acondicionamento novo) {
        if (ocupantes.contains(Acondicionamento.BATIDO)) {
            return "Horário sem vaga: já há uma carga batida, que reserva o horário inteiro.";
        }
        if (novo == Acondicionamento.BATIDO) {
            return "Horário sem vaga: carga batida exige o horário livre, e já há caminhões agendados.";
        }
        return "Horário sem vaga: o limite de 2 caminhões por horário foi atingido.";
    }
}
