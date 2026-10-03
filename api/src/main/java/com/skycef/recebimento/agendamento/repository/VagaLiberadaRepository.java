package com.skycef.recebimento.agendamento.repository;

import com.skycef.recebimento.agendamento.entity.VagaLiberada;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VagaLiberadaRepository extends JpaRepository<VagaLiberada, Long> {

    /** Vagas canceladas ainda sem decisao do armazem: contam como ocupadas. */
    @Query("""
            select new com.skycef.recebimento.agendamento.repository.OcupacaoSlot(v.horario, v.acondicionamento)
            from VagaLiberada v
            where v.dataVaga = :data
              and v.status = com.skycef.recebimento.agendamento.domain.StatusVagaLiberada.ABERTA
            """)
    List<OcupacaoSlot> ocupacoesAbertasDoDia(@Param("data") LocalDate data);
}
