'use strict';
/* Tarefa 1: agenda, Compras e armazém. As regras de vaga, estado e prazos ficam na API; a tela só pergunta e mostra. */

const ACT={}, VIEWS={};
const U={route:null,weekStart:semanaAtual(),agTodas:false,agStatus:'',arm:{filtro:'Todos'},dd:{},eqSel:{},bol:null,pf:null};

/* ---------- Utilitários de UI ---------- */
const dlg=$('#dlg'),drawer=$('#drawer');
function toast(msg,bad){
  const box=$('#toasts');const t=document.createElement('div');t.className='toast'+(bad?' bad':'');t.textContent=msg;box.appendChild(t);
  /* o aviso fica em uma camada acima dos diálogos modais */
  try{box.hidePopover();}catch(e){}try{box.showPopover();}catch(e){}
  setTimeout(()=>{t.remove();if(!box.children.length){try{box.hidePopover();}catch(e){}}},bad?6000:3400);
}
function modal(title,body,foot,wide){
  dlg.classList.toggle('wide',!!wide);
  dlg.innerHTML='<div class="dlg-head"><h2>'+title+'</h2><button class="icon-btn" data-act="close-dlg" aria-label="Fechar">×</button></div><div class="dlg-body">'+body+'</div><div class="dlg-foot">'+(foot||'<button class="btn" data-act="close-dlg">Fechar</button>')+'</div>';
  if(!dlg.open)dlg.showModal();
}
const closeAll=()=>{if(dlg.open)dlg.close();};
const acChip=a=>'<span class="chip"><span class="dot" style="background:var(--c)"></span>'+ACOND[a].nome+'</span>';
const acChipS=a=>'<span class="ac-'+a+'">'+acChip(a)+'</span>';
const stChip=s=>'<span class="chip '+(STATUS_CLS[s]||'')+'">'+STATUS[s]+'</span>';
const origBadge=o=>'<span class="badge '+(o==='TESTE'?'teste':o==='PLATAFORMA'?'plat':'hist')+'">'+(o==='HISTORICO'?'HISTÓRICO':esc(o))+'</span>';
const nfsTxt=ag=>ag.nfs.map(n=>/\d/.test(n.numero||'')?esc(fmtNF(n.numero)):esc(n.arquivo||'sem NF')).join(', ');
const head=(t,sub,who,actions)=>'<header class="page-head"><div><div class="title-row"><h1>'+t+'</h1><span class="who">'+who+'</span></div><p class="sub">'+sub+'</p></div><div class="actions">'+(actions||'')+'</div></header>';
const errTxt=e=>e&&e.message?e.message:String(e);
const setMsg=(sel,txt)=>{const el=$(sel);if(el)el.textContent=txt||'';};
const ativoAg=a=>['PENDENTE_COMPRAS','AUTORIZADO'].includes(a.status);

/* ======================= AGENDA ======================= */
function laneBtn(a,full){
  return '<button class="lane ac-'+a.acond+(full?' full':'')+'" data-act="open-ag" data-id="'+a.id+'"><span class="lm">'+esc(fornById(a.fornecedorId).curto)+'</span><span class="ls">'+ACOND[a.acond].nome+' · '+STATUS[a.status]+'</span></button>';
}
function vagaLane(v,full){
  return '<button class="lane vaga ac-'+v.acondicionamento+(full?' full':'')+'" data-act="open-vaga" data-id="'+v.id+'"><span class="lm">Vaga liberada</span><span class="ls">'+ACOND[v.acondicionamento].nome+' · aguardando decisão</span></button>';
}
function cellHtml(d,hora){
  if(motivoDiaBloqueado(d))return '<div class="cell blocked"><span>Sem recebimento</span></div>';
  const o=ocupantes(d,hora);
  const itens=[...o.ags.map(a=>({t:a.acond,h:laneBtn(a)})),...o.vagas.map(v=>({t:v.acondicionamento,h:vagaLane(v)}))];
  const bat=o.tipos.includes('BATIDO');
  const passado=d<hojeISO(),n=o.tipos.length;
  let lanes='';
  if(bat){
    const i=itens.findIndex(x=>x.t==='BATIDO'),b=itens[i];
    lanes=b.h.replace('class="lane ','class="lane full ')+itens.filter((x,j)=>j!==i).map(x=>x.h).join('');
  }else{
    for(let i=0;i<Math.max(MAX_UNITIZADOS,itens.length);i++)
      lanes+=itens[i]?itens[i].h:'<button class="lane empty'+(passado?'':' free')+'" data-act="new-ag" data-data="'+d+'" data-hora="'+hora+'"'+(passado?' disabled':'')+'>Livre</button>';
  }
  const foot=bat?'Exclusivo · carga batida':n>MAX_UNITIZADOS?'Acima do limite · caso fortuito':n===MAX_UNITIZADOS?'Lotado · 2 de 2':(MAX_UNITIZADOS-n)===1?'1 vaga livre':'2 vagas livres';
  return '<div class="cell">'+lanes+'<div class="foot">'+foot+'</div></div>';
}
function viewAgenda(){
  const days=[0,1,2,3,4].map(i=>addDays(U.weekStart,i));
  const ano=fromISO(days[4]).getFullYear();
  let g='<div class="gh" style="border-left:0"></div>'+days.map(d=>{
    const blk=motivoDiaBloqueado(d);
    return '<div class="gh'+(blk?' blocked':'')+'"><b>'+DOW[dow(d)]+'</b> '+fmtDM(d)+(blk?'<small>'+esc(blk)+'</small>':'')+'</div>';}).join('');
  SLOTS.forEach(h=>{g+='<div class="gt">'+h+'</div>'+days.map(d=>cellHtml(d,h)).join('');});
  const lista=S.ags.filter(a=>U.agTodas||(a.data>=days[0]&&a.data<=days[4])).filter(a=>!U.agStatus||a.status===U.agStatus).sort(porDataHora);
  const rows=lista.map(a=>{
    const ds=a.descs;
    return '<tr class="click" data-act="open-ag" data-id="'+a.id+'"><td class="num">'+fmtDM(a.data)+' '+a.horario+'</td><td>'+esc(fornById(a.fornecedorId).nome)+'</td><td>'+nfsTxt(a)+'</td><td>'+acChipS(a.acond)+'</td><td>'+stChip(a.status)+'</td><td>'+(ds.length?ds.map(x=>esc(x.armazem)).join(', '):'<span class="muted">a definir</span>')+'</td><td>'+origBadge(a.origem)+'</td></tr>';}).join('');
  const vagasAbertas=S.vagas.filter(v=>v.status==='ABERTA').length;
  return head('Agenda de recebimento','Todos os caminhões precisam de horário. A capacidade é única para a cooperativa inteira: ou uma carga batida sozinha, ou até dois caminhões paletizados ou big bag.','Quem usa: fornecedor (agenda) · Responsável pelo armazém (acompanha)',
    '<button class="btn" data-act="walkin">Chegou sem agendamento</button><button class="btn accent" data-act="new-ag-btn">Novo agendamento</button>')+
  (vagasAbertas?'<div class="callout warn" style="margin-bottom:14px"><b>'+vagasAbertas+' vaga(s) liberada(s) por cancelamento</b> aguardando decisão do armazém: clique na vaga tracejada da grade para escolher quem ocupa ou liberar ao público.</div>':'')+
  '<div class="wkbar"><button class="btn sm" data-act="week" data-d="-1" aria-label="Semana anterior">‹</button><h2 class="num">'+fmtDM(days[0])+' a '+fmtDM(days[4])+'/'+ano+'</h2><button class="btn sm" data-act="week" data-d="1" aria-label="Próxima semana">›</button><button class="btn sm" data-act="week-today">Semana atual</button></div>'+
  '<div class="agenda-wrap" role="region" aria-label="Grade de horários da semana" tabindex="0"><div class="agenda-grid">'+g+'</div></div>'+
  '<div class="legend"><span class="ac-BATIDO"><i class="sw"></i>Batido (exclusivo)</span><span class="ac-PALETIZADO"><i class="sw"></i>Paletizado</span><span class="ac-BIG_BAG"><i class="sw"></i>Big bag</span><span>Tracejado: horário ocupado por carga batida, vaga liberada ou data sem recebimento</span></div>'+
  '<div class="sec"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h2 style="font-size:20px">Agendamentos '+(U.agTodas?'(todas as datas)':'da semana')+'</h2><div class="row"><label class="row" style="gap:6px;font-size:14px"><input type="checkbox" data-chg="agTodas" '+(U.agTodas?'checked':'')+'> Mostrar todas as datas</label><select data-chg="agStatus" style="width:auto" aria-label="Filtrar por situação"><option value="">Todas as situações</option>'+optsHtml(Object.entries(STATUS),U.agStatus)+'</select></div></div>'+
  (rows?'<div class="tscroll panel" style="padding:4px 8px"><table><thead><tr><th>Data e hora</th><th>Fornecedor</th><th>Notas fiscais</th><th>Acondicionamento</th><th>Situação</th><th>Destinos</th><th>Origem</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="empty">Nenhum agendamento neste filtro. Clique em uma vaga livre na grade para começar.</div>')+'</div>';
}

