package com.skycef.recebimento.agendamento;

import com.skycef.recebimento.auth.AuthInterceptor;
import com.skycef.recebimento.auth.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;

@RestController
public class PortariaController {
    private final PortariaService portaria;
    public PortariaController(PortariaService portaria) { this.portaria = portaria; }

    @PostMapping("/api/agendamentos/{id}/portaria/conferencia")
    public Map<String, Object> conferir(@PathVariable long id, @RequestBody PortariaService.ConferenciaIn in, HttpServletRequest request) {
        return portaria.conferir(id, in, usuario(request));
    }

    @PostMapping("/api/agendamentos/{id}/portaria/enviar")
    public Map<String, Object> enviar(@PathVariable long id, HttpServletRequest request) { return portaria.enviar(id, usuario(request)); }

    @GetMapping("/api/insumos/recebimentos")
    public List<Map<String, Object>> listar(HttpServletRequest request) { return portaria.listar(usuario(request)); }

    @PostMapping("/api/insumos/recebimentos/{id}/decisao")
    public Map<String, Object> decidir(@PathVariable long id, @RequestBody PortariaService.DecisaoIn in, HttpServletRequest request) {
        return portaria.decidir(id, in, usuario(request));
    }

    private static AuthService.Usuario usuario(HttpServletRequest request) {
        Object value = request.getAttribute(AuthInterceptor.ATRIBUTO);
        return value instanceof AuthService.Usuario u ? u : null;
    }
}
