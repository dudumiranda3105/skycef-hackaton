/**
 * Recebimento Inteligente — Cocapec
 *
 * Sistema de gestão de recebimento de mercadorias para 4 armazéns da
 * Cooperativa Agropecuária de Franca (Cocapec).
 *
 * Entry point da aplicação Spring Boot. Configura:
 * - Component scanning em com.skycef.recebimento
 * - Flyway migrations em api/migrations/
 * - Bean lookup para controllers, services e repositories
 */
package com.skycef.recebimento;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RecebimentoApplication {
    public static void main(String[] args) {
        SpringApplication.run(RecebimentoApplication.class, args);
    }
}