/* ---- Novo agendamento ---- */
let NA=null,naTok=0;
const fornOpcao=f=>f.nome+(f.cnpj?' · '+fmtCnpj(f.cnpj):'');
function resolveForn(txt){
  const t=String(txt||'').trim().toLowerCase();if(!t)return null;
  const exato=S.forn.find(f=>fornOpcao(f).toLowerCase()===t);if(exato)return exato;
  const dig=t.replace(/\D/g,'');if(dig.length===14){const c=S.forn.find(f=>f.cnpj===dig);if(c)return c;}
  const cand=S.forn.filter(f=>f.nome.toLowerCase().includes(t));return cand.length===1?cand[0]:null;
}
function openNewAg(pre,walkin){
  const hoje=hojeISO();let d=pre.data||hoje;
  if(!pre.data){d=hoje;while(dow(d)===0||dow(d)===6)d=addDays(d,1);}
  NA={data:d,hora:pre.hora||'',acond:'',walkin:!!walkin};
  const body=
   (walkin?'<div class="callout warn">Sem agendamento, o caminhão só descarrega se houver vaga. Se houver, o agendamento é feito agora, a chegada é registrada e ele segue para Compras. Se não houver, registre o não recebimento.</div>':'')+
   '<label class="f">Fornecedor<input type="text" id="na-forn" list="na-fornlist" autocomplete="off" placeholder="Digite o nome ou o CNPJ"><datalist id="na-fornlist">'+S.forn.map(f=>'<option value="'+esc(fornOpcao(f))+'"></option>').join('')+'</datalist></label>'+
   '<details class="more"><summary>Fornecedor não está na lista? Cadastrar</summary><div class="grid2" style="margin-top:8px"><label class="f">Razão social<input type="text" id="nf-razao" maxlength="200"></label><label class="f">CNPJ <span class="hint">14 dígitos, opcional</span><input type="text" id="nf-cnpj" inputmode="numeric" maxlength="18"></label></div><div style="margin-top:8px"><button class="btn sm" data-act="na-novoforn">Cadastrar e selecionar</button></div></details>'+
   '<div class="stack" style="gap:8px"><div><div class="sec-t" style="margin-bottom:2px">Notas fiscais da entrega</div><p class="hint">Número da NF no padrão de 4 dígitos: 524 vira 0524. Se anexar o XML, a chave e os dados da nota são lidos dele.</p></div><div id="na-nfs" class="stack" style="gap:8px"></div><div><button class="btn sm" data-act="na-addnf">Adicionar outra nota fiscal</button></div></div>'+
   '<div><div class="sec-t">Acondicionamento (um por caminhão)</div><div class="opts" role="radiogroup">'+Object.entries(ACOND).map(([k,v])=>'<label class="opt ac-'+k+'"><input type="radio" name="na-ac" value="'+k+'"><span class="face"><b>'+v.nome+'</b><small>'+v.desc+'</small></span></label>').join('')+'</div></div>'+
   '<div class="grid2"><label class="f">Data<input type="date" id="na-data" value="'+d+'" min="'+hoje+'"></label><div></div></div>'+
   '<div><div class="sec-t">Horário</div><div class="slots" id="na-slots"></div></div>'+
   '<div id="na-msg" class="errs" aria-live="polite"></div>';
  modal(walkin?'Chegou sem agendamento':'Novo agendamento',body,
    '<button class="btn" data-act="close-dlg">Cancelar</button>'+(walkin?'<button class="btn danger" id="na-nr" hidden data-act="na-nr">Registrar não recebimento</button>':'')+'<button class="btn primary" data-act="na-save">'+(walkin?'Agendar agora':'Agendar')+'</button>');
  addNfRow();refreshSlots();
}
function addNfRow(){
  const c=$('#na-nfs');if(!c)return;const row=document.createElement('div');row.className='nfrow';
  row.innerHTML='<input class="nf" type="text" inputmode="numeric" maxlength="9" autocomplete="off" placeholder="0000" aria-label="Número da NF, padrão de 4 dígitos"><input type="file" accept=".xml,.pdf" aria-label="Arquivo da NF (XML ou PDF, até 10 MB)"><button class="btn sm" data-act="na-rmnf" aria-label="Remover NF">×</button>';
  c.appendChild(row);
}
function readNA(){NA.data=$('#na-data').value;const r=$('input[name=na-ac]:checked');NA.acond=r?r.value:'';}
async function refreshSlots(){
  if(!$('#na-slots'))return;readNA();
  const tok=++naTok;let ag=null,erro='';
  if(NA.data){try{ag=await GET('/api/agenda'+qs({data:NA.data}));}catch(e){erro=errTxt(e);}}
  if(tok!==naTok||!$('#na-slots'))return;
  const hoje=hojeISO(),agora=nowLocal().slice(11,16);let livres=0;
  const estado=h=>{
    if(!NA.acond||!NA.data)return{ok:false,sub:'Informe o tipo de carga'};
    if(!ag)return{ok:false,sub:'Indisponível'};
    if(!ag.diaUtil)return{ok:false,sub:'Sem recebimento'};
    const s=(ag.slots||[]).find(x=>x.horario===h);if(!s)return{ok:false,sub:'Indisponível'};
    const cabeAqui=NA.acond==='BATIDO'?s.aceitaBatido:s.aceitaPaletizadoOuBigBag;
    if(cabeAqui&&NA.data===hoje&&h<agora&&!NA.walkin)return{ok:false,sub:'Horário já passou'};
    return cabeAqui?{ok:true,sub:NA.acond==='BATIDO'?'Livre · exclusivo':(MAX_UNITIZADOS-s.ocupados)+' vaga(s)'}:{ok:false,sub:'Indisponível'};
  };
  if(NA.hora&&!estado(NA.hora).ok)NA.hora='';
  $('#na-slots').innerHTML=SLOTS.map(h=>{const e=estado(h);if(e.ok)livres++;
    return '<button class="slotbtn'+(NA.hora===h?' sel':'')+'" data-act="na-slot" data-h="'+h+'"'+(e.ok?'':' disabled')+'><b>'+h+'</b><small>'+e.sub+'</small></button>';}).join('');
  const bloq=ag&&ag.diaUtil===false?String(ag.motivoIndisponivel||'Sem recebimento neste dia.'):'';
  setMsg('#na-msg',erro||bloq||(NA.acond&&NA.data&&ag&&!livres?'Sem horário disponível neste dia para '+ACOND[NA.acond].nome.toLowerCase()+'. Escolha outra data.':''));
  const nr=$('#na-nr');if(nr)nr.hidden=!(NA.walkin&&NA.acond&&NA.data&&ag&&(!livres||bloq));
}
function lerNfs(){
  return $$('#na-nfs .nfrow').map(r=>({numero:fmtNF(r.querySelector('input[type=text]').value),arquivo:r.querySelector('input[type=file]').files[0]||null})).filter(n=>n.numero||n.arquivo);
}
async function saveNewAg(){
  readNA();const forn=resolveForn($('#na-forn').value);const erros=[];
  if(!forn)erros.push('Selecione o fornecedor da lista (ou cadastre um novo).');
  const nfs=lerNfs();
  if(!nfs.length)erros.push('Informe ao menos uma nota fiscal (número ou arquivo).');
  const nums=nfs.map(n=>n.numero).filter(Boolean);
  if(nums.some(n=>!nfValida(n)))erros.push('O número da nota fiscal precisa ter de 1 a 9 dígitos e não pode ser só zeros (ex.: 0524).');
  if(new Set(nums).size!==nums.length)erros.push('Há notas fiscais repetidas nesta entrega.');
  if(nfs.some(n=>n.arquivo&&!/\.(xml|pdf)$/i.test(n.arquivo.name)))erros.push('Os anexos precisam ser .xml ou .pdf.');
  if(nfs.some(n=>n.arquivo&&n.arquivo.size>10*1024*1024))erros.push('Cada anexo pode ter no máximo 10 MB.');
  if(!NA.acond)erros.push('Escolha o acondicionamento.');
  if(!NA.data)erros.push('Escolha a data.');else if(NA.data<hojeISO())erros.push('A data precisa ser hoje ou futura.');
  if(!NA.hora)erros.push('Escolha um horário.');
  if(erros.length){$('#na-msg').innerHTML=erros.map(e=>'<div>'+esc(e)+'</div>').join('');return;}
  let criado;
  try{
    criado=await POST('/api/agendamentos',{fornecedorId:forn.id,data:NA.data,horario:NA.hora,acondicionamento:NA.acond,agendadoNaHora:NA.walkin,
      notas:nfs.map(n=>n.numero?{nfNumero:n.numero}:{})});
  }catch(e){setMsg('#na-msg',errTxt(e));refreshSlots();return;}
  const falhas=[];
  for(let i=0;i<nfs.length;i++){
    if(!nfs[i].arquivo)continue;
    const fd=new FormData();fd.append('arquivo',nfs[i].arquivo);
    try{await http('POST','/api/agendamentos/'+criado.id+'/notas/'+criado.notas[i].id+'/arquivo',undefined,fd);}
    catch(e){falhas.push(nfs[i].arquivo.name+': '+errTxt(e));}
  }
  if(NA.walkin){try{await POST('/api/agendamentos/'+criado.id+'/chegada',{});}catch(e){falhas.push('Chegada não registrada: '+errTxt(e));}}
  closeAll();U.weekStart=mondayOf(NA.data);await refresh();go('agenda');
  toast('Agendamento criado para '+fmtDM(NA.data)+' às '+NA.hora+'. Aguardando Compras.');
  if(falhas.length)setTimeout(()=>toast('O agendamento foi criado, mas houve problema com o anexo. '+falhas.join(' | '),true),600);
}
async function walkinNaoRecebido(){
  readNA();const forn=resolveForn($('#na-forn').value);
  if(!forn){setMsg('#na-msg','Selecione o fornecedor para registrar o não recebimento.');return;}
  try{await POST('/api/nao-recebimentos',{motivo:'SEM_AGENDAMENTO_SEM_VAGA',fornecedorId:forn.id,data:NA.data||hojeISO()});}
  catch(e){setMsg('#na-msg',errTxt(e));return;}
  closeAll();await refresh();go('agenda');toast('Não recebimento registrado: chegou sem agendamento e sem vaga.');
}
async function novoFornecedor(){
  const razao=$('#nf-razao').value.trim(),cnpj=$('#nf-cnpj').value.replace(/\D/g,'');
  if(!razao){setMsg('#na-msg','Informe a razão social do fornecedor.');return;}
  if(cnpj&&cnpj.length!==14){setMsg('#na-msg','O CNPJ precisa ter 14 dígitos.');return;}
  try{
    const f=mapFornecedor(await POST('/api/fornecedores',cnpj?{razaoSocial:razao,cnpj}:{razaoSocial:razao}));
    S.forn.push(f);S.forn.sort((a,b)=>a.nome.localeCompare(b.nome));
    $('#na-fornlist').insertAdjacentHTML('beforeend','<option value="'+esc(fornOpcao(f))+'"></option>');
    $('#na-forn').value=fornOpcao(f);setMsg('#na-msg','');toast('Fornecedor cadastrado.');
  }catch(e){setMsg('#na-msg',errTxt(e));}
}

