package com.skycef.recebimento.dados;

import com.skycef.recebimento.boletim.BoletimCalculator;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Dados artificiais para a apresentação. Executar explicitamente com --demo-seed.
 * O seed é repetível: preserva dados existentes e nunca trunca tabelas.
 */
@Component
public class DemoSeeder implements ApplicationRunner {
    private static final Logger LOG = LoggerFactory.getLogger(DemoSeeder.class);
    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private static final LocalDate START = LocalDate.of(2026, 9, 14);
    private static final String[] SUPPLIERS = {
        "Agro Insumos Alfa Ltda", "Fertilizantes Beta S.A.", "Defensivos Gama do Brasil",
        "Máquinas Delta Implementos", "Nutrição Animal Épsilon", "Sementes Zeta Ltda",
        "Distribuidora Eta Agro", "Peças Theta Agrícolas"
    };
    private static final String[] CNPJ = {
        "11222333000181", "22333444000172", "33444555000163", "44555666000154",
        "55666777000145", "66777888000136", "77888999000127", "88999000000118"
    };
    private static final int[][] STAFF = {
        {6,11,2,3}, {5,8,1,2}, {4,6,1,2}
    };
    private static final int[][] UNITS = {
        {700,1500,90,650}, {1100,2150,120,600}, {1700,2500,160,900}
    };
    private static final String[] MAIN_ITEM = {"AGROQUIMICO","FERTILIZANTES","MAQUINAS","PECAS"};
    private static final int[] FIRST_CHAPA = {14,1,30,24};
    private final JdbcTemplate db;
    private final TransactionTemplate transactions;

