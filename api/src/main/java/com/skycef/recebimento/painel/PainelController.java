package com.skycef.recebimento.painel;

import java.time.LocalDate;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class PainelController {
    private final PlataformaPainelService plataforma;
    private final HistoricoPainelService historico;

    public PainelController(PlataformaPainelService plataforma, HistoricoPainelService historico) {
        this.plataforma = plataforma;
        this.historico = historico;
    }

    @GetMapping(value = "/painel", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<ClassPathResource> pagina() {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/html;charset=UTF-8"))
            .body(new ClassPathResource("static/painel.html"));
    }

    @GetMapping("/api/painel/operacao")
    public Map<String, Object> operacao(@RequestParam(required = false) LocalDate de,
                                         @RequestParam(required = false) LocalDate ate,
                                         @RequestParam(required = false) Integer armazemId,
                                         @RequestParam(required = false) String origem) {
        return plataforma.operacao(filtro(de, ate, armazemId, origem));
    }

    @GetMapping("/api/painel/dimensionamento/plataforma")
    public Map<String, Object> dimensionamentoPlataforma(@RequestParam(required = false) LocalDate de,
                                                          @RequestParam(required = false) LocalDate ate,
                                                          @RequestParam(required = false) Integer armazemId,
                                                          @RequestParam(required = false) String origem,
                                                          @RequestParam(defaultValue = "mes") String agrupar) {
        if (!agrupar.equals("dia") && !agrupar.equals("semana") && !agrupar.equals("mes"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "REQUISICAO_INVALIDA: agrupar");
        return plataforma.dimensionamento(filtro(de, ate, armazemId, origem), agrupar);
    }

    @GetMapping("/api/painel/historico/indicadores")
    public Map<String, Object> indicadoresHistorico(@RequestParam(required = false) LocalDate de,
                                                     @RequestParam(required = false) LocalDate ate) {
        return historico.indicadores(de, ate);
    }

    @GetMapping("/api/painel/dimensionamento/historico")
    public Map<String, Object> dimensionamentoHistorico(@RequestParam(required = false) LocalDate de,
                                                         @RequestParam(required = false) LocalDate ate) {
        return historico.dimensionamento(de, ate);
    }

    private PainelFiltro filtro(LocalDate de, LocalDate ate, Integer armazemId, String origem) {
        if (origem != null && !origem.equals("PLATAFORMA") && !origem.equals("TESTE"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "REQUISICAO_INVALIDA: origem");
        if (de != null && ate != null && de.isAfter(ate))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "REQUISICAO_INVALIDA: periodo");
        return new PainelFiltro(de, ate, armazemId, origem);
    }
}
