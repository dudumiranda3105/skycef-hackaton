package com.skycef.recebimento.cadastros.service;

import com.skycef.recebimento.cadastros.repository.FeriadoRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Calendario de funcionamento: recebimento de fornecedor so de segunda a sexta, sem feriados. */
@Service
public class CalendarioService {

    private final FeriadoRepository feriados;

    public CalendarioService(FeriadoRepository feriados) {
        this.feriados = feriados;
    }

    /** @return o motivo pelo qual nao ha recebimento na data, ou vazio se for dia util. */
    public Optional<String> motivoDiaNaoUtil(LocalDate data) {
        DayOfWeek dia = data.getDayOfWeek();
        if (dia == DayOfWeek.SATURDAY || dia == DayOfWeek.SUNDAY) {
            return Optional.of("Não há recebimento aos sábados e domingos.");
        }
        return feriados.findById(data)
                .map(f -> "Não há recebimento em feriados (" + f.getDescricao() + ").");
    }
}
