package com.skycef.recebimento.agendamento.entity;

import com.skycef.recebimento.agendamento.domain.Acondicionamento;
import com.skycef.recebimento.agendamento.domain.StatusVagaLiberada;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Vaga liberada por cancelamento. Cabe ao responsavel do armazem decidir quem a ocupa;
 * enquanto ABERTA ela continua contando como ocupada, para nenhum novo agendamento pega-la.
 */
@Entity
@Table(name = "vaga_liberada")
public class VagaLiberada {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "data_vaga", nullable = false)
    private LocalDate dataVaga;

    @Column(nullable = false)
    private LocalTime horario;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Acondicionamento acondicionamento;

    @Column(name = "origem_agendamento_id", nullable = false)
    private Long origemAgendamentoId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private StatusVagaLiberada status;

    @Column(name = "atribuida_a_agendamento_id")
    private Long atribuidaAAgendamentoId;

    @Column(name = "decidido_em")
    private Instant decididoEm;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm;

    protected VagaLiberada() {
    }

    public static VagaLiberada aberta(Agendamento cancelado, Instant agora) {
        VagaLiberada v = new VagaLiberada();
        v.dataVaga = cancelado.getDataAgendada();
        v.horario = cancelado.getHorario();
        v.acondicionamento = cancelado.getAcondicionamento();
        v.origemAgendamentoId = cancelado.getId();
        v.status = StatusVagaLiberada.ABERTA;
        v.criadoEm = agora;
        return v;
    }

    public Long getId() {
        return id;
    }

    public LocalDate getDataVaga() {
        return dataVaga;
    }

    public LocalTime getHorario() {
        return horario;
    }

    public Acondicionamento getAcondicionamento() {
        return acondicionamento;
    }

    public Long getOrigemAgendamentoId() {
        return origemAgendamentoId;
    }

    public StatusVagaLiberada getStatus() {
        return status;
    }

    public Long getAtribuidaAAgendamentoId() {
        return atribuidaAAgendamentoId;
    }

    public Instant getDecididoEm() {
        return decididoEm;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }
}
