package com.skycef.recebimento.agendamento.repository;

import com.skycef.recebimento.agendamento.entity.EventoAgendamento;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventoAgendamentoRepository extends JpaRepository<EventoAgendamento, Long> {

    List<EventoAgendamento> findByAgendamentoIdOrderByOcorridoEmAscIdAsc(Long agendamentoId);
}