    public DemoSeeder(JdbcTemplate db, TransactionTemplate transactions) {
        this.db = db; this.transactions = transactions;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!args.containsOption("demo-seed")) return;
        Map<String,Integer> counts = transactions.execute(status -> seed());
        LOG.info("Seed TESTE concluído: {}", counts);
    }

    /** Gera três semanas úteis de registros TESTE, sem tocar nos registros de produção. */
    public Map<String,Integer> seed() {
        long[] suppliers = suppliers();
        BigDecimal floor = db.query("select valor from parametro where chave='DIARIA_COMPLETA'",
            (rs,n)->rs.getBigDecimal(1)).stream().findFirst().orElse(new BigDecimal("90.1731"));
        int appointments=0, discharges=0, bulletins=0, refusals=0;
        LocalDate day=START;
        for(int workDay=0;workDay<15;day=day.plusDays(1)){
            if(day.getDayOfWeek()==DayOfWeek.SATURDAY||day.getDayOfWeek()==DayOfWeek.SUNDAY)continue;
            int week=workDay/5, withinWeek=workDay%5;
            for(int arm=1;arm<=4;arm++){
                int index=arm-1;
                // Cada destino ocupa um horário. A chave da NF identifica o registro do seed.
                long supplier=suppliers[(workDay+index)%suppliers.length];
                String nfKey="3526"+String.format("%040d",1000+workDay*4+arm);
                if (db.queryForObject("select count(*) from nota_fiscal where nf_chave=?",Integer.class,nfKey)==0) {
                    LocalTime slot=List.of(LocalTime.of(8,0),LocalTime.of(10,0),LocalTime.of(13,0),LocalTime.of(15,0)).get(index);
                    String acond=arm==2?"BATIDO":"PALETIZADO";
                    long ag=db.queryForObject("insert into agendamento (fornecedor_id,data_agendada,horario,acondicionamento,status,origem,chegada_em) "
                        +"values (?,?,?,?, 'CONCLUIDO','TESTE',?) returning id",Long.class,
                        supplier,Date.valueOf(day),slot,acond,at(day,slot.getHour(),0));
                    db.update("insert into nota_fiscal(agendamento_id,nf_numero,nf_chave) values (?,?,?)",ag,
                        String.valueOf(7000+workDay*4+arm),nfKey);
                    db.update("insert into validacao_compras(agendamento_id,decisao,pedido_referencia,decidido_em) "
                        +"values (?,'AUTORIZADO',?,?)",ag,"DEMO"+(1000+workDay*4+arm),at(day,7,0));
                    OffsetDateTime arrival=at(day,slot.getHour(),2);
                    OffsetDateTime entrance=arrival.plusMinutes(8+index*3);
                    OffsetDateTime exit=entrance.plusMinutes(arm==2?45:arm==3?18:25);
                    db.update("insert into descarga(agendamento_id,armazem_id,chegada_em,entrada_em,saida_em,quantidade_chapas) "
                        +"values (?,?,?,?,?,?)",ag,arm,arrival,entrance,exit,arm==2?5:arm==3?1:2);
                    appointments++;discharges++;
                }
                if(db.queryForObject("select count(*) from boletim where armazem_id=? and data=?",Integer.class,arm,Date.valueOf(day))==0){
                    int people=STAFF[week][index],quantity=UNITS[week][index]+(withinWeek-2)*20;
                    BigDecimal unitPrice=db.queryForObject("select preco_unitario from tipo_item where codigo=?",BigDecimal.class,MAIN_ITEM[index]);
                    int discharge=quantity/2,removal=quantity-discharge;
                    BoletimCalculator.Resultado result=BoletimCalculator.calcular(
                        List.of(new BoletimCalculator.Linha(unitPrice,discharge,removal,0)),people,0,floor);
                    long boletim=db.queryForObject("insert into boletim(armazem_id,data,producao_total,diarias_equivalentes,"
                        +"valor_por_diaria,total_a_pagar,complemento,situacao,origem) "
                        +"values (?,?,?,?,?,?,?,'CONSISTENTE','TESTE') returning id",Long.class,
                        arm,Date.valueOf(day),result.producaoTotal(),result.diariasEquivalentes(),
                        result.valorPorDiaria(),result.totalAPagar(),result.complemento());
                    db.update("insert into boletim_producao(boletim_id,tipo_item,qtd_descarga,qtd_remocao,qtd_transferencia,preco_unitario) "
                        +"values (?,?,?,?,0,?)",boletim,MAIN_ITEM[index],discharge,removal,unitPrice);
                    for(int i=0;i<people;i++){
                        String matricula=String.format("CHAPA_%02d",FIRST_CHAPA[index]+i);
                        db.update("insert into chapa(matricula,nome) values (?,?) on conflict(matricula) do nothing",matricula,matricula);
                        db.update("insert into boletim_equipe(boletim_id,matricula,tipo_diaria) values (?,?,'COMPLETA')",boletim,matricula);
                    }
                    bulletins++;
                }
            }
            if(withinWeek==1){
                // Idempotência pela descrição, data e origem: não duplica na segunda execução.
                String description="Seed TESTE: chuva forte impediu a descarga";
                if(db.queryForObject("select count(*) from nao_recebimento where data=? and origem='TESTE' and descricao=?",
                    Integer.class,Date.valueOf(day),description)==0){
                    db.update("insert into nao_recebimento(data,motivo,descricao,origem,fornecedor_id) "
                        +"values (?,'CASO_FORTUITO',?,'TESTE',?)",Date.valueOf(day),description,suppliers[workDay%suppliers.length]);
                    refusals++;
                }
            }
            workDay++;
        }
        return Map.of("agendamentos",appointments,"descargas",discharges,"boletins",bulletins,"naoRecebimentos",refusals);
    }

    private long[] suppliers(){
        long[] ids=new long[SUPPLIERS.length];
        for(int i=0;i<SUPPLIERS.length;i++){
            String code=String.format("DEMO_%02d",i+1);
            List<Long> existing=db.query("select id from fornecedor where codigo=? order by id limit 1",
                (rs,n)->rs.getLong(1),code);
            ids[i]=existing.isEmpty()?db.queryForObject("insert into fornecedor(codigo,razao_social,cnpj) values (?,?,?) returning id",
                Long.class,code,SUPPLIERS[i],CNPJ[i]):existing.get(0);
        }
        return ids;
    }

    private static OffsetDateTime at(LocalDate day,int hour,int minute){
        return day.atTime(hour,minute).atZone(ZONE).toOffsetDateTime();
    }
}
