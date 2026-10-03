package com.skycef.recebimento.shared;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Bancos criados pela API Python já têm V1–V7 em schema_migrations.
 * Registra essa versão como baseline do Flyway antes de aplicar migrações futuras.
 */
@Configuration
public class LegacyMigrationBridge {
    @Bean
    FlywayMigrationStrategy migrateFromExistingPostgres(DataSource dataSource) {
        return flyway -> {
            JdbcTemplate db = new JdbcTemplate(dataSource);
            Boolean legacy = db.queryForObject("select exists (select 1 from information_schema.tables "
                    + "where table_schema = current_schema() and table_name = 'schema_migrations')", Boolean.class);
            Boolean flywayReady = db.queryForObject("select exists (select 1 from information_schema.tables "
                    + "where table_schema = current_schema() and table_name = 'flyway_schema_history')", Boolean.class);
            if (Boolean.TRUE.equals(legacy) && !Boolean.TRUE.equals(flywayReady)) {
                Integer version = db.queryForObject("select coalesce(max(versao), 0) from schema_migrations", Integer.class);
                Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                        .baselineVersion(String.valueOf(version)).load().baseline();
            }
            flyway.migrate();
        };
    }
}
