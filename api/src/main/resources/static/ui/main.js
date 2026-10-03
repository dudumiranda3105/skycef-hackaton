'use strict';
/* Estrutura da tela: menu lateral, painéis que deslizam, início, eventos e carga inicial. */

const ICONS={
  agenda:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/></svg>',
  compras:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h8l3 3v11H5z"/><path d="M8 11l2 2 3-4"/></svg>',
  armazem:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 8l8-5 8 5v9H2z"/><path d="M7 17v-5h6v5"/></svg>',
  boletim:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7 7h6M7 10h6M7 13h3"/></svg>',
  painel:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 17V9M8 17V4M13 17v-6M18 17H2"/></svg>'
};
const PANELS=['agenda','compras','armazem','boletim','painel'];
const NAV=[['Recebimento',[['agenda','Agenda'],['compras','Compras'],['armazem','Armazém']]],['Equipe',[['boletim','Boletim diário']]],['Gestão',[['painel','Painel gerencial']]]];
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const stageEl=$('#stage');
let zTop=2;const retractTimers={};

function buildShell(){
  $('#nav').innerHTML=NAV.map(([g,items])=>'<div class="nav-group">'+g+'</div>'+items.map(([r,n])=>'<button class="nav-item" data-act="nav" data-r="'+r+'" aria-expanded="false" aria-controls="pv-'+r+'">'+ICONS[r]+n+'<span class="cnt" id="cnt-'+r+'" hidden></span></button>').join('')).join('');
  stageEl.insertAdjacentHTML('beforeend',PANELS.map(r=>'<section class="pv" id="pv-'+r+'" aria-hidden="true" inert><div class="pv-scroll"><div class="wrap"></div></div></section>').join(''));
}
const panelEl=r=>$('#pv-'+r);
const panelBody=r=>$('#pv-'+r+' .wrap');
function renderPanel(r){panelBody(r).innerHTML=VIEWS[r]();if(r==='boletim')refreshBoletimCalc();}
function setHash(r){try{history.replaceState(null,'','#/'+(r||''));}catch(e){}}

function openPanel(r){
  if(U.route===r){renderPanel(r);return;}
  const prev=U.route;U.route=r;
  clearTimeout(retractTimers[r]);
  const el=panelEl(r);renderPanel(r);
  el.style.zIndex=++zTop;el.inert=false;el.setAttribute('aria-hidden','false');
  void el.offsetWidth;el.classList.add('open');
  stageEl.classList.add('has-open');$('#home').inert=true;
  if(prev){                                   /* o painel anterior fica por baixo até o novo cobrir tudo */
    const pe=panelEl(prev);pe.inert=true;pe.setAttribute('aria-hidden','true');
    retractTimers[prev]=setTimeout(()=>{pe.classList.add('snap');pe.classList.remove('open');void pe.offsetWidth;pe.classList.remove('snap');},REDUCE?250:760);
  }
  syncNav();setHash(r);
  if(r==='painel')carregarPainel();
}
function closePanel(r){
  const el=panelEl(r);el.classList.remove('open');el.inert=true;el.setAttribute('aria-hidden','true');
  if(U.route===r){U.route=null;stageEl.classList.remove('has-open');$('#home').inert=false;renderHome();setHash('');}
  syncNav();
}
function togglePanel(r){U.route===r?closePanel(r):openPanel(r);}
const go=openPanel;                           /* "garantir aberto": usado depois de salvar algo */
function syncNav(){$$('.nav-item').forEach(b=>{const on=b.dataset.r===U.route;b.classList.toggle('on',on);b.setAttribute('aria-expanded',on);});}

function updateBadges(){
  const pend=S.ags.filter(a=>a.status==='PENDENTE_COMPRAS').length;
  const aguard=S.ags.filter(a=>a.status==='AUTORIZADO'&&!a.descs.length).length;
  const emAnd=todasDescs().filter(d=>descAberta(d)&&d.chegada).length;
  const set=(id,n)=>{const el=$('#'+id);el.hidden=!n;el.textContent=n;};
  set('cnt-compras',pend);set('cnt-armazem',aguard+emAnd);
}
function render(){
  if(U.route)renderPanel(U.route);
  renderHome();syncNav();updateBadges();
}
/* recarrega o que mudou no banco e redesenha */
async function refresh(){
  await carregarMovimento();
  await carregarDiasAgenda([0,1,2,3,4].map(i=>addDays(U.weekStart,i)));
  render();
}

