package com.skycef.recebimento.agendamento.repository;

import com.skycef.recebimento.agendamento.domain.Acondicionamento;
import java.time.LocalTime;

/** Um caminhao (ou vaga reservada) ocupando um horario: projecao das consultas de ocupacao. */
public record OcupacaoSlot(LocalTime horario, Acondicionamento acondicionamento) {
}
