'use strict';
/* Diferencial 6: Pergunte aos Dados.
   Arquitetura segura: pergunta → interpretação → UMA métrica permitida → a camada de métricas calcula → resposta com
   número, período, filtros e origem. A interpretação nunca calcula nem inventa números e não existe SQL livre:
   só as métricas do catálogo abaixo respondem. Hoje a interpretação usa regras locais (palavras-chave, armazém, período);
   um modelo de linguagem pode ser ligado em interpretar() sem mudar nada do restante, porque ele só escolheria
   uma métrica do catálogo e os parâmetros dela. */

const PERGUNTAS_EXEMPLO=[
  'Quanto pagamos de complemento no Adubo em setembro?',
  'Qual foi o tempo médio de espera na última semana?',
  'Quantos não recebimentos ocorreram por divergência?',
  'Qual armazém teve mais recebimentos no período?',
  'Como está o planejamento para amanhã?',
  'Por que existe pressão operacional amanhã de manhã?'
];
U.pg={hist:[],ocupado:false};

const semAcento=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const MESES_NOMES=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const NOME_MES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

/* ---------- interpretação: extrai período, armazém e motivo; escolhe a métrica ---------- */
function interpretarPeriodo(t){
  const hoje=hojeISO(),ym=hoje.slice(0,7);
  const M=(a,b,r)=>({de:a,ate:b,rotulo:r});
  if(/\bhoje\b/.test(t))return M(hoje,hoje,'hoje ('+fmtBR(hoje)+')');
  if(/\bontem\b/.test(t)){const d=addDays(hoje,-1);return M(d,d,'ontem ('+fmtBR(d)+')');}
  if(/(ultima|ultimas) semana|semana passada|ultimos 7 dias/.test(t))return M(addDays(hoje,-6),hoje,'últimos 7 dias ('+fmtDM(addDays(hoje,-6))+' a '+fmtDM(hoje)+')');
  if(/(esta|nesta) semana/.test(t))return M(mondayOf(hoje),hoje,'esta semana ('+fmtDM(mondayOf(hoje))+' a '+fmtDM(hoje)+')');
  if(/mes passado|ultimo mes/.test(t)){const [y,m]=ym.split('-').map(Number);const p=m===1?(y-1)+'-12':y+'-'+pad(m-1);return M(p+'-01',lastDayOfMonth(p),mLabel(p));}
  if(/(este|neste) mes|mes atual/.test(t))return M(ym+'-01',hoje,'este mês ('+mLabel(ym)+')');
  const mm=MESES_NOMES.findIndex(n=>new RegExp('\\b'+n+'\\b').test(t));
  const ano=(t.match(/\b(20\d{2})\b/)||[])[1];
  if(mm>=0){
    let y=ano?Number(ano):Number(ym.slice(0,4));if(!ano&&(mm+1)>Number(ym.slice(5)))y--;
    const p=y+'-'+pad(mm+1);return M(p+'-01',lastDayOfMonth(p),NOME_MES[mm]+' de '+y);
  }
  if(ano)return M(ano+'-01-01',ano+'-12-31','ano de '+ano);
  return null;
}
function interpretarArmazem(t){
  const a=S.armazens.find(x=>t.includes(semAcento(x.nome)))||(/patio|maquina/.test(t)?S.armazens.find(x=>/Pátio/.test(x.nome)):null);
  return a||null;
}
function interpretar(pergunta){
  const t=semAcento(pergunta).replace(/[?!.]/g,' ');
  const periodo=interpretarPeriodo(t),arm=interpretarArmazem(t);
  let motivo=null;
  if(/divergenc/.test(t))motivo='DIVERGENCIA_NF_PEDIDO';else if(/fortuito|chuva/.test(t))motivo='CASO_FORTUITO';else if(/sem agendamento|sem vaga/.test(t))motivo='SEM_AGENDAMENTO_SEM_VAGA';
  const manha=/\bmanha\b/.test(t),tarde=/\btarde\b/.test(t);
  let metrica=null;
  if(/(por que|porque|pq).*(pressao|alerta)|pressao (operacional )?(amanha|prevista)|existe pressao/.test(t))metrica='d1_porque';
  else if(/planejamento|\bd-?1\b|como esta.*amanha|previsto para amanha|o que (esta )?previsto/.test(t))metrica='d1_resumo';
  else if(/complemento|piso/.test(t))metrica='complemento';
  else if(/espera|esperou|aguardou|fila/.test(t))metrica='espera';
  else if(/(tempo|duracao).*(descarga|descarreg)|quanto tempo.*descarreg|descarga (media|demora)/.test(t))metrica='descarga';
  else if(/chapas.*(descarga|recebimento)|quantas chapas/.test(t))metrica='chapas';
  else if(/nao receb|nao-receb|recusad|devolvid/.test(t))metrica='nao_receb';
  else if(/qual armazem|que armazem|armazem.*(mais|maior)/.test(t))metrica='armazem_top';
  else if(/fornecedor.*(mais|maior)|maior fornecedor/.test(t))metrica='forn_top';
  else if(/sobrando|faltando|sobra|falta de chapa|folga|pressao de equipe/.test(t))metrica='sobra_falta';
  else if(/custo|gastamos|gasto|total a pagar|quanto pagamos/.test(t))metrica='custo';
  else if(/(quantas?|quantos?).*(entregas|cargas|recebimentos|descargas|caminhoes)/.test(t))metrica='entregas';
  return{metrica,periodo,arm,motivo,periodoDia:manha?'manha':tarde?'tarde':null,amanha:/amanha/.test(t),texto:pergunta};
}

