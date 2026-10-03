package com.skycef.recebimento.cadastros.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;

@Entity
@Table(name = "feriado")
public class Feriado {

    @Id
    private LocalDate data;

    @Column(nullable = false, length = 80)
    private String descricao;

    protected Feriado() {
    }

    public LocalDate getData() {
        return data;
    }

    public String getDescricao() {
        return descricao;
    }
}
