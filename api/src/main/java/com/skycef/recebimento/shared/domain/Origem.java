package com.skycef.recebimento.shared.domain;

/** De onde vem o dado. O regulamento exige declarar a origem de cada informacao do painel. */
public enum Origem {
    PLATAFORMA,  // registrado pelo uso real do sistema
    SIMULADO,    // gerado pela equipe para teste/demonstracao
    HISTORICO    // importado do pacote de dados da Cocapec
}
