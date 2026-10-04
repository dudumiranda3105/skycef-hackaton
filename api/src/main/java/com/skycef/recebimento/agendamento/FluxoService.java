package com.skycef.recebimento.agendamento;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.LocalDate;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class FluxoService {
    private final JdbcTemplate db;
    private final AgendamentoService base;

    public FluxoService(JdbcTemplate db, AgendamentoService base) { this.db = db; this.base = base; }

    @Transactional
    public Map<String, Object> chegada(long appointment, AgendamentoService.MarcoIn in) {
        OffsetDateTime when = AgendamentoService.instante(in == null ? null : in.ocorridoEm());
        Map<String, Object> a = base.agendamento(appointment, true);
        if (!Set.of("PENDENTE_COMPRAS", "AUTORIZADO").contains(AgendamentoService.status(a)))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "O agendamento não aceita a chegada do caminhão.");
        if (a.get("chegada_em") != null) throw AgendamentoService.erro(HttpStatus.CONFLICT, "A chegada deste caminhão já foi registrada.");
        OffsetDateTime agora = AgendamentoService.agora();
        OffsetDateTime horarioAgendado = LocalDateTime.of(AgendamentoService.data(a), AgendamentoService.horario(a)).atZone(AgendamentoService.ZONA).toOffsetDateTime();
        if (Duration.between(horarioAgendado, when).toMinutes() >= 30) {
            perderPorAtraso(a, agora, "Chegada registrada 30 minutos ou mais após o horário agendado.");
            Map<String, Object> resultado = base.detalhe(appointment);
            resultado.put("agendaPerdidaPorAtraso", true);
            return resultado;
        }
        db.update("update agendamento set chegada_em=? where id=?", when, appointment);
        db.update("update descarga set chegada_em=? where agendamento_id=? and chegada_em is null", when, appointment);
        marco(a, "CHEGADA", "Chegada do caminhão", when, null, null);
        return base.detalhe(appointment);
    }

    @Transactional
    public Map<String, Object> chegadaDescarga(long discharge, AgendamentoService.MarcoIn in) {
        OffsetDateTime when = AgendamentoService.instante(in == null ? null : in.ocorridoEm());
        Map<String, Object> d = base.descarga(discharge);
        Map<String, Object> a = base.agendamento(((Number) d.get("agendamento_id")).longValue(), true);
        exigirAutorizado(a);
        if (d.get("entrada_em") != null) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Esta descarga já começou; a chegada não pode mais ser alterada.");
        if (a.get("chegada_em") != null) throw AgendamentoService.erro(HttpStatus.CONFLICT, "A chegada deste caminhão já foi registrada.");
        db.update("update agendamento set chegada_em=? where id=?", when, AgendamentoService.id(a));
        db.update("update descarga set chegada_em=? where agendamento_id=? and chegada_em is null", when, AgendamentoService.id(a));
        marco(a, "CHEGADA", "Chegada registrada para a descarga", when, d, null);
        return base.detalhe(AgendamentoService.id(a));
    }

    @Transactional
    public Map<String, Object> entrada(long discharge, AgendamentoService.MarcoIn in) {
        OffsetDateTime when = AgendamentoService.instante(in == null ? null : in.ocorridoEm());
        Map<String, Object> d = base.descarga(discharge);
        Map<String, Object> a = base.agendamento(((Number) d.get("agendamento_id")).longValue(), true);
        exigirAutorizado(a);
        Map<String, Object> portaria = base.one("select situacao from portaria_recebimento where agendamento_id=?", AgendamentoService.id(a));
        if ((Boolean.TRUE.equals(a.get("exige_conferencia_portaria")) && portaria == null)
                || (portaria != null && !"DIRECIONADO".equals(portaria.get("situacao"))))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "Aguarde a validação e o direcionamento do setor de Insumos.");
        if (d.get("entrada_em") != null) throw AgendamentoService.erro(HttpStatus.CONFLICT, "A entrada desta descarga já foi registrada.");
        if (d.get("chegada_em") == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Registre a chegada do caminhão antes da entrada.");
        if (when.toInstant().isBefore(((OffsetDateTime) d.get("chegada_em")).toInstant()))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "A entrada não pode ser anterior à chegada.");
        db.update("update descarga set entrada_em=? where id=?", when, discharge);
        if ("AUTORIZADO".equals(AgendamentoService.status(a))) base.transition(a, "EM_DESCARGA", "Início da primeira descarga");
        marco(a, "ENTRADA", "Início da descarga", when, d, null);
        return base.detalhe(AgendamentoService.id(a));
    }

    @Transactional
    public Map<String, Object> saida(long discharge, AgendamentoService.SaidaIn in) {
        if (in == null || in.quantidadeChapas() == null || in.quantidadeChapas() < 0 || in.quantidadeChapas() > 100)
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Informe a quantidade de chapas (zero se a carga não exigiu).");
        OffsetDateTime when = AgendamentoService.instante(in.ocorridoEm());
        Map<String, Object> d = base.descarga(discharge);
        Map<String, Object> a = base.agendamento(((Number) d.get("agendamento_id")).longValue(), true);
        if (!"EM_DESCARGA".equals(AgendamentoService.status(a))) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Registre a entrada antes da saída.");
        if (d.get("entrada_em") == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Registre a entrada antes da saída.");
        if (d.get("saida_em") != null) throw AgendamentoService.erro(HttpStatus.CONFLICT, "A saída desta descarga já foi registrada.");
        if (when.toInstant().isBefore(((OffsetDateTime) d.get("entrada_em")).toInstant()))
            throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "A saída não pode ser anterior à entrada.");
        Set<Long> equipment = new java.util.TreeSet<>(in.equipamentoIds() == null ? List.of() : in.equipamentoIds());
        if (equipment.size() > 30) throw AgendamentoService.erro(HttpStatus.BAD_REQUEST, "Até 30 equipamentos por descarga.");
        for (Long equipmentId : equipment) {
            Map<String, Object> item = base.one("select id, armazem_id, tipo, observacao from equipamento where id=?", equipmentId);
            if (item == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Equipamento inválido: " + equipmentId + ".");
            int warehouse = ((Number) d.get("armazem_id")).intValue();
            int equipmentWarehouse = ((Number) item.get("armazem_id")).intValue();
            String observacao = item.get("observacao") == null ? "" : item.get("observacao").toString().toLowerCase();
            boolean transitavel = observacao.contains("transit") || observacao.contains("pode ir a outros armazéns");
            boolean compartilhavelAdubo = warehouse == 1 && equipmentWarehouse == 2
                    && observacao.contains("auxiliar o insumos");
            if (equipmentWarehouse != warehouse && !transitavel && !compartilhavelAdubo)
                throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Equipamento " + equipmentId + " não está alocado a este armazém.");
            Integer used = jdbcUsed(equipmentId, (OffsetDateTime) d.get("entrada_em"), when);
            if (used >= 1) throw AgendamentoService.erro(HttpStatus.CONFLICT, "O equipamento " + equipmentId + " já foi usado em outra descarga que se sobrepõe a este horário.");
        }
        db.update("update descarga set saida_em=?, quantidade_chapas=? where id=?", when, in.quantidadeChapas(), discharge);
        for (Long equipmentId : equipment) db.update("insert into descarga_equipamento(descarga_id,equipamento_id) values (?,?)", discharge, equipmentId);
        marco(a, "SAIDA", "Fim da descarga", when, d, Map.of("quantidadeChapas", in.quantidadeChapas(), "equipamentoIds", equipment));
        if (base.one("select id from descarga where agendamento_id=? and saida_em is null", AgendamentoService.id(a)) == null)
            base.transition(a, "CONCLUIDO", "Todas as descargas foram concluídas");
        return base.detalhe(AgendamentoService.id(a));
    }

    private void exigirAutorizado(Map<String, Object> a) {
        if (!Set.of("AUTORIZADO", "EM_DESCARGA").contains(AgendamentoService.status(a)))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "Compras precisa autorizar o agendamento antes de iniciar a descarga.");
    }

    /** Fecha automaticamente compromissos sem chegada quando a tolerância de 30 minutos termina. */
    @Scheduled(fixedDelayString = "${app.agenda.verificacao-atrasos-ms:30000}")
    @Transactional
    public void encerrarAgendamentosAtrasados() {
        OffsetDateTime agora = AgendamentoService.agora();
        List<Long> candidatos = db.query("select id from agendamento where status in ('PENDENTE_COMPRAS','AUTORIZADO') and chegada_em is null and data_agendada<=? order by data_agendada,horario,id",
                (rs, row) -> rs.getLong(1), agora.toLocalDate());
        for (Long id : candidatos) {
            Map<String, Object> a = base.agendamento(id, true);
            if (!Set.of("PENDENTE_COMPRAS", "AUTORIZADO").contains(AgendamentoService.status(a)) || a.get("chegada_em") != null) continue;
            OffsetDateTime limite = LocalDateTime.of(AgendamentoService.data(a), AgendamentoService.horario(a))
                    .atZone(AgendamentoService.ZONA).toOffsetDateTime().plusMinutes(30);
            if (!limite.isAfter(agora)) perderPorAtraso(a, agora, "Agendamento encerrado automaticamente após 30 minutos sem chegada registrada.");
        }
    }

    private void perderPorAtraso(Map<String, Object> a, OffsetDateTime agora, String descricao) {
        base.transition(a, "NAO_RECEBIDO", "Agendamento perdido por atraso de 30 minutos ou mais");
        db.update("insert into nao_recebimento(agendamento_id,fornecedor_id,data,motivo,descricao,origem,criado_em) values (?,?,?,'ATRASO_AGENDAMENTO',?,'PLATAFORMA',?)",
                AgendamentoService.id(a), a.get("fornecedor_id"), AgendamentoService.data(a), descricao, agora);
    }

    private int jdbcUsed(long equipmentId, OffsetDateTime starts, OffsetDateTime ends) {
        // Serializa saídas simultâneas do mesmo equipamento e confere sobreposição real de marcos.
        db.queryForObject("select id from equipamento where id=? for update", Long.class, equipmentId);
        Integer used = db.queryForObject("""
                select count(*)::integer from descarga_equipamento de
                join descarga d on d.id=de.descarga_id
                where de.equipamento_id=? and d.entrada_em <= ?
                  and coalesce(d.saida_em, 'infinity'::timestamptz) >= ?
                """, Integer.class, equipmentId, ends, starts);
        return used == null ? 0 : used;
    }

    private void marco(Map<String, Object> a, String kind, String text, OffsetDateTime when, Map<String, Object> d, Map<String, Object> extra) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("marco", kind); detail.put("instante", when.toString());
        if (extra != null) detail.putAll(extra);
        if (d != null) { detail.put("descargaId", AgendamentoService.id(d)); detail.put("armazemId", d.get("armazem_id")); }
        base.event(AgendamentoService.id(a), AgendamentoService.status(a), AgendamentoService.status(a), "MARCO", text, detail);
    }

    @Transactional
    public Map<String, Object> reagendar(long appointment, AgendamentoService.ReagendamentoIn in) {
        if (in == null || in.horario() == null || !AgendamentoService.HORARIOS.contains(in.horario())) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Horário inválido.");
        String reason = AgendamentoService.texto(in.motivo(), 300);
        if (reason == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Informe o motivo do reagendamento.");
        Map<String, Object> a = base.agendamento(appointment, false);
        lockSlots(a, in.data(), in.horario());
        a = lockedSameSlot(appointment, a);
        exigirSemConferenciaPortaria(appointment);
        if (!Set.of("PENDENTE_COMPRAS", "AUTORIZADO").contains(AgendamentoService.status(a))) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Só é possível reagendar antes da descarga.");
        LocalDate oldDay = AgendamentoService.data(a); LocalTime oldTime = AgendamentoService.horario(a);
        if (oldDay.equals(in.data()) && oldTime.equals(in.horario())) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Escolha uma data ou um horário diferente do atual.");
        base.validarCalendario(in.data(), in.horario(), false);
        List<String> occupants = base.ocupantes(in.data(), in.horario(), appointment, null);
        boolean fit = AgendamentoService.cabe(occupants, (String) a.get("acondicionamento"));
        if (!fit && !Boolean.TRUE.equals(in.casoFortuito())) throw AgendamentoService.erro(HttpStatus.CONFLICT, AgendamentoService.motivoSemVaga(occupants, (String) a.get("acondicionamento")));
        db.update("insert into reagendamento(agendamento_id,data_anterior,horario_anterior,data_nova,horario_novo,motivo,limite_excedido,criado_em) values (?,?,?,?,?,?,?,?)", appointment, oldDay, oldTime, in.data(), in.horario(), reason, !fit, AgendamentoService.agora());
        db.update("update agendamento set data_agendada=?, horario=?, limite_ignorado=limite_ignorado or ? where id=?", in.data(), in.horario(), !fit, appointment);
        base.event(appointment, AgendamentoService.status(a), AgendamentoService.status(a), "REAGENDAMENTO", (Boolean.TRUE.equals(in.casoFortuito()) ? "Reagendado por caso fortuito: " : "Reagendado: ") + reason,
                Map.of("de", Map.of("data", oldDay.toString(), "horario", oldTime.toString()), "para", Map.of("data", in.data().toString(), "horario", in.horario().toString()), "casoFortuito", Boolean.TRUE.equals(in.casoFortuito()), "limiteExcedido", !fit));
        return base.detalhe(appointment);
    }

    private void lockSlots(Map<String, Object> a, LocalDate otherDay, LocalTime otherTime) {
        List<Map.Entry<LocalDate, LocalTime>> slots = new ArrayList<>();
        slots.add(Map.entry(AgendamentoService.data(a), AgendamentoService.horario(a)));
        if (otherDay != null && otherTime != null) slots.add(Map.entry(otherDay, otherTime));
        slots.stream().distinct().sorted(Comparator.comparing((Map.Entry<LocalDate, LocalTime> e) -> e.getKey()).thenComparing(Map.Entry::getValue))
                .forEach(e -> base.lockSlot(e.getKey(), e.getValue()));
    }

    @Transactional
    public Map<String, Object> solicitar(long appointment, AgendamentoService.CancelamentoIn in) {
        String reason = AgendamentoService.texto(in == null ? null : in.motivo(), 300);
        if (reason == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Informe o motivo do cancelamento.");
        Map<String, Object> a = base.agendamento(appointment, true);
        exigirSemConferenciaPortaria(appointment);
        if (!Set.of("PENDENTE_COMPRAS", "AUTORIZADO").contains(AgendamentoService.status(a))) throw AgendamentoService.erro(HttpStatus.CONFLICT, "O agendamento não pode mais ser cancelado.");
        if (base.one("select agendamento_id from cancelamento where agendamento_id=?", appointment) != null) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Já existe uma solicitação de cancelamento para este agendamento.");
        db.update("insert into cancelamento(agendamento_id,motivo,situacao,solicitado_em) values (?,?,'SOLICITADO',?)", appointment, reason, AgendamentoService.agora());
        base.event(appointment, AgendamentoService.status(a), AgendamentoService.status(a), "CANCELAMENTO", "Cancelamento solicitado: " + reason, null);
        return base.detalhe(appointment);
    }

    @Transactional
    public Map<String, Object> efetivar(long appointment) {
        Map<String, Object> a = base.agendamento(appointment, false);
        lockSlots(a, null, null);
        a = lockedSameSlot(appointment, a);
        exigirSemConferenciaPortaria(appointment);
        Map<String, Object> cancel = base.one("select * from cancelamento where agendamento_id=?", appointment);
        if (cancel == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Não há solicitação de cancelamento para efetivar.");
        if ("EFETIVADO".equals(cancel.get("situacao"))) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Este cancelamento já foi efetivado.");
        base.transition(a, "CANCELADO", "Cancelamento efetivado: " + cancel.get("motivo"));
        db.update("update cancelamento set situacao='EFETIVADO', efetivado_em=? where agendamento_id=?", AgendamentoService.agora(), appointment);
        long vacancy = base.insert("insert into vaga_liberada(data_vaga,horario,acondicionamento,origem_agendamento_id,status,criado_em) values (?,?,?,?,'ABERTA',?)", AgendamentoService.data(a), AgendamentoService.horario(a), a.get("acondicionamento"), appointment, AgendamentoService.agora());
        base.event(appointment, "CANCELADO", "CANCELADO", "VAGA", "Vaga liberada; o armazém decide quem a ocupa", Map.of("vagaId", vacancy));
        return base.detalhe(appointment);
    }

    private void exigirSemConferenciaPortaria(long appointment) {
        if (base.one("select agendamento_id from portaria_recebimento where agendamento_id=?", appointment) != null)
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "O caminhão já foi conferido na portaria. O setor de Insumos deve decidir o recebimento.");
    }

    public List<Map<String, Object>> vagas(String situation) {
        List<Map<String, Object>> rows = situation == null ? base.many("select * from vaga_liberada order by data_vaga,horario,id") : base.many("select * from vaga_liberada where status=? order by data_vaga,horario,id", situation);
        return rows.stream().map(this::vagaOut).toList();
    }

    Map<String, Object> vacancy(long vacancy, boolean lock) {
        Map<String, Object> v = base.one("select * from vaga_liberada where id=?" + (lock ? " for update" : ""), vacancy);
        if (v == null) throw AgendamentoService.erro(HttpStatus.NOT_FOUND, "Vaga liberada não encontrada: " + vacancy);
        return v;
    }

    Map<String, Object> vagaOut(Map<String, Object> v) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", AgendamentoService.id(v)); out.put("data", v.get("data_vaga")); out.put("horario", v.get("horario").toString());
        out.put("acondicionamento", v.get("acondicionamento")); out.put("origemAgendamentoId", v.get("origem_agendamento_id"));
        out.put("status", v.get("status")); out.put("atribuidaAAgendamentoId", v.get("atribuida_a_agendamento_id"));
        out.put("decididoEm", v.get("decidido_em")); out.put("criadoEm", v.get("criado_em"));
        return out;
    }

    public List<Map<String, Object>> candidatos(long vacancy) {
        Map<String, Object> v = vacancy(vacancy, false);
        if (!"ABERTA".equals(v.get("status"))) return List.of();
        LocalDate day = (LocalDate) v.get("data_vaga"); LocalTime time = (LocalTime) v.get("horario");
        List<String> occupants = base.ocupantes(day, time, null, AgendamentoService.id(v));
        return base.many("select id,data_agendada,horario,acondicionamento from agendamento where status in ('PENDENTE_COMPRAS','AUTORIZADO') and data_agendada>=? order by data_agendada,horario,id", AgendamentoService.agora().toLocalDate()).stream()
                .filter(a -> !(day.equals(a.get("data_agendada")) && time.equals(a.get("horario"))))
                .filter(a -> AgendamentoService.cabe(occupants, (String) a.get("acondicionamento")))
                .map(a -> base.detalhe(AgendamentoService.id(a))).toList();
    }

    @Transactional
    public Map<String, Object> atribuir(long vacancy, AgendamentoService.AtribuicaoIn in) {
        if (in == null || in.agendamentoId() == null) throw AgendamentoService.erro(HttpStatus.BAD_REQUEST, "Informe o agendamento.");
        Map<String, Object> v = vacancy(vacancy, false);
        Map<String, Object> a = base.agendamento(in.agendamentoId(), false);
        lockSlots(a, (LocalDate) v.get("data_vaga"), (LocalTime) v.get("horario"));
        a = lockedSameSlot(in.agendamentoId(), a);
        v = vacancy(vacancy, true);
        if (!"ABERTA".equals(v.get("status"))) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Esta vaga já teve o destino decidido.");
        if (!Set.of("PENDENTE_COMPRAS", "AUTORIZADO").contains(AgendamentoService.status(a))) throw AgendamentoService.erro(HttpStatus.CONFLICT, "O agendamento não pode ocupar a vaga.");
        LocalDate day = (LocalDate) v.get("data_vaga"); LocalTime time = (LocalTime) v.get("horario");
        if (day.equals(AgendamentoService.data(a)) && time.equals(AgendamentoService.horario(a))) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "O agendamento já está neste horário.");
        base.validarCalendario(day, time, false);
        List<String> occupants = base.ocupantes(day, time, null, vacancy);
        if (!AgendamentoService.cabe(occupants, (String) a.get("acondicionamento"))) throw AgendamentoService.erro(HttpStatus.CONFLICT, AgendamentoService.motivoSemVaga(occupants, (String) a.get("acondicionamento")));
        LocalDate oldDay = AgendamentoService.data(a); LocalTime oldTime = AgendamentoService.horario(a);
        db.update("insert into reagendamento(agendamento_id,data_anterior,horario_anterior,data_nova,horario_novo,motivo,limite_excedido,criado_em) values (?,?,?,?,?,'Ocupa a vaga liberada por cancelamento',false,?)", in.agendamentoId(), oldDay, oldTime, day, time, AgendamentoService.agora());
        db.update("update agendamento set data_agendada=?, horario=? where id=?", day, time, in.agendamentoId());
        db.update("update vaga_liberada set status='ATRIBUIDA', atribuida_a_agendamento_id=?, decidido_em=? where id=?", in.agendamentoId(), AgendamentoService.agora(), vacancy);
        base.event(in.agendamentoId(), AgendamentoService.status(a), AgendamentoService.status(a), "REAGENDAMENTO", "Movido para a vaga liberada por cancelamento", Map.of("vagaId", vacancy, "de", Map.of("data", oldDay.toString(), "horario", oldTime.toString()), "para", Map.of("data", day.toString(), "horario", time.toString())));
        return base.detalhe(in.agendamentoId());
    }

    @Transactional
    public Map<String, Object> liberar(long vacancy) {
        Map<String, Object> v = vacancy(vacancy, false);
        base.lockSlot((LocalDate) v.get("data_vaga"), (LocalTime) v.get("horario"));
        v = vacancy(vacancy, true);
        if (!"ABERTA".equals(v.get("status"))) throw AgendamentoService.erro(HttpStatus.CONFLICT, "Esta vaga já teve o destino decidido.");
        db.update("update vaga_liberada set status='LIBERADA_GERAL', decidido_em=? where id=?", AgendamentoService.agora(), vacancy);
        return vagaOut(vacancy(vacancy, false));
    }

    @Transactional
    public Map<String, Object> naoRecebimento(AgendamentoService.NaoRecebimentoIn in) {
        if (in == null || in.motivo() == null || !Set.of("DIVERGENCIA_NF_PEDIDO", "SEM_AGENDAMENTO_SEM_VAGA", "CASO_FORTUITO", "OUTRO").contains(in.motivo())) throw AgendamentoService.erro(HttpStatus.BAD_REQUEST, "Motivo inválido.");
        String description = AgendamentoService.texto(in.descricao(), 300), name = AgendamentoService.texto(in.fornecedorNome(), 200);
        if ("OUTRO".equals(in.motivo()) && description == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Descreva o motivo do não recebimento.");
        if ("SEM_AGENDAMENTO_SEM_VAGA".equals(in.motivo()) && in.agendamentoId() != null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Este motivo vale para o caminhão que chegou sem agendamento.");
        Long supplier = in.fornecedorId(); LocalDate day = in.data();
        if (in.agendamentoId() != null) {
            Map<String, Object> a = base.agendamento(in.agendamentoId(), true);
            base.transition(a, "NAO_RECEBIDO", "Não recebido: " + in.motivo() + (description == null ? "" : " (" + description + ")"));
            supplier = ((Number) a.get("fornecedor_id")).longValue();
            if (day == null) day = AgendamentoService.data(a);
        } else {
            if (supplier == null && name == null) throw AgendamentoService.erro(HttpStatus.UNPROCESSABLE_ENTITY, "Informe o fornecedor (cadastrado ou pelo nome).");
            if (supplier != null && base.one("select id from fornecedor where id=?", supplier) == null) throw AgendamentoService.erro(HttpStatus.NOT_FOUND, "Fornecedor não encontrado: " + supplier);
            if (day == null) day = AgendamentoService.agora().toLocalDate();
        }
        long id = base.insert("insert into nao_recebimento(agendamento_id,fornecedor_id,fornecedor_nome,data,motivo,descricao,origem,criado_em) values (?,?,?,?,?,?,'PLATAFORMA',?)", in.agendamentoId(), supplier, name, day, in.motivo(), description, AgendamentoService.agora());
        return naoRecebimentoOut(base.one("select * from nao_recebimento where id=?", id));
    }

    public List<Map<String, Object>> naoRecebimentos(LocalDate day, String reason) {
        StringBuilder sql = new StringBuilder("select * from nao_recebimento where 1=1");
        List<Object> args = new ArrayList<>();
        if (day != null) { sql.append(" and data=?"); args.add(day); }
        if (reason != null) { sql.append(" and motivo=?"); args.add(reason); }
        sql.append(" order by data desc,id desc");
        return base.many(sql.toString(), args.toArray()).stream().map(this::naoRecebimentoOut).toList();
    }

    private Map<String, Object> naoRecebimentoOut(Map<String, Object> n) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", AgendamentoService.id(n)); out.put("agendamentoId", n.get("agendamento_id")); out.put("fornecedorId", n.get("fornecedor_id"));
        out.put("fornecedorNome", n.get("fornecedor_nome")); out.put("data", n.get("data")); out.put("motivo", n.get("motivo"));
        out.put("descricao", n.get("descricao")); out.put("origem", n.get("origem")); out.put("criadoEm", n.get("criado_em"));
        return out;
    }

    private Map<String, Object> lockedSameSlot(long appointment, Map<String, Object> previouslyRead) {
        Map<String, Object> locked = base.agendamento(appointment, true);
        if (!AgendamentoService.data(locked).equals(AgendamentoService.data(previouslyRead))
                || !AgendamentoService.horario(locked).equals(AgendamentoService.horario(previouslyRead)))
            throw AgendamentoService.erro(HttpStatus.CONFLICT, "O agendamento foi alterado por outra pessoa; tente novamente.");
        return locked;
    }
}