/* =================== INÍCIO =================== */
function viewHome(){
  if(!S.carregado)return '<div class="wrap"><section class="hero"><div><h1>Recebimento Inteligente</h1><p class="sub">'+(S.erro?'':'Carregando os dados…')+'</p></div></section>'+(S.erro?'<div class="callout bad">'+esc(S.erro)+' <button class="btn sm" data-act="reload">Tentar de novo</button></div>':'')+'</div>';
  const wk=semanaAtual(),wkEnd=addDays(wk,4);
  const semana=S.ags.filter(a=>a.data>=wk&&a.data<=wkEnd&&!LIBERAM_VAGA.includes(a.status)).length;
  const pend=S.ags.filter(a=>a.status==='PENDENTE_COMPRAS').length;
  const semDest=S.ags.filter(a=>a.status==='AUTORIZADO'&&!a.descs.length).length;
  const aberto=todasDescs().filter(descAberta);
  const fila=aberto.filter(d=>d.chegada&&!d.entrada).length,emDesc=aberto.filter(d=>d.entrada).length;
  const bols=[...S.boletins].sort((a,b)=>b.data.localeCompare(a.data));
  const ult=bols[0],R=respostaHome();
  const origPlat=S.ags.some(a=>a.origem==='TESTE')?'TESTE':'PLATAFORMA';
  const mod=(r,cor,nome,big,sub,orig)=>'<button class="mod" data-act="nav" data-r="'+r+'" style="--mc:'+cor+'"><span class="ic">'+ICONS[r]+'</span><span class="mn">'+nome+'</span><span class="big num">'+big+'</span><span class="ms">'+sub+'</span>'+origBadge(orig)+'</button>';
  const ask=R?'<span class="fig num">'+nf1.format(+R.menor.d)+' diárias</span><span class="rs2 num">'+brl0(R.menor.r)+' a realocar</span><small>'+(R.descompasso?'Folga na safra, pressão na entressafra: a equipe está mal distribuída no tempo. ':'')+'Histórico, '+mLabel(R.de)+' a '+mLabel(R.ate)+'. Folga '+brl0(R.sobra.sobraReais)+' · pressão '+brl0(R.sobra.faltaReais)+', ao piso.</small>'
    :'<span class="rs2">Histórico ainda não carregado</span><small>Carregue o pacote da Cocapec (README, “Carregar dados”) para ver a folga e a pressão em reais. Os boletins da plataforma já alimentam o painel.</small>';
  return '<div class="wrap"><section class="hero"><div><h1>Recebimento Inteligente</h1><p class="sub">Agende o caminhão, receba no armazém, feche o boletim da equipe e veja o que isso significa em reais. Cada seção abre deslizando do menu ao lado; clique nela de novo para guardar.</p></div>'+
   '<div class="ask"><small>A pergunta da direção</small><b>A quantidade de chapas está sobrando ou faltando?</b>'+ask+'<button class="btn accent" data-act="nav" data-r="painel">Ver os números e as fontes</button></div></section>'+
   '<div class="hub">'+
    mod('agenda','var(--blue)','Agenda',nf0.format(semana),'entregas na semana · '+pend+' aguardando Compras',origPlat)+
    mod('compras','var(--green)','Compras',nf0.format(pend),pend===1?'entrega aguardando validação':'entregas aguardando validação',origPlat)+
    mod('armazem','var(--yellow-deep)','Armazém',nf0.format(semDest+fila+emDesc),semDest+' sem destino · '+fila+' na fila · '+emDesc+' em descarga',origPlat)+
    mod('boletim','var(--green)','Boletim diário',ult?brl4(ult.total||ult.producao):'—',ult?('último: '+esc(ult.armazem)+', '+fmtDM(ult.data)+' · '+nf0.format(bols.length)+' boletins salvos'):'nenhum boletim salvo ainda',ult?ult.origem:origPlat)+
    mod('painel','var(--blue)','Painel gerencial',R?nf1.format(+R.menor.d)+' dia.':'—','diárias a realocar entre períodos, com a fonte de cada número','HISTORICO')+
   '</div>'+
   '<div class="legend-home"><span>Origem dos números:</span>'+origBadge('HISTORICO')+' pacote de dados da Cocapec '+origBadge('PLATAFORMA')+' registrado no sistema '+origBadge('TESTE')+' dados de demonstração</div></div>';
}
function renderHome(){const el=$('#home');if(el)el.innerHTML=viewHome();}

