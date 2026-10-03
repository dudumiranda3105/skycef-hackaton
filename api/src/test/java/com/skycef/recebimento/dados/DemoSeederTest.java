package com.skycef.recebimento.dados;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

class DemoSeederTest {
    @Test
    void doesNotModifyDatabaseUnlessExplicitlyRequested() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        TransactionTemplate transaction = mock(TransactionTemplate.class);
        new DemoSeeder(jdbc, transaction).run(new DefaultApplicationArguments(new String[0]));
        verifyNoInteractions(jdbc, transaction);
    }
}
