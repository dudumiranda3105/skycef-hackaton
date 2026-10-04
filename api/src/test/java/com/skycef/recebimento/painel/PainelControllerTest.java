package com.skycef.recebimento.painel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PainelControllerTest {
    private final PlataformaPainelService plataforma = org.mockito.Mockito.mock(PlataformaPainelService.class);
    private final HistoricoPainelService historico = org.mockito.Mockito.mock(HistoricoPainelService.class);
    private final PainelController controller = new PainelController(plataforma, historico);

    @Test
    void rejectsUnknownOriginAndGrouping() {
        assertEquals(400, assertThrows(ResponseStatusException.class,
            () -> controller.operacao(null, null, null, "INVENTADA")).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
            () -> controller.operacao(null, null, null, "TESTE")).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
            () -> controller.dimensionamentoPlataforma(null, null, null, null, "ano")).getStatusCode().value());
    }

    @Test
    void defaultsToRealPlatformOriginAndForwardsInclusiveDateRange() {
        LocalDate day = LocalDate.of(2026, 10, 3);
        Map<String,Object> result = Map.of("origens", Map.of("PLATAFORMA", 1));
        when(plataforma.operacao(any())).thenReturn(result);
        assertEquals(result, controller.operacao(day, day, 2, null));
        verify(plataforma).operacao(eq(new PainelFiltro(day, day, 2, "PLATAFORMA")));
    }

    @Test
    void historicalEndpointsShareMonthFilters() {
        LocalDate day = LocalDate.of(2026, 4, 1);
        controller.indicadoresHistorico(day, day);
        controller.dimensionamentoHistorico(day, day);
        verify(historico).indicadores(day, day);
        verify(historico).dimensionamento(day, day);
    }
}