/* ---- Detalhe do agendamento (gaveta) ---- */
async function openAg(id){
  const a=agById(id);if(!a)return;
  let eventos=[];try{eventos=await GET('/api/agendamentos/'+id+'/eventos');}catch(e){}
  const f=fornById(a.fornecedorId),ds=a.descs;
  const reag=eventos.filter(e=>e.tipo==='REAGENDAMENTO'&&e.detalhe&&e.detalhe.de&&e.detalhe.para);
  const nrs=S.nr.filter(n=>n.agendamentoId===id),vaga=vagaAbertaDe(id);
  const ativo=ativoAg(a),acts=[];
  if(ativo)acts.push('<button class="btn" data-act="reag" data-id="'+id+'">Reagendar</button>');
  if(ativo&&!a.chegadaEm&&!ds.length)acts.push('<button class="btn" data-act="chegou" data-id="'+id+'">Registrar chegada do caminhão</button>');
  if(ativo&&!a.canc)acts.push('<button class="btn" data-act="canc-req" data-id="'+id+'">Solicitar cancelamento</button>');
  if(a.canc&&a.canc.situacao==='SOLICITADO'&&a.status!=='CANCELADO')acts.push('<button class="btn danger" data-act="canc-ok" data-id="'+id+'">Efetivar cancelamento</button>');
  if(ativo)acts.push('<button class="btn" data-act="nr" data-id="'+id+'">Registrar não recebimento</button>');
  if(vaga)acts.push('<button class="btn accent" data-act="open-vaga" data-id="'+vaga.id+'">Decidir quem ocupa a vaga</button>');
  const nomeDest={AGUARDANDO:'aguardando chegada',NA_FILA:'na fila',EM_DESCARGA:'em descarga',CONCLUIDA:'concluída'};
  drawer.innerHTML=
   '<div class="dlg-head"><div><h2>'+esc(f.nome)+'</h2><div class="row" style="margin-top:6px">'+stChip(a.status)+acChipS(a.acond)+origBadge(a.origem)+'</div></div><button class="icon-btn" data-act="close-drawer" aria-label="Fechar">×</button></div>'+
   '<div class="dlg-body">'+
   '<div class="kv"><span>Data <b class="num">'+fmtBR(a.data)+'</b></span><span>Horário <b class="num">'+a.horario+'</b></span>'+(f.cnpj?'<span>CNPJ <b class="num">'+fmtCnpj(f.cnpj)+'</b></span>':'')+(a.chegadaEm?'<span>Chegou <b class="num">'+fmtTS(a.chegadaEm)+'</b></span>':'')+'</div>'+
   (a.naHora?'<div class="callout warn">Entrega que chegou sem agendamento prévio.</div>':'')+
   (a.limiteIgnorado?'<div class="callout warn">Este agendamento excede o limite normal do horário (reagendado por caso fortuito).</div>':'')+
   '<div><div class="sec-t">Notas fiscais</div><div class="tl">'+a.nfs.map(n=>'<div class="num">'+(n.numero?esc(fmtNF(n.numero)):'—')+(n.chave?' · <span class="muted">chave '+esc(n.chave.slice(0,6))+'…'+esc(n.chave.slice(-4))+'</span>':'')+(n.arquivo?' · <a href="/api/agendamentos/'+id+'/notas/'+n.id+'/arquivo">'+esc(n.arquivo)+'</a>':'')+'</div>').join('')+'</div></div>'+
   '<div><div class="sec-t">Compras</div>'+(a.compras?'<div class="tl"><div>Pedido <b>'+esc(a.compras.pedido||'—')+'</b> · '+(a.compras.decisao==='AUTORIZADO'?'<span class="pos">Autorizado</span>':'<span class="neg">Não autorizado</span>')+(a.compras.obs?'<br><span class="muted">'+esc(a.compras.obs)+'</span>':'')+'</div></div>':'<p class="muted">Aguardando validação de Compras.</p>')+'</div>'+
   '<div><div class="sec-t">Destinos e descargas</div>'+(ds.length?'<div class="tl">'+ds.map(d=>'<div><b>'+esc(d.armazem)+'</b> · '+nomeDest[dStatus(d)]+'<br><span class="muted num">chegada '+fmtHM(d.chegada)+' · entrada '+fmtHM(d.entrada)+' · saída '+fmtHM(d.saida)+(d.chapas!=null?' · '+d.chapas+' chapas':'')+'</span></div>').join('')+'</div>':'<p class="muted">Destinos ainda não definidos pelo armazém.</p>')+'</div>'+
   ((reag.length||a.canc||nrs.length)?'<div><div class="sec-t">Histórico</div><div class="tl">'+
     reag.map(e=>'<div>Reagendado de '+fmtDM(e.detalhe.de.data)+' '+String(e.detalhe.de.horario).slice(0,5)+' para '+fmtDM(e.detalhe.para.data)+' '+String(e.detalhe.para.horario).slice(0,5)+' · '+(e.detalhe.casoFortuito?'caso fortuito':'outro motivo')+(e.detalhe.limiteExcedido?' · acima do limite':'')+'<br><span class="muted">'+esc(e.observacao||'')+'</span></div>').join('')+
     (a.canc?'<div>Cancelamento '+(a.canc.situacao==='EFETIVADO'?'efetivado':'solicitado')+' · '+esc(a.canc.motivo)+'</div>':'')+
     nrs.map(n=>'<div>Não recebido · '+(MOTIVOS_NR[n.motivo]||n.motivo)+(n.descricao?' · '+esc(n.descricao):'')+'</div>').join('')+'</div></div>':'')+
   (eventos.length?'<details class="more"><summary>Trilha de auditoria ('+eventos.length+' eventos)</summary><div class="tl">'+eventos.map(e=>'<div><span class="muted num">'+esc(fmtTS(loc(e.ocorridoEm)))+'</span> · '+esc(e.observacao||e.tipo)+'</div>').join('')+'</div></details>':'')+
   '</div><div class="dlg-foot">'+(acts.join('')||'<span class="muted">Sem ações disponíveis nesta situação.</span>')+'</div>';
  if(!drawer.open)drawer.showModal();
}
const dStatus=d=>d.saida?'CONCLUIDA':d.entrada?'EM_DESCARGA':d.chegada?'NA_FILA':'AGUARDANDO';

