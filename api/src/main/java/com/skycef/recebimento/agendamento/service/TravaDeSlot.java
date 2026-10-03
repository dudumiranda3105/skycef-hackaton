package com.skycef.recebimento.agendamento.service;

import com.skycef.recebimento.agendamento.domain.GradeDeHorarios;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.PreparedStatement;
import java.time.LocalDate;
import java.time.LocalTime;
import org.hibernate.Session;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Serializa as reservas de um mesmo (data, horario) com um advisory lock do PostgreSQL.
 *
 * <p>A regra de ocupacao (batido exclusivo, ate 2 paletizados/big bag) e verificada em
 * codigo, e o banco nao a garante. Sem esta trava, dois fornecedores que reservam o mesmo
 * horario ao mesmo tempo leem a mesma ocupacao e ambos passam. O lock e liberado
 * sozinho no commit/rollback; deve ser pedido ANTES de ler a ocupacao.
 */
@Component
public class TravaDeSlot {

    @PersistenceContext
    private EntityManager em;

    @Transactional(propagation = Propagation.MANDATORY)
    public void travar(LocalDate data, LocalTime horario) {
        int indice = GradeDeHorarios.HORARIOS.indexOf(horario);
        if (indice < 0) {
            throw new IllegalArgumentException("Horário fora da grade: " + horario);
        }
        long chave = data.toEpochDay() * 10L + indice;
        // execute() ignora o resultado: o tipo `void` da funcao nao e mapeavel pelo Hibernate
        em.unwrap(Session.class).doWork(conexao -> {
            try (PreparedStatement ps = conexao.prepareStatement("select pg_advisory_xact_lock(?)")) {
                ps.setLong(1, chave);
                ps.execute();
            }
        });
    }
}
