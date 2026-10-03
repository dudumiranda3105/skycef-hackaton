package com.skycef.recebimento.agendamento.domain;

/** Situacao de uma vaga liberada por cancelamento. */
public enum StatusVagaLiberada {
    ABERTA,          // aguardando o responsavel do armazem decidir; continua contando como ocupada
    ATRIBUIDA,       // o responsavel escolheu quem a ocupa
    LIBERADA_GERAL   // o responsavel devolveu a vaga para novos agendamentos
}