/* inclinação 3D leve dos cartões do início */
document.addEventListener('pointermove',e=>{
  if(REDUCE)return;const m=e.target.closest&&e.target.closest('.mod');if(!m)return;
  const b=m.getBoundingClientRect(),px=(e.clientX-b.left)/b.width-.5,py=(e.clientY-b.top)/b.height-.5;
  m.style.transform='perspective(900px) rotateX('+(-py*9).toFixed(2)+'deg) rotateY('+(px*11).toFixed(2)+'deg)';
});
document.addEventListener('pointerout',e=>{const m=e.target.closest&&e.target.closest('.mod');if(m&&!m.contains(e.relatedTarget))m.style.transform='';});

/* =================== EVENTOS =================== */
Object.assign(ACT,{
  nav(t){togglePanel(t.dataset.r);},
  home(){if(U.route)closePanel(U.route);},
  theme(){const r=document.documentElement;const dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.dataset.theme=dark?'light':'dark';},
  reload:async()=>{
    if(!S.carregado){await iniciar();return;}
    await carregarCadastros();await refresh();
    if(U.route==='painel')await carregarPainel();else carregarResumoHome();
    toast('Dados atualizados.');
  }
});
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t||t.disabled)return;
  const fn=ACT[t.dataset.act];if(!fn)return;
  e.preventDefault();
  let r;try{r=fn(t,e);}catch(err){toast(errTxt(err),true);return;}
  if(r&&r.then){t.disabled=true;r.catch(err=>toast(errTxt(err),true)).finally(()=>{t.disabled=false;});}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.bol)onBolInput(t);
  else if(t.dataset.dd){const [id,k]=t.dataset.dd.split(':');(U.dd[id]=U.dd[id]||{})[k]=t.value;}
  else if(t.classList&&t.classList.contains('nf')){const c=t.value.replace(/\D/g,'').slice(0,9);if(c!==t.value)t.value=c;}
  else if(t.id==='na-data'||t.name==='na-ac'){refreshSlots();}
  else if(t.id==='rg-data'){const a=agById(RG.id);RG.hora='';carregarDiasAgenda([t.value]).then(()=>slotPicker('rg-slots',t.value,a.acond,a.id,$('#rg-mot').value==='FORTUITO',''));}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('nf')){t.value=fmtNF(t.value);return;}
  if(t.dataset.pf){const k=t.dataset.pf;U.pf[k]=k==='teste'?t.checked:t.value;if(U.pf.from>U.pf.to){if(k==='from')U.pf.to=U.pf.from;else U.pf.from=U.pf.to;}carregarPainel();}
  else if(t.dataset.chg==='agTodas'){U.agTodas=t.checked;render();}
  else if(t.dataset.chg==='agStatus'){U.agStatus=t.value;render();}
  else if(t.dataset.chg==='armFiltro'){U.arm.filtro=t.value;render();}
  else if(t.dataset.eqtipo!==undefined){U.bol.equipe[Number(t.dataset.eqtipo)].tipo=t.value;refreshBoletimCalc();}
  else if(t.id==='bol-arm'||t.id==='bol-data'){ACT['bol-abrir']();}
  else if(t.id==='nr-mot'){$('#nr-dw').hidden=t.value!=='OUTRO';}
  else if(t.id==='rg-mot'){const a=agById(RG.id),fort=t.value==='FORTUITO';RG.hora='';$('#rg-hint').textContent=fort?'opcional para caso fortuito':'obrigatório';slotPicker('rg-slots',$('#rg-data').value,a.acond,a.id,fort,'');}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.id==='eq-m'){e.preventDefault();ACT['eq-add']();return;}
  if(e.key!=='Escape'||dlg.open||drawer.open||!U.route)return;
  const tag=(e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select')return;
  closePanel(U.route);
});

/* =================== INÍCIO DO APP =================== */
async function iniciar(){
  S.erro=null;S.carregado=false;renderHome();
  const conn=$('#conn');
  try{
    await carregarCadastros();await carregarMovimento();
    await carregarDiasAgenda([0,1,2,3,4].map(i=>addDays(U.weekStart,i)));
    S.carregado=true;
    const arm=armId('Adubo')||(S.armazens[0]&&S.armazens[0].id);
    U.bol=novoRascunho(arm,ultimoDiaUtil());
    conn.textContent='Ligado à API. Os dados ficam no PostgreSQL.';
  }catch(e){
    S.erro=errTxt(e);conn.textContent='Sem conexão com a API.';renderHome();return;
  }
  render();carregarResumoHome();
  try{const h=(location.hash||'').replace('#/','');if(VIEWS[h])setTimeout(()=>openPanel(h),80);}catch(e){}
}
buildShell();
iniciar();