/* ---------- catálogo de métricas permitidas ---------- */
const qPeriodo=(p)=>p?{de:p.de,ate:p.ate}:{};
const origemDe=o=>Object.keys(o||{});
const filtrosTxt=(i)=>[i.periodo?'período: '+i.periodo.rotulo:'período: todo o período registrado',i.arm?'armazém: '+i.arm.nome:'armazém: todos'];
const METRICAS={
  complemento:{nome:'Complemento pago ao piso',def:'Soma do complemento dos boletins: o que se paga para completar o piso de R$ 90,1731 por diária quando a produção fica abaixo dele.',fonte:'Boletim diário (plataforma)',
    async calc(i){
      const r=await GET('/api/painel/dimensionamento/plataforma'+qs({...qPeriodo(i.periodo),armazemId:i.arm&&i.arm.id,agrupar:'mes'}));
      const T=r.total||{};
      if(!T.boletins)return{vazio:'Não há boletins salvos neste filtro.',origens:r.origens};
      return{valor:brl2(T.sobraReais),texto:'Foi pago <b>'+brl2(T.sobraReais)+'</b> de complemento'+(i.arm?' no '+esc(i.arm.nome):' nos armazéns')+' ('+nf0.format(T.boletins)+' boletim(ns), '+nf1.format(+T.diariasEquivalentes)+' diárias).',registros:T.boletins+' boletim(ns)'+(T.boletinsInconsistentes?', '+T.boletinsInconsistentes+' inconsistente(s) fora dos valores':''),origens:r.origens,
        linhas:(r.porArmazem||[]).map(a=>[a.armazem,brl2(a.sobraReais)])};
    }},
  espera:{nome:'Tempo médio de espera',def:'Média de (entrada − chegada) de cada descarga concluída.',fonte:'Descargas registradas na plataforma',limite:'O histórico da Cocapec não tem horário de chegada: só existe na plataforma. Descargas sem chegada ou entrada ficam fora.',
    async calc(i){const r=await op(i);const x=r.tempoMedioEsperaMin||{};
      if(x.media==null)return{vazio:'Não há descargas com chegada e entrada registradas neste filtro.',origens:r.origens};
      return{valor:fmtDur(x.media),texto:'O tempo médio de espera foi de <b>'+fmtDur(x.media)+'</b>.',registros:nf0.format(x.amostra)+' descarga(s)',origens:r.origens,linhas:(r.porArmazem||[]).filter(a=>a.esperaMediaMin!=null).map(a=>[a.armazem,fmtDur(a.esperaMediaMin)])};}},
  descarga:{nome:'Tempo médio de descarga',def:'Média de (saída − entrada) de cada descarga concluída.',fonte:'Descargas registradas na plataforma',limite:'Estimativas do Dossiê (ex.: 10 paletes ≈ 15 min) não entram.',
    async calc(i){const r=await op(i);const x=r.tempoMedioDescargaMin||{};
      if(x.media==null)return{vazio:'Não há descargas concluídas neste filtro.',origens:r.origens};
      return{valor:fmtDur(x.media),texto:'O tempo médio de descarga foi de <b>'+fmtDur(x.media)+'</b>.',registros:nf0.format(x.amostra)+' descarga(s)',origens:r.origens,linhas:(r.porArmazem||[]).filter(a=>a.descargaMediaMin!=null).map(a=>[a.armazem,fmtDur(a.descargaMediaMin)])};}},
  chapas:{nome:'Chapas por descarga',def:'Média da quantidade de chapas informada em cada descarga.',fonte:'Descargas registradas na plataforma',limite:'Mede a intensidade de cada descarga; não é o efetivo do dia.',
    async calc(i){const r=await op(i);const x=r.chapasPorRecebimento||{};
      if(x.media==null)return{vazio:'Não há descargas com chapas informadas neste filtro.',origens:r.origens};
      return{valor:nf1.format(x.media),texto:'Foram usadas em média <b>'+nf1.format(x.media)+'</b> chapas por descarga.',registros:nf0.format(x.amostra)+' descarga(s)',origens:r.origens,linhas:(r.porArmazem||[]).filter(a=>a.chapasPorRecebimento!=null).map(a=>[a.armazem,nf1.format(a.chapasPorRecebimento)])};}},
  custo:{nome:'Custo da operação',def:'Soma do total a pagar dos boletins consistentes (produção, ou piso + complemento). Sem encargos nem equipamentos.',fonte:'Boletim diário (plataforma)',
    async calc(i){const r=await op(i);const c=r.custoDaOperacao||{};
      if(!c.boletins)return{vazio:'Não há boletins neste filtro.',origens:r.origens};
      return{valor:brl2(c.totalAPagar),texto:'O custo da operação foi de <b>'+brl2(c.totalAPagar)+'</b> (produção '+brl2(c.producao)+', complemento '+brl2(c.complemento)+').',registros:nf0.format(c.boletins)+' boletim(ns)'+(c.boletinsInconsistentes?', '+c.boletinsInconsistentes+' inconsistente(s) fora do total':''),origens:r.origens};}},
  nao_receb:{nome:'Não recebimentos',def:'Contagem de ocorrências de não recebimento, por motivo.',fonte:'Não recebimentos registrados na plataforma',limite:'Quando Compras não autoriza, o sistema registra o não recebimento por divergência entre NF e pedido (assunção da equipe).',
    async calc(i){const r=await op(i);const L=r.naoRecebimentos||[];
      const sel=i.motivo?(L.find(x=>x.motivo===i.motivo)||{quantidade:0}).quantidade:L.reduce((s,x)=>s+x.quantidade,0);
      const rot=i.motivo?MOTIVOS_NR[i.motivo].toLowerCase():'no total';
      return{valor:nf0.format(sel),texto:'Ocorreram <b>'+nf0.format(sel)+'</b> não recebimento(s) '+(i.motivo?'por '+esc(rot):'no total')+'.',registros:nf0.format(L.reduce((s,x)=>s+x.quantidade,0))+' ocorrência(s) no filtro',origens:{...(r.origens||{})},semOrigem:!(Object.keys(r.origens||{}).length),
        linhas:Object.keys(MOTIVOS_NR).map(k=>[MOTIVOS_NR[k],nf0.format((L.find(x=>x.motivo===k)||{quantidade:0}).quantidade)])};}},
  armazem_top:{nome:'Armazém com mais recebimentos',def:'Armazém com mais descargas concluídas no filtro (plataforma). Sem registros da plataforma, usa os recebimentos-destino do histórico.',fonte:'Descargas (plataforma) ou histórico Cocapec',
    async calc(i){
      const r=await op({...i,arm:null});const L=(r.porArmazem||[]).slice().sort((a,b)=>b.cargas-a.cargas);
      if(L.length)return{valor:L[0].armazem,texto:'O armazém com mais recebimentos foi o <b>'+esc(L[0].armazem)+'</b> ('+nf0.format(L[0].cargas)+' descarga(s) concluída(s)).',registros:nf0.format(L.reduce((s,a)=>s+a.cargas,0))+' descarga(s)',origens:r.origens,linhas:L.map(a=>[a.armazem,nf0.format(a.cargas)+' descargas'])};
      const h=await GET('/api/painel/dimensionamento/historico'+qs(qPeriodo(i.periodo)));const A=(h.armazens||[]).slice().sort((a,b)=>b.recebimentos-a.recebimentos);
      if(!A.length||!A[0].recebimentos)return{vazio:'Não há recebimentos registrados neste filtro.',origens:{}};
      return{valor:A[0].armazem,texto:'Sem descargas da plataforma no filtro, o histórico indica o <b>'+esc(A[0].armazem)+'</b> ('+nf0.format(A[0].recebimentos)+' recebimentos-destino).',registros:nf0.format(sum(A,'recebimentos'))+' recebimentos-destino',origens:{HISTORICO:1},linhas:A.map(a=>[a.armazem,nf0.format(a.recebimentos)+' recebimentos'])};
    }},
  forn_top:{nome:'Fornecedores com maior volume',def:'Fornecedores com mais recebimentos distintos em todo o histórico (a unidade é recebimento, não kg).',fonte:'Histórico Cocapec',limite:'Não muda com período nem armazém.',
    async calc(){const r=await GET('/api/painel/historico/indicadores');const L=r.fornecedoresMaiorVolume||[];
      if(!L.length)return{vazio:'O histórico ainda não foi carregado.',origens:{}};
      return{valor:L[0].fornecedor,texto:'O fornecedor com maior volume é <b>'+esc(L[0].fornecedor)+'</b> ('+nf0.format(L[0].recebimentos)+' recebimentos).',registros:'ranking do histórico completo',origens:{HISTORICO:1},linhas:L.slice(0,6).map(x=>[x.fornecedor,nf0.format(x.recebimentos)+' recebimentos'])};}},
  entregas:{nome:'Descargas concluídas',def:'Quantidade de descargas com saída registrada (um caminhão com 2 destinos conta 2).',fonte:'Descargas registradas na plataforma',
    async calc(i){const r=await op(i);const c=(r.cargasRecebidas||{}).total||0;
      if(!c)return{vazio:'Não há descargas concluídas neste filtro.',origens:r.origens};
      return{valor:nf0.format(c),texto:'Foram concluídas <b>'+nf0.format(c)+'</b> descarga(s).',registros:nf0.format(c)+' descarga(s)',origens:r.origens,linhas:(r.porArmazem||[]).map(a=>[a.armazem,nf0.format(a.cargas)])};}},
  sobra_falta:{nome:'Sobra ou falta de chapas',def:'Histórico: saldo mês a mês entre chapas presentes e necessárias pela norma do Dossiê, em diárias e em R$ ao piso. Plataforma: complemento pago (sobra) e produção acima do piso (falta).',fonte:'Histórico Cocapec e boletins da plataforma',limite:'O saldo do histórico é relativo ao próprio histórico (não o tamanho ideal absoluto) e é ordem de grandeza.',
    async calc(i){
      const h=await GET('/api/painel/dimensionamento/historico'+qs(qPeriodo(i.periodo))),t=h.totais||{};
      if(!(h.meses||[]).length)return{vazio:'Não há histórico de folha no período pedido (o pacote cobre só alguns meses).',origens:{}};
      return{valor:brl0(t.sobraReais)+' / '+brl0(t.faltaReais),texto:'No histórico há folga de <b>'+nf1.format(+t.sobraDiarias)+' diárias ('+brl0(t.sobraReais)+')</b> em alguns meses e pressão de <b>'+nf1.format(+t.faltaDiarias)+' diárias ('+brl0(t.faltaReais)+')</b> em outros, ao piso. O saldo líquido é '+brl0(t.saldoReais)+': há descompasso no tempo, não sobra nem falta permanente.',registros:nf0.format(h.meses.length)+' mês(es)',origens:{HISTORICO:1},linhas:(h.estacoes||[]).map(e=>[e.rotulo,sgn1(e.saldoDiarias)+' diárias · '+brl0(e.saldoReais)])};
    }},
  d1_resumo:{nome:'Planejamento D-1',def:'Entregas agendadas para o próximo dia operacional, distribuídas por horário e armazém, com nível de pressão.',fonte:'Agendamentos (plataforma) e equipe de referência dos boletins',limite:'Trabalha com níveis, não com número exato de chapas.',
    async calc(i){
      const data=await proxDiaOperacional();U.d1.data=data;const P=d1Calc(data,null),n=P.ags.length;
      if(!n)return{vazio:'Não há entregas agendadas para '+fmtBR(data)+'.',origens:{}};
      const al=[];P.linhas.forEach(L=>SLOTS.forEach(h=>{const k=L.slots[h].nivel.k;if(k==='ALTA'||k==='MODERADA')al.push(L.nome+' às '+h+': '+NIVEL_TXT[k].toLowerCase());}));
      const orig={};P.ags.forEach(a=>orig[a.origem]=(orig[a.origem]||0)+1);
      return{valor:nf0.format(n)+' entregas',texto:'Para <b>'+esc(DOW_LONGO[dow(data)])+', '+fmtBR(data)+'</b> há <b>'+n+'</b> entrega(s) agendada(s)'+(al.length?', com '+al.length+' alerta(s) de pressão.':', sem pressão moderada ou alta com a equipe de referência.'),registros:n+' agendamento(s)',origens:orig,
        linhas:[...SLOTS.map(h=>[h.slice(0,2)+'h',P.ags.filter(a=>a.horario===h).length+' entrega(s)']),...al.map(x=>['Alerta',x])],abrir:{rotulo:'Abrir o Planejamento D-1',painel:'d1'}};
    }},
  d1_porque:{nome:'Por que existe pressão (D-1)',def:'Explica quais agendamentos contribuem para os alertas de pressão do próximo dia operacional.',fonte:'Agendamentos (plataforma) e equipe de referência dos boletins',limite:'Trabalha com níveis, não com número exato de chapas.',
    async calc(i){
      const data=await proxDiaOperacional();U.d1.data=data;const P=d1Calc(data,null);const slots=i.periodoDia?D1_PERIODOS[i.periodoDia].slots:SLOTS;
      const al=[];P.linhas.forEach(L=>slots.forEach(h=>{const c=L.slots[h];if(['ALTA','MODERADA'].includes(c.nivel.k))al.push({L,h,c});}));
      const per=i.periodoDia?' '+D1_PERIODOS[i.periodoDia].nome.toLowerCase():'';
      if(!al.length)return{valor:'Sem pressão',texto:'Para '+fmtBR(data)+per+' <b>não há pressão moderada ou alta</b> com a equipe de referência. Entregas previstas: '+P.ags.length+'.',registros:P.ags.length+' agendamento(s)',origens:{},abrir:{rotulo:'Abrir o Planejamento D-1',painel:'d1'}};
      al.sort((a,b)=>(b.c.nivel.k==='ALTA')-(a.c.nivel.k==='ALTA'));const m=al[0];
      return{valor:NIVEL_TXT[m.c.nivel.k],texto:'<b>'+esc(m.L.nome)+' às '+m.h+'</b> concentra o maior nível ('+esc(NIVEL_TXT[m.c.nivel.k].toLowerCase())+'): '+m.c.need+' chapa(s) simultâneas exigidas pela norma para uma equipe de referência de '+m.L.team+'. Contribuem: '+m.c.itens.map(x=>codigoAg(x.ag.id)+' ('+esc(fornById(x.ag.fornecedorId).curto)+', '+ACOND[x.ag.acond].nome.toLowerCase()+')').join('; ')+'.',registros:al.length+' alerta(s) em '+fmtBR(data),origens:{},
        linhas:al.map(x=>[x.L.nome+' às '+x.h,NIVEL_TXT[x.c.nivel.k]+' · '+x.c.need+' chapa(s)']),abrir:{rotulo:'Ver no Planejamento D-1',painel:'d1'}};
    }}
};
const op=async i=>GET('/api/painel/operacao'+qs({...qPeriodo(i.periodo),armazemId:i.arm&&i.arm.id}));

