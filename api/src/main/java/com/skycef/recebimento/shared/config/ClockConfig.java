package com.skycef.recebimento.shared.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Relogio unico da aplicacao, no fuso da cooperativa. A JVM do container roda em UTC; sem
 * isto, "hoje" viraria "amanha" depois das 21h. Injetar o Clock tambem permite fixar o
 * tempo nos testes.
 */
@Configuration
public class ClockConfig {

    public static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    @Bean
    Clock clock() {
        return Clock.system(FUSO);
    }
}
