package com.skycef.recebimento.agendamento;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class AgendamentoService {
    static final List<LocalTime> HORARIOS = List.of(LocalTime.of(8, 0), LocalTime.of(10, 0), LocalTime.of(13, 0), LocalTime.of(15, 0));
    static final Set<String> LIBERADOS = Set.of("CANCELADO", "NAO_AUTORIZADO", "NAO_RECEBIDO");
    static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");
    private final JdbcTemplate db;
    private final ObjectMapper json;

    public AgendamentoService(JdbcTemplate db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    static ResponseStatusException erro(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }

    static String texto(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim();
        if (trimmed.length() > max) throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "O texto excede " + max + " caracteres.");
        return trimmed;
    }

    static OffsetDateTime agora() { return OffsetDateTime.now(ZONA); }

    static OffsetDateTime instante(OffsetDateTime value) {
        OffsetDateTime now = agora();
        if (value != null && value.toInstant().isAfter(now.plusMinutes(5).toInstant()))
            throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "O instante informado está no futuro.");
        return value == null ? now : value;
    }

    static String rotulo(String status) {
        return switch (status) {
            case "PENDENTE_COMPRAS" -> "Aguardando Compras";
            case "AUTORIZADO" -> "Autorizado";
            case "NAO_AUTORIZADO" -> "Não autorizado";
            case "EM_DESCARGA" -> "Descarregando";
            case "CONCLUIDO" -> "Concluído";
            case "CANCELADO" -> "Cancelado";
            case "NAO_RECEBIDO" -> "Não recebido";
            default -> status;
        };
    }

    public record NotaIn(String nfChave, String nfNumero, BigDecimal pesoTotalKg) {}
    public record AgendarIn(Long fornecedorId, LocalDate data, LocalTime horario, String acondicionamento,
                            List<NotaIn> notas, Boolean agendadoNaHora, String placaVeiculo) {}
    public record ComprasIn(String decisao, String pedidoReferencia, String observacao) {}
    public record DestinosIn(List<Long> armazemIds, String observacao) {}
    public record MarcoIn(OffsetDateTime ocorridoEm) {}
    public record SaidaIn(Integer quantidadeChapas, List<Long> equipamentoIds, OffsetDateTime ocorridoEm) {}
    public record ReagendamentoIn(LocalDate data, LocalTime horario, String motivo, Boolean casoFortuito) {}
    public record CancelamentoIn(String motivo) {}
    public record AtribuicaoIn(Long agendamentoId) {}
    public record NaoRecebimentoIn(String motivo, LocalDate data, Long agendamentoId, Long fornecedorId,
                                   String fornecedorNome, String descricao) {}

    private static final RowMapper<Map<String, Object>> MAP = (rs, row) -> {
        Map<String, Object> m = new LinkedHashMap<>();
        var md = rs.getMetaData();
        for (int i = 1; i <= md.getColumnCount(); i++) {
            String label = md.getColumnLabel(i);
            Object v = rs.getObject(i);
            if (v instanceof Timestamp t) v = t.toInstant().atZone(ZONA).toOffsetDateTime();
            else if (v instanceof Date d) v = d.toLocalDate();
            else if (v instanceof Time t) v = t.toLocalTime();
            m.put(label, v);
        }
        return m;
    };

    Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> rows = db.query(sql, MAP, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    List<Map<String, Object>> many(String sql, Object... args) { return db.query(sql, MAP, args); }

    static Long id(Map<String, Object> row) { return ((Number) row.get("id")).longValue(); }
    static String status(Map<String, Object> row) { return (String) row.get("status"); }
    static LocalDate data(Map<String, Object> row) { return (LocalDate) row.get("data_agendada"); }
    static LocalTime horario(Map<String, Object> row) { return (LocalTime) row.get("horario"); }

    long insert(String sql, Object... args) {
        KeyHolder key = new GeneratedKeyHolder();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(sql, new String[]{"id"});
            for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
            return ps;
        }, key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }

    Map<String, Object> agendamento(long id, boolean lock) {
        Map<String, Object> row = one("select * from agendamento where id=?" + (lock ? " for update" : ""), id);
        if (row == null) throw erro(HttpStatus.NOT_FOUND, "Agendamento não encontrado: " + id);
        return row;
    }

    Map<String, Object> descarga(long id) {
        Map<String, Object> d = one("select * from descarga where id=?", id);
        if (d == null) throw erro(HttpStatus.NOT_FOUND, "Descarga não encontrada: " + id);
        return d;
    }

    void lockSlot(LocalDate day, LocalTime time) {
        int index = HORARIOS.indexOf(time);
        if (index < 0) throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "Horário inválido. Escolha entre 08h00, 10h00, 13h00 e 15h00.");
        db.query("select pg_advisory_xact_lock(?)", (rs, row) -> 0, day.toEpochDay() * 10 + index);
    }

    void validarCalendario(LocalDate day, LocalTime time, boolean naHora) {
        if (day == null || time == null || !HORARIOS.contains(time))
            throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "Horário inválido. Escolha entre 08h00, 10h00, 13h00 e 15h00.");
        OffsetDateTime now = agora();
        if (day.isBefore(now.toLocalDate())) throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "Não é possível usar uma data passada.");
        String reason = motivoNaoUtil(day);
        if (reason != null) throw erro(HttpStatus.UNPROCESSABLE_ENTITY, reason);
        if (day.equals(now.toLocalDate()) && time.isBefore(now.toLocalTime()) && !naHora)
            throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "Este horário já passou. Escolha um horário posterior.");
    }

    String motivoNaoUtil(LocalDate day) {
        if (day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY)
            return "Não há agendamentos aos fins de semana.";
        Map<String, Object> holiday = one("select descricao from data_nao_operacional where data=?", day);
        return holiday == null ? null : "Data não operacional: " + holiday.get("descricao") + ".";
    }

    List<String> ocupantes(LocalDate day, LocalTime time, Long excludeAppointment, Long excludeVacancy) {
        List<String> out = new ArrayList<>();
        String activeSql = "select acondicionamento from agendamento where data_agendada=? and horario=? and status not in ('CANCELADO','NAO_AUTORIZADO','NAO_RECEBIDO')";
        List<Map<String, Object>> active = excludeAppointment == null ? many(activeSql, day, time) : many(activeSql + " and id<>?", day, time, excludeAppointment);
        for (Map<String, Object> row : active)
            out.add((String) row.get("acondicionamento"));
        String vacancySql = "select acondicionamento from vaga_liberada where data_vaga=? and horario=? and status='ABERTA'";
        List<Map<String, Object>> vacancies = excludeVacancy == null ? many(vacancySql, day, time) : many(vacancySql + " and id<>?", day, time, excludeVacancy);
        for (Map<String, Object> row : vacancies)
            out.add((String) row.get("acondicionamento"));
        return out;
    }

    static boolean cabe(List<String> occupants, String type) {
        return !occupants.contains("BATIDO") && ("BATIDO".equals(type) ? occupants.isEmpty() : occupants.size() < 2);
    }

    static String motivoSemVaga(List<String> occupants, String type) {
        if (occupants.contains("BATIDO")) return "Horário sem vaga: já há uma carga batida, que reserva o horário inteiro.";
        if ("BATIDO".equals(type)) return "Horário sem vaga: carga batida exige o horário livre, e já há caminhões agendados.";
        return "Horário sem vaga: o limite de 2 caminhões por horário foi atingido.";
    }

    void event(long appointment, String before, String after, String type, String observation, Map<String, Object> detail) {
        String payload;
        try { payload = detail == null ? null : json.writeValueAsString(detail); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
        db.update("insert into evento_agendamento(agendamento_id,de_status,para_status,tipo,observacao,detalhe,ocorrido_em) values (?,?,?,?,?,cast(? as jsonb),?)",
                appointment, before, after, type, observation.length() > 300 ? observation.substring(0, 300) : observation, payload, agora());
    }

    void transition(Map<String, Object> row, String next, String observation) {
        String current = status(row);
        boolean allowed = switch (current) {
            case "PENDENTE_COMPRAS" -> Set.of("AUTORIZADO", "NAO_AUTORIZADO", "CANCELADO", "NAO_RECEBIDO").contains(next);
            case "AUTORIZADO" -> Set.of("EM_DESCARGA", "CANCELADO", "NAO_RECEBIDO").contains(next);
            case "EM_DESCARGA" -> "CONCLUIDO".equals(next);
            default -> false;
        };
        if (!allowed) throw erro(HttpStatus.CONFLICT, "O agendamento está '" + rotulo(current) + "' e não pode passar para '" + rotulo(next) + "'.");
        long appointment = id(row);
        db.update("update agendamento set status=? where id=?", next, appointment);
        if (LIBERADOS.contains(next)) db.update("update nota_fiscal set ativa=false where agendamento_id=?", appointment);
        event(appointment, current, next, "STATUS", observation, null);
        row.put("status", next);
    }

    public Map<String, Object> detalhe(long appointment) {
        Map<String, Object> a = agendamento(appointment, false);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id(a));
        out.put("fornecedorId", a.get("fornecedor_id"));
        out.put("data", a.get("data_agendada"));
        out.put("horario", horario(a).toString());
        out.put("acondicionamento", a.get("acondicionamento"));
        out.put("status", status(a));
        out.put("statusRotulo", rotulo(status(a)));
        out.put("agendadoNaHora", a.get("agendado_na_hora"));
        out.put("limiteIgnorado", a.get("limite_ignorado"));
        out.put("origem", a.get("origem"));
        out.put("criadoEm", a.get("criado_em"));
        out.put("chegadaEm", a.get("chegada_em"));
        out.put("placaVeiculo", a.get("placa_veiculo"));
        out.put("portariaObrigatoria", a.get("exige_conferencia_portaria"));
        out.put("portaria", one("""
                select p.situacao, p.placa, p.conferido_em as "conferidoEm", p.enviado_em as "enviadoEm",
                       p.decidido_em as "decididoEm", p.observacao,
                       c.nome as "conferidoPorNome", d.nome as "decididoPorNome"
                from portaria_recebimento p join usuario c on c.id=p.conferido_por_usuario_id
                left join usuario d on d.id=p.decidido_por_usuario_id where p.agendamento_id=?
                """, appointment));
        out.put("notas", many("select id, nf_numero as \"nfNumero\", nf_chave as \"nfChave\", peso_total_kg as \"pesoTotalKg\", arquivo_nome as \"arquivoNome\", ativa from nota_fiscal where agendamento_id=? order by id", appointment));
        out.put("validacaoCompras", one("select decisao, pedido_referencia as \"pedidoReferencia\", observacao, decidido_em as \"decididoEm\" from validacao_compras where agendamento_id=?", appointment));
        List<Map<String, Object>> downloads = many("select id, armazem_id as \"armazemId\", chegada_em as \"chegadaEm\", entrada_em as \"entradaEm\", saida_em as \"saidaEm\", quantidade_chapas as \"quantidadeChapas\" from descarga where agendamento_id=? order by armazem_id", appointment);
        for (Map<String, Object> d : downloads) {
            List<Long> equipment = db.query("select equipamento_id from descarga_equipamento where descarga_id=? order by equipamento_id", (rs, row) -> rs.getLong(1), d.get("id"));
            d.put("equipamentoIds", equipment);
        }
        out.put("descargas", downloads);
        out.put("cancelamento", one("select motivo, situacao, solicitado_em as \"solicitadoEm\", efetivado_em as \"efetivadoEm\" from cancelamento where agendamento_id=?", appointment));
        return out;
    }

    public List<Map<String, Object>> listar(LocalDate day, String state) {
        return listar(day, state, null);
    }

    public List<Map<String, Object>> listar(LocalDate day, String state, Long solicitanteUsuarioId) {
        StringBuilder sql = new StringBuilder("select id from agendamento where 1=1");
        List<Object> args = new ArrayList<>();
        if (day != null) { sql.append(" and data_agendada=?"); args.add(day); }
        if (state != null) { sql.append(" and status=?"); args.add(state); }
        if (solicitanteUsuarioId != null) { sql.append(" and solicitado_por_usuario_id=?"); args.add(solicitanteUsuarioId); }
        sql.append(" order by data_agendada,horario,id");
        return many(sql.toString(), args.toArray()).stream().map(r -> detalhe(id(r))).toList();
    }

    public void exigirDono(long appointment, Long usuarioId) {
        if (usuarioId == null || one("select id from agendamento where id=? and solicitado_por_usuario_id=?", appointment, usuarioId) == null)
            throw erro(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
    }

    public Map<String, Object> agenda(LocalDate day) {
        if (day == null) throw erro(HttpStatus.BAD_REQUEST, "Informe a data.");
        String reason = motivoNaoUtil(day);
        List<Map<String, Object>> slots = new ArrayList<>();
        if (reason == null) for (LocalTime time : HORARIOS) {
            List<String> occupants = ocupantes(day, time, null, null);
            slots.add(Map.of("horario", time.toString(), "ocupados", occupants.size(), "aceitaBatido", cabe(occupants, "BATIDO"), "aceitaPaletizadoOuBigBag", cabe(occupants, "PALETIZADO")));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("data", day); result.put("diaUtil", reason == null); result.put("motivoIndisponivel", reason); result.put("slots", slots);
        return result;
    }

    @Transactional
    public Map<String, Object> agendar(AgendarIn input) { return agendar(input, null); }

    @Transactional
    public Map<String, Object> agendar(AgendarIn input, Long solicitanteUsuarioId) {
        if (input == null || input.fornecedorId() == null || input.notas() == null || input.notas().isEmpty() || input.notas().size() > 20)
            throw erro(HttpStatus.BAD_REQUEST, "Informe fornecedor e de 1 a 20 notas fiscais.");
        if (input.acondicionamento() == null || !Set.of("BATIDO", "PALETIZADO", "BIG_BAG").contains(input.acondicionamento()))
            throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "Acondicionamento inválido.");
        validarCalendario(input.data(), input.horario(), Boolean.TRUE.equals(input.agendadoNaHora()));
        if (one("select id from fornecedor where id=?", input.fornecedorId()) == null)
            throw erro(HttpStatus.NOT_FOUND, "Fornecedor não encontrado: " + input.fornecedorId());
        Set<String> keys = new LinkedHashSet<>();
        for (NotaIn n : input.notas()) {
            if (n == null) throw erro(HttpStatus.BAD_REQUEST, "Nota fiscal inválida.");
            if (n.nfChave() != null && (!n.nfChave().matches("[0-9]{44}") || !keys.add(n.nfChave())))
                throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "A chave de acesso da nota fiscal deve ter 44 dígitos e não pode ser repetida.");
            if (n.nfNumero() != null && n.nfNumero().length() > 20)
                throw erro(HttpStatus.BAD_REQUEST, "O número da nota fiscal excede 20 caracteres.");
            if (n.pesoTotalKg() != null && n.pesoTotalKg().signum() < 0)
                throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "O peso da carga não pode ser negativo.");
        }
        lockSlot(input.data(), input.horario());
        String placa = PortariaService.placa(input.placaVeiculo(), false);
        List<String> occupants = ocupantes(input.data(), input.horario(), null, null);
        if (!cabe(occupants, input.acondicionamento())) throw erro(HttpStatus.CONFLICT, motivoSemVaga(occupants, input.acondicionamento()));
        long appointment;
        try {
            appointment = insert("insert into agendamento(fornecedor_id,data_agendada,horario,acondicionamento,status,agendado_na_hora,limite_ignorado,origem,criado_em,solicitado_por_usuario_id,placa_veiculo,exige_conferencia_portaria) values (?,?,?,?,? ,?,?,?,?,?,?,true)",
                    input.fornecedorId(), input.data(), input.horario(), input.acondicionamento(), "PENDENTE_COMPRAS", Boolean.TRUE.equals(input.agendadoNaHora()), false, "PLATAFORMA", agora(), solicitanteUsuarioId, placa);
            for (NotaIn n : input.notas()) insert("insert into nota_fiscal(agendamento_id,nf_chave,nf_numero,peso_total_kg,ativa,criado_em) values (?,?,?,?,true,?)",
                    appointment, n.nfChave(), n.nfNumero(), n.pesoTotalKg(), agora());
        } catch (DataIntegrityViolationException e) { throw erro(HttpStatus.CONFLICT, "Uma das notas fiscais já está agendada."); }
        event(appointment, null, "PENDENTE_COMPRAS", "STATUS", Boolean.TRUE.equals(input.agendadoNaHora()) ? "Agendado na hora pelo caminhão sem aviso prévio" : "Agendamento criado", null);
        return detalhe(appointment);
    }

    @Transactional
    public Map<String, Object> compras(long appointment, ComprasIn in) {
        if (in == null || in.decisao() == null || !Set.of("AUTORIZADO", "NAO_AUTORIZADO").contains(in.decisao())) throw erro(HttpStatus.BAD_REQUEST, "Decisão inválida.");
        String order = texto(in.pedidoReferencia(), 20), observation = texto(in.observacao(), 250);
        if ("AUTORIZADO".equals(in.decisao()) && order == null) throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "Informe o pedido de compra de referência para autorizar.");
        if ("NAO_AUTORIZADO".equals(in.decisao()) && observation == null) throw erro(HttpStatus.UNPROCESSABLE_ENTITY, "Descreva a divergência encontrada entre a nota e o pedido.");
        Map<String, Object> a = agendamento(appointment, true);
        transition(a, in.decisao(), "AUTORIZADO".equals(in.decisao()) ? "Nota conferida com o pedido de compra" : "Divergência entre nota e pedido: " + observation);
        db.update("insert into validacao_compras(agendamento_id,decisao,pedido_referencia,observacao,decidido_em) values (?,?,?,?,?)", appointment, in.decisao(), order, observation, agora());
        if ("NAO_AUTORIZADO".equals(in.decisao()))
            db.update("insert into nao_recebimento(agendamento_id,fornecedor_id,data,motivo,descricao,origem,criado_em) values (?,?,?,?,?,'PLATAFORMA',?)", appointment, a.get("fornecedor_id"), data(a), "DIVERGENCIA_NF_PEDIDO", observation, agora());
        return detalhe(appointment);
    }

    @Transactional
    public Map<String, Object> destinos(long appointment, DestinosIn in) {
        if (in == null || in.armazemIds() == null || in.armazemIds().isEmpty() || in.armazemIds().size() > 4)
            throw erro(HttpStatus.BAD_REQUEST, "Informe de 1 a 4 armazéns de destino.");
        Set<Long> ids = new LinkedHashSet<>(in.armazemIds());
        Map<String, Object> a = agendamento(appointment, true);
        if (!"AUTORIZADO".equals(status(a))) throw erro(HttpStatus.CONFLICT, "Compras precisa autorizar o agendamento antes de definir os destinos.");
        Map<String, Object> portaria = one("select situacao from portaria_recebimento where agendamento_id=?", appointment);
        if ((Boolean.TRUE.equals(a.get("exige_conferencia_portaria")) && portaria == null)
                || (portaria != null && !"DIRECIONADO".equals(portaria.get("situacao"))))
            throw erro(HttpStatus.CONFLICT, "Insumos precisa validar a conferência da portaria antes de definir os destinos.");
        if (one("select id from descarga where agendamento_id=?", appointment) != null) throw erro(HttpStatus.CONFLICT, "Os armazéns de destino já foram definidos para este agendamento.");
        for (Long warehouse : ids) {
            if (one("select id from armazem where id=?", warehouse) == null) throw erro(HttpStatus.NOT_FOUND, "Armazém não encontrado: " + warehouse);
            insert("insert into descarga(agendamento_id,armazem_id,chegada_em,criado_em) values (?,?,?,?)", appointment, warehouse, a.get("chegada_em"), agora());
        }
        event(appointment, status(a), status(a), "DESTINO", Objects.requireNonNullElse(texto(in.observacao(), 250), "Armazém(ns) de destino definido(s)"), Map.of("armazemIds", ids));
        return detalhe(appointment);
    }

    public List<Map<String, Object>> eventos(long appointment) {
        agendamento(appointment, false);
        List<Map<String, Object>> events = many("select id, de_status as \"deStatus\", para_status as \"paraStatus\", tipo, observacao, detalhe, ocorrido_em as \"ocorridoEm\" from evento_agendamento where agendamento_id=? order by ocorrido_em,id", appointment);
        for (Map<String, Object> event : events) {
            Object detail = event.get("detalhe");
            if (detail != null) {
                try { event.put("detalhe", json.readValue(detail.toString(), Map.class)); }
                catch (JsonProcessingException e) { throw new IllegalStateException("Evento com JSON inválido", e); }
            }
        }
        return events;
    }
}
