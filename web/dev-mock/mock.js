/* Mock da API só para testar a interface sem Java. Segue o contrato de docs/API-TAREFA*.md e as regras lidas no código Java. */
(function(){
const SP=()=>new Date().toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo'});
const today=()=>SP().slice(0,10);
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const addDays=(s,n)=>{const [y,m,d]=s.split('-').map(Number);const x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return iso(x);};
const dowOf=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).getDay();};
const monday=s=>addDays(s,-((dowOf(s)+6)%7));
const nowTs=()=>SP().replace(' ','T').slice(0,19)+'-03:00';
const ARM=[{id:1,codigo:'INSUMOS',nome:'Insumos'},{id:2,codigo:'ADUBO',nome:'Adubo'},{id:3,codigo:'PATIO_MAQUINAS',nome:'Pátio de Máquinas'},{id:4,codigo:'LOJA',nome:'Loja'}];
const EQ=[[1,'INS-EMPG-01','Empilhadeira a gás'],[1,'INS-EMPE-01','Empilhadeira elétrica/retrátil'],[1,'INS-TRAP-01','Transpaleteira elétrica'],[1,'INS-TRAP-02','Transpaleteira elétrica'],[1,'INS-PALM-01','Paleteira manual'],[2,'ADU-EMPG-01','Empilhadeira a gás'],[2,'ADU-EMPG-02','Empilhadeira a gás'],[2,'ADU-PALM-01','Paleteira manual'],[3,'PAT-EMPG-01','Empilhadeira a gás'],[3,'PAT-TRAT-01','Trator'],[3,'PAT-TRAT-02','Trator'],[4,'LOJ-CARR-01','Carrinho de mão']].map((e,i)=>({id:i+1,armazemId:e[0],identificacao:e[1],tipo:e[2],observacao:null}));
const FORN=[['Votorantim Cimentos S/A','01637895008893'],['Yara Brasil Fertilizantes S/A','92660604015708'],['Syngenta Proteção de Cultivos Ltda','60744463001080'],['Agronelli Agroindústria Ltda','10208566001562'],['Indústrias Reunidas Colombo Ltda','45127545000100'],['Mosaic Fertilizantes do Brasil Ltda','61156501009960'],['Imep Indústria Mecânica Pompeia Ltda','44483394000151'],['Agrale S/A','88610324000192']].map((f,i)=>({id:i+1,razaoSocial:f[0],cnpj:f[1]}));
const CHAPAS=Array.from({length:51},(_,i)=>({matricula:'CHAPA_'+pad(i+1),nome:'CHAPA_'+pad(i+1)}));
const TIPOS=[['ACESSORIOS','Acessórios agropecuários','0.3224'],['AGROQUIMICO','Agroquímico','0.3224'],['ALIMENTACAO_ANIMAL','Alimentação animal','0.3387'],['FERTILIZANTES','Fertilizantes','0.3224'],['MAQUINAS','Máquinas / equipamentos','0.3224'],['MEDICAMENTOS','Medicamentos','0.3387'],['PECAS','Peças','0.3387'],['SACARIA_FARDO_250','Sacaria fardo c/ 250','1.1780'],['SACARIA_FARDO_500','Sacaria fardo c/ 500','2.3561'],['SACARIA_MALAS_25','Sacaria malas c/ 25','0.1824'],['SACARIA_MALAS_40','Sacaria malas c/ 40','0.2635'],['SACARIA_MALAS_50','Sacaria malas c/ 50','0.3224'],['SEMENTES','Sementes','0.3224'],['SERVICOS_DIVERSOS','Serviços diversos','0.3224']].map(t=>({codigo:t[0],descricao:t[1],precoUnitario:t[2]}));
const FERIADOS={'2026-10-12':'Nossa Senhora Aparecida'};
const PISO=901731n;

