package com.skycef.recebimento.agendamento;

import com.skycef.recebimento.auth.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Fila persistida de conferência da portaria e decisão de Insumos. */
@Service
public class PortariaService {
    private final JdbcTemplate db;
    private final AgendamentoService base;
    private final FluxoService flow;

    public PortariaService(JdbcTemplate db, AgendamentoService base, FluxoService flow) {
        this.db = db; this.base = base; this.flow = flow;
    }

    public record ConferenciaIn(String placa, Boolean destinatarioConfirmado, List<Long> notasConferidas) {}
    public record DecisaoIn(String decisao, List<Long> armazemIds, String observacao) {}

    static String placa(String value, boolean obrigatoria) {
        String normalizada = value == null ? null : value.toUpperCase(Locale.ROOT).replaceAll("[-\\s]", "");
        if (normalizada == null || normalizada.isEmpty()) {
            if (obrigatoria) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Informe a placa do caminhão presente na portaria.");
            return null;
        }
        if (!normalizada.matches("[A-Z]{3}[0-9][A-Z0-9][0-9]{2}"))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Informe uma placa brasileira válida, como ABC1234 ou ABC1D23.");
        return normalizada;
    }

    private static void exigirPapel(AuthService.Usuario usuario, String papel) {
        if (usuario == null) throw AgendamentoService.erro(HttpStatus.UNAUTHORIZED, "Entre com seu usuário para registrar a conferência.");
        if (!Set.of("ADMIN", papel).contains(usuario.papel()))
            throw AgendamentoService.erro(HttpStatus.FORBIDDEN, "Esta ação é exclusiva do perfil " + papel + ".");
    }

