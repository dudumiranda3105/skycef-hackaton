'use strict';
/* Tarefa 3: painel gerencial. Todos os números vêm de /api/painel/*; cada um declara a origem
   (HISTORICO, PLATAFORMA ou TESTE) e abre, em "Ver cálculo", de onde vem e como foi feito. */

const F_PED='pedido_recebimento_notafiscal.xlsx', F_CHA='chapas_por_dia.csv';
const ARM_COR={'Loja':'var(--blue)','Adubo':'var(--green)','Insumos':'var(--yellow-deep)','Pátio de Máquinas':'var(--palet)'};
const P={histAll:null,hist:null,indic:null,op:null,plat:null,erro:null,carregando:false,tok:0};
U.pf={from:null,to:null,arm:'Todos',teste:true,tab:'hist'};
let ORIG={};

const mesAtual=()=>hojeISO().slice(0,7);
const primeiroMes=()=>{const m=P.histAll&&P.histAll.meses&&P.histAll.meses[0];return m?m.mes:addDays(hojeISO(),-60).slice(0,7);};
const ultimoMes=()=>{const L=P.histAll&&P.histAll.meses||[];const m=L.length?L[L.length-1].mes:'0000-00';return m>mesAtual()?m:mesAtual();};
const mesesFiltro=()=>monthsBetween(primeiroMes(),ultimoMes());
const isOM=ym=>{const n=+ym.slice(5);return n>=10||n<=3;};          /* safra: out a mar */
const absS=s=>String(s==null?'':s).replace('-','');
const origTxt=o=>Object.entries(o||{}).map(([k,v])=>nf0.format(v)+' '+k.toLowerCase()).join(' + ')||'nenhum registro';
const origDe=o=>Object.keys(o||{}).includes('TESTE')?'TESTE':'PLATAFORMA';

function initPf(){const f=U.pf;if(!f.from){f.from=primeiroMes();f.to=ultimoMes();}}
function pfQuery(f){
  const q={de:f.from+'-01',ate:lastDayOfMonth(f.to)};
  return{q,qp:{...q,armazemId:f.arm==='Todos'?null:f.arm,origem:f.teste?null:'PLATAFORMA'}};
}
async function carregarPainel(){
  const tok=++P.tok;P.carregando=true;P.erro=null;
  if(U.route==='painel'&&P.hist)renderPanel('painel');
  try{
    if(!P.histAll)P.histAll=await GET('/api/painel/dimensionamento/historico');
    initPf();const f=U.pf,{q,qp}=pfQuery(f);
    const [hist,indic,op,plat]=await Promise.all([
      GET('/api/painel/dimensionamento/historico'+qs(q)),
      P.indic||GET('/api/painel/historico/indicadores'),
      GET('/api/painel/operacao'+qs(qp)),
      GET('/api/painel/dimensionamento/plataforma'+qs({...qp,agrupar:'mes'}))]);
    if(tok!==P.tok)return;
    Object.assign(P,{hist,indic,op,plat});
    if(hist&&hist.piso)S.piso=hist.piso;
  }catch(e){if(tok===P.tok)P.erro=errTxt(e);}
  if(tok===P.tok){P.carregando=false;if(U.route==='painel')renderPanel('painel');renderHome();}
}
async function carregarResumoHome(){
  try{P.histAll=await GET('/api/painel/dimensionamento/historico');if(P.histAll.piso)S.piso=P.histAll.piso;}catch(e){}
  renderHome();
}