/* ---- Reagendar, cancelar, não recebimento, vaga liberada ---- */
let RG=null;
function slotPicker(boxId,data,acond,exceptId,fortuito,sel){
  const box=$('#'+boxId);if(!box)return;
  const hoje=hojeISO(),agora=nowLocal().slice(11,16);
  box.innerHTML=SLOTS.map(h=>{
    let ok=false,sub='Escolha a data';
    if(data){
      const bloq=motivoDiaBloqueado(data);
      if(bloq){sub='Sem recebimento';}
      else if(data<hoje||(data===hoje&&h<agora)){sub='Horário já passou';}
      else{const t=ocupantes(data,h,exceptId).tipos;const c=cabe(t,acond);ok=c||fortuito;sub=c?'Disponível':fortuito?'Excede o limite':'Indisponível';}
    }
    return '<button class="slotbtn'+(sel===h?' sel':'')+'" data-act="rg-slot" data-h="'+h+'"'+(ok?'':' disabled')+'><b>'+h+'</b><small>'+sub+'</small></button>';}).join('');
}
async function openReag(id){
  const a=agById(id);RG={id,hora:'',data:a.data};
  modal('Reagendar entrega','<p class="muted">'+esc(fornById(a.fornecedorId).curto)+' · hoje em '+fmtDM(a.data)+' às '+a.horario+' · '+ACOND[a.acond].nome+'</p>'+
   '<label class="f">Motivo<select id="rg-mot"><option value="FORTUITO">Caso fortuito (ex.: chuva): pode exceder a capacidade</option><option value="OUTRO">Outro motivo: respeita a capacidade</option></select></label>'+
   '<label class="f">Nova data<input type="date" id="rg-data" value="'+a.data+'" min="'+hojeISO()+'"></label>'+
   '<div><div class="sec-t">Novo horário</div><div class="slots" id="rg-slots"></div></div>'+
   '<label class="f">Detalhe do motivo <span class="hint" id="rg-hint">opcional para caso fortuito</span><input type="text" id="rg-obs" maxlength="280" placeholder="Ex.: chuva forte no período da manhã"></label><div id="rg-msg" class="errs"></div>',
   '<button class="btn" data-act="close-dlg">Cancelar</button><button class="btn primary" data-act="rg-save">Reagendar</button>');
  await carregarDiasAgenda([a.data]);slotPicker('rg-slots',a.data,a.acond,id,true,'');
}
async function saveReag(){
  const a=agById(RG.id),data=$('#rg-data').value,fort=$('#rg-mot').value==='FORTUITO',det=$('#rg-obs').value.trim();
  if(!data||!RG.hora){setMsg('#rg-msg','Escolha a nova data e o horário.');return;}
  if(!fort&&!det){setMsg('#rg-msg','Descreva o motivo do reagendamento.');return;}
  if(data===a.data&&RG.hora===a.horario){setMsg('#rg-msg','A nova data e horário são iguais aos atuais.');return;}
  const t=ocupantes(data,RG.hora,a.id).tipos,excede=!cabe(t,a.acond);
  try{await POST('/api/agendamentos/'+a.id+'/reagendamento',{data,horario:RG.hora,motivo:det||'Caso fortuito',casoFortuito:fort});}
  catch(e){setMsg('#rg-msg',errTxt(e));return;}
  closeAll();await refresh();openAg(a.id);U.weekStart=mondayOf(data);
  toast(excede?'Reagendado por caso fortuito, acima do limite normal do horário.':'Entrega reagendada.');
}
function openCancReq(id){
  modal('Solicitar cancelamento','<label class="f">Motivo<input type="text" id="cn-mot" maxlength="280" placeholder="Ex.: fornecedor sem veículo disponível"></label><div id="cn-msg" class="errs"></div><p class="muted">Enquanto o cancelamento não for efetivado, o horário continua ocupado.</p>',
   '<button class="btn" data-act="close-dlg">Voltar</button><button class="btn primary" data-act="canc-req-ok" data-id="'+id+'">Solicitar</button>');
}
function nrDialog(id){
  const motivos=Object.entries(MOTIVOS_NR).filter(([k])=>k!=='SEM_AGENDAMENTO_SEM_VAGA');
  modal('Registrar não recebimento','<label class="f">Motivo<select id="nr-mot">'+optsHtml(motivos,'DIVERGENCIA_NF_PEDIDO')+'</select></label><label class="f" id="nr-dw" hidden>Descrição <span class="hint">obrigatória para o motivo “Outro”</span><textarea id="nr-desc" maxlength="280"></textarea></label><div id="nr-msg" class="errs"></div>',
   '<button class="btn" data-act="close-dlg">Voltar</button><button class="btn danger" data-act="nr-ok" data-id="'+id+'">Registrar</button>');
}
async function fillVaga(vagaId){
  const v=S.vagas.find(x=>x.id===vagaId);if(!v)return;
  let cand=[];try{cand=(await GET('/api/vagas-liberadas/'+vagaId+'/candidatos')).map(mapAg);}catch(e){toast(errTxt(e),true);return;}
  cand.sort(porDataHora);
  const aberta=v.status==='ABERTA',hora=String(v.horario).slice(0,5);
  modal('Quem ocupa a vaga de '+fmtDM(v.data)+' às '+hora+'?',
   '<p class="muted">Vaga de '+ACOND[v.acondicionamento].nome.toLowerCase()+' liberada por cancelamento. O sistema não escolhe sozinho: decida abaixo ou libere ao público. Estes agendamentos cabem na vaga conforme a regra de capacidade:</p>'+
   (cand.length?'<div class="stack" style="gap:6px">'+cand.map((a,i)=>'<label class="row" style="gap:10px;border:1px solid var(--line);border-radius:6px;padding:8px 10px"><input type="radio" name="fv" value="'+a.id+'"'+(i===0?' checked':'')+'><span><b>'+esc(fornById(a.fornecedorId).curto)+'</b> · '+ACOND[a.acond].nome+' · hoje em '+fmtDM(a.data)+' '+a.horario+'</span></label>').join('')+'</div>':'<div class="empty">Nenhum agendamento candidato. Libere a vaga ao público ou deixe aberta.</div>')+'<div id="fv-msg" class="errs"></div>',
   '<button class="btn" data-act="close-dlg">Decidir depois</button>'+(aberta?'<button class="btn" data-act="fv-geral" data-id="'+vagaId+'">Liberar ao público</button>':'')+(cand.length&&aberta?'<button class="btn primary" data-act="fv-ok" data-id="'+vagaId+'">Ocupar a vaga</button>':''),true);
}

