package com.skycef.recebimento.agendamento.entity;

import com.skycef.recebimento.agendamento.domain.Acondicionamento;
import com.skycef.recebimento.agendamento.domain.StatusAgendamento;
import com.skycef.recebimento.shared.domain.Origem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/** Agendamento de recebimento (tabela agendamento). Nunca e apagado: so muda de status. */
@Entity
@Table(name = "agendamento")
public class Agendamento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "fornecedor_id", nullable = false)
    private Long fornecedorId;

    @Column(name = "data_agendada", nullable = false)
    private LocalDate dataAgendada;

    @Column(nullable = false)
    private LocalTime horario;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Acondicionamento acondicionamento;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatusAgendamento status;

    @Column(name = "nf_numero", length = 20)
    private String nfNumero;

    @Column(name = "nf_chave", length = 44)
    private String nfChave;

    @Column(name = "peso_total_kg", precision = 14, scale = 3)
    private BigDecimal pesoTotalKg;

    @Column(name = "pedido_compra", length = 20)
    private String pedidoCompra;

    /** Caminhao que chegou sem aviso e agendou no ato. */
    @Column(name = "agendado_na_hora", nullable = false)
    private boolean agendadoNaHora;

    /** Reagendamento por caso fortuito que desconsiderou o limite de caminhoes do horario. */
    @Column(name = "limite_ignorado", nullable = false)
    private boolean limiteIgnorado;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Origem origem;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm;

    @Column(name = "compras_em")
    private Instant comprasEm;

    @Column(name = "autorizado_em")
    private Instant autorizadoEm;

    @Column(name = "motivo_cancelamento", length = 300)
    private String motivoCancelamento;

    /** Evita que duas transicoes concorrentes sobrescrevam uma a outra. */
    @Version
    @Column(nullable = false)
    private int versao;

    protected Agendamento() {
    }

    public static Agendamento novo(Long fornecedorId, LocalDate data, LocalTime horario,
                                   Acondicionamento acondicionamento, String nfChave, String nfNumero,
                                   BigDecimal pesoTotalKg, boolean agendadoNaHora, Instant agora) {
        Agendamento a = new Agendamento();
        a.fornecedorId = fornecedorId;
        a.dataAgendada = data;
        a.horario = horario;
        a.acondicionamento = acondicionamento;
        a.status = StatusAgendamento.AGENDADO;
        a.nfChave = nfChave;
        a.nfNumero = nfNumero;
        a.pesoTotalKg = pesoTotalKg;
        a.agendadoNaHora = agendadoNaHora;
        a.limiteIgnorado = false;
        a.origem = Origem.PLATAFORMA;
        a.criadoEm = agora;
        return a;
    }

    public Long getId() {
        return id;
    }

    public Long getFornecedorId() {
        return fornecedorId;
    }

    public LocalDate getDataAgendada() {
        return dataAgendada;
    }

    public LocalTime getHorario() {
        return horario;
    }

    public Acondicionamento getAcondicionamento() {
        return acondicionamento;
    }

    public StatusAgendamento getStatus() {
        return status;
    }

    public String getNfNumero() {
        return nfNumero;
    }

    public String getNfChave() {
        return nfChave;
    }

    public BigDecimal getPesoTotalKg() {
        return pesoTotalKg;
    }

    public String getPedidoCompra() {
        return pedidoCompra;
    }

    public boolean isAgendadoNaHora() {
        return agendadoNaHora;
    }

    public boolean isLimiteIgnorado() {
        return limiteIgnorado;
    }

    public Origem getOrigem() {
        return origem;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }

    public Instant getComprasEm() {
        return comprasEm;
    }

    public Instant getAutorizadoEm() {
        return autorizadoEm;
    }

    public String getMotivoCancelamento() {
        return motivoCancelamento;
    }

    public int getVersao() {
        return versao;
    }
}