/* ---------- gráficos (SVG) ---------- */
function chartDiverging(items){
  const n=items.length,step=44,bw=28,mL=36,mR=6,mT=22,mB=40,H=290,W=mL+mR+step*n;
  const maxv=Math.max(10,...items.filter(i=>i.dif!=null).map(i=>Math.abs(i.dif)));
  const tick=maxv>120?50:maxv>60?25:maxv>25?10:5,top=Math.ceil(maxv/tick)*tick;
  const ph=H-mT-mB,y0=mT+ph/2,k=(ph/2)/top;
  let s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Saldo mensal de diárias frente à necessidade pelo histórico de recebimentos"><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--line)" stroke-width="2"/></pattern></defs>';
  items.forEach((it,i)=>{if(isOM(it.ym))s+='<rect class="band" x="'+(mL+i*step)+'" y="'+mT+'" width="'+step+'" height="'+ph+'"/>';});
  for(let v=-top;v<=top;v+=tick){const y=y0-v*k;s+='<line class="'+(v===0?'z':'ln')+'" x1="'+mL+'" x2="'+(W-mR)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(mL-6)+'" y="'+(y+4)+'" text-anchor="end">'+(v>0?'+':v<0?'−':'')+Math.abs(v)+'</text>';}
  items.forEach((it,i)=>{
    const x=mL+i*step+(step-bw)/2,cx=x+bw/2;
    if(it.dif==null){s+='<rect class="hatch" x="'+x+'" y="'+mT+'" width="'+bw+'" height="'+ph+'"><title>'+mLabel(it.ym)+': sem dado de folha</title></rect>';}
    else{const h=Math.abs(it.dif)*k;
      s+='<rect class="'+(it.dif>=0?'bar-pos':'bar-neg')+'" x="'+x+'" y="'+(it.dif>=0?y0-h:y0)+'" width="'+bw+'" height="'+Math.max(h,0.5)+'" rx="2"><title>'+mLabel(it.ym)+': '+sgn1(it.dif)+' diárias</title></rect>'+
         '<text class="v" x="'+cx+'" y="'+(it.dif>=0?y0-h-5:y0+h+13)+'" text-anchor="middle">'+sgn1(it.dif)+'</text>';}
    s+='<text x="'+cx+'" y="'+(H-mB+16)+'" text-anchor="middle">'+MES[+it.ym.slice(5)-1]+'</text>'+(it.ym.slice(5)==='01'||i===0?'<text x="'+cx+'" y="'+(H-mB+30)+'" text-anchor="middle" style="font-weight:600">'+it.ym.slice(0,4)+'</text>':'');
  });
  return s+'</svg>';
}
function chartSazonal(arr){
  const step=46,bw=26,dx=9,dy=6,mL=36,mT=26,mB=26,H=214,W=mL+12*step+dx+6;const mx=Math.max(1,...arr),stp=mx>400?100:mx>150?50:10,top=Math.ceil(mx/stp)*stp,ph=H-mT-mB;
  let s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Média mensal de recebimentos por mês do ano">';
  for(let m=1;m<=12;m++)if(isOM('2000-'+pad(m)))s+='<rect class="band" x="'+(mL+(m-1)*step)+'" y="'+mT+'" width="'+step+'" height="'+ph+'"/>';
  for(let v=0;v<=top;v+=stp){const y=mT+ph-v/top*ph;s+='<line class="ln" x1="'+mL+'" x2="'+(W-4)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(mL-5)+'" y="'+(y+4)+'" text-anchor="end">'+v+'</text>';}
  const pico=arr.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,4).map(x=>x[1]);
  arr.forEach((v,i)=>{
    const h=v/top*ph,x=mL+i*step+(step-bw)/2,y=mT+ph-h,pk=pico.includes(i),c=pk?'var(--yellow-deep)':'var(--palet)';
    s+='<g><title>'+MES[i]+': média de '+nf0.format(v)+' recebimentos-destino</title>'+
      '<polygon points="'+(x+bw)+','+y+' '+(x+bw+dx)+','+(y-dy)+' '+(x+bw+dx)+','+(y+h-dy)+' '+(x+bw)+','+(y+h)+'" style="fill:color-mix(in srgb,'+c+' 62%,#000)"/>'+
      '<polygon points="'+x+','+y+' '+(x+dx)+','+(y-dy)+' '+(x+bw+dx)+','+(y-dy)+' '+(x+bw)+','+y+'" style="fill:color-mix(in srgb,'+c+' 70%,#fff)"/>'+
      '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" style="fill:'+c+'"/></g>'+
      '<text class="v" x="'+(x+(bw+dx)/2)+'" y="'+(y-dy-4)+'" text-anchor="middle">'+nf0.format(v)+'</text><text x="'+(x+(bw+dx)/2)+'" y="'+(H-8)+'" text-anchor="middle">'+MES[i]+'</text>';
  });
  return s+'</svg>';
}
function chartIso(items){
  const Wd=38,Dp=38,GAP=34,HMAX=120,mx=Math.max(1,...items.map(i=>i.v));
  const Pt=(x,y,z)=>[(x-y)*0.866,(x+y)*0.5-z];
  const boxes=items.map((it,i)=>{const x=i*(Wd+GAP),y=0,h=Math.max(10,it.v/mx*HMAX);
    return{it,h,a:Pt(x,y,h),b:Pt(x+Wd,y,h),c:Pt(x+Wd,y+Dp,h),d:Pt(x,y+Dp,h),e:Pt(x,y+Dp,0),f:Pt(x+Wd,y+Dp,0),g:Pt(x+Wd,y,0)};});
  const pts=boxes.flatMap(b=>[b.a,b.b,b.c,b.d,b.e,b.f,b.g]);
  const minX=Math.min(...pts.map(p=>p[0]))-36,maxX=Math.max(...pts.map(p=>p[0]))+36,minY=Math.min(...pts.map(p=>p[1]))-48,maxY=Math.max(...pts.map(p=>p[1]))+20;
  const poly=ps=>ps.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  let s='<svg class="iso" viewBox="'+minX.toFixed(0)+' '+minY.toFixed(0)+' '+(maxX-minX).toFixed(0)+' '+(maxY-minY).toFixed(0)+'" role="img" aria-label="Blocos 3D: altura proporcional aos recebimentos de cada armazém">';
  boxes.forEach(b=>{const col=b.it.cor,op=b.it.sel?'':'opacity:.5;';
    s+='<g style="'+op+'"><title>'+esc(b.it.l)+': '+nf0.format(b.it.v)+' recebimentos-destino</title>'+
      '<polygon points="'+poly([b.d,b.c,b.f,b.e])+'" style="fill:'+col+'"/>'+
      '<polygon points="'+poly([b.c,b.b,b.g,b.f])+'" style="fill:color-mix(in srgb,'+col+' 62%,#000)"/>'+
      '<polygon points="'+poly([b.a,b.b,b.c,b.d])+'" style="fill:color-mix(in srgb,'+col+' 68%,#fff)"/></g>';});
  boxes.forEach(b=>{const cx=((b.a[0]+b.c[0])/2).toFixed(1),y=b.a[1];
    s+='<text class="s" x="'+cx+'" y="'+(y-3).toFixed(1)+'" text-anchor="middle">'+b.it.pct+'</text><text x="'+cx+'" y="'+(y-15).toFixed(1)+'" text-anchor="middle">'+nf0.format(b.it.v)+'</text><text x="'+cx+'" y="'+(y-28).toFixed(1)+'" text-anchor="middle" style="font-weight:700">'+esc(b.it.short||b.it.l)+'</text>';});
  return s+'</svg>';
}
function barsHtml(items,fmt,cls){
  const mx=Math.max(1,...items.map(i=>i[1]));
  return '<div class="bars">'+items.map(([l,v])=>'<div class="bar '+(cls||'')+'"><span>'+esc(l)+'</span><div class="t"><i style="width:'+(v/mx*100)+'%"></i></div><span class="num r">'+(fmt?fmt(v):nf0.format(v))+'</span></div>').join('')+'</div>';
}
const srcLine=(k,orig,txt)=>'<div class="src">'+origBadge(orig)+'<span class="st">'+txt+'</span><button class="lnk" data-act="origem" data-k="'+k+'">Ver cálculo</button></div>';
const kpiCard=(k,l,v,s,orig,fonte)=>'<div class="kpi"><span class="l">'+l+'</span><span class="v num">'+v+'</span><span class="s">'+s+'</span>'+srcLine(k,orig,fonte)+'</div>';
const statTile=(l,v,s)=>'<div class="stat"><span class="l">'+l+'</span><span class="v num">'+v+'</span><span class="s">'+s+'</span></div>';
const sitChip=s=>'<span class="chip '+(s==='SOBRA'?'ok':s==='FALTA'?'bad':s==='EQUILIBRADO'?'info':'')+'">'+({SOBRA:'Sobra',FALTA:'Falta',EQUILIBRADO:'Equilibrado',SEM_DADOS:'Sem dados'}[s]||esc(s))+'</span>';

/* sazonalidade: média por mês do ano nos anos completos do histórico, a partir de demandaPorMesEArmazem */
function sazonalidade(arm){
  const L=(P.histAll&&P.histAll.demandaPorMesEArmazem)||[];
  const tot=new Map(),sel=new Map();
  L.forEach(r=>{tot.set(r.mes,(tot.get(r.mes)||0)+r.recebimentos);if(arm==='Todos'||String(r.armazemId)===String(arm))sel.set(r.mes,(sel.get(r.mes)||0)+r.recebimentos);});
  const anos=[...new Set([...tot.keys()].map(m=>m.slice(0,4)))];
  const completos=anos.filter(y=>monthsBetween(y+'-01',y+'-12').every(m=>tot.has(m)));
  const base=completos.length?completos:anos;
  const med=Array.from({length:12},(_,i)=>{const vs=base.map(y=>sel.get(y+'-'+pad(i+1))).filter(v=>v!=null);return vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:0;});
  return{med,anos:base,completos:completos.length>0};
}

