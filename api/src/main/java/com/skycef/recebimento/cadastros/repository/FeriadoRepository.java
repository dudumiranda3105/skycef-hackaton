package com.skycef.recebimento.cadastros.repository;

import com.skycef.recebimento.cadastros.entity.Feriado;
import java.time.LocalDate;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeriadoRepository extends JpaRepository<Feriado, LocalDate> {
}
