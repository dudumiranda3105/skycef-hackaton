package com.skycef.recebimento.agendamento.domain;

/** Como a carga vem acondicionada. Um caminhao traz sempre um unico tipo (nao ha carga mista). */
public enum Acondicionamento {
    BATIDO,      // solto, movimentado manualmente saco a saco
    PALETIZADO,  // sacaria em paletes, descarregada com empilhadeira
    BIG_BAG      // descarregado com empilhadeira
}
