package com.skycef.recebimento.shared;

import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final JdbcTemplate db;

    public HealthController(JdbcTemplate db) {
        this.db = db;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        db.queryForObject("select 1", Integer.class);
        return Map.of("status", "ok");
    }
}
