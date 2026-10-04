'use strict';
/* Diferenciais 2 e 3: Planejamento D-1 e Simulador de equipe.
   O D-1 aproveita os agendamentos já cadastrados para responder "o que está previsto para o próximo dia e onde há pressão?".
   O Simulador muda só o cenário de equipe, com o MESMO motor, sem gravar nada.
   Cuidado metodológico: as regras de negócio não permitem prever um número exato de chapas. Por isso o módulo trabalha com
   NÍVEIS (baixa, moderada, alta) e diz as limitações, em vez de fingir precisão. Nenhum impacto financeiro é inventado aqui. */

const D1_PERIODOS={manha:{nome:'Manhã',slots:['08:00','10:00']},tarde:{nome:'Tarde',slots:['13:00','15:00']}};
/* Limiares do nível de pressão = chapas simultâneas exigidas pela norma ÷ equipe disponível. Parâmetros nossos (não da Cocapec). */
const D1_LIM={moderada:0.7,alta:1.0,realocavel:0.4};
const NIVEL_TXT={ALTA:'Pressão alta',MODERADA:'Pressão moderada',BAIXA:'Cenário compatível',SEM:'Sem carga prevista',ND:'Sem equipe de referência'};
const NIVEL_CLS={ALTA:'bad',MODERADA:'warn',BAIXA:'ok',SEM:'',ND:''};
U.d1={data:null,sim:{armId:null,equipe:null}};

/* chapas simultâneas pela norma do Dossiê (§7). DQ-016 (paletizado/big bag abaixo de 500 kg) segue em aberto: não é automatizado. */
function normaChapas(a){
  const pesos=a.nfs.filter(n=>n.peso!=null&&n.peso!=='').map(n=>Number(n.peso)),conhecido=pesos.length>0,kg=pesos.reduce((s,x)=>s+x,0);
  if(a.acond==='BATIDO')return conhecido&&kg<500?{n:0,nota:'Carga batida abaixo de 500 kg ('+nf0.format(kg)+' kg): a norma não prevê chapas.'}:{n:5,nota:conhecido?'':'Peso da carga desconhecido: usamos a referência de carga batida acima de 500 kg (5 chapas).'};
  return{n:2,nota:conhecido&&kg<500?'Paletizado/big bag abaixo de 500 kg: o Dossiê é ambíguo (DQ-016, 0 ou 2 chapas). Usamos 2 e sinalizamos.':''};
}
function nivelPressao(need,team){
  if(!need)return{k:'SEM',r:0};
  if(!team)return{k:'ND',r:null};
  const r=need/team;
  if(r>D1_LIM.alta)return{k:'ALTA',r};
  if(r>D1_LIM.moderada)return{k:'MODERADA',r};
  return{k:'BAIXA',r,realoc:r<=D1_LIM.realocavel};
}
/* equipe de referência de um armazém = média de chapas dos últimos boletins (só informação; não é a escala de amanhã) */
function equipeReferencia(armazemId){
  const L=S.boletins.filter(b=>b.armazemId===armazemId&&b.chapas>0).sort((a,b)=>b.data.localeCompare(a.data)).slice(0,5);
  if(!L.length)return null;
  const m=L.reduce((s,b)=>s+b.chapas,0)/L.length;
  return{n:Math.round(m),amostra:L.length,desde:L[L.length-1].data};
}
function d1Calc(data,equipePorArm){
  const ags=S.ags.filter(a=>a.data===data&&!LIBERAM_VAGA.includes(a.status)).sort(porDataHora);
  const contribs=[];
  ags.forEach(a=>{const nm=normaChapas(a);
    if(a.descs.length)a.descs.forEach(d=>contribs.push({ag:a,armId:d.armazemId,h:a.horario,chapas:nm.n,nota:nm.nota}));
    else contribs.push({ag:a,armId:null,h:a.horario,chapas:nm.n,nota:nm.nota});});
  const linhas=[...S.armazens.map(a=>({id:a.id,nome:a.nome})),{id:null,nome:'Destino a definir'}].map(L=>{
    const ref=L.id==null?null:equipeReferencia(L.id),over=equipePorArm&&L.id!=null?equipePorArm[L.id]:null;
    const team=over!=null?over:(ref?ref.n:null),tipo=over!=null?'simulada':(ref?'referência':null);
    const slots={};SLOTS.forEach(h=>{const it=contribs.filter(c=>c.armId===L.id&&c.h===h);const need=it.reduce((s,c)=>s+c.chapas,0);slots[h]={need,itens:it,nivel:nivelPressao(need,team)};});
    const pico=Math.max(0,...SLOTS.map(h=>slots[h].need)),picoH=SLOTS.find(h=>slots[h].need===pico&&pico>0)||null;
    const periodos=Object.fromEntries(Object.entries(D1_PERIODOS).map(([k,p])=>{const need=Math.max(0,...p.slots.map(h=>slots[h].need));return[k,{need,nivel:nivelPressao(need,team),slots:p.slots}];}));
    const ordem={ALTA:4,MODERADA:3,BAIXA:2,SEM:0,ND:1};
    const geral=SLOTS.map(h=>slots[h].nivel).sort((a,b)=>ordem[b.k]-ordem[a.k])[0];
    return{id:L.id,nome:L.nome,team,tipo,ref,slots,pico,picoH,periodos,nivel:geral,entregas:new Set(contribs.filter(c=>c.armId===L.id).map(c=>c.ag.id)).size};
  });
  return{data,ags,contribs,linhas};
}
async function proxDiaOperacional(){
  let d=addDays(hojeISO(),1);
  for(let i=0;i<14;i++){await carregarDiasAgenda([d]);if(!motivoDiaBloqueado(d))return d;d=addDays(d,1);}
  return d;
}

