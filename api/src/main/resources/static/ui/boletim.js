'use strict';
/* Tarefa 2: boletim diário dos chapas, lançado de uma vez para os 4 armazéns.
   Por baixo, a API continua gravando um boletim por armazém e por dia (regra do Dossiê e UNIQUE(armazem_id, data)),
   o que mantém o painel por armazém. As linhas são somadas aqui só para dar retorno imediato; piso, complemento
   e totais vêm sempre de POST /api/boletins/calculo (a mesma conta que grava o boletim). */

const CAMPOS_Q=['d','r','t'];
const NOME_Q={d:'descarga',r:'remoção',t:'transferência'};
const cent4=s=>{const [i,f='']=String(s).split('.');return BigInt((i||'0')+f.padEnd(4,'0').slice(0,4));};
const big4=v=>{const s=v.toString().padStart(5,'0');return s.slice(0,-4)+'.'+s.slice(-4);};
const qItem=(sec,cod)=>{const it=sec.itens[cod]||{};return(+it.d||0)+(+it.r||0)+(+it.t||0);};

let calcTimer=null;const calcTok={};
U.calc={};        /* armazemId -> resposta da prévia ou {erro} */

function secVazia(){return{itens:{},equipe:[],saved:null};}
function secDoBoletim(ex){
  const itens={};ex.linhas.forEach(l=>{itens[l.tipoItem]={d:l.descarga,r:l.remocao,t:l.transferencia,preco:l.precoUnitario};});
  return{itens,equipe:ex.equipe.map(m=>({matricula:m.matricula,tipo:m.tipoDiaria})),saved:ex};
}
/* um dia inteiro: uma seção por armazém; as que já estão gravadas abrem somente para leitura */
function novoDia(data,aba){
  const sec={};
  S.armazens.forEach(a=>{const ex=S.boletins.find(b=>b.armazemId===a.id&&b.data===data);sec[a.id]=ex?secDoBoletim(ex):secVazia();});
  U.calc={};
  return{data,aba:aba||(S.armazens[0]&&S.armazens[0].id),sec};
}
const secAtual=()=>U.bol.sec[U.bol.aba];
const secPreenchida=s=>S.tipos.some(t=>qItem(s,t.codigo)>0)||s.equipe.length>0;
function ultimoDiaUtil(){let d=addDays(hojeISO(),-1);while(dow(d)===0)d=addDays(d,-1);return d;}   /* sábado também tem boletim */
function dadosResumo(x){
  if(!x||x.erro)return null;
  if(x.producaoTotal!==undefined)return{producao:x.producaoTotal,diarias:x.diariasEquivalentes,vpd:x.valorPorDiaria,total:x.totalAPagar,complemento:x.complemento,abaixo:x.abaixoDoPiso,situacao:x.situacao,exib:x.exibicao||{},completas:x.chapasDiariaCompleta,meias:x.chapasMeiaDiaria,piso:x.piso};
  return{producao:x.producao,diarias:x.diarias,vpd:x.vpd,total:x.total,complemento:x.complemento,abaixo:x.abaixo,situacao:x.situacao,exib:x.exib,completas:x.completas,meias:x.meias,piso:S.piso};
}
function payloadSec(armazemId){
  const b=U.bol,s=b.sec[armazemId];
  const linhas=S.tipos.filter(t=>qItem(s,t.codigo)>0).map(t=>{const it=s.itens[t.codigo];return{tipoItem:t.codigo,descarga:+it.d||0,remocao:+it.r||0,transferencia:+it.t||0};});
  return{armazemId,data:b.data,linhas,equipe:s.equipe.map(e=>({matricula:e.matricula,tipoDiaria:e.tipo}))};
}
const resumoDe=armazemId=>{const s=U.bol.sec[armazemId];return s.saved?dadosResumo(s.saved):dadosResumo(U.calc[armazemId]);};
function estadoSec(armazemId){
  const s=U.bol.sec[armazemId];
  if(s.saved)return{k:'salvo',t:'gravado'};
  if(!secPreenchida(s))return{k:'vazio',t:'vazio'};
  return{k:'rascunho',t:'a salvar'};
}