async function perguntar(texto){
  const q=String(texto||'').trim();if(!q)return;
  const i=interpretar(q);const item={q,quando:nowLocal(),i};
  U.pg.hist.unshift(item);renderPanel('perguntar');
  if(!i.metrica){item.resp={naoEntendi:true};renderPanel('perguntar');return;}
  const m=METRICAS[i.metrica];
  try{item.resp=await m.calc(i);}catch(e){item.resp={erro:errTxt(e)};}
  renderPanel('perguntar');
}
function cartaoResposta(it){
  const i=it.i,m=i.metrica&&METRICAS[i.metrica],r=it.resp;
  let corpo;
  if(!r)corpo='<p class="muted">Calculando…</p>';
  else if(r.naoEntendi)corpo='<div class="callout warn">Não consegui ligar essa pergunta a uma das métricas permitidas, e não vou inventar um número. Tente uma destas:</div><div class="row" style="margin-top:8px">'+PERGUNTAS_EXEMPLO.map(p=>'<button class="chip info" style="border:0;cursor:pointer" data-act="pg-ex" data-q="'+esc(p)+'">'+esc(p)+'</button>').join('')+'</div>';
  else if(r.erro)corpo='<div class="callout bad">Não foi possível calcular: '+esc(r.erro)+'</div>';
  else{
    const orig=Object.keys(r.origens||{});
    corpo='<div class="row" style="margin-bottom:6px"><span class="chip info">Métrica: '+esc(m.nome)+'</span>'+(orig.length?orig.map(origBadge).join(' '):'<span class="badge teste">PLATAFORMA</span>')+'</div>'+
      (r.vazio?'<div class="callout warn">'+esc(r.vazio)+'</div>':'<div class="bignum num" style="font-size:34px">'+esc(r.valor)+'</div><p>'+r.texto+'</p>')+
      '<table class="mini" style="margin:10px 0"><tbody><tr><td class="muted">Interpretei</td><td>'+esc(m.nome)+'</td></tr>'+filtrosTxt(i).map(f=>'<tr><td class="muted">'+esc(f.split(':')[0])+'</td><td>'+esc(f.split(':').slice(1).join(':').trim())+'</td></tr>').join('')+(i.motivo?'<tr><td class="muted">motivo</td><td>'+esc(MOTIVOS_NR[i.motivo])+'</td></tr>':'')+(r.registros?'<tr><td class="muted">Registros considerados</td><td>'+esc(r.registros)+'</td></tr>':'')+'<tr><td class="muted">Origem</td><td>'+(orig.length?orig.map(o=>o==='HISTORICO'?'histórico Cocapec':o==='TESTE'?'dados de teste':'plataforma').join(' + '):'nova plataforma')+'</td></tr></tbody></table>'+
      (r.linhas&&r.linhas.length?'<details class="more"><summary>Detalhe</summary><table class="mini"><tbody>'+r.linhas.map(l=>'<tr><td>'+esc(l[0])+'</td><td class="r num">'+esc(l[1])+'</td></tr>').join('')+'</tbody></table></details>':'')+
      '<details class="more"><summary>Sobre este dado</summary><ul class="dl-list"><li><b>Fórmula:</b> '+esc(m.def)+'</li><li><b>Fonte:</b> '+esc(m.fonte)+'</li>'+(m.limite?'<li><b>Limitação:</b> '+esc(m.limite)+'</li>':'')+'</ul></details>'+
      (r.abrir?'<div class="row" style="margin-top:8px"><button class="btn sm" data-act="nav" data-r="'+r.abrir.painel+'">'+esc(r.abrir.rotulo)+'</button></div>':'');
  }
  return '<div class="panel" style="padding:18px"><div class="row" style="justify-content:space-between;align-items:flex-start"><b style="font:700 17px var(--f-disp)">“'+esc(it.q)+'”</b><span class="muted small num">'+esc(fmtTS(it.quando))+'</span></div>'+corpo+'</div>';
}
function viewPerguntar(){
  return head('Pergunte aos dados','Faça uma pergunta em linguagem natural sobre o que a solução já registra e calcula. A pergunta vira uma métrica permitida, o sistema calcula e a resposta mostra número, período, filtros e origem.','Quem usa: direção e gestores')+
  '<div class="panel" style="margin-bottom:20px"><form id="pg-form" autocomplete="off" class="row" style="gap:10px;flex-wrap:nowrap"><input type="text" id="pg-q" placeholder="Ex.: Quanto pagamos de complemento no Adubo em setembro?" aria-label="Pergunta" style="flex:1"><button class="btn primary" type="submit">Perguntar</button></form>'+
   '<div class="row" style="margin-top:10px">'+PERGUNTAS_EXEMPLO.map(p=>'<button class="chip info" style="border:0;cursor:pointer" data-act="pg-ex" data-q="'+esc(p)+'">'+esc(p)+'</button>').join('')+'</div>'+
   '<p class="hint" style="margin-top:12px"><b>Arquitetura segura:</b> pergunta → interpretação → métrica permitida → cálculo → resposta com número, período, filtros e origem. A interpretação não calcula nem inventa números e não executa SQL livre. Hoje ela usa regras locais; um modelo de linguagem pode entrar nesse ponto escolhendo apenas uma métrica do catálogo.</p></div>'+
  (U.pg.hist.length?'<div class="stack">'+U.pg.hist.map(cartaoResposta).join('')+'</div>':'<div class="empty">Faça a primeira pergunta ou clique em um exemplo.</div>')+
  '<div class="sec"><details class="panel"><summary style="cursor:pointer;font:700 19px var(--f-disp)">Métricas que a direção pode consultar</summary><ul class="dl-list" style="margin-top:12px">'+Object.values(METRICAS).map(m=>'<li><b>'+esc(m.nome)+'</b>: '+esc(m.def)+' <span class="muted">Fonte: '+esc(m.fonte)+'.</span></li>').join('')+'</ul></details></div>';
}
Object.assign(ACT,{'pg-ex'(t){const el=$('#pg-q');if(el)el.value=t.dataset.q;return perguntar(t.dataset.q);}});
document.addEventListener('submit',e=>{if(e.target.id==='pg-form'){e.preventDefault();const q=$('#pg-q').value;$('#pg-q').value='';perguntar(q);}});
VIEWS.perguntar=viewPerguntar;
