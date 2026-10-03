package com.skycef.recebimento.shared.error;

/** Violacao de regra de negocio (ex.: transicao de estado invalida). Vira HTTP 422. */
public class RegraDeNegocioException extends RuntimeException {

    public RegraDeNegocioException(String message) {
        super(message);
    }
}
