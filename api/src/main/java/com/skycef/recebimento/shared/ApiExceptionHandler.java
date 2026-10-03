package com.skycef.recebimento.shared;

import java.util.Map;
import java.util.NoSuchElementException;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> responseStatus(ResponseStatusException error) {
        return resposta(error.getStatusCode(), error.getReason());
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoSuchElementException error) {
        return resposta(HttpStatus.NOT_FOUND, error.getMessage());
    }

    @ExceptionHandler({DuplicateKeyException.class, DataIntegrityViolationException.class})
    public ResponseEntity<Map<String, Object>> conflict(Exception error) {
        return resposta(HttpStatus.CONFLICT, "Registro duplicado ou em conflito com os dados existentes.");
    }

    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class,
            HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String, Object>> invalid(Exception error) {
        return resposta(HttpStatus.UNPROCESSABLE_ENTITY, error.getMessage());
    }

    private ResponseEntity<Map<String, Object>> resposta(HttpStatusCode status, String detalhe) {
        String codigo = switch (status.value()) {
            case 404 -> "NAO_ENCONTRADO";
            case 409 -> "CONFLITO";
            case 422, 400 -> "REQUISICAO_INVALIDA";
            default -> "ERRO";
        };
        return ResponseEntity.status(status).contentType(MediaType.parseMediaType("application/problem+json"))
                .body(Map.of("status", status.value(), "codigo", codigo,
                        "detail", detalhe == null ? "Requisição não pôde ser processada." : detalhe));
    }
}
