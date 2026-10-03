package com.skycef.recebimento.painel;

import static com.skycef.recebimento.painel.PainelUtils.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class PlataformaPainelService {
    private final JdbcTemplate jdbc;

    public PlataformaPainelService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    BigDecimal piso() {
        List<BigDecimal> values = jdbc.query("select valor from parametro where chave = 'DIARIA_COMPLETA'",
            (rs, n) -> rs.getBigDecimal(1));
        return values.isEmpty() ? new BigDecimal("90.1731") : values.get(0);
    }

    public Map<String, Object> operacao(PainelFiltro f) {
        List<Object> args = f.args();
        String sql = "select d.id, d.armazem_id, ar.nome as armazem, a.origem, a.fornecedor_id, "
            + "d.chegada_em, d.entrada_em, d.saida_em, d.quantidade_chapas, "
            + "(d.saida_em at time zone 'America/Sao_Paulo')::date as dia, "
            + "extract(hour from d.entrada_em at time zone 'America/Sao_Paulo')::int as hora_entrada, "
            + "extract(isodow from d.saida_em at time zone 'America/Sao_Paulo')::int as dia_semana "
            + "from descarga d join agendamento a on a.id=d.agendamento_id join armazem ar on ar.id=d.armazem_id "
            + "where d.saida_em is not null" + f.sql("(d.saida_em at time zone 'America/Sao_Paulo')::date", "d.armazem_id", "a.origem", args);
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args.toArray());
        Map<String, Long> origens = new TreeMap<>();
        Map<String, Long> cargasDia = new TreeMap<>();
        Map<Integer, Arm> arms = new TreeMap<>();
        Map<Long, Long> fornecedores = new HashMap<>();
        Map<Integer, Long> horas = new TreeMap<>();
        Map<Integer, Long> semanas = new TreeMap<>();
        List<Double> espera = new ArrayList<>(), duracao = new ArrayList<>(), chapas = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            int armId = ((Number) row.get("armazem_id")).intValue();
            Arm arm = arms.computeIfAbsent(armId, id -> new Arm(String.valueOf(row.get("armazem"))));
            arm.cargas++;
            LocalDate dia = ((java.sql.Date) row.get("dia")).toLocalDate();
            arm.dias.put(dia, true);
            String key = dia + "|" + armId;
            cargasDia.merge(key, 1L, Long::sum);
            Double e = minutos(row.get("chegada_em"), row.get("entrada_em"));
            Double d = minutos(row.get("entrada_em"), row.get("saida_em"));
            if (e != null) { espera.add(e); arm.espera.add(e); }
            if (d != null) { duracao.add(d); arm.duracao.add(d); }
            if (row.get("quantidade_chapas") != null) {
                double c = ((Number) row.get("quantidade_chapas")).doubleValue();
                chapas.add(c); arm.chapas.add(c);
            }
            fornecedores.merge(number(row.get("fornecedor_id")), 1L, Long::sum);
            if (row.get("hora_entrada") != null) horas.merge(((Number) row.get("hora_entrada")).intValue(), 1L, Long::sum);
            semanas.merge(((Number) row.get("dia_semana")).intValue(), 1L, Long::sum);
            origens.merge((String) row.get("origem"), 1L, Long::sum);
        }
        Map<Long, String> nomesFornecedor = new HashMap<>();
        if (!fornecedores.isEmpty()) {
            jdbc.query("select id, razao_social from fornecedor", rs -> {
                nomesFornecedor.put(rs.getLong(1), rs.getString(2));
            });
        }
        List<Object> custoArgs = f.args();
        String custoSql = "select count(*) as boletins, count(*) filter (where situacao='INCONSISTENTE') as inconsistentes, "
            + "coalesce(sum(producao_total),0) as producao, "
            + "coalesce(sum(total_a_pagar) filter (where situacao='CONSISTENTE'),0) as total_a_pagar, "
            + "coalesce(sum(complemento) filter (where situacao='CONSISTENTE'),0) as complemento "
            + "from boletim where true" + f.sql("data", "armazem_id", "origem", custoArgs);
        Map<String, Object> custo = jdbc.queryForMap(custoSql, custoArgs.toArray());
        List<Object> naoArgs = f.args();
        String naoSql = "select motivo, count(*) as n from nao_recebimento where true"
            + f.sql("data", null, "origem", naoArgs) + " group by motivo order by n desc";
        List<Map<String, Object>> nao = jdbc.queryForList(naoSql, naoArgs.toArray());
        List<Map<String, Object>> porDia = new ArrayList<>(), porArm = new ArrayList<>(), porForn = new ArrayList<>();
        for (var item : cargasDia.entrySet()) {
            String[] p = item.getKey().split("\\|"); int id = Integer.parseInt(p[1]);
            porDia.add(map("data", p[0], "armazemId", id, "armazem", arms.get(id).nome, "cargas", item.getValue()));
        }
        for (var item : arms.entrySet()) {
            Arm a = item.getValue();
            porArm.add(map("armazemId", item.getKey(), "armazem", a.nome, "cargas", a.cargas,
                "diasComMovimento", a.dias.size(), "horasOcupadas", round(a.duracao.stream().mapToDouble(x -> x).sum()/60, 2),
                "esperaMediaMin", media(a.espera), "descargaMediaMin", media(a.duracao), "chapasPorRecebimento", media(a.chapas)));
        }
        fornecedores.entrySet().stream().sorted(Map.Entry.<Long, Long>comparingByValue().reversed())
            .limit(10).forEach(e -> porForn.add(map("fornecedorId", e.getKey(),
                "fornecedor", nomesFornecedor.getOrDefault(e.getKey(), String.valueOf(e.getKey())), "recebimentos", e.getValue())));
        return map("filtro", f.json(), "origens", origens,
            "cargasRecebidas", map("total", rows.size(), "unidade", "descargas concluídas (um caminhão com 2 destinos conta 2)", "porDiaEArmazem", porDia),
            "tempoMedioEsperaMin", map("media", media(espera), "amostra", espera.size(), "definicao", "entrada − chegada"),
            "tempoMedioDescargaMin", map("media", media(duracao), "amostra", duracao.size(), "definicao", "saída − entrada"),
            "chapasPorRecebimento", map("media", media(chapas), "amostra", chapas.size(), "observacao", "intensidade de cada descarga; NÃO é o efetivo do dia (esse vem do boletim)"),
            "porArmazem", porArm,
            "utilizacao", map("observacao", "A Cocapec não definiu a fórmula de utilização: mostramos descargas e horas ocupadas por armazém, sem um percentual 'oficial'."),
            "fornecedoresMaiorVolume", porForn, "fornecedoresUnidade", "recebimentos (descargas concluídas); não se soma kg com unidades",
            "movimento", map("porHoraDeEntrada", horas.entrySet().stream().map(e -> map("hora",e.getKey(),"cargas",e.getValue())).toList(),
                              "porDiaDaSemana", semanas.entrySet().stream().map(e -> map("diaSemana",e.getKey(),"cargas",e.getValue())).toList()),
            "naoRecebimentos", nao.stream().map(r -> map("motivo",r.get("motivo"),"quantidade",r.get("n"))).toList(),
            "custoDaOperacao", map("totalAPagar", money(decimal(custo.get("total_a_pagar"))),
                "producao", money(decimal(custo.get("producao"))), "complemento", money(decimal(custo.get("complemento"))),
                "boletins", custo.get("boletins"), "boletinsInconsistentes", custo.get("inconsistentes"),
                "definicao", "soma do total a pagar dos boletins (produção, ou piso + complemento). Sem encargos e sem equipamentos. Boletins INCONSISTENTES ficam de fora."));
    }

    private static class Arm {
        final String nome; int cargas;
        final Map<LocalDate, Boolean> dias = new HashMap<>();
        final List<Double> espera = new ArrayList<>(), duracao = new ArrayList<>(), chapas = new ArrayList<>();
        Arm(String nome) { this.nome = nome; }
    }

    private static Double minutos(Object start, Object end) {
        if (start == null || end == null) return null;
        return Duration.between(((Timestamp)start).toInstant(), ((Timestamp)end).toInstant()).toMillis() / 60000d;
    }

    private static Double media(List<Double> values) {
        return values.isEmpty() ? null : round(values.stream().mapToDouble(x -> x).average().orElse(0), 1);
    }

    public Map<String, Object> dimensionamento(PainelFiltro f, String agrupar) {
        BigDecimal piso = piso();
        List<Object> args = f.args();
        String sql = "select b.data,b.armazem_id,a.nome as armazem,b.producao_total,b.diarias_equivalentes,"
            + "b.total_a_pagar,b.complemento,b.situacao,b.origem from boletim b join armazem a on a.id=b.armazem_id where true"
            + f.sql("b.data", "b.armazem_id", "b.origem", args) + " order by b.data,b.armazem_id";
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args.toArray());
        Acc total = new Acc(); Map<Integer, Acc> arms = new TreeMap<>(); Map<String, Acc> periods = new TreeMap<>();
        Map<Integer, String> nomes = new HashMap<>(); Map<String, Long> origens = new TreeMap<>();
        for (Map<String, Object> row : rows) {
            LocalDate day = ((java.sql.Date)row.get("data")).toLocalDate();
            int arm = ((Number)row.get("armazem_id")).intValue();
            nomes.put(arm, (String)row.get("armazem"));
            origens.merge((String)row.get("origem"), 1L, Long::sum);
            total.add(row,piso); arms.computeIfAbsent(arm,k->new Acc()).add(row,piso);
            periods.computeIfAbsent(period(day,agrupar)+"|"+arm,k->new Acc()).add(row,piso);
        }
        List<Object> eqArgs = f.args();
        String eqWhere = f.sql("b.data", "b.armazem_id", "b.origem", eqArgs);
        List<Map<String,Object>> efetivo = jdbc.queryForList("select b.data,count(distinct e.matricula) as pessoas "
            + "from boletim_equipe e join boletim b on b.id=e.boletim_id where true"+eqWhere+" group by b.data order by b.data", eqArgs.toArray());
        long repetidos = jdbc.queryForObject("select count(*) from (select b.data,e.matricula from boletim_equipe e "
            + "join boletim b on b.id=e.boletim_id where true"+eqWhere+" group by b.data,e.matricula having count(*)>1) x",
            Long.class, eqArgs.toArray());
        List<Map<String,Object>> porArm = new ArrayList<>(), porPer = new ArrayList<>();
        arms.forEach((id,acc)->{Map<String,Object> m=map("armazemId",id,"armazem",nomes.get(id));m.putAll(acc.json(piso));porArm.add(m);});
        periods.forEach((key,acc)->{String[] p=key.split("\\|");int id=Integer.parseInt(p[1]);
            Map<String,Object> m=map("periodo",p[0],"armazemId",id,"armazem",nomes.get(id));m.putAll(acc.json(piso));porPer.add(m);});
        return map("agrupadoPor",agrupar,"piso",money(piso),"filtro",f.json(),"origens",origens,
            "total",total.json(piso),"porArmazem",porArm,"porPeriodo",porPer,
            "efetivoDistintoPorDia",efetivo.stream().map(r->map("data",r.get("data").toString(),"pessoas",r.get("pessoas"))).toList(),
            "alertas",map("matriculasEmMaisDeUmBoletimNoMesmoDia",repetidos,"observacao",
                "Se uma matrícula aparece em dois boletins no mesmo dia, cada boletim paga as suas diárias; o efetivo distinto do dia conta a pessoa uma única vez."),
            "comoLer","Sobra em R$ = complemento pago (diária garantida sem produção que a justifique). Falta em R$ = produção acima do piso (equipe curta para a demanda do dia).");
    }

    private static String period(LocalDate d,String kind) {
        if (kind.equals("dia")) return d.toString();
        if (kind.equals("semana")) return d.get(WeekFields.ISO.weekBasedYear())+"-S"+String.format("%02d",d.get(WeekFields.ISO.weekOfWeekBasedYear()));
        return d.toString().substring(0,7);
    }

    private static class Acc {
        int boletins, inconsistentes, comComplemento, acimaPiso;
        BigDecimal diarias=BigDecimal.ZERO,producao=BigDecimal.ZERO,total=BigDecimal.ZERO,complemento=BigDecimal.ZERO,falta=BigDecimal.ZERO;
        void add(Map<String,Object> b,BigDecimal piso) {
            boletins++;
            if (!"CONSISTENTE".equals(b.get("situacao"))) { inconsistentes++; return; }
            BigDecimal d=decimal(b.get("diarias_equivalentes")), p=decimal(b.get("producao_total"));
            diarias=diarias.add(d);producao=producao.add(p);total=total.add(decimal(b.get("total_a_pagar")));
            BigDecimal c=decimal(b.get("complemento"));complemento=complemento.add(c);
            if(c.signum()>0) comComplemento++;
            BigDecimal excess=p.subtract(piso.multiply(d));if(excess.signum()>0){acimaPiso++;falta=falta.add(excess);}
        }
        Map<String,Object> json(BigDecimal piso) {
            BigDecimal aproveitamento=diarias.signum()==0?null:producao.divide(piso.multiply(diarias),8,RoundingMode.HALF_EVEN);
            String situacao=aproveitamento==null?"SEM_DADOS":aproveitamento.compareTo(new BigDecimal("0.90"))<0?"SOBRA":
                aproveitamento.compareTo(new BigDecimal("1.10"))>0?"FALTA":"EQUILIBRADO";
            return map("boletins",boletins,"boletinsInconsistentes",inconsistentes,
                "diariasEquivalentes",diarias.toPlainString(),"producao",money(producao),"totalAPagar",money(total),
                "sobraReais",money(complemento),"sobraDiarias",decimalText(complemento.divide(piso,8,RoundingMode.HALF_EVEN),2),
                "faltaReais",money(falta),"faltaDiarias",decimalText(falta.divide(piso,8,RoundingMode.HALF_EVEN),2),
                "diasComComplemento",comComplemento,"diasAcimaDoPiso",acimaPiso,
                "aproveitamento",aproveitamento==null?null:decimalText(aproveitamento,4),"situacao",situacao);
        }
    }
}
