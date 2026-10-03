package com.skycef.recebimento.shared.error;

/** Conflito com o estado atual (ex.: horario sem vaga, boletim ja existente). Vira HTTP 409. */
public class ConflitoException extends RuntimeException {

    public ConflitoException(String message) {
        super(message);
    }
}
