package com.skycef.recebimento.shared.error;

/** Recurso inexistente (ex.: fornecedor ou agendamento com aquele id). Vira HTTP 404. */
public class RecursoNaoEncontradoException extends RuntimeException {

    public RecursoNaoEncontradoException(String message) {
        super(message);
    }
}