function viewPainel(){
  const f=U.pf;ORIG={};
  if(P.erro&&!P.hist)return head('Painel gerencial','A quantidade de chapas está sobrando ou faltando, e quanto isso vale em reais?','Quem usa: direção e gestores')+'<div class="callout bad">Não foi possível carregar o painel: '+esc(P.erro)+' <button class="btn sm" data-act="pf-retry">Tentar de novo</button></div>';
  if(!P.hist||!f.from)return head('Painel gerencial','A quantidade de chapas está sobrando ou faltando, e quanto isso vale em reais?','Quem usa: direção e gestores')+'<div class="empty">Carregando os indicadores…</div>';
  const H=P.hist,I=P.indic||{},O=P.op||{},Z=P.plat||{};
  const piso=brl4(S.piso);
  const perTxt=mLabel(f.from)+' a '+mLabel(f.to);
  const armTxt=f.arm==='Todos'?'todos os armazéns':armNome(Number(f.arm));
  const meses=H.meses||[];
  const oPl=origDe(O.origens),oBol=origDe(Z.origens);
  const diasTot=sum(meses,'diasUteis');
  const evTot=meses.reduce((s,m)=>s+m.recebimentosPorDia*m.diasUteis,0);
  const chapTot=meses.reduce((s,m)=>s+m.chapasPorDia*m.diasUteis,0);
  const tot=H.totais||{},est=H.estacoes||[];
  const safra=est.find(e=>e.estacao==='SAFRA'),ent=est.find(e=>e.estacao==='ENTRESSAFRA');
  const optM=mesesFiltro().map(m=>[m,mLabel(m)]);

  /* ---------- bloco central ---------- */
  let core,srcCentral;
  if(f.tab==='hist'){
    if(meses.length){
      const sobraD=+tot.sobraDiarias,faltaD=+tot.faltaDiarias;
      const descompasso=sobraD>0&&faltaD>0&&safra&&ent&&(safra.saldoDiarias*ent.saldoDiarias<0);
      const liquido=+tot.saldoReais;
      const titulo=descompasso?'Não há sobra nem falta permanente: a equipe está mal distribuída no tempo':liquido>0?'Folga relativa no período':liquido<0?'Pressão relativa (falta) no período':'Equipe equilibrada no período';
      const texto=descompasso?('Na '+(safra.saldoDiarias>0?'safra (out a mar)':'entressafra (abr a set)')+' a equipe fica folgada ('+sgn1(Math.max(safra.saldoDiarias,ent.saldoDiarias))+' diárias) e na '+(safra.saldoDiarias>0?'entressafra (abr a set)':'safra (out a mar)')+' fica apertada ('+sgn1(Math.min(safra.saldoDiarias,ent.saldoDiarias))+'). O que sobra em um período falta no outro.')
        :'O saldo é relativo ao próprio histórico: mostra se a equipe acompanhou a demanda, não o tamanho absoluto ideal. O absoluto vem do boletim da plataforma.';
      const menor=Math.min(sobraD,faltaD)===sobraD?{d:tot.sobraDiarias,r:tot.sobraReais}:{d:tot.faltaDiarias,r:tot.faltaReais};
      const cen=H.cenarios||[];
      ORIG.saldo={t:'Sobra ou falta de chapas (histórico)',b:'HISTORICO',
        fontes:[F_PED+': Data Recebimento, Nº Recebimento e Depósito (o depósito vira armazém físico)',F_CHA+': chapas presentes − chapas na operação do café, só dias úteis'],
        passos:['Recebimentos-destino únicos por dia e armazém ('+nf0.format(evTot)+' em '+perTxt+')',
          'Esforço de cada recebimento pela norma do Dossiê por armazém (pessoa-minutos): Adubo 225, Insumos 100, Pátio de Máquinas 17,5, Loja 0',
          'Equilíbrio do histórico: '+nf1.format(H.equilibrio.pessoaMinutosPorChapaDia)+' pessoa-minutos por chapa-dia, calculado em '+nf0.format(H.equilibrio.diasUteisAnalisados)+' dias úteis. Recortes de período não o alteram',
          'Chapas necessárias do mês = esforço do mês ÷ equilíbrio; saldo = chapas presentes − necessárias (em diárias)',
          'Folga = soma dos meses com saldo positivo ('+nf1.format(sobraD)+' diárias); pressão = soma dos meses com saldo negativo ('+nf1.format(faltaD)+' diárias)',
          'Em reais: diárias × piso do boletim ('+piso+'): folga '+brl2(tot.sobraReais)+', pressão '+brl2(tot.faltaReais)+', saldo '+brl2(tot.saldoReais)],
        notas:(H.limitacoes||[]).concat(['É uma faixa de sensibilidade ao piso, não economia comprovada: a remuneração real de cada dia é o total a pagar do boletim.'])};
      ORIG.valor={t:'Valor em reais do desalinhamento',b:'HISTORICO',
        fontes:['Resultado do cálculo anterior (diárias de folga e de pressão)','Piso do boletim: '+piso+' por diária equivalente (Dossiê, seção 8)'],
        passos:[nf1.format(sobraD)+' diárias de folga × '+piso+' = '+brl2(tot.sobraReais),nf1.format(faltaD)+' diárias de pressão × '+piso+' = '+brl2(tot.faltaReais)].concat(cen.map(c=>c.nome+' ('+nf1.format(c.pessoaMinutosPorChapaDia)+' pessoa-min por chapa-dia): folga '+brl2(c.sobraReais)+' · pressão '+brl2(c.faltaReais)+' · saldo '+brl2(c.saldoReais))),
        notas:['Ordem de grandeza, não economia comprovada. A folha consolidada não diz se cada presença foi meia ou completa.','Folga é capacidade que pode ser realocada (carregamento de cooperados, outros setores), não ociosidade.']};
      srcCentral=srcLine('saldo','HISTORICO',F_PED+' ÷ '+F_CHA+' · '+perTxt+' · todos os armazéns');
      const fimHist=P.histAll&&P.histAll.meses&&P.histAll.meses.length?P.histAll.meses[P.histAll.meses.length-1].mes:f.to;
      const items=monthsBetween(f.from,f.to<fimHist?f.to:fimHist).map(ym=>{const r=meses.find(x=>x.mes===ym);return{ym,dif:r?r.saldoDiarias:null};});
      const corBig=descompasso?'':(liquido>=0?'pos':'neg');
      core='<div class="core"><div class="answer"><div class="a-left"><span class="badge hist">HISTÓRICO · baseline</span><h2>'+esc(titulo)+'</h2><p>'+esc(texto)+'</p></div><div class="a-right"><div class="bignum num '+corBig+'">'+nf1.format(+menor.d)+'<small style="font:500 15px var(--f-ui);color:var(--ink-2)"> diárias</small></div><div class="rs num">'+brl0(menor.r)+' a realocar</div><p class="muted small">Folga '+brl0(tot.sobraReais)+' ('+nf1.format(sobraD)+' diárias) · pressão '+brl0(tot.faltaReais)+' ('+nf1.format(faltaD)+' diárias), ao piso de '+piso+'. Ordem de grandeza, não economia comprovada. <button class="lnk" data-act="origem" data-k="valor">Ver cálculo</button></p></div></div>'+
       '<div class="stats">'+statTile('Dias úteis analisados',nf0.format(diasTot),perTxt)+statTile('Recebimentos por dia',diasTot?nf1.format(evTot/diasTot):'—','recebimentos-destino por dia útil')+statTile('Chapas por dia',diasTot?nf1.format(chapTot/diasTot):'—','presentes − café, média do período')+statTile('Equipe × demanda',H.robustez&&H.robustez.correlacaoEquipeEDemanda!=null?nf2.format(H.robustez.correlacaoEquipeEDemanda):'—','correlação diária: perto de 0 = a equipe não acompanha a demanda')+'</div>'+
       '<div class="tscroll"><div style="min-width:760px">'+chartDiverging(items)+'</div></div>'+
       '<div class="legend"><span><i class="sw" style="background:var(--folga)"></i>Folga relativa</span><span><i class="sw" style="background:var(--pressao)"></i>Pressão relativa</span><span><i class="sw" style="background:var(--band);border:1px solid var(--line)"></i>Safra (out a mar)</span><span>Hachurado: sem folha de chapas no mês</span></div>'+
       '<div><div class="sec-t">Os números de cada estação</div><div class="tscroll"><table class="mini"><thead><tr><th>Estação</th><th class="r">Dias úteis</th><th class="r">Recebimentos por dia</th><th class="r">Chapas por dia</th><th class="r">Saldo (diárias)</th><th class="r">Saldo em R$</th></tr></thead><tbody>'+
         est.map(e=>'<tr><td>'+esc(e.rotulo)+'</td><td class="r num">'+nf0.format(e.diasUteis)+'</td><td class="r num">'+nf1.format(e.recebimentosPorDia)+'</td><td class="r num">'+nf1.format(e.chapasPorDia)+'</td><td class="r num"><b class="'+(e.saldoDiarias>=0?'pos':'neg')+'">'+sgn1(e.saldoDiarias)+'</b></td><td class="r num">'+brl0(e.saldoReais)+'</td></tr>').join('')+'</tbody></table></div></div>'+
       '<div><div class="sec-t">Os números de cada mês</div><div class="tscroll"><table class="mini"><thead><tr><th>Mês</th><th class="r">Dias úteis</th><th class="r">Recebimentos por dia</th><th class="r">Chapas por dia</th><th class="r">Necessárias por dia</th><th class="r">Saldo (diárias)</th><th class="r">Saldo em R$</th><th>Situação</th></tr></thead><tbody>'+
         meses.map(r=>'<tr><td>'+mLabel(r.mes)+'</td><td class="r num">'+r.diasUteis+'</td><td class="r num">'+nf1.format(r.recebimentosPorDia)+'</td><td class="r num">'+nf1.format(r.chapasPorDia)+'</td><td class="r num">'+nf1.format(r.chapasNecessariasPorDia)+'</td><td class="r num"><b class="'+(r.saldoDiarias>=0?'pos':'neg')+'">'+sgn1(r.saldoDiarias)+'</b></td><td class="r num">'+brl0(r.saldoReais)+'</td><td>'+sitChip(r.situacao)+'</td></tr>').join('')+
         '</tbody></table></div><p class="muted small" style="margin-top:6px">Saldo em R$ = saldo em diárias × '+piso+' (piso do boletim). Situação: sobra ou falta acima de 10% da equipe do mês.</p></div>'+
       (cen.length?'<div><div class="sec-t">Sensibilidade: e se o ponto de equilíbrio fosse outro?</div><div class="tscroll"><table class="mini"><thead><tr><th>Cenário</th><th class="r">Pessoa-min por chapa-dia</th><th class="r">Folga</th><th class="r">Pressão</th><th class="r">Saldo</th></tr></thead><tbody>'+cen.map(c=>'<tr><td>'+esc(c.nome)+'</td><td class="r num">'+nf1.format(c.pessoaMinutosPorChapaDia)+'</td><td class="r num">'+brl0(c.sobraReais)+'</td><td class="r num">'+brl0(c.faltaReais)+'</td><td class="r num"><b class="'+(+c.saldoReais>=0?'pos':'neg')+'">'+brl0(c.saldoReais)+'</b></td></tr>').join('')+'</tbody></table></div></div>':'')+
       '<div class="callout warn"><b>Para ler com cuidado</b><ul class="dl-list" style="margin:6px 0 0">'+(H.limitacoes||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div></div>';
    }else{
      core='<div class="empty">Sem histórico no período filtrado. A folha de chapas e os recebimentos do pacote cobrem apenas alguns meses; ajuste o período ou carregue o pacote (README, “Carregar dados”).</div>';
      srcCentral=srcLine('saldo','HISTORICO',F_PED+' ÷ '+F_CHA);
    }
  }else{
    const T=Z.total||{boletins:0};
    ORIG.plat={t:'Sobra e falta pelos boletins (plataforma)',b:oBol,
      fontes:['Boletim diário: produção, diárias equivalentes, total a pagar e complemento de cada boletim ('+nf0.format(T.boletins||0)+' no filtro)','Piso do boletim: '+piso+' por diária equivalente'],
      passos:['Sobra em R$ = soma do complemento pago (diária garantida sem produção que a justifique)','Falta em R$ = soma de (produção − piso × diárias) nos dias em que a produção passou do piso (equipe curta para a demanda do dia)','Aproveitamento = produção ÷ (piso × diárias): abaixo de 0,90 é sobra, acima de 1,10 é falta','Resultado do filtro: sobra '+brl2(T.sobraReais)+' · falta '+brl2(T.faltaReais)+' · aproveitamento '+(T.aproveitamento!=null?nf2.format(+T.aproveitamento):'—')],
      notas:['Só entram dias com boletim salvo. Boletins inconsistentes (produção sem diárias) são contados, mas ficam fora dos valores.','A mesma matrícula em dois boletins no mesmo dia é paga em cada boletim; o efetivo distinto do dia conta a pessoa uma vez.','Folga é capacidade realocável, não ociosidade.']};
    srcCentral=srcLine('plat',oBol,'Boletim diário · '+perTxt+' · '+armTxt);
    const sit=T.situacao,al=Z.alertas||{};
    core=(T.boletins?
     '<div class="core"><div class="answer"><div class="a-left"><span class="badge '+(oBol==='TESTE'?'teste':'plat')+'">'+(f.teste?'PLATAFORMA + TESTE':'PLATAFORMA')+'</span><h2>'+({SOBRA:'Sobra de equipe: a produção ficou abaixo do piso',FALTA:'Falta de equipe: a produção passou do piso',EQUILIBRADO:'Equipe alinhada à produção',SEM_DADOS:'Sem diárias válidas no filtro'}[sit]||'')+'</h2><p>Sobra é o complemento pago para completar o piso; falta é a produção acima do piso, sinal de equipe curta para a demanda do dia. Só entram os dias com boletim.</p></div><div class="a-right"><div class="bignum num '+(sit==='FALTA'?'neg':'pos')+'">'+brl0(sit==='FALTA'?T.faltaReais:T.sobraReais)+'</div><div class="rs num">'+brl0(sit==='FALTA'?T.sobraReais:T.faltaReais)+(sit==='FALTA'?' de sobra':' de falta')+'</div><p class="muted small">Sobra = complemento pago. Falta = produção acima do piso de '+piso+' por diária. Capacidade realocável, não ociosidade.</p></div></div>'+
     '<div class="stats">'+statTile('Boletins considerados',nf0.format(T.boletins),origTxt(Z.origens)+(T.boletinsInconsistentes?' · '+T.boletinsInconsistentes+' inconsistente(s)':''))+statTile('Diárias equivalentes',nf1.format(+T.diariasEquivalentes),'completas + 0,5 × meias')+statTile('Total a pagar',brl2(T.totalAPagar),'produção + complemento (custo da operação)')+statTile('Aproveitamento',T.aproveitamento!=null?nf2.format(+T.aproveitamento):'—','produção ÷ (piso × diárias): < 0,90 sobra · > 1,10 falta')+'</div>'+
     (al.matriculasEmMaisDeUmBoletimNoMesmoDia>0?'<div class="callout warn">'+al.matriculasEmMaisDeUmBoletimNoMesmoDia+' matrícula(s) aparecem em mais de um boletim no mesmo dia. Cada boletim paga as suas diárias; o efetivo distinto do dia conta a pessoa uma única vez.</div>':'')+
     '<div class="tscroll"><table class="mini"><thead><tr><th>Armazém</th><th class="r">Boletins</th><th class="r">Diárias</th><th class="r">Produção</th><th class="r">Total a pagar</th><th class="r">Sobra (R$)</th><th class="r">Falta (R$)</th><th class="r">Aproveitamento</th><th>Situação</th></tr></thead><tbody>'+(Z.porArmazem||[]).map(r=>'<tr><td>'+esc(r.armazem)+'</td><td class="r num">'+r.boletins+(r.boletinsInconsistentes?' <span class="chip warn">'+r.boletinsInconsistentes+' inc.</span>':'')+'</td><td class="r num">'+nf1.format(+r.diariasEquivalentes)+'</td><td class="r num">'+brl2(r.producao)+'</td><td class="r num">'+brl2(r.totalAPagar)+'</td><td class="r num">'+brl2(r.sobraReais)+'</td><td class="r num">'+brl2(r.faltaReais)+'</td><td class="r num">'+(r.aproveitamento!=null?nf2.format(+r.aproveitamento):'—')+'</td><td>'+sitChip(r.situacao)+'</td></tr>').join('')+'</tbody></table></div>'+
     ((Z.porPeriodo||[]).length?'<div><div class="sec-t">Mês a mês</div><div class="tscroll"><table class="mini"><thead><tr><th>Mês</th><th>Armazém</th><th class="r">Boletins</th><th class="r">Sobra (R$)</th><th class="r">Falta (R$)</th><th>Situação</th></tr></thead><tbody>'+Z.porPeriodo.map(r=>'<tr><td>'+esc(/^\d{4}-\d{2}$/.test(r.periodo)?mLabel(r.periodo):r.periodo)+'</td><td>'+esc(r.armazem)+'</td><td class="r num">'+r.boletins+'</td><td class="r num">'+brl2(r.sobraReais)+'</td><td class="r num">'+brl2(r.faltaReais)+'</td><td>'+sitChip(r.situacao)+'</td></tr>').join('')+'</tbody></table></div></div>':'')+'</div>':
     '<div class="empty">Sem boletins no filtro. Salve boletins no módulo Boletim diário para ver sobra e falta pelo custo real da equipe.'+(f.teste?'':' Marque “Incluir dados de teste” para ver a demonstração.')+'</div>');
  }

  /* ---------- peso dos armazéns (3D) ---------- */
  const A=(H.armazens||[]);const totEv=sum(A,'recebimentos');
  const armRows=A.map(a=>({l:a.armazem,short:a.armazem==='Pátio de Máquinas'?'Pátio':a.armazem,v:a.recebimentos,cor:ARM_COR[a.armazem]||'var(--blue)',sel:f.arm==='Todos'||Number(f.arm)===a.armazemId,pct:totEv?nf1.format(a.recebimentos/totEv*100)+'%':'—',a})).sort((x,y)=>y.v-x.v);
  ORIG.arm={t:'Peso de cada armazém nos recebimentos',b:'HISTORICO',
    fontes:[F_PED+': Data Recebimento, Nº Recebimento e Depósito',F_CHA+': presenças diárias (a folha não distingue o armazém de cada chapa)'],
    passos:['Depósitos viram armazéns: MATFerti e MATFert2 → Adubo; MATDefe, MATDef2, MATGeral e MATGer2 → Insumos; MATMaq → Pátio de Máquinas; MATLoja → Loja','Cada armazém: recebimentos únicos em '+perTxt,'Esforço = recebimentos × norma do Dossiê (pessoa-minutos por recebimento), com uma premissa de acondicionamento por armazém','Participação na necessidade = esforço do armazém ÷ esforço total; a folga e a pressão em R$ são repartidas por essa participação'].concat(armRows.map(r=>r.l+': '+r.a.premissa)),
    notas:['A parcela por armazém é uma repartição do saldo total, não o número de pessoas realmente alocadas em cada local: o histórico não registra isso.','Linhas de depósitos fora do mapeamento do Dossiê ficam de fora da quebra por armazém.']};
  const pesoHtml='<div class="panel"><h2>Peso de cada armazém nos recebimentos</h2><p class="lead">A altura do bloco é proporcional aos recebimentos-destino do período filtrado. A tabela reparte a folga e a pressão pela necessidade de cada armazém.</p>'+(armRows.length?'<div class="iso-wrap">'+chartIso(armRows)+
    '<div class="tscroll"><table class="mini"><thead><tr><th>Armazém</th><th class="r">Recebimentos</th><th class="r">Parte da necessidade</th><th class="r">Parcela da folga</th><th class="r">Parcela da pressão</th></tr></thead><tbody>'+armRows.map(r=>'<tr><td><span class="dot" style="background:'+r.cor+'"></span> '+esc(r.l)+'</td><td class="r num">'+nf0.format(r.v)+'</td><td class="r num">'+nf1.format(r.a.participacaoNaNecessidade*100)+'%</td><td class="r num">'+brl0(r.a.parcelaDaSobraReais)+'</td><td class="r num">'+brl0(r.a.parcelaDaFaltaReais)+'</td></tr>').join('')+'<tr class="sum"><td>Total</td><td class="r num">'+nf0.format(totEv)+'</td><td class="r num">100%</td><td class="r num">'+brl0(tot.sobraReais)+'</td><td class="r num">'+brl0(tot.faltaReais)+'</td></tr></tbody></table></div></div>':'<div class="empty">Sem recebimentos históricos no período.</div>')+
    '<p class="muted small" style="margin-top:6px">A quebra por armazém não depende de quantas pessoas ficam em cada local, informação que a folha não traz.</p>'+srcLine('arm','HISTORICO',F_PED+' · '+perTxt)+'</div>';

  /* ---------- indicadores com fonte ---------- */
  const cr=O.cargasRecebidas||{total:0},esp=O.tempoMedioEsperaMin||{},dur=O.tempoMedioDescargaMin||{},chap=O.chapasPorRecebimento||{},custo=O.custoDaOperacao||{};
  ORIG.cargas={t:'Cargas recebidas por dia (histórico)',b:'HISTORICO',fontes:[F_PED+': Data Recebimento, Nº Recebimento, Depósito',F_CHA+': dias úteis com folha'],
    passos:['Recebimentos-destino únicos em '+perTxt+': '+nf0.format(evTot),'Dias úteis com folha de chapas: '+nf0.format(diasTot),'Média = '+nf0.format(evTot)+' ÷ '+nf0.format(diasTot)+' = '+(diasTot?nf1.format(evTot/diasTot):'—')+' por dia útil'],
    notas:['Um caminhão com dois destinos conta duas vezes: cada destino é uma descarga.','Uma linha da planilha é um item de pedido, não um caminhão; por isso a unidade é o recebimento-destino (documental).']};
  ORIG.desc={t:'Descargas concluídas (plataforma)',b:oPl,fontes:['Descarga: saída preenchida','Agendamento: origem do registro'],
    passos:['Descargas com saída registrada em '+perTxt+', '+armTxt+': '+nf0.format(cr.total)+' ('+origTxt(O.origens)+')'],notas:[cr.unidade||'Cada destino de um caminhão é uma descarga com tempos e recursos próprios.']};
  ORIG.espera={t:'Espera média',b:oPl,fontes:['Descarga.chegada e Descarga.entrada'],passos:['Para cada descarga: entrada − chegada','Média de '+nf0.format(esp.amostra||0)+' descarga(s) com os dois horários: '+(esp.media==null?'sem dados':fmtDur(esp.media))],notas:['O histórico da Cocapec não tem horário de chegada, então este número só existe na plataforma.']};
  ORIG.dur={t:'Descarga média',b:oPl,fontes:['Descarga.entrada e Descarga.saida'],passos:['Para cada descarga concluída: saída − entrada','Média de '+nf0.format(dur.amostra||0)+' descarga(s): '+(dur.media==null?'sem dados':fmtDur(dur.media))],notas:['Os tempos do Dossiê (ex.: 10 paletes ≈ 15 min) são estimativas e não entram aqui.']};
  ORIG.chap={t:'Chapas por descarga',b:oPl,fontes:['Descarga.quantidade_chapas'],passos:['Média de '+nf0.format(chap.amostra||0)+' descarga(s) com chapas informadas: '+(chap.media==null?'sem dados':nf1.format(chap.media))],notas:[chap.observacao||'Mede a intensidade de cada descarga. Não é o efetivo do dia.']};
  ORIG.custo={t:'Custo da operação',b:oPl,fontes:['Boletim diário: total a pagar de cada boletim'],
    passos:['Boletins no filtro: '+nf0.format(custo.boletins||0)+(custo.boletinsInconsistentes?' ('+custo.boletinsInconsistentes+' inconsistente(s) ficaram de fora do total)':''),'Produção somada: '+brl4(custo.producao),'Complemento somado: '+brl4(custo.complemento),'Custo = total a pagar dos boletins consistentes = '+brl4(custo.totalAPagar)],
    notas:[custo.definicao||'Segue o Dossiê: o custo é o total do boletim, nunca R$ 180 por pessoa nem encargos.']};
  const ut=(O.porArmazem||[]);
  ORIG.util={t:'Utilização dos locais',b:oPl,fontes:['Descarga: entrada e saída por armazém'],passos:ut.length?ut.map(a=>a.armazem+': '+nf1.format(a.horasOcupadas)+' h em '+a.cargas+' descarga(s), em '+a.diasComMovimento+' dia(s) com movimento'):['Sem descargas concluídas no filtro.'],notas:[(O.utilizacao&&O.utilizacao.observacao)||'A Cocapec ainda não definiu um percentual oficial de utilização.','Mais de um caminhão pode estar no mesmo armazém ao mesmo tempo, então as horas somam sobreposições.']};
  const forn=(I.fornecedoresMaiorVolume||[]).map(x=>[x.fornecedor,x.recebimentos]);
  ORIG.forn={t:'Fornecedores com maior volume',b:'HISTORICO',fontes:[F_PED+': Nome do fornecedor e Nº Recebimento'],passos:['Para cada fornecedor: quantidade de recebimentos distintos, todo o histórico do pacote'],notas:[I.unidade||'Unidade: recebimentos, não kg.','Peso e quantidade se repetem em recebimentos parciais do mesmo pedido, então não são somados.','Este ranking não muda com o filtro de período nem de armazém.']};
  const dias=(I.porDiaDaSemana||[]).map(d=>[DOW_LONGO[d.diaSemana%7]+(d.mediaPorDia!=null?' · '+nf1.format(d.mediaPorDia)+'/dia':''),d.recebimentos]);
  ORIG.dow={t:'Dias de maior movimento',b:'HISTORICO',fontes:[F_PED+': Data Recebimento'],passos:['Recebimentos únicos por dia da semana em todo o histórico, todos os armazéns; a média por dia divide pelos dias com movimento'],notas:[(I.observacao)||'Não depende do filtro.']};
  const horas=((O.movimento||{}).porHoraDeEntrada||[]).map(h=>[pad(h.hora)+'h',h.cargas]);
  ORIG.hora={t:'Horários de maior movimento',b:oPl,fontes:['Descarga.entrada (hora de início da descarga)'],passos:horas.length?horas.map(([h,n])=>'Início às '+h+': '+n+' descarga(s)'):['Sem descargas no filtro.'],notas:['O histórico não tem horários; este indicador só existe na plataforma.']};
  const nrMap=Object.fromEntries((O.naoRecebimentos||[]).map(x=>[x.motivo,x.quantidade]));
  const nrCnt=Object.keys(MOTIVOS_NR).map(k=>[MOTIVOS_NR[k],nrMap[k]||0]);
  ORIG.nr={t:'Não recebimentos por motivo',b:oPl,fontes:['NaoRecebimento.motivo'],passos:nrCnt.map(([m,n])=>m+': '+n),notas:['Cada ocorrência entra em um único motivo.','Quando Compras não autoriza, a plataforma registra o não recebimento por divergência entre NF e pedido (assunção da equipe, a confirmar com a Cocapec).']};
  const SZ=sazonalidade(f.arm),mediaSaz=SZ.med.reduce((a,b)=>a+b,0)/12;
  ORIG.saz={t:'Sazonalidade dos recebimentos',b:'HISTORICO',fontes:[F_PED+': Data Recebimento, Nº Recebimento, Depósito'],passos:['Recebimentos únicos por mês, '+(SZ.completos?'nos anos completos ':'nos anos disponíveis ')+SZ.anos.join(', ')+', tirando a média de cada mês do ano','Média mensal do ano: '+nf1.format(mediaSaz)+' recebimentos'],notas:['Os meses mais altos ficam em amarelo no gráfico.','O reforço de equipe previsto vai de outubro a março; a faixa de fundo marca esse período.']};

  const mesesNomes=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const totalAbs=nr=>nr.reduce((s,x)=>s+x[1],0);
  return head('Painel gerencial','A quantidade de chapas está sobrando ou faltando, e quanto isso vale em reais? Cada número vem com a sua fonte; clique em “Ver cálculo” para ver as contas.','Quem usa: direção e gestores',P.carregando?'<span class="chip info">Atualizando…</span>':'')+
  '<div class="filters"><label class="f">De<select data-pf="from">'+optsHtml(optM,f.from)+'</select></label><label class="f">Até<select data-pf="to">'+optsHtml(optM,f.to)+'</select></label><label class="f">Armazém<select data-pf="arm"><option value="Todos">Todos</option>'+optsHtml(S.armazens.map(a=>[a.id,a.nome]),f.arm)+'</select></label><label class="row" style="gap:6px;font-size:14px;min-height:38px"><input type="checkbox" data-pf="teste" '+(f.teste?'checked':'')+'> Incluir dados de teste</label>'+
   '<div class="row"><button class="btn sm" data-act="pf-preset" data-p="hist">Período do histórico</button><button class="btn sm" data-act="pf-preset" data-p="all">Todo o período</button></div></div>'+
  '<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="font-size:22px">Sobra ou falta de chapas</h2><div class="tabs" role="tablist"><button role="tab" class="'+(f.tab==='hist'?'on':'')+'" data-act="pf-tab" data-t="hist">Histórico (baseline)</button><button role="tab" class="'+(f.tab==='plat'?'on':'')+'" data-act="pf-tab" data-t="plat">Plataforma (boletins)</button></div></div>'+core+srcCentral+'</div>'+
  '<div class="sec">'+pesoHtml+'</div>'+
  '<div class="sec"><div class="kpis">'+
   kpiCard('cargas','Cargas recebidas · histórico',meses.length&&diasTot?nf1.format(evTot/diasTot):'—','recebimentos-destino por dia útil · '+nf0.format(evTot)+' em '+nf0.format(diasTot)+' dias','HISTORICO',F_PED)+
   kpiCard('desc','Descargas concluídas · plataforma',nf0.format(cr.total),cr.total?origTxt(O.origens):'cada destino de caminhão conta uma vez',oPl,'Descarga com saída registrada')+
   kpiCard('espera','Espera média',esp.media==null?'—':fmtDur(esp.media),'chegada até entrada · '+nf0.format(esp.amostra||0)+' descarga(s)',oPl,'Descarga.chegada → entrada')+
   kpiCard('dur','Descarga média',dur.media==null?'—':fmtDur(dur.media),'entrada até saída · '+nf0.format(dur.amostra||0)+' descarga(s)',oPl,'Descarga.entrada → saída')+
   kpiCard('chap','Chapas por descarga',chap.media==null?'—':nf1.format(chap.media),'média por descarga, não é o efetivo do dia · '+nf0.format(chap.amostra||0)+' descarga(s)',oPl,'Descarga.quantidade_chapas')+
   kpiCard('custo','Custo da operação',custo.boletins?brl2(custo.totalAPagar):'—',custo.boletins?brl4(custo.totalAPagar)+' · complemento '+brl4(custo.complemento)+' · '+nf0.format(custo.boletins)+' boletim(ns)'+(custo.boletinsInconsistentes?' · '+custo.boletinsInconsistentes+' inconsistente(s) fora da soma':''):'sem boletins no filtro',oPl,'Boletim diário: total a pagar')+
  '</div></div>'+
  '<div class="sec cols2"><div class="panel"><h2>Utilização dos locais</h2><p class="lead">Horas de descarga ocupadas por armazém. A Cocapec ainda não definiu um percentual oficial.</p>'+(ut.length?barsHtml(ut.map(a=>[a.armazem+' ('+a.cargas+')',a.horasOcupadas]),h=>nf1.format(h)+' h'):'<div class="empty">Sem descargas concluídas no filtro.</div>')+srcLine('util',oPl,'Descarga.entrada → saída, por armazém')+'</div>'+
   '<div class="panel"><h2>Fornecedores com maior volume</h2><p class="lead">Recebimentos distintos em todo o histórico, sem filtro de período. Não soma kg com unidades.</p>'+(forn.length?barsHtml(forn,null,'green'):'<div class="empty">Sem histórico carregado.</div>')+srcLine('forn','HISTORICO',F_PED+' · Nome e Nº Recebimento')+'</div></div>'+
  '<div class="sec cols2"><div class="panel"><h2>Dias e horários de maior movimento</h2><p class="lead">Histórico por dia da semana (todos os armazéns) e plataforma por hora de início da descarga.</p>'+(dias.length?barsHtml(dias):'<div class="empty">Sem histórico carregado.</div>')+srcLine('dow','HISTORICO',F_PED+' · Data Recebimento')+'<div style="height:14px"></div>'+(horas.length?barsHtml(horas,null,'green'):'<div class="empty">Sem descargas da plataforma no filtro.</div>')+srcLine('hora',oPl,'Descarga.entrada')+'</div>'+
   '<div class="panel"><h2>Não recebimentos por motivo</h2><p class="lead">Ocorrências registradas na plataforma.</p>'+(totalAbs(nrCnt)?barsHtml(nrCnt):'<div class="empty">Nenhum não recebimento no filtro.</div>')+srcLine('nr',oPl,'NaoRecebimento.motivo')+'</div></div>'+
  '<div class="sec"><div class="panel"><h2>Sazonalidade dos recebimentos</h2><p class="lead">Média mensal de recebimentos-destino '+(SZ.anos.length?'em '+SZ.anos.join(', ')+(SZ.completos?' (anos completos)':' (sem ano completo no pacote)'):'')+(f.arm==='Todos'?'':' · '+esc(armTxt))+'. Os quatro meses mais altos ficam em amarelo; a faixa de fundo marca a safra (out a mar).</p>'+
   (SZ.anos.length?'<div class="tscroll"><div style="min-width:600px;max-width:780px">'+chartSazonal(SZ.med)+'</div></div>'+
   '<div class="tscroll" style="margin-top:12px"><table class="mini"><thead><tr><th></th>'+mesesNomes.map(m=>'<th class="r">'+m+'</th>').join('')+'</tr></thead><tbody><tr><td>Média por mês</td>'+SZ.med.map(v=>'<td class="r num">'+nf0.format(v)+'</td>').join('')+'</tr><tr><td>Em relação à média do ano</td>'+SZ.med.map(v=>{const p=mediaSaz?(v/mediaSaz-1)*100:0;return '<td class="r num"><span class="'+(p>=0?'neg':'pos')+'">'+(p>=0?'+':'−')+nf0.format(Math.abs(p))+'%</span></td>';}).join('')+'</tr></tbody></table></div>':'<div class="empty">Sem histórico carregado.</div>')+
   srcLine('saz','HISTORICO',F_PED+' · Data Recebimento')+'</div></div>'+
  '<div class="sec"><details class="panel"><summary style="cursor:pointer;font:700 19px var(--f-disp)">Como os dados foram tratados</summary><div class="stack" style="margin-top:12px;font-size:14px"><ul class="dl-list">'+
   ['Linhas duplicadas exatas da movimentação são descartadas na carga; as contagens usam a chave única de data, nº do recebimento e armazém.','Pares pedido-item com quantidade e peso repetidos em recebimentos parciais: quantidade e peso não são somados como carga (a coluna de peso não é usada).','Chaves de acesso ausentes ou malformadas: não servem de chave principal dos indicadores.','Depósitos fora do mapeamento do Dossiê ficam de fora da quebra por armazém; MATProv e MATReser não recebem.','Folha de chapas: só segunda a sexta e só meses com pelo menos 10 dias de folha; ago e dez de 2025 e jan de 2025 ficam de fora.','As 460 notas em XML são amostra não proporcional: não entram no volume nem na sazonalidade.','O código de produto dentro do XML é do fornecedor, não do catálogo da Cocapec.','O histórico não tem chegada, entrada, saída, chapas nem equipamentos por recebimento. Esses indicadores só existem na plataforma.']
   .map(t=>'<li>'+t+'</li>').join('')+'</ul></div></details></div>';
}

function abrirOrigem(k){
  const o=ORIG[k];if(!o)return;
  const lista=a=>'<ul class="dl-list">'+a.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  modal(esc(o.t),'<div class="row">'+origBadge(o.b)+'<span class="muted small">Os números abaixo seguem o filtro atual do painel.</span></div>'+
    '<div><div class="sec-t">De onde vem</div>'+lista(o.fontes)+'</div>'+
    '<div><div class="sec-t">Como o número é calculado</div><ol class="dl-steps">'+o.passos.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol></div>'+
    (o.notas&&o.notas.length?'<div><div class="sec-t">Para ler com cuidado</div>'+lista(o.notas)+'</div>':''),null,true);
}

Object.assign(ACT,{
  origem(t){abrirOrigem(t.dataset.k);},
  'pf-retry'(){return carregarPainel();},
  'pf-preset'(t){initPf();if(t.dataset.p==='hist'){const L=(P.histAll&&P.histAll.meses)||[];U.pf.from=L.length?L[0].mes:primeiroMes();U.pf.to=L.length?L[L.length-1].mes:ultimoMes();}else{U.pf.from=primeiroMes();U.pf.to=ultimoMes();}return carregarPainel();},
  'pf-tab'(t){U.pf.tab=t.dataset.t;renderPanel('painel');}
});
VIEWS.painel=viewPainel;

/* cálculo da pergunta da direção para o início */
function respostaHome(){
  const H=P.histAll;if(!H||!H.totais||!(H.meses||[]).length)return null;
  const t=H.totais,s=+t.sobraDiarias,f=+t.faltaDiarias;
  const menor=s<=f?{d:t.sobraDiarias,r:t.sobraReais}:{d:t.faltaDiarias,r:t.faltaReais};
  const est=H.estacoes||[],safra=est.find(e=>e.estacao==='SAFRA'),ent=est.find(e=>e.estacao==='ENTRESSAFRA');
  const descompasso=s>0&&f>0&&safra&&ent&&(safra.saldoDiarias*ent.saldoDiarias<0);
  return{menor,sobra:t,descompasso,safra,ent,de:H.meses[0].mes,ate:H.meses[H.meses.length-1].mes};
}