let seq=100;
const DB={ags:[],vagas:[],nr:[],bol:[],ev:[]};
const rotulo={PENDENTE_COMPRAS:'Aguardando Compras',AUTORIZADO:'Autorizado',NAO_AUTORIZADO:'Não autorizado',EM_DESCARGA:'Descarregando',CONCLUIDO:'Concluído',CANCELADO:'Cancelado',NAO_RECEBIDO:'Não recebido'};
function ev(id,de,para,tipo,obs,det){DB.ev.push({id:seq++,agId:id,deStatus:de,paraStatus:para,tipo,observacao:obs,detalhe:det||null,ocorridoEm:nowTs()});}
function mkAg(o){const id=seq++;const a=Object.assign({id,fornecedorId:1,data:today(),horario:'08:00',acondicionamento:'PALETIZADO',status:'PENDENTE_COMPRAS',statusRotulo:'',agendadoNaHora:false,limiteIgnorado:false,origem:'TESTE',criadoEm:nowTs(),chegadaEm:null,notas:[{id:seq++,nfNumero:String(500+id),nfChave:null,pesoTotalKg:null,arquivoNome:null,ativa:true}],validacaoCompras:null,descargas:[],cancelamento:null},o);a.statusRotulo=rotulo[a.status];DB.ags.push(a);ev(id,null,a.status,'STATUS','Agendamento criado');return a;}
function mkDesc(a,arm,o){const d=Object.assign({id:seq++,armazemId:arm,chegadaEm:a.chegadaEm,entradaEm:null,saidaEm:null,quantidadeChapas:null,equipamentoIds:[]},o);a.descargas.push(d);return d;}
const ts=(day,hm)=>day+'T'+hm+':00-03:00';
function seed(){
  const w0=dowOf(today()),wk=w0===0?addDays(today(),1):w0===6?addDays(today(),2):monday(today()),D=n=>addDays(wk,n);
  const a1=mkAg({fornecedorId:2,data:D(0),horario:'08:00',acondicionamento:'BIG_BAG',status:'AUTORIZADO',validacaoCompras:{decisao:'AUTORIZADO',pedidoReferencia:'PC-25001',observacao:null,decididoEm:nowTs()}});mkDesc(a1,2,{});
  mkAg({fornecedorId:3,data:D(0),horario:'08:00',acondicionamento:'PALETIZADO',status:'AUTORIZADO',validacaoCompras:{decisao:'AUTORIZADO',pedidoReferencia:'PC-25002'}});
  mkAg({fornecedorId:6,data:D(0),horario:'10:00',acondicionamento:'BATIDO',status:'PENDENTE_COMPRAS'});
  mkAg({fornecedorId:4,data:D(1),horario:'13:00',acondicionamento:'PALETIZADO',status:'PENDENTE_COMPRAS'});
  mkAg({fornecedorId:1,data:D(1),horario:'08:00',acondicionamento:'BATIDO',status:'AUTORIZADO',validacaoCompras:{decisao:'AUTORIZADO',pedidoReferencia:'PC-25003'}});
  const c=mkAg({fornecedorId:7,data:D(2),horario:'10:00',acondicionamento:'BIG_BAG',status:'CANCELADO',cancelamento:{motivo:'Fornecedor sem veículo',situacao:'EFETIVADO'}});
  DB.vagas.push({id:seq++,data:D(2),horario:'10:00',acondicionamento:'BIG_BAG',origemAgendamentoId:c.id,status:'ABERTA',atribuidaAAgendamentoId:null,decididoEm:null,criadoEm:nowTs()});
  mkAg({fornecedorId:5,data:D(3),horario:'15:00',acondicionamento:'PALETIZADO',status:'AUTORIZADO',validacaoCompras:{decisao:'AUTORIZADO',pedidoReferencia:'PC-25004'}});
  // histórico recente concluído (três dias úteis atrás)
  let day=addDays(today(),-1),n=0;while(n<5){if(![0,6].includes(dowOf(day))){const a=mkAg({fornecedorId:1+n,data:day,horario:['08:00','10:00','13:00','15:00'][n%4],acondicionamento:n%2?'PALETIZADO':'BATIDO',status:'CONCLUIDO',validacaoCompras:{decisao:'AUTORIZADO',pedidoReferencia:'PC-24'+n}});
    a.chegadaEm=ts(day,'07:5'+n);mkDesc(a,1+(n%4),{chegadaEm:ts(day,'07:5'+n),entradaEm:ts(day,'08:1'+n),saidaEm:ts(day,'09:0'+n),quantidadeChapas:2+n%3,equipamentoIds:[1]});n++;}day=addDays(day,-1);}
  const dd=addDays(today(),-1);
  [[2,'2025-11-17']].forEach(()=>{});
  DB.bol.push(mkBol(1,addDays(today(),-1),[{tipoItem:'AGROQUIMICO',descarga:600,remocao:100,transferencia:0}],['CHAPA_14','CHAPA_15','CHAPA_16','CHAPA_17','CHAPA_18'].map((m,i)=>({matricula:m,tipoDiaria:i<4?'COMPLETA':'MEIA'})),'TESTE'));
  DB.bol.push(mkBol(2,addDays(today(),-1),[{tipoItem:'FERTILIZANTES',descarga:4000,remocao:500,transferencia:0}],['CHAPA_01','CHAPA_02','CHAPA_03','CHAPA_04','CHAPA_05','CHAPA_06','CHAPA_07','CHAPA_08'].map(m=>({matricula:m,tipoDiaria:'COMPLETA'})),'TESTE'));
}
function bigStr(v,dec){const s=v.toString().padStart(dec+1,'0');return dec?s.slice(0,-dec)+'.'+s.slice(-dec):s;}
const c4=s=>{const [i,f='']=String(s).split('.');return BigInt(i+f.padEnd(4,'0').slice(0,4));};
const hu=(n,d)=>(n*2n+d)/(2n*d);   // meio para cima
function calc(b){
  const linhas=[];let prod=0n;
  for(const l of b.linhas){const t=TIPOS.find(x=>x.codigo===l.tipoItem);if(!t)throw Err(422,'Tipo de item inválido: '+l.tipoItem);const q=(l.descarga||0)+(l.remocao||0)+(l.transferencia||0);if(!q)continue;const v=c4(t.precoUnitario)*BigInt(q);prod+=v;linhas.push({tipoItem:t.codigo,descricao:t.descricao,descarga:l.descarga||0,remocao:l.remocao||0,transferencia:l.transferencia||0,quantidadeTotal:q,precoUnitario:t.precoUnitario,valor:bigStr(v,4)});}
  if(b.equipe.length>20)throw Err(422,'Um boletim aceita no máximo 20 chapas.');
  if(!linhas.length&&!b.equipe.length)throw Err(422,'Informe a produção do dia e/ou a equipe.');
  const seen=new Set();for(const m of b.equipe){if(seen.has(m.matricula))throw Err(422,'Matrícula repetida: '+m.matricula);seen.add(m.matricula);if(!CHAPAS.some(c=>c.matricula===m.matricula))throw Err(422,'Matrícula não cadastrada: '+m.matricula);}
  const comp=b.equipe.filter(m=>m.tipoDiaria==='COMPLETA').length,meias=b.equipe.length-comp,d2=BigInt(2*comp+meias);
  const equipe=b.equipe.map(m=>({matricula:m.matricula,nome:m.matricula,tipoDiaria:m.tipoDiaria}));
  const out={piso:'90.1731',linhas,equipe,quantidadeChapas:b.equipe.length,chapasDiariaCompleta:comp,chapasMeiaDiaria:meias,diariasEquivalentes:(Number(d2)/2).toFixed(1),producaoTotal:bigStr(prod,4)};
  if(d2===0n){Object.assign(out,{situacao:'INCONSISTENTE',valorPorDiaria:null,totalAPagar:null,complemento:null,abaixoDoPiso:null,exibicao:{producaoTotal:bigStr(hu(prod,100n),2)}});out.exibicao.producaoTotal=bigStr(hu(prod,100n),2);return out;}
  const vpd=hu(prod*2n*10000n,d2*10000n);const abaixo=prod*2n<PISO*d2;const tot=abaixo?hu(PISO*d2,2n):prod;const comp4=abaixo?tot-prod:0n;
  Object.assign(out,{situacao:'CONSISTENTE',valorPorDiaria:bigStr(vpd,4),totalAPagar:bigStr(tot,4),complemento:bigStr(comp4,4),abaixoDoPiso:abaixo,exibicao:{producaoTotal:bigStr(hu(prod,100n),2),valorPorDiaria:bigStr(hu(vpd,100n),2),totalAPagar:bigStr(hu(tot,100n),2),complemento:bigStr(hu(comp4,100n),2)}});
  return out;
}
function mkBol(armId,data,linhas,equipe,origem){const c=calc({linhas,equipe});return Object.assign({id:seq++,armazemId:armId,armazemNome:ARM.find(a=>a.id===armId).nome,data,origem,criadoEm:nowTs()},c);}
function Err(status,detail,codigo){const e=new Error(detail);e.status=status;e.codigo=codigo||({400:'REQUISICAO_INVALIDA',404:'NAO_ENCONTRADO',409:'CONFLITO'}[status]||'REGRA_DE_NEGOCIO');return e;}
const LIB=['CANCELADO','NAO_AUTORIZADO','NAO_RECEBIDO'];
function ocup(data,h,ex){const t=DB.ags.filter(a=>a.data===data&&a.horario===h&&a.id!==ex&&!LIB.includes(a.status)).map(a=>a.acondicionamento);DB.vagas.filter(v=>v.data===data&&v.horario===h&&v.status==='ABERTA').forEach(v=>t.push(v.acondicionamento));return t;}
const cabe=(t,a)=>!t.includes('BATIDO')&&(a==='BATIDO'?t.length===0:t.length<2);
const semVaga=(t,a)=>t.includes('BATIDO')?'Horário sem vaga: já há uma carga batida, que reserva o horário inteiro.':a==='BATIDO'?'Horário sem vaga: carga batida exige o horário livre, e já há caminhões agendados.':'Horário sem vaga: o limite de 2 caminhões por horário foi atingido.';
const HORS=['08:00','10:00','13:00','15:00'];
function naoUtil(d){if([0,6].includes(dowOf(d)))return 'Não há agendamentos aos fins de semana.';return FERIADOS[d]?'Data não operacional: '+FERIADOS[d]+'.':null;}
function valida(d,h,naHora){if(!d||!HORS.includes(h))throw Err(422,'Horário inválido. Escolha entre 08h00, 10h00, 13h00 e 15h00.');if(d<today())throw Err(422,'Não é possível usar uma data passada.');const r=naoUtil(d);if(r)throw Err(422,r);if(d===today()&&h<SP().slice(11,16)&&!naHora)throw Err(422,'Este horário já passou. Escolha um horário posterior.');}
const find=id=>{const a=DB.ags.find(x=>x.id===Number(id));if(!a)throw Err(404,'Agendamento não encontrado: '+id);return a;};
function trans(a,next,obs){const ok={PENDENTE_COMPRAS:['AUTORIZADO','NAO_AUTORIZADO','CANCELADO','NAO_RECEBIDO'],AUTORIZADO:['EM_DESCARGA','CANCELADO','NAO_RECEBIDO'],EM_DESCARGA:['CONCLUIDO']}[a.status]||[];if(!ok.includes(next))throw Err(409,"O agendamento está '"+rotulo[a.status]+"' e não pode passar para '"+rotulo[next]+"'.");ev(a.id,a.status,next,'STATUS',obs);a.status=next;a.statusRotulo=rotulo[next];if(LIB.includes(next))a.notas.forEach(n=>n.ativa=false);}
const J=o=>JSON.parse(JSON.stringify(o));
const findDesc=id=>{for(const a of DB.ags){const d=a.descargas.find(x=>x.id===Number(id));if(d)return[a,d];}throw Err(404,'Descarga não encontrada: '+id);};
const OFF=s=>s;
function histo(de,ate){
  const base=[["2025-02",19,172,300],["2025-03",21,154,285],["2025-04",19,136,315],["2025-05",21,151,368],["2025-06",21,130,392],["2025-07",22,146,628],["2025-09",22,186,632],["2025-10",23,215,690],["2025-11",18,195,406],["2026-01",21,181,365],["2026-02",19,197,370],["2026-03",22,211,359],["2026-04",20,169,347],["2026-05",20,165,423],["2026-06",21,178,443],["2026-07",22,187,605],["2026-08",21,175,494]];
  const ref=194.3,all=base.map(([m,dias,disp,ev])=>{const esf=ev*60;const nec=esf/ref;const saldo=disp-nec;return{mes:m,estacao:(+m.slice(5)>=10||+m.slice(5)<=3)?'SAFRA':'ENTRESSAFRA',diasUteis:dias,recebimentosPorDia:+(ev/dias).toFixed(2),chapasPorDia:+(disp/dias).toFixed(2),chapasNecessariasPorDia:+(nec/dias).toFixed(2),saldoDiarias:+saldo.toFixed(2),saldoReais:(saldo*90.1731).toFixed(4),situacao:Math.abs(saldo)/disp>.1?(saldo>0?'SOBRA':'FALTA'):'EQUILIBRADO',_ev:ev};});
  const sel=all.filter(r=>(!de||r.mes>=de.slice(0,7))&&(!ate||r.mes<=ate.slice(0,7)));
  const sobra=sel.reduce((s,r)=>s+Math.max(r.saldoDiarias,0),0),falta=sel.reduce((s,r)=>s+Math.max(-r.saldoDiarias,0),0);
  const est=['SAFRA','ENTRESSAFRA'].map(k=>{const g=sel.filter(r=>r.estacao===k);const dias=g.reduce((s,r)=>s+r.diasUteis,0);if(!dias)return null;const b=g.reduce((s,r)=>s+r.saldoDiarias,0);return{estacao:k,rotulo:k==='SAFRA'?'Safra (out a mar)':'Entressafra (abr a set)',diasUteis:dias,recebimentosPorDia:+(g.reduce((s,r)=>s+r._ev,0)/dias).toFixed(2),chapasPorDia:+(g.reduce((s,r)=>s+r.chapasPorDia*r.diasUteis,0)/dias).toFixed(2),saldoDiarias:+b.toFixed(2),saldoReais:(b*90.1731).toFixed(4)};}).filter(Boolean);
  const shares=[[1,'Insumos',1719,171900],[2,'Adubo',1721,387225],[3,'Pátio de Máquinas',728,12740],[4,'Loja',3254,0]],te=shares.reduce((s,a)=>s+a[3],0);
  const dem=[];sel.forEach(r=>{[1,2,3,4].forEach((a,i)=>dem.push({mes:r.mes,armazemId:a,armazem:ARM[i].nome,recebimentos:Math.round(r._ev*[.18,.2,.07,.55][i])}));});
  for(const y of ['2023','2024']){for(let m=1;m<=12;m++){const f=[.8,.8,.8,.85,.95,1,1.4,1.5,1.5,1.7,1.1,.9][m-1];[1,2,3,4].forEach((a,i)=>dem.push({mes:y+'-'+pad(m),armazemId:a,armazem:ARM[i].nome,recebimentos:Math.round(300*f*[.18,.2,.07,.55][i])}));}}
  dem.sort((a,b)=>a.mes.localeCompare(b.mes)||a.armazemId-b.armazemId);
  return{origem:'HISTORICO',periodo:{de:sel[0]&&sel[0].mes,ate:sel.length?sel[sel.length-1].mes:null},piso:'90.1731',equilibrio:{pessoaMinutosPorChapaDia:ref,diasUteisAnalisados:350,diasUteisExibidos:sel.reduce((s,r)=>s+r.diasUteis,0)},
    meses:sel.map(({_ev,...r})=>r),estacoes:est,totais:{sobraDiarias:+sobra.toFixed(2),faltaDiarias:+falta.toFixed(2),sobraReais:(sobra*90.1731).toFixed(4),faltaReais:(falta*90.1731).toFixed(4),saldoReais:((sobra-falta)*90.1731).toFixed(4)},
    armazens:shares.map(a=>({armazemId:a[0],armazem:a[1],recebimentos:a[2],esforcoPessoaMinutos:a[3],participacaoNaNecessidade:+(a[3]/te).toFixed(4),parcelaDaSobraReais:(sobra*a[3]/te*90.1731).toFixed(4),parcelaDaFaltaReais:(falta*a[3]/te*90.1731).toFixed(4),premissa:'Premissa de acondicionamento do armazém '+a[1]})),
    cenarios:[{nome:'Equilíbrio médio do histórico',pessoaMinutosPorChapaDia:ref,sobraReais:(sobra*90.1731).toFixed(4),faltaReais:(falta*90.1731).toFixed(4),saldoReais:((sobra-falta)*90.1731).toFixed(4)},{nome:'Capacidade demonstrada (3º quartil mensal)',pessoaMinutosPorChapaDia:210.5,sobraReais:'30000.0000',faltaReais:'8000.0000',saldoReais:'22000.0000'}],
    robustez:{correlacaoEquipeEDemanda:0.08,correlacaoEquipeEDemandaSemPeso:0.11},demandaPorMesEArmazem:dem,limitacoes:['O histórico só enxerga o recebimento; o carregamento de cooperados divide a mesma equipe e nunca foi registrado.','A folha não distingue o armazém de cada chapa.','(mock) dados sintéticos para teste de interface.']};
}
function operacao(q){
  const done=DB.ags.flatMap(a=>a.descargas.filter(d=>d.saidaEm).map(d=>({a,d}))).filter(x=>(!q.armazemId||x.d.armazemId===+q.armazemId)&&(!q.origem||x.a.origem===q.origem));
  const m=(l)=>l.length?+(l.reduce((s,x)=>s+x,0)/l.length).toFixed(1):null;
  const min=(a,b)=>(new Date(b)-new Date(a))/60000;
  const esp=done.filter(x=>x.d.chegadaEm&&x.d.entradaEm).map(x=>min(x.d.chegadaEm,x.d.entradaEm)),dur=done.map(x=>min(x.d.entradaEm,x.d.saidaEm)),ch=done.filter(x=>x.d.quantidadeChapas!=null).map(x=>x.d.quantidadeChapas);
  const por={};done.forEach(x=>{const r=por[x.d.armazemId]||(por[x.d.armazemId]={armazemId:x.d.armazemId,armazem:ARM[x.d.armazemId-1].nome,cargas:0,diasComMovimento:1,horasOcupadas:0});r.cargas++;r.horasOcupadas+=min(x.d.entradaEm,x.d.saidaEm)/60;});
  Object.values(por).forEach(r=>r.horasOcupadas=+r.horasOcupadas.toFixed(2));
  const origens={};done.forEach(x=>origens[x.a.origem]=(origens[x.a.origem]||0)+1);
  const bols=DB.bol.filter(b=>(!q.armazemId||b.armazemId===+q.armazemId)&&(!q.origem||b.origem===q.origem));const ok=bols.filter(b=>b.situacao==='CONSISTENTE');
  const money=a=>a.reduce((s,x)=>s+ +x,0).toFixed(4);
  const nr={};DB.nr.forEach(n=>nr[n.motivo]=(nr[n.motivo]||0)+1);
  const horas={};done.forEach(x=>{const h=+x.d.entradaEm.slice(11,13);horas[h]=(horas[h]||0)+1;});
  return{filtro:q,origens,cargasRecebidas:{total:done.length,unidade:'descargas concluídas (um caminhão com 2 destinos conta 2)',porDiaEArmazem:[]},tempoMedioEsperaMin:{media:m(esp),amostra:esp.length,definicao:'entrada − chegada'},tempoMedioDescargaMin:{media:m(dur),amostra:dur.length,definicao:'saída − entrada'},chapasPorRecebimento:{media:m(ch),amostra:ch.length,observacao:'intensidade de cada descarga; NÃO é o efetivo do dia'},porArmazem:Object.values(por),utilizacao:{observacao:'A Cocapec não definiu a fórmula de utilização.'},fornecedoresMaiorVolume:[],movimento:{porHoraDeEntrada:Object.entries(horas).map(([h,c])=>({hora:+h,cargas:c})),porDiaDaSemana:[]},naoRecebimentos:Object.entries(nr).map(([motivo,quantidade])=>({motivo,quantidade})),custoDaOperacao:{totalAPagar:money(ok.map(b=>b.totalAPagar)),producao:money(bols.map(b=>b.producaoTotal)),complemento:money(ok.map(b=>b.complemento)),boletins:bols.length,boletinsInconsistentes:bols.length-ok.length,definicao:'soma do total a pagar dos boletins.'}};
}
function plat(q){
  const bols=DB.bol.filter(b=>(!q.armazemId||b.armazemId===+q.armazemId)&&(!q.origem||b.origem===q.origem)&&(!q.de||b.data>=q.de)&&(!q.ate||b.data<=q.ate));
  const acc=l=>{const ok=l.filter(b=>b.situacao==='CONSISTENTE');const d=ok.reduce((s,b)=>s+ +b.diariasEquivalentes,0),p=ok.reduce((s,b)=>s+ +b.producaoTotal,0);const sobra=ok.reduce((s,b)=>s+ +b.complemento,0),falta=ok.reduce((s,b)=>s+Math.max(+b.producaoTotal-90.1731*b.diariasEquivalentes,0),0);const ap=d?p/(90.1731*d):null;return{boletins:l.length,boletinsInconsistentes:l.length-ok.length,diariasEquivalentes:d.toFixed(1),producao:p.toFixed(4),totalAPagar:ok.reduce((s,b)=>s+ +b.totalAPagar,0).toFixed(4),sobraReais:sobra.toFixed(4),sobraDiarias:(sobra/90.1731).toFixed(2),faltaReais:falta.toFixed(4),faltaDiarias:(falta/90.1731).toFixed(2),diasComComplemento:ok.filter(b=>+b.complemento>0).length,diasAcimaDoPiso:0,aproveitamento:ap==null?null:ap.toFixed(4),situacao:ap==null?'SEM_DADOS':ap<.9?'SOBRA':ap>1.1?'FALTA':'EQUILIBRADO'};};
  const origens={};bols.forEach(b=>origens[b.origem]=(origens[b.origem]||0)+1);
  return{agrupadoPor:'mes',piso:'90.1731',filtro:q,origens,total:acc(bols),porArmazem:ARM.filter(a=>bols.some(b=>b.armazemId===a.id)).map(a=>({armazemId:a.id,armazem:a.nome,...acc(bols.filter(b=>b.armazemId===a.id))})),porPeriodo:[...new Set(bols.map(b=>b.data.slice(0,7)+'|'+b.armazemId))].map(k=>{const [p,i]=k.split('|');return{periodo:p,armazemId:+i,armazem:ARM[i-1].nome,...acc(bols.filter(b=>b.data.slice(0,7)===p&&b.armazemId===+i))};}),efetivoDistintoPorDia:[],alertas:{matriculasEmMaisDeUmBoletimNoMesmoDia:0,observacao:''}};
}
function route(method,url,body,isForm){
  const u=new URL(url,location.origin),p=u.pathname,q=Object.fromEntries(u.searchParams);let m;
  if(p==='/health')return{status:'ok'};
  if(p==='/api/armazens')return ARM;if(p==='/api/equipamentos')return EQ;if(p==='/api/fornecedores'&&method==='GET')return FORN;
  if(p==='/api/fornecedores'){const f={id:FORN.length+1,razaoSocial:body.razaoSocial,cnpj:body.cnpj||null};FORN.push(f);return[201,f];}
  if(p==='/api/chapas')return CHAPAS;if(p==='/api/boletim/tipos-item')return TIPOS;
  if(p==='/api/agenda'){const r=naoUtil(q.data);const slots=r?[]:HORS.map(h=>{const t=ocup(q.data,h);return{horario:h,ocupados:t.length,aceitaBatido:cabe(t,'BATIDO'),aceitaPaletizadoOuBigBag:cabe(t,'PALETIZADO')};});return{data:q.data,diaUtil:!r,motivoIndisponivel:r,slots};}
  if(p==='/api/agendamentos'&&method==='GET')return J(DB.ags.filter(a=>(!q.data||a.data===q.data)&&(!q.status||a.status===q.status)).sort((a,b)=>(a.data+a.horario).localeCompare(b.data+b.horario)));
  if(p==='/api/agendamentos'){
    if(!body.fornecedorId||!body.notas||!body.notas.length)throw Err(400,'Informe fornecedor e de 1 a 20 notas fiscais.');
    valida(body.data,body.horario,body.agendadoNaHora);const t=ocup(body.data,body.horario);if(!cabe(t,body.acondicionamento))throw Err(409,semVaga(t,body.acondicionamento));
    const a=mkAg({fornecedorId:body.fornecedorId,data:body.data,horario:body.horario,acondicionamento:body.acondicionamento,agendadoNaHora:!!body.agendadoNaHora,origem:'PLATAFORMA'});
    a.notas=body.notas.map(n=>({id:seq++,nfNumero:n.nfNumero||null,nfChave:n.nfChave||null,pesoTotalKg:null,arquivoNome:null,ativa:true}));return[201,J(a)];}
  if(m=p.match(/^\/api\/agendamentos\/(\d+)\/notas\/(\d+)\/arquivo$/)){const a=find(m[1]);const n=a.notas.find(x=>x.id===+m[2]);if(!n)throw Err(404,'Nota não encontrada.');n.arquivoNome='nota.xml';return J(a);}
  if(m=p.match(/^\/api\/agendamentos\/(\d+)\/eventos$/))return J(DB.ev.filter(e=>e.agId===+m[1]));
  if(m=p.match(/^\/api\/agendamentos\/(\d+)\/(validacao-compras|destinos|chegada|reagendamento|cancelamento\/efetivacao|cancelamento)$/)){
    const a=find(m[1]),k=m[2];
    if(k==='validacao-compras'){if(!['AUTORIZADO','NAO_AUTORIZADO'].includes(body.decisao))throw Err(400,'Decisão inválida.');if(body.decisao==='AUTORIZADO'&&!body.pedidoReferencia)throw Err(422,'Informe o pedido de compra de referência para autorizar.');if(body.decisao==='NAO_AUTORIZADO'&&!body.observacao)throw Err(422,'Descreva a divergência encontrada entre a nota e o pedido.');trans(a,body.decisao,'Compras');a.validacaoCompras={decisao:body.decisao,pedidoReferencia:body.pedidoReferencia||null,observacao:body.observacao||null,decididoEm:nowTs()};if(body.decisao==='NAO_AUTORIZADO')DB.nr.push({id:seq++,agendamentoId:a.id,fornecedorId:a.fornecedorId,fornecedorNome:null,data:a.data,motivo:'DIVERGENCIA_NF_PEDIDO',descricao:body.observacao,origem:'PLATAFORMA',criadoEm:nowTs()});return J(a);}
    if(k==='destinos'){if(a.status!=='AUTORIZADO')throw Err(409,'Compras precisa autorizar o agendamento antes de definir os destinos.');if(a.descargas.length)throw Err(409,'Os armazéns de destino já foram definidos para este agendamento.');body.armazemIds.forEach(i=>mkDesc(a,i,{}));return J(a);}
    if(k==='chegada'){if(!['PENDENTE_COMPRAS','AUTORIZADO'].includes(a.status))throw Err(409,'O agendamento não aceita a chegada do caminhão.');if(a.chegadaEm)throw Err(409,'A chegada deste caminhão já foi registrada.');a.chegadaEm=nowTs();a.descargas.forEach(d=>d.chegadaEm=d.chegadaEm||a.chegadaEm);ev(a.id,a.status,a.status,'MARCO','Chegada do caminhão');return J(a);}
    if(k==='reagendamento'){if(!['PENDENTE_COMPRAS','AUTORIZADO'].includes(a.status))throw Err(409,'Só é possível reagendar antes da descarga.');if(!body.motivo)throw Err(422,'Informe o motivo do reagendamento.');valida(body.data,body.horario,false);const t=ocup(body.data,body.horario,a.id),fit=cabe(t,a.acondicionamento);if(!fit&&!body.casoFortuito)throw Err(409,semVaga(t,a.acondicionamento));ev(a.id,a.status,a.status,'REAGENDAMENTO',(body.casoFortuito?'Reagendado por caso fortuito: ':'Reagendado: ')+body.motivo,{de:{data:a.data,horario:a.horario},para:{data:body.data,horario:body.horario},casoFortuito:!!body.casoFortuito,limiteExcedido:!fit});a.data=body.data;a.horario=body.horario;a.limiteIgnorado=a.limiteIgnorado||!fit;return J(a);}
    if(k==='cancelamento'){if(!['PENDENTE_COMPRAS','AUTORIZADO'].includes(a.status))throw Err(409,'O agendamento não pode mais ser cancelado.');if(a.cancelamento)throw Err(409,'Já existe uma solicitação de cancelamento para este agendamento.');if(!body.motivo)throw Err(422,'Informe o motivo do cancelamento.');a.cancelamento={motivo:body.motivo,situacao:'SOLICITADO'};return J(a);}
    if(k==='cancelamento/efetivacao'){if(!a.cancelamento)throw Err(422,'Não há solicitação de cancelamento para efetivar.');trans(a,'CANCELADO','Cancelamento efetivado');a.cancelamento.situacao='EFETIVADO';DB.vagas.push({id:seq++,data:a.data,horario:a.horario,acondicionamento:a.acondicionamento,origemAgendamentoId:a.id,status:'ABERTA',atribuidaAAgendamentoId:null,decididoEm:null,criadoEm:nowTs()});return J(a);}
  }
  if(m=p.match(/^\/api\/agendamentos\/(\d+)$/))return J(find(m[1]));
  if(m=p.match(/^\/api\/descargas\/(\d+)\/(chegada|entrada|saida)$/)){
    const [a,d]=findDesc(m[1]),k=m[2],when=(body&&body.ocorridoEm)||nowTs();
    if(k==='chegada'){if(!['AUTORIZADO','EM_DESCARGA'].includes(a.status))throw Err(409,'Compras precisa autorizar o agendamento antes de iniciar a descarga.');if(d.entradaEm)throw Err(409,'Esta descarga já começou; a chegada não pode mais ser alterada.');d.chegadaEm=when;return J(a);}
    if(k==='entrada'){if(!['AUTORIZADO','EM_DESCARGA'].includes(a.status))throw Err(409,'Compras precisa autorizar o agendamento antes de iniciar a descarga.');if(d.entradaEm)throw Err(409,'A entrada desta descarga já foi registrada.');if(!d.chegadaEm)throw Err(422,'Registre a chegada do caminhão antes da entrada.');if(when<d.chegadaEm)throw Err(422,'A entrada não pode ser anterior à chegada.');d.entradaEm=when;if(a.status==='AUTORIZADO')trans(a,'EM_DESCARGA','Início da primeira descarga');return J(a);}
    if(body.quantidadeChapas==null)throw Err(422,'Informe a quantidade de chapas (zero se a carga não exigiu).');if(a.status!=='EM_DESCARGA')throw Err(409,'Registre a entrada antes da saída.');if(when<d.entradaEm)throw Err(422,'A saída não pode ser anterior à entrada.');d.saidaEm=when;d.quantidadeChapas=body.quantidadeChapas;d.equipamentoIds=body.equipamentoIds||[];if(a.descargas.every(x=>x.saidaEm))trans(a,'CONCLUIDO','Todas as descargas foram concluídas');return J(a);}
  if(p==='/api/vagas-liberadas')return J(DB.vagas.filter(v=>!q.situacao||v.status===q.situacao));
  if(m=p.match(/^\/api\/vagas-liberadas\/(\d+)\/(candidatos|atribuicao|liberacao-geral)$/)){
    const v=DB.vagas.find(x=>x.id===+m[1]);if(!v)throw Err(404,'Vaga liberada não encontrada.');
    if(m[2]==='candidatos'){if(v.status!=='ABERTA')return[];const t=DB.ags.filter(a=>a.data===v.data&&a.horario===v.horario&&!LIB.includes(a.status)).map(a=>a.acondicionamento);return J(DB.ags.filter(a=>['PENDENTE_COMPRAS','AUTORIZADO'].includes(a.status)&&a.data>=today()&&!(a.data===v.data&&a.horario===v.horario)&&cabe(t,a.acondicionamento)));}
    if(m[2]==='liberacao-geral'){if(v.status!=='ABERTA')throw Err(409,'Esta vaga já teve o destino decidido.');v.status='LIBERADA_GERAL';return J(v);}
    if(v.status!=='ABERTA')throw Err(409,'Esta vaga já teve o destino decidido.');const a=find(body.agendamentoId);const t=ocup(v.data,v.horario,null).filter((x,i,arr)=>true);ev(a.id,a.status,a.status,'REAGENDAMENTO','Movido para a vaga liberada por cancelamento',{de:{data:a.data,horario:a.horario},para:{data:v.data,horario:v.horario}});a.data=v.data;a.horario=v.horario;v.status='ATRIBUIDA';v.atribuidaAAgendamentoId=a.id;return J(a);}
  if(p==='/api/nao-recebimentos'&&method==='GET')return J(DB.nr);
  if(p==='/api/nao-recebimentos'){if(body.motivo==='OUTRO'&&!body.descricao)throw Err(422,'Descreva o motivo do não recebimento.');let day=body.data||today(),forn=body.fornecedorId||null;if(body.agendamentoId){const a=find(body.agendamentoId);trans(a,'NAO_RECEBIDO','Não recebido');forn=a.fornecedorId;day=body.data||a.data;}const n={id:seq++,agendamentoId:body.agendamentoId||null,fornecedorId:forn,fornecedorNome:null,data:day,motivo:body.motivo,descricao:body.descricao||null,origem:'PLATAFORMA',criadoEm:nowTs()};DB.nr.push(n);return[201,n];}
  if(p==='/api/boletins/calculo')return calc(body);
  if(p==='/api/boletins'&&method==='POST'){const c=calc(body);if(body.data>today())throw Err(422,'A data não pode estar no futuro.');if(DB.bol.some(b=>b.armazemId===body.armazemId&&b.data===body.data))throw Err(409,'Já existe um boletim deste armazém nesta data.');const b=mkBol(body.armazemId,body.data,body.linhas,body.equipe,'PLATAFORMA');DB.bol.push(b);return[201,J(b)];}
  if(p==='/api/boletins')return J(DB.bol.slice().sort((a,b)=>b.data.localeCompare(a.data)));
  if(p==='/api/painel/dimensionamento/historico')return histo(q.de,q.ate);
  if(p==='/api/painel/historico/indicadores')return{origem:'HISTORICO',unidade:'recebimentos (nº do recebimento na data)',fornecedoresMaiorVolume:[{fornecedor:'Votorantim Cimentos',recebimentos:1293},{fornecedor:'Yara Brasil Fertilizantes',recebimentos:1011},{fornecedor:'Syngenta Proteção de Cultivos',recebimentos:911}],porDiaDaSemana:[1,2,3,4,5].map((d,i)=>({diaSemana:d,recebimentos:1490-i*10,dias:70,mediaPorDia:21.3})),porAnoEArmazem:[],observacao:'(mock)'};
  if(p==='/api/painel/operacao')return operacao(q);
  if(p==='/api/painel/dimensionamento/plataforma')return plat(q);
  throw Err(404,'Rota não simulada: '+method+' '+p);
}
seed();
const realFetch=window.fetch;
window.fetch=async function(url,opt={}){
  if(String(url).startsWith('http')&&!String(url).startsWith(location.origin))return realFetch(url,opt);
  await new Promise(r=>setTimeout(r,25));
  try{
    const method=(opt.method||'GET').toUpperCase();let body=null;
    if(typeof opt.body==='string')body=JSON.parse(opt.body);
    let r=route(method,url,body,opt.body instanceof FormData);let status=200;
    if(Array.isArray(r)&&typeof r[0]==='number'&&r.length===2&&typeof r[1]==='object'&&!Array.isArray(r[1])){status=r[0];r=r[1];}
    return new Response(JSON.stringify(r),{status,headers:{'Content-Type':'application/json'}});
  }catch(e){
    if(!e.status){console.error(e);return new Response(JSON.stringify({status:500,codigo:'ERRO_INTERNO',detail:e.message}),{status:500});}
    return new Response(JSON.stringify({status:e.status,codigo:e.codigo,detail:e.message}),{status:e.status,headers:{'Content-Type':'application/problem+json'}});
  }
};
window.__MOCK=DB;
})();