function viewBoletim(){
  const b=U.bol,s=secAtual(),podeLancar=pf('boletim'),ro=!!s.saved||!podeLancar,arm=armById(b.aba);
  const dias=[...new Set(S.boletins.map(x=>x.data))].sort().reverse().slice(0,10);
  const rows=S.tipos.map(t=>{
    const preco=ro&&s.itens[t.codigo]&&s.itens[t.codigo].preco?s.itens[t.codigo].preco:t.precoUnitario;
    return '<tr><td>'+esc(t.descricao)+'</td><td class="r num pr">'+brl4(preco)+'</td>'+
    CAMPOS_Q.map(f=>'<td class="r"><input class="qty" type="text" inputmode="numeric" autocomplete="off" maxlength="8" data-bol="'+t.codigo+':'+f+'" value="'+((s.itens[t.codigo]||{})[f]||'')+'"'+(ro?' disabled':'')+' aria-label="'+esc(t.descricao)+', '+NOME_Q[f]+'"></td>').join('')+
    '<td class="r num" id="bq-'+t.codigo+'">0</td><td class="r num" id="bv-'+t.codigo+'">—</td></tr>';}).join('');
  const nSalvos=S.armazens.filter(a=>b.sec[a.id].saved).length,nRasc=S.armazens.filter(a=>estadoSec(a.id).k==='rascunho').length;
  const abas=S.armazens.map(a=>{const e=estadoSec(a.id);
    return '<button role="tab" class="'+(a.id===b.aba?'on':'')+'" data-act="bol-aba" data-id="'+a.id+'" aria-selected="'+(a.id===b.aba)+'">'+esc(a.nome)+' <span class="chip '+(e.k==='salvo'?'ok':e.k==='rascunho'?'warn':'')+'" style="margin-left:4px">'+e.t+'</span></button>';}).join('');
  return head('Boletim diário dos ensacadores','Um lançamento por dia, com os 4 armazéns de uma vez: escolha o dia, preencha a produção e a equipe de cada armazém e salve tudo junto. O sistema calcula produção, piso e complemento com 4 casas decimais.','Quem usa: responsável pelo armazém, normalmente no dia seguinte',
   (podeLancar?'<button class="btn" data-act="bol-exemplo">Carregar exemplo oficial</button>':''))+
  '<div class="filters"><label class="f">Data de referência<input type="date" id="bol-data" value="'+b.data+'" max="'+hojeISO()+'"></label>'+
   '<span class="chip '+(nSalvos===S.armazens.length?'info':'ok')+'">'+nSalvos+' de '+S.armazens.length+' armazéns gravados neste dia</span>'+(nRasc?'<span class="chip warn">'+nRasc+' a salvar</span>':'')+'</div>'+
  '<div class="tabs" role="tablist" aria-label="Armazém do boletim" style="margin-bottom:16px;flex-wrap:wrap">'+abas+'</div>'+
  (!podeLancar?'<div class="callout" style="margin-bottom:16px">O seu perfil só consulta os boletins: aqui você vê o que já foi gravado.</div>':'')+(s.saved?'<div class="callout" style="margin-bottom:16px">O boletim de <b>'+esc(arm.nome)+'</b> neste dia já foi gravado ('+origBadge(s.saved.origem)+'). Há um boletim por armazém e por dia, e a gravação não é editável: confira os números abaixo.</div>':'')+
  '<div class="bol-layout"><div class="stack">'+
   '<div class="panel"><h2>Produção do dia · '+esc(arm.nome)+'</h2>'+
   '<p class="lead">Escolha o tipo de cada linha: o sistema não adivinha. Quantidade total = descarga + remoção + transferência. As quantidades são números inteiros; os preços são os da tabela vigente.</p>'+
   '<div class="tscroll"><table class="bol-table"><thead><tr><th>Tipo de item</th><th class="r">Preço unitário</th><th class="r">Descarga</th><th class="r">Remoção</th><th class="r">Transferência</th><th class="r">Qtd. total</th><th class="r">Valor</th></tr></thead><tbody>'+rows+'<tr class="total-line"><td colspan="5">Produção total</td><td class="r num" id="bq-tot">0</td><td class="r num" id="bv-tot">R$ 0,0000</td></tr></tbody></table></div>'+
   '<div id="bol-qerr" class="errs" style="margin-top:8px"></div></div>'+
   '<div class="panel" id="bol-equipe"></div></div>'+
  '<div class="sticky stack"><div class="panel resumo" id="bol-resumo"></div>'+(podeLancar?'<div class="row"><button class="btn primary" data-act="bol-salvar"'+(nRasc?'':' disabled')+'>Salvar boletim do dia'+(nRasc?' ('+nRasc+' '+(nRasc>1?'armazéns':'armazém')+')':'')+'</button><button class="btn" data-act="bol-limpar">Limpar o dia</button></div>':'')+'<div id="bol-msg" class="errs"></div></div></div>'+
  '<div class="sec"><h2>Boletins salvos</h2>'+(dias.length?'<div class="tscroll panel tbl"><table><thead><tr><th>Data</th><th>Armazéns</th><th class="r">Produção</th><th class="r">Complemento</th><th class="r">Total a pagar</th><th>Origem</th></tr></thead><tbody>'+dias.map(d=>{
    const L=S.boletins.filter(x=>x.data===d),ok=L.filter(x=>x.situacao==='CONSISTENTE');
    const sm=(arr,k)=>arr.reduce((t,x)=>t+cent4(x[k]),0n);const origens=[...new Set(L.map(x=>x.origem))];
    return '<tr class="click" data-act="bol-open" data-d="'+d+'"><td class="num">'+fmtBR(d)+'</td><td>'+L.map(x=>'<span class="chip'+(x.situacao==='CONSISTENTE'?'':' bad')+'">'+esc(x.armazem)+'</span>').join(' ')+'</td><td class="r num">'+brl4(big4(sm(L,'producao')))+'</td><td class="r num">'+brl4(big4(sm(ok,'complemento')))+'</td><td class="r num">'+brl4(big4(sm(ok,'total')))+(L.length-ok.length?' <span class="chip bad">'+(L.length-ok.length)+' inconsistente(s)</span>':'')+'</td><td>'+origens.map(origBadge).join(' ')+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty">Nenhum boletim salvo ainda.</div>')+'</div>';
}
function equipeHtml(){
  const s=secAtual(),L=s.equipe,ro=!!s.saved||!pf('boletim');
  return '<div class="row" style="justify-content:space-between"><h2>Equipe do dia · '+esc(armById(U.bol.aba).nome)+'</h2><span class="chip '+(L.length>=MAX_CHAPAS_BOLETIM?'warn':'')+' num">'+L.length+' de '+MAX_CHAPAS_BOLETIM+'</span></div><p class="lead">Digite a matrícula: o nome vem do cadastro. A mesma pessoa pode estar em mais de um armazém no mesmo dia.</p>'+
   (ro?'':'<div class="row" style="align-items:flex-end"><label class="f" style="flex:1;min-width:130px">Matrícula<input type="text" list="roster" id="eq-m" autocomplete="off" placeholder="Ex.: CHAPA_08"></label><label class="f" style="width:130px">Diária<select id="eq-t"><option value="COMPLETA">Completa</option><option value="MEIA">Meia</option></select></label><button class="btn" data-act="eq-add">Adicionar</button></div>'+
   '<datalist id="roster">'+S.chapas.map(r=>'<option value="'+esc(r.matricula)+'">'+esc(r.nome)+'</option>').join('')+'</datalist><div id="eq-msg" class="errs" style="margin:6px 0"></div>')+
   (L.length?L.map((e,i)=>{const r=S.chapas.find(x=>x.matricula===e.matricula);return '<div class="team-row"><span class="num">'+esc(e.matricula)+'</span><span>'+esc(r?r.nome:'—')+'</span>'+(ro?'<span>'+(e.tipo==='MEIA'?'Meia':'Completa')+'</span><span></span>':'<select data-eqtipo="'+i+'" aria-label="Diária de '+esc(e.matricula)+'"><option value="COMPLETA"'+(e.tipo==='COMPLETA'?' selected':'')+'>Completa</option><option value="MEIA"'+(e.tipo==='MEIA'?' selected':'')+'>Meia</option></select><button class="icon-btn" style="font-size:20px" data-act="eq-rm" data-i="'+i+'" aria-label="Remover">×</button>')+'</div>';}).join(''):'<div class="empty" style="margin-top:8px">Nenhum chapa lançado.</div>');
}
function resolveChapa(txt){
  const t=String(txt||'').trim().toUpperCase();if(!t)return null;
  return S.chapas.find(c=>c.matricula===t)||(/^\d{1,2}$/.test(t)?S.chapas.find(c=>c.matricula==='CHAPA_'+pad(+t)):null)||null;
}
function podeAdicionarChapa(txt){
  const b=U.bol,s=secAtual(),ch=resolveChapa(txt);
  if(!String(txt||'').trim())return{ok:false,erro:'Informe a matrícula.'};
  if(!ch)return{ok:false,erro:'Matrícula '+txt.trim()+' não encontrada no cadastro.'};
  if(s.equipe.some(e=>e.matricula===ch.matricula))return{ok:false,erro:ch.nome+' já está neste boletim.'};
  if(s.equipe.length>=MAX_CHAPAS_BOLETIM)return{ok:false,erro:'Limite de '+MAX_CHAPAS_BOLETIM+' chapas por boletim.'};
  const outro=S.armazens.find(a=>a.id!==b.aba&&b.sec[a.id].equipe.some(e=>e.matricula===ch.matricula));
  return{ok:true,ch,aviso:outro?('Também consta no boletim de '+outro.nome+' nesta data. Isso é permitido.'):null};
}

/* linhas e total da produção: soma exata com inteiros (BigInt), sem float */
function atualizaLinhas(){
  const s=secAtual();let tot=0n,qt=0;
  S.tipos.forEach(t=>{
    const q=qItem(s,t.codigo);const preco=s.saved&&s.itens[t.codigo]&&s.itens[t.codigo].preco?s.itens[t.codigo].preco:t.precoUnitario;
    const v=cent4(preco)*BigInt(q);tot+=v;qt+=q;
    const qe=$('#bq-'+t.codigo),ve=$('#bv-'+t.codigo);if(qe){qe.textContent=nf0.format(q);ve.textContent=q?brl4(big4(v)):'—';}
  });
  const qe=$('#bq-tot');if(qe){qe.textContent=nf0.format(qt);$('#bv-tot').textContent=brl4(big4(tot));}
}
function refreshBoletimCalc(){
  const eqEl=$('#bol-equipe');if(eqEl&&!eqEl.dataset.ready){eqEl.innerHTML=equipeHtml();eqEl.dataset.ready='1';}
  atualizaLinhas();
  const b=U.bol,s=secAtual();
  if(!s.saved){
    const pl=payloadSec(b.aba);
    if(!pl.linhas.length&&!pl.equipe.length)delete U.calc[b.aba];
    else{clearTimeout(calcTimer);calcTimer=setTimeout(()=>calcular(b.aba),220);}
  }
  pintaResumo();atualizaAbas();
}
async function calcular(armazemId){
  const tok=(calcTok[armazemId]||0)+1;calcTok[armazemId]=tok;
  const pl=payloadSec(armazemId);if(!pl.linhas.length&&!pl.equipe.length)return;
  let r=null,erro=null;
  try{r=await POST('/api/boletins/calculo',pl);if(r&&r.piso)S.piso=r.piso;}catch(e){erro=errTxt(e);}
  if(tok!==calcTok[armazemId]||!$('#bol-resumo'))return;
  U.calc[armazemId]=erro?{erro}:r;pintaResumo();
}
function atualizaAbas(){
  $$('[data-act=bol-aba]').forEach(btn=>{const e=estadoSec(Number(btn.dataset.id));const c=btn.querySelector('.chip');if(c){c.textContent=e.t;c.className='chip '+(e.k==='salvo'?'ok':e.k==='rascunho'?'warn':'');}});
  const nRasc=S.armazens.filter(a=>estadoSec(a.id).k==='rascunho').length,sv=$('[data-act=bol-salvar]');
  if(sv){sv.disabled=!nRasc;sv.textContent='Salvar boletim do dia'+(nRasc?' ('+nRasc+' '+(nRasc>1?'armazéns':'armazém')+')':'');}
}
function pintaResumo(){
  const R=$('#bol-resumo');if(!R)return;
  const b=U.bol,c=resumoDe(b.aba),erro=(U.calc[b.aba]||{}).erro,piso=brl4(S.piso);
  /* visão do dia: um total por armazém e a soma */
  let totDia=0n,compDia=0n,n=0;
  const linhasDia=S.armazens.map(a=>{
    const r=resumoDe(a.id),e=estadoSec(a.id);
    if(r&&r.situacao==='CONSISTENTE'){totDia+=cent4(r.total);compDia+=cent4(r.complemento);n++;}
    return '<div class="ln"><span>'+esc(a.nome)+'<small>'+(e.k==='vazio'?'sem lançamento':e.k==='salvo'?'gravado':'a salvar')+(r&&r.situacao==='INCONSISTENTE'?' · inconsistente':'')+'</small></span><b class="num">'+(r&&r.situacao==='CONSISTENTE'?brl2(r.total):'—')+'</b></div>';}).join('');
  let h='<h2>Fechamento do dia</h2>'+linhasDia+'<div class="ln" style="font-weight:700"><span>Total do dia<small>'+n+' armazém(ns) com cálculo · complemento '+brl2(big4(compDia))+'</small></span><b class="num">'+brl2(big4(totDia))+'</b></div>';
  h+='<h2 style="margin-top:6px;font-size:17px">'+esc(armById(b.aba).nome)+'</h2>';
  if(erro)h+='<div class="callout bad">'+esc(erro)+'</div>';
  if(!c){
    if(!erro)h+='<p class="muted">'+(secPreenchida(secAtual())?'Calculando…':'Lance a produção e a equipe para ver o cálculo.')+'</p>';
    R.innerHTML=h;return;
  }
  if(c.situacao==='INCONSISTENTE')h+='<div class="callout bad"><b>Boletim inconsistente.</b> Há produção, mas nenhuma diária lançada. O pagamento não pode ser calculado: confira a equipe antes de salvar.</div>';
  h+='<div class="ln"><span>Produção total<small>soma das linhas, cada uma com 4 casas</small></span><b class="num">'+brl4(c.producao)+'</b></div>'+
     '<div class="ln"><span>Diárias equivalentes<small>'+c.completas+' completa(s) + '+c.meias+' meia(s)</small></span><b class="num">'+nf1.format(+c.diarias)+'</b></div>';
  if(c.situacao==='CONSISTENTE'){
    const vpd=+c.vpd,pf=+S.piso,mx=Math.max(vpd,pf)*1.25;
    h+='<div><div class="ln" style="border:0;padding:0"><span>Valor por diária<small>Piso: '+piso+'</small></span><b class="num">'+brl4(c.vpd)+'</b></div><div class="gauge" role="img" aria-label="Valor por diária comparado ao piso"><i class="'+(c.abaixo?'low':'')+'" style="width:'+Math.min(100,vpd/mx*100)+'%"></i><u style="left:'+(pf/mx*100)+'%"></u></div></div>'+
       '<div class="ln"><span>Complemento<small>'+(c.abaixo?'Abaixo do piso: completa até '+piso+' por diária':'Acima do piso: paga a produção, sem teto')+'</small></span><b class="num '+(c.abaixo?'neg':'')+'">'+brl4(c.complemento)+'</b></div>'+
       '<div><span class="muted">Total a pagar</span><div class="big num">'+brl4(c.total)+'</div><small class="muted num">'+brl2(c.total)+' em reais e centavos · é o custo da operação no painel</small></div>';
  }
  R.innerHTML=h;
}
/* salva as seções preenchidas: valida todas antes (prévia da API) e grava uma a uma */
async function bolSalvar(){
  const b=U.bol;
  if(!b.data){setMsg('#bol-msg','Escolha a data de referência.');return;}
  const alvo=S.armazens.filter(a=>estadoSec(a.id).k==='rascunho');
  if(!alvo.length){setMsg('#bol-msg','Lance a produção ou a equipe de ao menos um armazém.');return;}
  setMsg('#bol-msg','');
  for(const a of alvo){
    try{await POST('/api/boletins/calculo',payloadSec(a.id));}
    catch(e){setMsg('#bol-msg',a.nome+': '+errTxt(e));b.aba=a.id;render();return;}
  }
  const gravados=[];let falha=null;
  for(const a of alvo){
    try{const r=await POST('/api/boletins',payloadSec(a.id));gravados.push({a,r});}
    catch(e){falha={a,e};break;}
  }
  await carregarMovimento();
  gravados.forEach(({a})=>{const ex=S.boletins.find(x=>x.armazemId===a.id&&x.data===b.data);if(ex){const s=b.sec[a.id];Object.assign(s,secDoBoletim(ex));}});
  render();
  if(falha){setMsg('#bol-msg',(gravados.length?gravados.length+' armazém(ns) gravado(s). ':'')+falha.a.nome+' não foi gravado: '+errTxt(falha.e)+' Corrija e salve de novo: os já gravados não serão repetidos.');b.aba=falha.a.id;render();return;}
  const inc=gravados.filter(g=>g.r.situacao==='INCONSISTENTE').length;
  const tot=gravados.filter(g=>g.r.situacao==='CONSISTENTE').reduce((t,g)=>t+cent4(g.r.totalAPagar),0n);
  toast(gravados.length+' boletim(ns) do dia gravado(s). Total a pagar '+brl2(big4(tot))+'.'+(inc?' '+inc+' ficou inconsistente: pendente de conferência.':''));
}
function onBolInput(t){
  const [k,f]=t.dataset.bol.split(':'),s=secAtual();
  const limpo=t.value.replace(/\D/g,'');const err=$('#bol-qerr');
  if(limpo!==t.value){t.value=limpo;err.textContent='As quantidades são números inteiros, sem vírgula nem sinal.';}else err.textContent='';
  (s.itens[k]=s.itens[k]||{d:0,r:0,t:0})[f]=limpo===''?0:Number(limpo);
  refreshBoletimCalc();
}

/* ---- Conferência do cálculo oficial contra a API ---- */
async function verificarCalculo(){
  const ids=['CHAPA_08','CHAPA_09','CHAPA_15','CHAPA_48','CHAPA_37','CHAPA_38','CHAPA_41','CHAPA_42','CHAPA_43','CHAPA_49','CHAPA_30'];
  const adubo=armId('Adubo')||2;
  const linhas=[{tipoItem:'FERTILIZANTES',descarga:2778},{tipoItem:'AGROQUIMICO',descarga:30},{tipoItem:'SERVICOS_DIVERSOS',descarga:40}];
  const eq=(n,m)=>ids.slice(0,n+m).map((c,i)=>({matricula:c,tipoDiaria:i<n?'COMPLETA':'MEIA'}));
  const casos=[
    ['Exemplo oficial (Adubo, 17/11/2025, 11 completas)',eq(11,0),{producaoTotal:'918.20',valorPorDiaria:'83.47',totalAPagar:'991.90',complemento:'73.71'}],
    ['Variação (10 completas + 1 meia)',eq(10,1),{producaoTotal:'918.20',valorPorDiaria:'87.45',totalAPagar:'946.82',complemento:'28.62'}]];
  const out=[];
  try{const h=await GET('/health');out.push({ok:h&&h.status==='ok',nome:'API no ar (/health)',det:JSON.stringify(h)});}catch(e){out.push({ok:false,nome:'API no ar (/health)',det:errTxt(e)});}
  for(const [nome,equipe,esp] of casos){
    try{
      const r=await POST('/api/boletins/calculo',{armazemId:adubo,data:'2025-11-17',linhas,equipe});
      const got=r.exibicao||{};const falhas=Object.entries(esp).filter(([k,v])=>got[k]!==v).map(([k,v])=>k+': esperado '+v+', veio '+got[k]);
      out.push({ok:!falhas.length,nome:nome+' → R$ '+esp.producaoTotal.replace('.',',')+' · '+esp.totalAPagar.replace('.',',')+' · complemento '+esp.complemento.replace('.',','),det:falhas.join('; ')});
    }catch(e){out.push({ok:false,nome,det:errTxt(e)});}
  }
  const ok=out.filter(t=>t.ok).length;
  modal('Conferência do cálculo oficial','<div class="callout '+(ok===out.length?'ok':'bad')+'"><b>'+ok+' de '+out.length+' conferências passaram.</b> Estes números vêm da API em tempo real: o exemplo do Dossiê (R$ 918,20 / 991,90 / 73,71) e a variação com uma meia diária (R$ 946,82 / 28,62). Nada é gravado.</div><div class="tests"><ul>'+out.map(t=>'<li><span class="chip '+(t.ok?'ok':'bad')+'">'+(t.ok?'ok':'falhou')+'</span><span>'+esc(t.nome)+(t.ok?'':'<br><small class="neg">'+esc(t.det)+'</small>')+'</span></li>').join('')+'</ul></div>',null,true);
}

Object.assign(ACT,{
  verify(){return verificarCalculo();},
  'bol-abrir'(){const data=$('#bol-data').value;if(!data){toast('Escolha a data de referência.',true);return;}U.bol=novoDia(data,U.bol.aba);render();},
  'bol-aba'(t){U.bol.aba=Number(t.dataset.id);render();},
  'bol-open'(t){U.bol=novoDia(t.dataset.d,U.bol.aba);render();const sc=$('#pv-boletim .pv-scroll');if(sc)sc.scrollTop=0;},
  'bol-limpar'(){U.bol=novoDia(U.bol.data,U.bol.aba);render();},
  'bol-exemplo'(){
    const ids=['CHAPA_08','CHAPA_09','CHAPA_15','CHAPA_48','CHAPA_37','CHAPA_38','CHAPA_41','CHAPA_42','CHAPA_43','CHAPA_49','CHAPA_30'].filter(m=>S.chapas.some(c=>c.matricula===m));
    const adubo=armId('Adubo')||2;U.bol=novoDia('2025-11-17',adubo);
    U.bol.sec[adubo]={itens:{FERTILIZANTES:{d:2778,r:0,t:0},AGROQUIMICO:{d:30,r:0,t:0},SERVICOS_DIVERSOS:{d:40,r:0,t:0}},equipe:ids.map(m=>({matricula:m,tipo:'COMPLETA'})),saved:null};
    render();toast('Exemplo oficial carregado no Adubo: R$ 918,20 de produção e 11 diárias. Troque uma diária para meia e compare.');
  },
  'bol-salvar'(){return bolSalvar();},
  'eq-add'(){
    const m=$('#eq-m').value.trim(),tp=$('#eq-t').value;
    const r=podeAdicionarChapa(m);
    if(!r.ok){setMsg('#eq-msg',r.erro);return;}
    secAtual().equipe.push({matricula:r.ch.matricula,tipo:tp});
    $('#bol-equipe').innerHTML=equipeHtml();setMsg('#eq-msg',r.aviso||'');refreshBoletimCalc();$('#eq-m').focus();
  },
  'eq-rm'(t){secAtual().equipe.splice(Number(t.dataset.i),1);$('#bol-equipe').innerHTML=equipeHtml();refreshBoletimCalc();}
});
VIEWS.boletim=viewBoletim;