/* ---------- explicações ("Por quê?") ---------- */
function porQueSlot(armId,h){
  const P=d1Calc(U.d1.data,simOver()),L=P.linhas.find(x=>x.id===armId),c=L.slots[h];
  const ref=L.tipo==='simulada'?'equipe simulada de '+L.team+' chapa(s)':L.ref?'equipe de referência de '+L.team+' chapa(s) (média dos '+L.ref.amostra+' boletins mais recentes)':'sem equipe de referência para este armazém';
  const notas=[...new Set(c.itens.map(i=>i.nota).filter(Boolean))];
  modal('Por que '+esc(NIVEL_TXT[c.nivel.k].toLowerCase())+'? · '+esc(L.nome)+' às '+h,
    '<div class="row"><span class="chip '+NIVEL_CLS[c.nivel.k]+'">'+NIVEL_TXT[c.nivel.k]+'</span><span class="muted small">'+fmtBR(U.d1.data)+'</span></div>'+
    '<div><div class="sec-t">Quem contribui</div>'+(c.itens.length?'<ul class="dl-list">'+c.itens.map(i=>'<li><b>'+codigoAg(i.ag.id)+'</b> · '+esc(fornById(i.ag.fornecedorId).curto)+' · '+ACOND[i.ag.acond].nome+' · '+STATUS[i.ag.status]+' → '+i.chapas+' chapa(s) pela norma</li>').join('')+'</ul>':'<p class="muted">Nenhuma entrega prevista neste horário.</p>')+'</div>'+
    '<div><div class="sec-t">Como o nível foi decidido</div><ol class="dl-steps"><li>Chapas simultâneas exigidas pela norma do Dossiê (§7): batido 5, paletizado ou big bag 2. Neste horário: <b>'+c.need+'</b>.</li>'+
    '<li>Equipe considerada: '+ref+'.</li>'+(c.nivel.r!=null?'<li>Razão = '+c.need+' ÷ '+L.team+' = <b>'+nf2.format(c.nivel.r)+'</b>.</li>':'')+
    '<li>Limiares (parâmetros do projeto, não da Cocapec): acima de '+nf2.format(D1_LIM.alta)+' é pressão alta; acima de '+nf2.format(D1_LIM.moderada)+' até '+nf2.format(D1_LIM.alta)+' é moderada; até '+nf2.format(D1_LIM.moderada)+' é compatível'+(c.nivel.realoc?' (e até '+nf2.format(D1_LIM.realocavel)+' indica capacidade potencialmente disponível para realocação)':'')+'.</li></ol></div>'+
    '<div><div class="sec-t">Para ler com cuidado</div><ul class="dl-list"><li>É um nível, não uma previsão exata de chapas: a Cocapec ainda não definiu uma fórmula de dimensionamento.</li><li>A chegada real pode atrasar e as descargas de horários vizinhos podem se sobrepor; o D-1 não prevê isso.</li>'+notas.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></div>');
}
const simOver=()=>{const s=U.d1.sim;return s.armId&&s.equipe!=null?{[s.armId]:s.equipe}:null;};

/* ---------- tela ---------- */
function viewD1(){
  if(!U.d1.data)return head('Planejamento D-1','O que está previsto para o próximo dia operacional e onde existe maior pressão.','Quem usa: direção e responsável pelo armazém')+'<div class="empty">Carregando…</div>';
  const data=U.d1.data,P=d1Calc(data,simOver()),n=P.ags.length;
  const aut=P.ags.filter(a=>['AUTORIZADO','EM_DESCARGA','CONCLUIDO'].includes(a.status)).length,pend=P.ags.filter(a=>a.status==='PENDENTE_COMPRAS').length;
  const semDest=P.ags.filter(a=>!a.descs.length).length;
  const porHora=SLOTS.map(h=>[h.slice(0,2)+'h',P.ags.filter(a=>a.horario===h).length]);
  const porAc=Object.keys(ACOND).map(k=>[ACOND[k].nome,P.ags.filter(a=>a.acond===k).length]);
  const porArm=P.linhas.map(L=>[L.nome,L.entregas]).filter(x=>x[1]>0);
  const nome=DOW_LONGO[dow(data)]+', '+fmtBR(data);
  const alertas=[];
  P.linhas.forEach(L=>SLOTS.forEach(h=>{const c=L.slots[h];if(['ALTA','MODERADA'].includes(c.nivel.k))alertas.push({L,h,c});}));
  alertas.sort((a,b)=>(b.c.nivel.k==='ALTA')-(a.c.nivel.k==='ALTA')||a.h.localeCompare(b.h));
  const matriz=P.linhas.filter(L=>L.id!=null||L.entregas>0).map(L=>
    '<tr><td><b>'+esc(L.nome)+'</b><br><span class="muted small">'+(L.team!=null?'equipe '+L.team+' chapa(s) · '+L.tipo:(L.id==null?'sem equipe: destino não definido':'sem equipe de referência'))+'</span></td>'+
    SLOTS.map(h=>{const c=L.slots[h];return '<td class="r">'+(c.need?'<b class="num">'+c.need+'</b> chapa(s)<br><button class="chip '+NIVEL_CLS[c.nivel.k]+'" style="border:0;cursor:pointer" data-act="d1-porque" data-a="'+(L.id==null?'':L.id)+'" data-h="'+h+'" title="Por quê?">'+(c.nivel.k==='ND'?'sem referência':c.nivel.k==='ALTA'?'alta':c.nivel.k==='MODERADA'?'moderada':'baixa')+' · por quê?</button>':'<span class="muted">—</span>')+'</td>';}).join('')+
    '<td class="r"><span class="chip '+NIVEL_CLS[L.nivel.k]+'">'+NIVEL_TXT[L.nivel.k]+'</span></td></tr>').join('');
  return head('Planejamento D-1','Organiza o que está previsto para o próximo dia operacional a partir dos agendamentos já cadastrados e mostra onde existe maior pressão. Não grava nada: é só leitura e planejamento.','Quem usa: direção e responsável pelo armazém',
    '<button class="btn sm" data-act="d1-dia" data-d="-1" aria-label="Dia anterior">‹</button><button class="btn" data-act="d1-prox">Próximo dia operacional</button><button class="btn sm" data-act="d1-dia" data-d="1" aria-label="Próximo dia">›</button>')+
  '<div class="callout" style="margin-bottom:18px"><b>'+esc(nome)+'</b>. O módulo trabalha com <b>níveis</b> (baixa, moderada e alta pressão), não com um número exato de chapas, porque as regras de negócio ainda não permitem calcular um número exato. Cada alerta tem o botão “Por quê?”.</div>'+
  '<div class="stats" style="margin-bottom:20px">'+statTile('Entregas agendadas',nf0.format(n),'no dia (cancelados e recusados não contam)')+statTile('Autorizadas por Compras',nf0.format(aut),pend+' ainda aguardando Compras')+statTile('Destino a definir',nf0.format(semDest),'entregas sem armazém de destino')+statTile('Alertas',nf0.format(alertas.length),alertas.filter(a=>a.c.nivel.k==='ALTA').length+' de pressão alta')+'</div>'+
  (n?'':'<div class="empty" style="margin-bottom:20px">Nenhuma entrega agendada para este dia.</div>')+
  '<div class="cols2"><div class="panel"><h2>Por horário</h2><p class="lead">Entregas por horário da grade.</p>'+barsHtml(porHora)+'</div>'+
   '<div class="panel"><h2>Por acondicionamento</h2><p class="lead">Batido, paletizado e big bag.</p>'+barsHtml(porAc,null,'green')+'<h2 style="margin-top:14px;font-size:17px">Por armazém</h2><p class="lead">Só entregas com destino definido; o resto fica em “destino a definir”.</p>'+(porArm.length?barsHtml(porArm):'<div class="empty">Sem entregas.</div>')+'</div></div>'+
  '<div class="sec"><div class="panel"><h2>Pressão estimada por horário e armazém</h2><p class="lead">Chapas simultâneas exigidas pela norma do Dossiê (batido 5, paletizado e big bag 2) comparadas com a equipe de referência do armazém (média dos últimos boletins). Equipe informada: a do simulador, abaixo.</p>'+
   '<div class="tscroll"><table class="mini"><thead><tr><th>Armazém</th>'+SLOTS.map(h=>'<th class="r">'+h+'</th>').join('')+'<th class="r">Nível do dia</th></tr></thead><tbody>'+(matriz||'<tr><td colspan="6" class="muted">Sem dados.</td></tr>')+'</tbody></table></div>'+
   '<p class="muted small" style="margin-top:8px">Limiares: alta acima de '+nf2.format(D1_LIM.alta)+', moderada acima de '+nf2.format(D1_LIM.moderada)+' (necessidade ÷ equipe). São parâmetros do projeto, não regra da Cocapec. Paletizado e big bag abaixo de 500 kg seguem em aberto (DQ-016): usamos 2 chapas e sinalizamos.</p></div></div>'+
  '<div class="sec"><div class="panel"><h2>Alertas explicáveis</h2>'+(alertas.length?'<ul class="dl-list" style="gap:10px">'+alertas.map(({L,h,c})=>'<li><span class="chip '+NIVEL_CLS[c.nivel.k]+'">'+(c.nivel.k==='ALTA'?'alta':'moderada')+'</span> <b>'+esc(L.nome)+'</b> às '+h+': '+c.need+' chapa(s) simultâneas para '+(L.team||'—')+' na equipe ('+c.itens.length+' entrega(s)). <button class="lnk" data-act="d1-porque" data-a="'+(L.id==null?'':L.id)+'" data-h="'+h+'">Por quê?</button></li>').join('')+'</ul>':'<p class="muted">Nenhum horário com pressão moderada ou alta para este dia, com a equipe considerada.</p>')+'</div></div>'+
  '<div class="sec" id="d1-sim">'+viewSimulador(data)+'</div>';
}

/* ---------- Simulador de equipe ---------- */
function viewSimulador(data){
  const s=U.d1.sim,arms=S.armazens;
  if(!s.armId)s.armId=(arms.find(a=>a.nome==='Insumos')||arms[0]||{}).id;
  const base=d1Calc(data,null),L0=base.linhas.find(x=>x.id===s.armId);
  const pico=L0?L0.pico:0,ref=L0&&L0.ref?L0.ref.n:null;
  if(s.equipe==null)s.equipe=ref||Math.max(pico,4);
  const cen=[];const ini=Math.max(1,(ref||Math.max(pico,4))-2);for(let t=ini;t<ini+7;t++)cen.push(t);
  const linha=t=>{const sl=SLOTS.map(h=>nivelPressao(L0.slots[h].need,t));const ordem={ALTA:4,MODERADA:3,BAIXA:2,SEM:0,ND:1};const pior=sl.slice().sort((a,b)=>ordem[b.k]-ordem[a.k])[0];return{t,pior,altas:sl.filter(x=>x.k==='ALTA').length,mods:sl.filter(x=>x.k==='MODERADA').length};};
  const txt=x=>x.pior.k==='SEM'?'Sem carga prevista':x.pior.k==='ALTA'?'Pressão alta':x.pior.k==='MODERADA'?'Pressão moderada':x.pior.realoc?'Capacidade potencialmente disponível para realocação':'Cenário compatível';
  const atual=linha(s.equipe),Lsim=d1Calc(data,{[s.armId]:s.equipe}).linhas.find(x=>x.id===s.armId);
  return '<div class="panel"><h2>Simulador de equipe</h2><p class="lead">Altere só o cenário de equipe e veja como a pressão estimada mudaria, usando o mesmo motor do Planejamento D-1 para '+esc(fmtBR(data))+'. <b>Nada é gravado</b>: não muda boletins, agendamentos nem a equipe real.</p>'+
   '<div class="filters" style="margin-bottom:14px"><label class="f">Armazém<select data-d1="arm">'+optsHtml(arms.map(a=>[a.id,a.nome]),s.armId)+'</select></label><label class="f">Chapas disponíveis neste cenário<input type="number" min="1" max="20" step="1" data-d1="equipe" value="'+s.equipe+'"></label>'+
   '<div class="f"><span>Necessidade pico</span><b class="num" style="font-size:20px">'+pico+' chapa(s)</b></div><div class="f"><span>Equipe de referência</span><b class="num" style="font-size:20px">'+(ref!=null?ref+' chapa(s)':'—')+'</b></div></div>'+
   '<div class="answer" style="margin-bottom:14px"><div><span class="chip '+NIVEL_CLS[atual.pior.k]+'">'+txt(atual)+'</span><h2 style="font-size:20px;margin:8px 0">'+s.equipe+' chapa(s): '+txt(atual).toLowerCase()+'</h2><p class="muted">'+(atual.altas?atual.altas+' horário(s) com pressão alta. ':'')+(atual.mods?atual.mods+' com pressão moderada. ':'')+(atual.pior.realoc?'Neste cenário haveria <b>capacidade disponível para realocação</b> (outras atividades, como o carregamento de cooperados), sem recomendar redução permanente de equipe.':'')+'</p></div><div class="tscroll"><table class="mini"><thead><tr>'+SLOTS.map(h=>'<th class="r">'+h+'</th>').join('')+'</tr></thead><tbody><tr>'+SLOTS.map(h=>{const c=Lsim.slots[h];return '<td class="r">'+(c.need?c.need+' chapa(s)<br><span class="chip '+NIVEL_CLS[c.nivel.k]+'">'+(c.nivel.k==='ALTA'?'alta':c.nivel.k==='MODERADA'?'moderada':'baixa')+'</span>':'<span class="muted">—</span>')+'</td>';}).join('')+'</tr></tbody></table></div></div>'+
   '<div class="sec-t">Comparar cenários</div><div class="tscroll"><table class="mini"><thead><tr><th>Equipe</th><th>Resultado</th><th class="r">Horários em pressão alta</th><th class="r">Em pressão moderada</th></tr></thead><tbody>'+cen.map(linha).map(x=>'<tr'+(x.t===s.equipe?' style="font-weight:700"':'')+'><td class="num">'+x.t+' chapa(s)'+(ref!=null&&x.t===ref?' <span class="muted small">(referência)</span>':'')+'</td><td><span class="chip '+NIVEL_CLS[x.pior.k]+'">'+txt(x)+'</span></td><td class="r num">'+x.altas+'</td><td class="r num">'+x.mods+'</td></tr>').join('')+'</tbody></table></div>'+
   '<div class="callout" style="margin-top:14px"><b>O que o simulador não faz:</b> não grava uma nova equipe; não altera boletins ou agendamentos; não recomenda contratação ou demissão permanente; não inventa impacto financeiro quando os dados não sustentam o cálculo. Prefira dizer “capacidade disponível para realocação”, não “funcionários sobrando”.</div></div>';
}

async function carregarD1(){
  if(!U.d1.data){U.d1.data=await proxDiaOperacional();}
  if(U.route==='d1')renderPanel('d1');
}
Object.assign(ACT,{
  'd1-prox':async()=>{U.d1.data=await proxDiaOperacional();renderPanel('d1');},
  'd1-dia':async t=>{let d=addDays(U.d1.data,Number(t.dataset.d));while(dow(d)===0||dow(d)===6)d=addDays(d,Number(t.dataset.d));await carregarDiasAgenda([d]);U.d1.data=d;renderPanel('d1');},
  'd1-porque'(t){porQueSlot(t.dataset.a===''?null:Number(t.dataset.a),t.dataset.h);}
});
VIEWS.d1=viewD1;