    @Transactional
    public Map<String, Object> conferir(long appointment, ConferenciaIn in, AuthService.Usuario usuario) {
        exigirPapel(usuario, "PORTEIRO");
        Map<String, Object> a = base.agendamento(appointment, true);
        if (base.one("select agendamento_id from portaria_recebimento where agendamento_id=?", appointment) != null)
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "Este caminhão já foi conferido. Consulte a conferência existente.");
        if (!"AUTORIZADO".equals(AgendamentoService.status(a)))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "O agendamento precisa estar autorizado por Compras.");
        if (!AgendamentoService.data(a).equals(AgendamentoService.agora().toLocalDate()))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "Este agendamento não é do dia de hoje. Confira o QR Code e o horário.");
        if (in == null || !Boolean.TRUE.equals(in.destinatarioConfirmado()))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Confirme na nota fiscal que a carga é destinada à nossa empresa.");
        String placa = placa(in.placa(), true);
        if (a.get("placa_veiculo") != null && !Objects.equals(placa, a.get("placa_veiculo")))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "A placa presente na portaria não corresponde à placa agendada.");
        List<Long> notas = db.query("select id from nota_fiscal where agendamento_id=? and ativa=true order by id", (rs, row) -> rs.getLong(1), appointment);
        if (notas.isEmpty() || in.notasConferidas() == null || in.notasConferidas().stream().anyMatch(Objects::isNull)
                || in.notasConferidas().size() != notas.size() || !new HashSet<>(in.notasConferidas()).equals(new HashSet<>(notas)))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Confira todas as notas fiscais ativas deste agendamento.");
        if (base.one("select id from descarga where agendamento_id=?", appointment) != null)
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "Os destinos deste caminhão já foram definidos pelo fluxo anterior.");
        if (a.get("chegada_em") == null) {
            Map<String, Object> chegada = flow.chegada(appointment, null);
            if ("NAO_RECEBIDO".equals(chegada.get("status"))) return chegada;
        }
        OffsetDateTime agora = AgendamentoService.agora();
        db.update("""
                insert into portaria_recebimento(agendamento_id,situacao,placa,conferido_em,conferido_por_usuario_id)
                values (?,'AGUARDANDO_DOCUMENTOS',?,?,?)
                """, appointment, placa, agora, usuario.id());
        base.event(appointment, "AUTORIZADO", "AUTORIZADO", "PORTARIA_CONFERENCIA", "Caminhão, destinatário e notas conferidos na portaria",
                Map.of("placa", placa, "notasConferidas", notas, "usuarioId", usuario.id()));
        return base.detalhe(appointment);
    }

    private Map<String, Object> portaria(long appointment, String expected) {
        Map<String, Object> p = base.one("select * from portaria_recebimento where agendamento_id=?", appointment);
        if (p == null) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Faça a conferência do caminhão na portaria primeiro.");
        if (!expected.equals(p.get("situacao")))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "Esta conferência está em " + p.get("situacao") + " e não aceita esta ação.");
        return p;
    }

    @Transactional
    public Map<String, Object> enviar(long appointment, AuthService.Usuario usuario) {
        exigirPapel(usuario, "PORTEIRO");
        Map<String, Object> a = base.agendamento(appointment, true);
        portaria(appointment, "AGUARDANDO_DOCUMENTOS");
        if (!"AUTORIZADO".equals(AgendamentoService.status(a)))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "O agendamento não está mais autorizado.");
        Integer notas = db.queryForObject("select count(*) from nota_fiscal where agendamento_id=? and ativa=true", Integer.class, appointment);
        Integer faltantes = db.queryForObject("select count(*) from nota_fiscal where agendamento_id=? and ativa=true and (conteudo is null or octet_length(conteudo)=0 or arquivo_nome is null)", Integer.class, appointment);
        if (notas == null || notas == 0 || faltantes == null || faltantes > 0)
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Anexe uma foto ou documento para cada nota fiscal antes de enviar a Insumos.");
        db.update("update portaria_recebimento set situacao='PENDENTE_INSUMOS',enviado_em=? where agendamento_id=?", AgendamentoService.agora(), appointment);
        base.event(appointment, "AUTORIZADO", "AUTORIZADO", "PORTARIA_ENVIO", "Documentos enviados para validação do setor de Insumos", Map.of("usuarioId", usuario.id()));
        return base.detalhe(appointment);
    }

    public List<Map<String, Object>> listar(AuthService.Usuario usuario) {
        exigirPapel(usuario, "INSUMO");
        List<Long> ids = db.query("""
                select agendamento_id from portaria_recebimento
                order by case situacao when 'PENDENTE_INSUMOS' then 0 when 'AGUARDANDO_DOCUMENTOS' then 1 else 2 end,
                coalesce(enviado_em,conferido_em),agendamento_id
                """, (rs, row) -> rs.getLong(1));
        return ids.stream().map(base::detalhe).toList();
    }

    @Transactional
    public Map<String, Object> decidir(long appointment, DecisaoIn in, AuthService.Usuario usuario) {
        exigirPapel(usuario, "INSUMO");
        if (in == null || !Set.of("APROVAR", "RECUSAR").contains(Objects.requireNonNullElse(in.decisao(), "")))
            throw AgendamentoService.erro(HttpStatus.BAD_REQUEST, "Escolha APROVAR ou RECUSAR.");
        Map<String, Object> a = base.agendamento(appointment, true);
        portaria(appointment, "PENDENTE_INSUMOS");
        if (!"AUTORIZADO".equals(AgendamentoService.status(a)))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "O agendamento não está mais autorizado.");
        String observacao = AgendamentoService.texto(in.observacao(), 250);
        boolean aprovado = "APROVAR".equals(in.decisao());
        if (!aprovado && observacao == null)
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Descreva a divergência para recusar o recebimento.");
        db.update("update portaria_recebimento set situacao=?,decidido_em=?,decidido_por_usuario_id=?,observacao=? where agendamento_id=?",
                aprovado ? "DIRECIONADO" : "RECUSADO", AgendamentoService.agora(), usuario.id(), observacao, appointment);
        if (aprovado) {
            base.destinos(appointment, new AgendamentoService.DestinosIn(in.armazemIds(), observacao));
        } else {
            base.transition(a, "NAO_RECEBIDO", "Recebimento recusado por Insumos: " + observacao);
            db.update("""
                    insert into nao_recebimento(agendamento_id,fornecedor_id,data,motivo,descricao,origem,criado_em)
                    values (?,?,?,'DIVERGENCIA_NF_PEDIDO',?,'PLATAFORMA',?)
                    """, appointment, a.get("fornecedor_id"), AgendamentoService.agora().toLocalDate(), observacao, AgendamentoService.agora());
        }
        base.event(appointment, "AUTORIZADO", aprovado ? "AUTORIZADO" : "NAO_RECEBIDO", "INSUMOS_DECISAO",
                aprovado ? "Insumos validou e direcionou o caminhão" : "Insumos recusou o recebimento: " + observacao,
                Map.of("decisao", in.decisao(), "usuarioId", usuario.id()));
        return base.detalhe(appointment);
    }
}
