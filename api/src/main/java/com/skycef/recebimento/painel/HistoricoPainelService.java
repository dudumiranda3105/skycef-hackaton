package com.skycef.recebimento.painel;

import static com.skycef.recebimento.painel.PainelUtils.*;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class HistoricoPainelService {
    private static final double[] ESFORCO = {0, 100, 225, 17.5, 0};
    private static final String[] PREMISSA = {"",
        "Insumos: paletizado, 2 chapas × 50 min (10 paletes × 5 min de ciclo completo)",
        "Adubo: carga batida, 5 chapas × 45 min (40 a 50 min para 200 sacas ou 28 t)",
        "Pátio de Máquinas: 1 chapa × 17,5 min (15 a 20 min por implemento)",
        "Loja: fracionado leve, menos de 500 kg não usa chapa (dossiê, seção 7)"};
    private final JdbcTemplate jdbc;
    private final PlataformaPainelService plataforma;

    public HistoricoPainelService(JdbcTemplate jdbc, PlataformaPainelService plataforma) {
        this.jdbc = jdbc; this.plataforma = plataforma;
    }

    public Map<String,Object> indicadores(LocalDate de, LocalDate ate) {
        String where = dates("h.data_recebimento", de, ate);
        Object[] args = dateArgs(de, ate);
        Map<Integer,String> nomes = nomes();
        List<Map<String,Object>> forn = jdbc.queryForList("select coalesce(h.fornecedor_nome,h.fornecedor_codigo,'sem identificação') as fornecedor, "
            + "count(distinct (h.data_recebimento,h.nr_recebimento)) as recebimentos "
            + "from hist_recebimento_item h where h.data_recebimento is not null"+where
            + " group by 1 order by 2 desc,1 limit 10", args);
        List<Map<String,Object>> semana = jdbc.queryForList("select extract(isodow from h.data_recebimento)::int as dia_semana, "
            + "count(distinct (h.data_recebimento,h.nr_recebimento)) as recebimentos, "
            + "count(distinct h.data_recebimento) as dias from hist_recebimento_item h "
            + "where h.data_recebimento is not null"+where+" group by 1 order by 1", args);
        List<Map<String,Object>> anos = jdbc.queryForList("select extract(year from h.data_recebimento)::int as ano, d.armazem_id, "
            + "count(distinct (h.data_recebimento,h.nr_recebimento)) as recebimentos "
            + "from hist_recebimento_item h join deposito_armazem d on d.deposito=h.deposito "
            + "where d.armazem_id is not null and h.data_recebimento is not null"+where+" group by 1,2 order by 1,2", args);
        return map("origem","HISTORICO", "unidade","recebimentos (nº do recebimento na data); um recebimento pode ter vários itens",
            "fornecedoresMaiorVolume",forn.stream().map(r->map("fornecedor",r.get("fornecedor"),"recebimentos",r.get("recebimentos"))).toList(),
            "porDiaDaSemana",semana.stream().map(r->{long n=number(r.get("recebimentos")),days=number(r.get("dias"));
                return map("diaSemana",r.get("dia_semana"),"recebimentos",n,"dias",days,"mediaPorDia",days==0?null:round((double)n/days,1));}).toList(),
            "porAnoEArmazem",anos.stream().map(r->{int a=((Number)r.get("armazem_id")).intValue();
                return map("ano",r.get("ano"),"armazemId",a,"armazem",nomes.get(a),"recebimentos",r.get("recebimentos"));}).toList(),
            "observacao","A cooperativa nunca registrou horário de chegada ou de descarga: o histórico não permite tempos médios nem horários de pico. O dia da semana inclui os 5 sábados com recebimento.");
    }

    public Map<String,Object> dimensionamento(LocalDate de, LocalDate ate) {
        BigDecimal piso = plataforma.piso();
        Map<Integer,String> nomes = nomes();
        List<Map<String,Object>> events = jdbc.queryForList("select h.data_recebimento as data,d.armazem_id, "
            + "count(distinct h.nr_recebimento) as eventos from hist_recebimento_item h "
            + "join deposito_armazem d on d.deposito=h.deposito where d.armazem_id is not null "
            + "and h.data_recebimento is not null group by 1,2");
        Map<LocalDate,Map<Integer,Integer>> byDay = new HashMap<>();
        Map<String,Integer> byMonthArm = new TreeMap<>();
        for (Map<String,Object> r : events) {
            LocalDate date=((Date)r.get("data")).toLocalDate(); int arm=((Number)r.get("armazem_id")).intValue();
            int count=((Number)r.get("eventos")).intValue();
            byDay.computeIfAbsent(date,k->new HashMap<>()).put(arm,count);
            byMonthArm.merge(date.toString().substring(0,7)+"|"+arm,count,Integer::sum);
        }
        List<Map<String,Object>> folhas=jdbc.queryForList("select data,qtd_presentes-coalesce(qtd_cafe,0) as liquidos "
            + "from hist_chapa_dia where extract(isodow from data) between 1 and 5 and qtd_presentes is not null order by data");
        List<Day> all=new ArrayList<>(); Map<String,Integer> daysPerMonth=new HashMap<>();
        for(Map<String,Object> r:folhas){LocalDate date=((Date)r.get("data")).toLocalDate();
            all.add(new Day(date,((Number)r.get("liquidos")).intValue(),byDay.getOrDefault(date,Map.of())));
            daysPerMonth.merge(month(date),1,Integer::sum);}
        List<Day> base=all.stream().filter(d->daysPerMonth.get(month(d.date))>=10).toList();
        int totalLiquidos=base.stream().mapToInt(d->d.liquidos).sum();
        double ref=totalLiquidos==0?0:base.stream().mapToDouble(Day::effort).sum()/totalLiquidos;
        List<Month> allMonths=months(base,ref);
        List<Month> selected=allMonths.stream().filter(m->inPeriod(m.month,de,ate)).toList();
        double sobra=selected.stream().mapToDouble(m->Math.max(m.balance,0)).sum();
        double falta=selected.stream().mapToDouble(m->Math.max(-m.balance,0)).sum();
        List<Map<String,Object>> meses=selected.stream().map(m->map("mes",m.month,"estacao",season(m.month),
            "diasUteis",m.days,"recebimentosPorDia",round((double)m.events/m.days,2),
            "chapasPorDia",round((double)m.liquidos/m.days,2),"chapasNecessariasPorDia",round(m.necessary/m.days,2),
            "saldoDiarias",round(m.balance,2),"saldoReais",reais(m.balance,piso),"situacao",m.status())).toList();
        List<Map<String,Object>> seasons=new ArrayList<>();
        for(String season:List.of("SAFRA","ENTRESSAFRA")){
            List<Month> group=selected.stream().filter(m->season(m.month).equals(season)).toList();
            int days=group.stream().mapToInt(m->m.days).sum(); if(days==0)continue;
            double balance=group.stream().mapToDouble(m->m.balance).sum();
            seasons.add(map("estacao",season,"rotulo",season.equals("SAFRA")?"Safra (out a mar)":"Entressafra (abr a set)",
                "diasUteis",days,"recebimentosPorDia",round(group.stream().mapToInt(m->m.events).sum()/(double)days,2),
                "chapasPorDia",round(group.stream().mapToInt(m->m.liquidos).sum()/(double)days,2),
                "saldoDiarias",round(balance,2),"saldoReais",reais(balance,piso)));
        }
        int[] armEvents=new int[5];double[] armEffort=new double[5];
        String first=selected.isEmpty()?"":selected.get(0).month,last=selected.isEmpty()?"":selected.get(selected.size()-1).month;
        for(Day day:base)if(!selected.isEmpty()&&month(day.date).compareTo(first)>=0&&month(day.date).compareTo(last)<=0)
            day.events.forEach((arm,n)->{if(arm>=1&&arm<=4){armEvents[arm]+=n;armEffort[arm]+=n*ESFORCO[arm];}});
        double totalEffort=Arrays.stream(armEffort).sum();if(totalEffort==0)totalEffort=1;
        List<Map<String,Object>> armazens=new ArrayList<>();
        for(int arm=1;arm<=4;arm++){
            double share=armEffort[arm]/totalEffort;
            armazens.add(map("armazemId",arm,"armazem",nomes.getOrDefault(arm,String.valueOf(arm)),
                "recebimentos",armEvents[arm],"esforcoPessoaMinutos",round(armEffort[arm],1),
                "participacaoNaNecessidade",round(share,4),"parcelaDaSobraReais",reais(sobra*share,piso),
                "parcelaDaFaltaReais",reais(falta*share,piso),"premissa",PREMISSA[arm]));
        }
        List<Double> staff=base.stream().map(d->(double)d.liquidos).toList();
        Double weighted=correlation(staff,base.stream().map(Day::effort).toList());
        Double simple=correlation(staff,base.stream().map(d->(double)d.totalEvents()).toList());
        List<Double> ratios=allMonths.stream().filter(m->m.liquidos!=0).map(m->m.effort/m.liquidos).toList();
        List<Map<String,Object>> scenarios=new ArrayList<>();
        for(int i=0;i<2;i++){
            double reference=i==0?ref:percentile(ratios,.75);
            List<Month> scenario=months(base,reference).stream().filter(m->inPeriod(m.month,de,ate)).toList();
            double s=scenario.stream().mapToDouble(m->Math.max(m.balance,0)).sum();
            double f=scenario.stream().mapToDouble(m->Math.max(-m.balance,0)).sum();
            scenarios.add(map("nome",i==0?"Equilíbrio médio do histórico":"Capacidade demonstrada (3º quartil mensal)",
                "pessoaMinutosPorChapaDia",round(reference,2),"sobraReais",reais(s,piso),
                "faltaReais",reais(f,piso),"saldoReais",reais(s-f,piso)));
        }
        long outside=jdbc.queryForObject("select count(*) filter (where d.armazem_id is null) "
            + "from hist_recebimento_item h left join deposito_armazem d on d.deposito=h.deposito",Long.class);
        List<Map<String,Object>> demand=new ArrayList<>();
        byMonthArm.forEach((key,n)->{String[] parts=key.split("\\|");if(inPeriod(parts[0],de,ate)){
            int arm=Integer.parseInt(parts[1]);demand.add(map("mes",parts[0],"armazemId",arm,
                "armazem",nomes.getOrDefault(arm,String.valueOf(arm)),"recebimentos",n));}});
        return map("origem","HISTORICO","periodo",map("de",selected.isEmpty()?null:first,"ate",selected.isEmpty()?null:last),
            "piso",money(piso),"equilibrio",map("pessoaMinutosPorChapaDia",round(ref,2),
                "diasUteisAnalisados",base.size(),"diasUteisExibidos",selected.stream().mapToInt(m->m.days).sum()),
            "meses",meses,"estacoes",seasons,
            "totais",map("sobraDiarias",round(sobra,2),"faltaDiarias",round(falta,2),
                "sobraReais",reais(sobra,piso),"faltaReais",reais(falta,piso),"saldoReais",reais(sobra-falta,piso)),
            "armazens",armazens,"cenarios",scenarios,
            "robustez",map("correlacaoEquipeEDemanda",weighted==null?null:round(weighted,3),
                "correlacaoEquipeEDemandaSemPeso",simple==null?null:round(simple,3)),
            "demandaPorMesEArmazem",demand,
            "limitacoes",List.of(
                "O histórico só enxerga o recebimento; o carregamento de cooperados divide a mesma equipe e nunca foi registrado. O equilíbrio é relativo ao próprio histórico: mostra se a equipe acompanhou a demanda, não o tamanho absoluto ideal. O absoluto vem do boletim da plataforma.",
                "A folha não distingue o armazém de cada chapa: a quebra por armazém reparte o saldo pela participação de cada um na necessidade (esforço da norma do dossiê).",
                "O esforço por recebimento usa as normas do dossiê (seções 7 e 9) com uma premissa de acondicionamento por armazém, pois o histórico não registra o acondicionamento.",
                outside+" linhas de depósitos fora do dossiê ficam fora da quebra por armazém.",
                "Não há folha de agosto e dezembro de 2025 nem de janeiro/2025 completo: esses meses ficam fora."));
    }

    private Map<Integer,String> nomes(){
        Map<Integer,String> result=new HashMap<>();
        jdbc.query("select id,nome from armazem order by id",rs->{result.put(rs.getInt(1),rs.getString(2));});
        return result;
    }
    private static String dates(String column,LocalDate de,LocalDate ate){
        return (de==null?"":" and "+column+">=?")+(ate==null?"":" and "+column+"<=?");
    }
    private static Object[] dateArgs(LocalDate de,LocalDate ate){
        List<Object> args=new ArrayList<>();if(de!=null)args.add(de);if(ate!=null)args.add(ate);return args.toArray();
    }
    private static String month(LocalDate day){return day.toString().substring(0,7);}
    private static boolean inPeriod(String m,LocalDate de,LocalDate ate){
        return (de==null||m.compareTo(month(de))>=0)&&(ate==null||m.compareTo(month(ate))<=0);
    }
    private static String season(String m){int n=Integer.parseInt(m.substring(5));return n>=10||n<=3?"SAFRA":"ENTRESSAFRA";}
    private static String reais(double value,BigDecimal piso){return money(BigDecimal.valueOf(round(value,6)).multiply(piso));}
    private record Day(LocalDate date,int liquidos,Map<Integer,Integer> events){
        double effort(){return events.entrySet().stream().mapToDouble(e->e.getKey()>=1&&e.getKey()<=4?e.getValue()*ESFORCO[e.getKey()]:0).sum();}
        int totalEvents(){return events.values().stream().mapToInt(x->x).sum();}
    }
    private record Month(String month,int days,int liquidos,int events,double effort,double necessary,double balance){
        String status(){if(liquidos==0)return "SEM_DADOS";double relative=balance/liquidos;
            return relative>.10?"SOBRA":relative<-.10?"FALTA":"EQUILIBRADO";}
    }
    private static List<Month> months(List<Day> days,double reference){
        Map<String,List<Day>> grouped=days.stream().collect(Collectors.groupingBy(d->month(d.date),TreeMap::new,Collectors.toList()));
        List<Month> result=new ArrayList<>();
        grouped.forEach((m,ds)->{int staff=ds.stream().mapToInt(d->d.liquidos).sum();
            double effort=ds.stream().mapToDouble(Day::effort).sum();double needed=reference==0?0:effort/reference;
            result.add(new Month(m,ds.size(),staff,ds.stream().mapToInt(Day::totalEvents).sum(),effort,needed,staff-needed));});
        return result;
    }
    private static double percentile(List<Double> values,double p){
        if(values.isEmpty())return 0;List<Double> sorted=values.stream().sorted().toList();
        double pos=(sorted.size()-1)*p;int base=(int)pos;
        return sorted.get(base)+(sorted.get(Math.min(base+1,sorted.size()-1))-sorted.get(base))*(pos-base);
    }
    private static Double correlation(List<Double> xs,List<Double> ys){
        if(xs.size()<3||xs.size()!=ys.size())return null;
        double mx=xs.stream().mapToDouble(x->x).average().orElse(0),my=ys.stream().mapToDouble(x->x).average().orElse(0);
        double xx=0,yy=0,xy=0;for(int i=0;i<xs.size();i++){
            double x=xs.get(i)-mx,y=ys.get(i)-my;xx+=x*x;yy+=y*y;xy+=x*y;}
        return xx==0||yy==0?null:xy/Math.sqrt(xx*yy);
    }
}
