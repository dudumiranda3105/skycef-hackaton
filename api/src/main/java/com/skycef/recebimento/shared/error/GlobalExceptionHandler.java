package com.skycef.recebimento.shared.error;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Formato unico de erro (RFC 7807) com a propriedade estavel {@code codigo}, para o front
 * nao depender do texto da mensagem. Erros de validacao (@Valid) ja saem como 400 pela
 * classe base.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(RegraDeNegocioException.class)
    ProblemDetail regraDeNegocio(RegraDeNegocioException e) {
        return problema(HttpStatus.UNPROCESSABLE_ENTITY, "REGRA_DE_NEGOCIO", e.getMessage());
    }

    @ExceptionHandler(ConflitoException.class)
    ProblemDetail conflito(ConflitoException e) {
        return problema(HttpStatus.CONFLICT, "CONFLITO", e.getMessage());
    }

    @ExceptionHandler(RecursoNaoEncontradoException.class)
    ProblemDetail naoEncontrado(RecursoNaoEncontradoException e) {
        return problema(HttpStatus.NOT_FOUND, "NAO_ENCONTRADO", e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail argumentoInvalido(IllegalArgumentException e) {
        return problema(HttpStatus.BAD_REQUEST, "REQUISICAO_INVALIDA", e.getMessage());
    }

    /** Rede de seguranca do banco (ex.: indice unico de NF ativa, CHECK de dia util). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail integridade(DataIntegrityViolationException e) {
        log.warn("Violacao de integridade: {}", e.getMostSpecificCause().getMessage());
        return problema(HttpStatus.CONFLICT, "VIOLACAO_DE_INTEGRIDADE",
                "A operação viola uma regra de integridade dos dados (registro duplicado ou inválido).");
    }

    /** Dois usuarios alteraram o mesmo agendamento ao mesmo tempo (@Version). */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail versaoConflitante(OptimisticLockingFailureException e) {
        return problema(HttpStatus.CONFLICT, "CONFLITO_DE_VERSAO",
                "O registro foi alterado por outra pessoa. Atualize a tela e tente novamente.");
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail inesperado(Exception e) {
        log.error("Erro inesperado", e);
        return problema(HttpStatus.INTERNAL_SERVER_ERROR, "ERRO_INTERNO",
                "Erro interno. Tente novamente; se persistir, avise a equipe.");
    }

    private static ProblemDetail problema(HttpStatus status, String codigo, String detalhe) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detalhe);
        p.setProperty("codigo", codigo);
        return p;
    }
}
