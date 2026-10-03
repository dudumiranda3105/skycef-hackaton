package com.skycef.recebimento.agendamento.service;

import com.skycef.recebimento.agendamento.domain.Acondicionamento;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Pedido de agendamento ja interpretado. A nota fiscal (chave, numero, peso) vem do parser
 * do modulo nfe; o service nao confia em status/origem vindos do cliente.
 */
public record AgendarCommand(
        Long fornecedorId,
        LocalDate data,
        LocalTime horario,
        Acondicionamento acondicionamento,
        String nfChave,
        String nfNumero,
        BigDecimal pesoTotalKg,
        boolean agendadoNaHora) {
}