/* ======================= COMPRAS ======================= */
function viewCompras(){
  const pend=S.ags.filter(a=>a.status==='PENDENTE_COMPRAS').sort(porDataHora);
  const feitos=S.ags.filter(a=>a.compras).sort((a,b)=>porDataHora(b,a)).slice(0,8);
  return head('Validação de Compras','Confira se as notas fiscais batem com o pedido de compra e registre a decisão. Sem integração com o SAP: o número do pedido é digitado.','Quem usa: setor de Compras')+
  (pend.length?'<div class="cards">'+pend.map(a=>{const f=fornById(a.fornecedorId);return '<div class="card ac-'+a.acond+'"><div class="card-head"><div><h3>'+esc(f.nome)+'</h3><div class="kv"><span>Entrega <b class="num">'+fmtDM(a.data)+' · '+a.horario+'</b></span><span>Notas <b>'+nfsTxt(a)+'</b></span>'+(f.cnpj?'<span>CNPJ <b class="num">'+fmtCnpj(f.cnpj)+'</b></span>':'')+'</div></div><div class="row">'+acChipS(a.acond)+origBadge(a.origem)+'</div></div>'+
   '<div class="grid2"><label class="f">Pedido de compra<input type="text" maxlength="20" id="pc-'+a.id+'" placeholder="Ex.: PC-25878"></label><label class="f">Observação <span class="hint">obrigatória se não autorizar</span><input type="text" maxlength="240" id="po-'+a.id+'"></label></div><div id="pe-'+a.id+'" class="errs"></div>'+
   '<div class="row"><button class="btn primary" data-act="compras" data-id="'+a.id+'" data-d="AUTORIZADO">Autorizar</button><button class="btn danger" data-act="compras" data-id="'+a.id+'" data-d="NAO_AUTORIZADO">Não autorizar</button></div></div>';}).join('')+'</div>':'<div class="empty">Nada aguardando validação. Os novos agendamentos aparecem aqui.</div>')+
  '<div class="sec"><h2>Últimas decisões</h2>'+(feitos.length?'<div class="tscroll panel" style="padding:4px 8px"><table><thead><tr><th>Entrega</th><th>Fornecedor</th><th>Pedido</th><th>Decisão</th><th>Origem</th></tr></thead><tbody>'+feitos.map(a=>'<tr class="click" data-act="open-ag" data-id="'+a.id+'"><td class="num">'+fmtDM(a.data)+' '+a.horario+'</td><td>'+esc(fornById(a.fornecedorId).curto)+'</td><td>'+esc(a.compras.pedido||'—')+'</td><td>'+(a.compras.decisao==='AUTORIZADO'?'<span class="chip ok">Autorizado</span>':'<span class="chip bad">Não autorizado</span>')+'</td><td>'+origBadge(a.origem)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">Ainda sem decisões.</div>')+'</div>';
}

/* ======================= ARMAZÉM ======================= */
const descAberta=d=>{const a=agById(d.agId);return a&&['AUTORIZADO','EM_DESCARGA'].includes(a.status)&&!d.saida;};
function viewArmazem(){
  const aguard=S.ags.filter(a=>a.status==='AUTORIZADO'&&!a.descs.length).sort(porDataHora);
  const filt=U.arm.filtro;
  const doFiltro=d=>filt==='Todos'||String(d.armazemId)===String(filt);
  const abertas=todasDescs().filter(d=>descAberta(d)&&doFiltro(d)).sort((x,y)=>porDataHora(agById(x.agId),agById(y.agId)));
  const recentes=todasDescs().filter(d=>d.saida&&doFiltro(d)).sort((a,b)=>b.saida.localeCompare(a.saida)).slice(0,8);
  const cnt={fila:abertas.filter(d=>d.chegada&&!d.entrada).length,desc:abertas.filter(d=>d.entrada).length};
  return head('Recebimento no armazém','Defina para onde cada caminhão vai e registre, em cada descarga, chegada, entrada, saída, chapas e equipamentos.','Quem usa: responsável pelo armazém',
   '<select data-chg="armFiltro" style="width:auto" aria-label="Filtrar por armazém"><option value="Todos">Todos os armazéns</option>'+optsHtml(S.armazens.map(a=>[a.id,a.nome]),filt)+'</select>')+
  '<div class="kpis" style="margin-bottom:22px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"><div class="kpi"><span class="l">Aguardando destino</span><span class="v num">'+aguard.length+'</span></div><div class="kpi"><span class="l">Na fila</span><span class="v num">'+cnt.fila+'</span></div><div class="kpi"><span class="l">Em descarga</span><span class="v num">'+cnt.desc+'</span></div><div class="kpi"><span class="l">Concluídas (recentes)</span><span class="v num">'+recentes.length+'</span></div></div>'+
  '<h2 style="font-size:21px;margin-bottom:10px">Definir destinos</h2>'+
  (aguard.length?'<div class="cards">'+aguard.map(a=>'<div class="card ac-'+a.acond+'"><div class="card-head"><div><h3>'+esc(fornById(a.fornecedorId).nome)+'</h3><div class="kv"><span>Entrega <b class="num">'+fmtDM(a.data)+' · '+a.horario+'</b></span><span>Pedido <b>'+esc(a.compras&&a.compras.pedido||'—')+'</b></span><span>Notas <b>'+nfsTxt(a)+'</b></span></div></div><div class="row">'+acChipS(a.acond)+(a.chegadaEm?'<span class="chip info">Chegou '+fmtHM(a.chegadaEm)+'</span>':'')+origBadge(a.origem)+'</div></div>'+
   '<div><div class="sec-t">Armazéns de destino <span class="muted" style="font-weight:400;font-family:var(--f-ui)">(cada destino vira uma descarga com tempos e recursos próprios)</span></div><div class="row">'+S.armazens.map(r=>'<label class="eq" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" class="dst-'+a.id+'" value="'+r.id+'"> '+esc(r.nome)+'</label>').join('')+'</div></div><div id="de-'+a.id+'" class="errs"></div>'+
   '<div class="row"><button class="btn primary" data-act="destinos" data-id="'+a.id+'">Criar descargas</button>'+(a.chegadaEm?'':'<button class="btn" data-act="chegou" data-id="'+a.id+'">Caminhão chegou agora</button>')+'</div></div>').join('')+'</div>':'<div class="empty">Nenhuma entrega autorizada aguardando destino.</div>')+
  '<h2 style="font-size:21px;margin:26px 0 10px">Descargas em andamento ou previstas</h2>'+
  (abertas.length?'<div class="cards">'+abertas.map(descCard).join('')+'</div>':'<div class="empty">Sem descargas abertas neste filtro.</div>')+
  '<div class="sec"><h2>Concluídas recentemente</h2>'+(recentes.length?'<div class="tscroll panel" style="padding:4px 8px"><table><thead><tr><th>Saída</th><th>Fornecedor</th><th>Armazém</th><th class="r">Espera</th><th class="r">Descarga</th><th class="r">Chapas</th><th>Origem</th></tr></thead><tbody>'+recentes.map(d=>{const a=agById(d.agId);return '<tr><td class="num">'+fmtTS(d.saida)+'</td><td>'+esc(fornById(a.fornecedorId).curto)+'</td><td>'+esc(d.armazem)+'</td><td class="r num">'+fmtDur(d.chegada&&d.entrada?minDiff(d.chegada,d.entrada):null)+'</td><td class="r num">'+fmtDur(minDiff(d.entrada,d.saida))+'</td><td class="r num">'+(d.chapas==null?'—':d.chapas)+'</td><td>'+origBadge(d.origem)+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty">Ainda sem descargas concluídas.</div>')+'</div>';
}
const draft=(d,k)=>{const x=U.dd[d.id];return x&&x[k]!==undefined?x[k]:(d[k]??'');};
function descCard(d){
  const a=agById(d.agId),st=dStatus(d);
  const dr=k=>draft(d,k);
  const esp=d.chegada&&d.entrada?minDiff(d.chegada,d.entrada):null,dur=d.entrada&&d.saida?minDiff(d.entrada,d.saida):null;
  const atraso=d.chegada?minDiff(a.data+'T'+a.horario,d.chegada):null;
  const sel=U.eqSel[d.id]||(U.eqSel[d.id]=new Set(d.equip));
  const meu=S.equip.filter(e=>e.armazemId===d.armazemId),outros=S.equip.filter(e=>e.armazemId!==d.armazemId);
  const eqBtn=e=>'<button class="eq'+(sel.has(e.id)?' on':'')+'" data-act="eq" data-d="'+d.id+'" data-e="'+e.id+'" title="'+esc(e.tipo)+'" aria-pressed="'+sel.has(e.id)+'">'+esc(e.identificacao)+'</button>';
  const f=(k,l)=>{const salvo=!!d[k];return '<div class="step"><label class="f" for="d-'+d.id+'-'+k+'">'+l+(salvo?' <span class="hint">registrada</span>':'')+'</label><div class="row"><input type="datetime-local" id="d-'+d.id+'-'+k+'" data-dd="'+d.id+':'+k+'" value="'+esc(dr(k))+'"'+(salvo?' disabled':'')+'>'+(salvo?'':'<button class="btn sm" data-act="agora" data-t="d-'+d.id+'-'+k+'">Agora</button>')+'</div></div>';};
  return '<div class="card ac-'+a.acond+'" id="dc-'+d.id+'"><div class="card-head"><div><h3>'+esc(fornById(a.fornecedorId).curto)+' → '+esc(d.armazem)+'</h3><div class="kv"><span>Agendado <b class="num">'+fmtDM(a.data)+' · '+a.horario+'</b></span><span>Notas <b>'+nfsTxt(a)+'</b></span></div></div><div class="row">'+acChipS(a.acond)+'<span class="chip '+(st==='AGUARDANDO'?'':'info')+'">'+({AGUARDANDO:'Aguardando chegada',NA_FILA:'Na fila',EM_DESCARGA:'Em descarga',CONCLUIDA:'Concluída'})[st]+'</span>'+(atraso!=null&&atraso>TOLERANCIA_MIN?'<span class="chip warn">Atrasado '+atraso+' min</span>':'')+(d.chegada&&d.chegada.slice(0,10)!==a.data?'<span class="chip warn">Fora da data agendada</span>':'')+origBadge(d.origem)+'</div></div>'+
   '<div class="steps">'+f('chegada','Chegada')+f('entrada','Entrada (início)')+f('saida','Saída (fim)')+'</div>'+
   '<div class="row">'+(esp!=null?'<span class="chip">Espera '+fmtDur(esp)+'</span>':'')+(dur!=null?'<span class="chip">Descarga '+fmtDur(dur)+'</span>':'')+'</div>'+
   '<div class="grid2"><label class="f">Chapas nesta descarga <span class="hint">Referência do Dossiê: '+ACOND[a.acond].chapas+' ('+(a.acond==='BATIDO'?'batido acima de 500 kg':'paletizado/big bag')+'). Serve de alerta, não bloqueia. Gravado junto com a saída.</span><input type="number" min="0" max="100" step="1" id="d-'+d.id+'-chapas" data-dd="'+d.id+':chapas" value="'+esc(dr('chapas'))+'"></label></div>'+
   '<div><div class="sec-t">Equipamentos usados <span class="muted" style="font-weight:400;font-family:var(--f-ui)">(cada unidade é individual; gravados junto com a saída)</span></div><div class="eqs">'+meu.map(eqBtn).join('')+'</div><details class="more"><summary>Equipamentos de outros locais</summary><div class="eqs">'+outros.map(eqBtn).join('')+'</div></details></div>'+
   '<div id="de-'+d.id+'" class="errs"></div><div class="row"><button class="btn primary" data-act="save-desc" data-d="'+d.id+'">Salvar registro</button></div></div>';
}
function validarTempos(ag,d,t){
  const e=[],ts=nowLocal();
  if(t.entrada&&!t.chegada)e.push('Registre a chegada antes da entrada.');
  if(t.saida&&!t.entrada)e.push('Registre a entrada antes da saída.');
  if(t.chegada&&t.entrada&&t.entrada<t.chegada)e.push('A entrada não pode ser anterior à chegada.');
  if(t.entrada&&t.saida&&t.saida<t.entrada)e.push('A saída não pode ser anterior à entrada.');
  if((t.entrada||t.saida)&&!['AUTORIZADO','EM_DESCARGA'].includes(ag.status))e.push('Sem agendamento autorizado, a descarga não pode começar.');
  for(const k of ['chegada','entrada','saida'])if(t[k]&&t[k]>addMin(ts,5))e.push('O horário de '+k+' está no futuro.');
  return e;
}
const descById=id=>todasDescs().find(x=>x.id===id);

/* ======================= AÇÕES ======================= */
Object.assign(ACT,{
  'close-dlg'(){closeAll();},
  'close-drawer'(){drawer.close();},
  week(t){U.weekStart=addDays(U.weekStart,7*Number(t.dataset.d));return semanaMudou();},
  'week-today'(){U.weekStart=semanaAtual();return semanaMudou();},
  'new-ag'(t){openNewAg({data:t.dataset.data,hora:t.dataset.hora});},
  'new-ag-btn'(){openNewAg({});},
  walkin(){openNewAg({},true);},
  'na-addnf'(){addNfRow();},
  'na-rmnf'(t){const rows=$$('#na-nfs .nfrow');if(rows.length>1)t.closest('.nfrow').remove();else{t.closest('.nfrow').querySelector('input[type=text]').value='';t.closest('.nfrow').querySelector('input[type=file]').value='';}},
  'na-slot'(t){NA.hora=t.dataset.h;$$('#na-slots .slotbtn').forEach(b=>b.classList.toggle('sel',b.dataset.h===NA.hora));},
  'na-save'(){return saveNewAg();},
  'na-nr'(){return walkinNaoRecebido();},
  'na-novoforn'(){return novoFornecedor();},
  'open-ag'(t){return openAg(Number(t.dataset.id));},
  reag(t){return openReag(Number(t.dataset.id));},
  'rg-slot'(t){RG.hora=t.dataset.h;$$('#rg-slots .slotbtn').forEach(b=>b.classList.toggle('sel',b.dataset.h===RG.hora));},
  'rg-save'(){return saveReag();},
  chegou:async t=>{
    const id=Number(t.dataset.id);
    try{await POST('/api/agendamentos/'+id+'/chegada',{});}catch(e){toast(errTxt(e),true);return;}
    await refresh();if(drawer.open)openAg(id);toast('Chegada do caminhão registrada.');
  },
  'canc-req'(t){openCancReq(Number(t.dataset.id));},
  'canc-req-ok':async t=>{
    const id=Number(t.dataset.id),m=$('#cn-mot').value.trim();
    if(!m){setMsg('#cn-msg','Informe o motivo do cancelamento.');return;}
    try{await POST('/api/agendamentos/'+id+'/cancelamento',{motivo:m});}catch(e){setMsg('#cn-msg',errTxt(e));return;}
    closeAll();await refresh();openAg(id);toast('Cancelamento solicitado. O horário segue ocupado até a efetivação.');
  },
  'canc-ok':async t=>{
    const id=Number(t.dataset.id);
    try{await POST('/api/agendamentos/'+id+'/cancelamento/efetivacao');}catch(e){toast(errTxt(e),true);return;}
    await refresh();openAg(id);toast('Cancelamento efetivado. A vaga ficou aberta: o armazém decide quem ocupa.');
  },
  nr(t){nrDialog(Number(t.dataset.id));},
  'nr-ok':async t=>{
    const id=Number(t.dataset.id),mot=$('#nr-mot').value,desc=($('#nr-desc')||{value:''}).value.trim();
    if(mot==='OUTRO'&&!desc){setMsg('#nr-msg','Descreva o motivo quando escolher “Outro”.');return;}
    try{await POST('/api/nao-recebimentos',{motivo:mot,agendamentoId:id,descricao:desc||undefined});}catch(e){setMsg('#nr-msg',errTxt(e));return;}
    closeAll();await refresh();openAg(id);toast('Não recebimento registrado.');
  },
  'open-vaga'(t){drawer.open&&drawer.close();return fillVaga(Number(t.dataset.id));},
  'fv-ok':async t=>{
    const sel=$('input[name=fv]:checked');if(!sel)return;
    const v=S.vagas.find(x=>x.id===Number(t.dataset.id)),a=agById(Number(sel.value));
    try{await POST('/api/vagas-liberadas/'+v.id+'/atribuicao',{agendamentoId:a.id});}catch(e){setMsg('#fv-msg',errTxt(e));return;}
    closeAll();drawer.open&&drawer.close();await refresh();toast('Vaga ocupada por '+fornById(a.fornecedorId).curto+'.');
  },
  'fv-geral':async t=>{
    try{await POST('/api/vagas-liberadas/'+Number(t.dataset.id)+'/liberacao-geral');}catch(e){setMsg('#fv-msg',errTxt(e));return;}
    closeAll();await refresh();toast('Vaga liberada ao público: deixou de ocupar o horário.');
  },
  compras:async t=>{
    const id=Number(t.dataset.id),dec=t.dataset.d,ped=$('#pc-'+id).value.trim(),obs=$('#po-'+id).value.trim(),err='#pe-'+id;
    if(dec==='AUTORIZADO'&&!ped){setMsg(err,'Informe o número do pedido para autorizar.');return;}
    if(dec==='NAO_AUTORIZADO'&&!obs){setMsg(err,'Explique na observação por que não autorizou.');return;}
    try{await POST('/api/agendamentos/'+id+'/validacao-compras',{decisao:dec,pedidoReferencia:ped||undefined,observacao:obs||undefined});}catch(e){setMsg(err,errTxt(e));return;}
    await refresh();toast(dec==='AUTORIZADO'?'Autorizado. Segue para o armazém definir destinos.':'Não autorizado. A decisão ficou registrada e a vaga foi liberada.');
  },
  destinos:async t=>{
    const id=Number(t.dataset.id),sel=$$('.dst-'+id+':checked').map(i=>Number(i.value));
    if(!sel.length){setMsg('#de-'+id,'Escolha ao menos um armazém de destino.');return;}
    try{await POST('/api/agendamentos/'+id+'/destinos',{armazemIds:sel});}catch(e){setMsg('#de-'+id,errTxt(e));return;}
    await refresh();toast(sel.length+' descarga(s) criada(s).');
  },
  agora(t){const el=$('#'+t.dataset.t);if(el){el.value=nowLocal();el.dispatchEvent(new Event('input',{bubbles:true}));}},
  eq(t){
    const id=Number(t.dataset.d),e=Number(t.dataset.e),set=U.eqSel[id]||(U.eqSel[id]=new Set());
    set.has(e)?set.delete(e):set.add(e);t.classList.toggle('on',set.has(e));t.setAttribute('aria-pressed',set.has(e));
  },
  'save-desc':async t=>{
    const id=Number(t.dataset.d),d=descById(id),a=agById(d.agId),err='#de-'+id;
    const v=k=>{const el=$('#d-'+id+'-'+k);return el&&el.value?el.value:(d[k]||null);};
    const tempos={chegada:v('chegada'),entrada:v('entrada'),saida:v('saida')};
    const chTxt=$('#d-'+id+'-chapas').value;const chapas=chTxt===''?null:Number(chTxt);
    const erros=validarTempos(a,d,tempos);
    if(chapas!=null&&(!Number.isInteger(chapas)||chapas<0||chapas>100))erros.push('A quantidade de chapas precisa ser um número inteiro entre 0 e 100.');
    if(tempos.saida&&!d.saida&&chapas==null)erros.push('Informe a quantidade de chapas (zero se a carga não exigiu) para registrar a saída.');
    if(erros.length){$(err).innerHTML=erros.map(e=>'<div>'+esc(e)+'</div>').join('');return;}
    let feito=0,falha=null;
    try{
      if(tempos.chegada&&!d.chegada){await POST('/api/descargas/'+id+'/chegada',{ocorridoEm:toOffset(tempos.chegada)});feito++;delete (U.dd[id]||{}).chegada;}
      if(tempos.entrada&&!d.entrada){await POST('/api/descargas/'+id+'/entrada',{ocorridoEm:toOffset(tempos.entrada)});feito++;delete (U.dd[id]||{}).entrada;}
      if(tempos.saida&&!d.saida){await POST('/api/descargas/'+id+'/saida',{quantidadeChapas:chapas,equipamentoIds:[...(U.eqSel[id]||[])],ocorridoEm:toOffset(tempos.saida)});feito++;delete U.dd[id];}
    }catch(e){falha=e;}
    await refresh();
    if(falha){const el=$(err);if(el)el.textContent=errTxt(falha);toast(errTxt(falha),true);return;}
    toast(!feito?'Nada novo para registrar.':tempos.saida?'Descarga concluída e registrada.':'Registro salvo.');
  }
});
async function semanaMudou(){
  const dias=[0,1,2,3,4].map(i=>addDays(U.weekStart,i));
  await carregarDiasAgenda(dias);render();
}
VIEWS.agenda=viewAgenda;VIEWS.compras=viewCompras;VIEWS.armazem=viewArmazem;
