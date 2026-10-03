package com.skycef.recebimento.agendamento.entity;

import com.skycef.recebimento.agendamento.domain.StatusAgendamento;
import com.skycef.recebimento.agendamento.domain.TipoEvento;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Trilha de auditoria do agendamento (tabela evento_agendamento). Somente insercao. */
@Entity
@Table(name = "evento_agendamento")
public class EventoAgendamento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agendamento_id", nullable = false)
    private Long agendamentoId;

    @Enumerated(EnumType.STRING)
    @Column(name = "de_status", length = 20)
    private StatusAgendamento deStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "para_status", nullable = false, length = 20)
    private StatusAgendamento paraStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TipoEvento tipo;

    @Column(length = 300)
    private String observacao;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> detalhe;

    @Column(name = "ocorrido_em", nullable = false)
    private Instant ocorridoEm;

    protected EventoAgendamento() {
    }

    public static EventoAgendamento status(Long agendamentoId, StatusAgendamento de, StatusAgendamento para,
                                           String observacao, Instant quando) {
        EventoAgendamento e = new EventoAgendamento();
        e.agendamentoId = agendamentoId;
        e.deStatus = de;
        e.paraStatus = para;
        e.tipo = TipoEvento.STATUS;
        e.observacao = observacao;
        e.ocorridoEm = quando;
        return e;
    }

    public Long getId() {
        return id;
    }

    public Long getAgendamentoId() {
        return agendamentoId;
    }

    public StatusAgendamento getDeStatus() {
        return deStatus;
    }

    public StatusAgendamento getParaStatus() {
        return paraStatus;
    }

    public TipoEvento getTipo() {
        return tipo;
    }

    public String getObservacao() {
        return observacao;
    }

    public Map<String, Object> getDetalhe() {
        return detalhe;
    }

    public Instant getOcorridoEm() {
        return ocorridoEm;
    }
}
