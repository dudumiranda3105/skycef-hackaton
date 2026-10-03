package com.skycef.recebimento.agendamento.repository;

import com.skycef.recebimento.agendamento.domain.StatusAgendamento;
import com.skycef.recebimento.agendamento.entity.Agendamento;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AgendamentoRepository extends JpaRepository<Agendamento, Long> {

    /**
     * Agendamentos que ocupam vaga no dia (todos exceto CANCELADO e NAO_RECEBIDO; mesma
     * regra de {@link StatusAgendamento#ocupaVaga()}). A vaga vale para a cooperativa
     * inteira: nao ha filtro por armazem.
     */
    @Query("""
            select new com.skycef.recebimento.agendamento.repository.OcupacaoSlot(a.horario, a.acondicionamento)
            from Agendamento a
            where a.dataAgendada = :data
              and a.status not in (com.skycef.recebimento.agendamento.domain.StatusAgendamento.CANCELADO,
                                   com.skycef.recebimento.agendamento.domain.StatusAgendamento.NAO_RECEBIDO)
            """)
    List<OcupacaoSlot> ocupacoesDoDia(@Param("data") LocalDate data);

    boolean existsByNfChaveAndStatusNotIn(String nfChave, Collection<StatusAgendamento> status);
}
