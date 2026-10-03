'use strict';
/* Tarefa 2: boletim diário dos chapas. As linhas são somadas aqui só para dar retorno imediato;
   piso, complemento e totais vêm sempre de POST /api/boletins/calculo (a mesma conta que grava o boletim). */

const CAMPOS_Q=['d','r','t'];
const NOME_Q={d:'descarga',r:'remoção',t:'transferência'};
const KEY_Q={d:'descarga',r:'remocao',t:'transferencia'};
const cent4=s=>{const [i,f='']=String(s).split('.');return BigInt((i||'0')+f.padEnd(4,'0').slice(0,4));};
const big4=v=>{const s=v.toString().padStart(5,'0');return s.slice(0,-4)+'.'+s.slice(-4);};
const qItem=(b,cod)=>{const it=b.itens[cod]||{};return(+it.d||0)+(+it.r||0)+(+it.t||0);};

let calcTok=0,calcTimer=null;
U.calc=null;      /* resposta da prévia (ou {erro}) */

function novoRascunho(armazemId,data){
  const ex=S.boletins.find(b=>b.armazemId===armazemId&&b.data===data);
  if(ex){
    const itens={};ex.linhas.forEach(l=>{itens[l.tipoItem]={d:l.descarga,r:l.remocao,t:l.transferencia,preco:l.precoUnitario};});
    return{armazemId,data,saved:ex,itens,equipe:ex.equipe.map(m=>({matricula:m.matricula,tipo:m.tipoDiaria}))};
  }
  return{armazemId,data,saved:null,itens:{},equipe:[]};
}
function ultimoDiaUtil(){let d=addDays(hojeISO(),-1);while(dow(d)===0)d=addDays(d,-1);return d;}   /* sábado também tem boletim */
function dadosResumo(x){
  if(!x)return null;
  if(x.producaoTotal!==undefined)return{producao:x.producaoTotal,diarias:x.diariasEquivalentes,vpd:x.valorPorDiaria,total:x.totalAPagar,complemento:x.complemento,abaixo:x.abaixoDoPiso,situacao:x.situacao,exib:x.exibicao||{},completas:x.chapasDiariaCompleta,meias:x.chapasMeiaDiaria,piso:x.piso};
  return{producao:x.producao,diarias:x.diarias,vpd:x.vpd,total:x.total,complemento:x.complemento,abaixo:x.abaixo,situacao:x.situacao,exib:x.exib,completas:x.completas,meias:x.meias,piso:S.piso};
}
function payloadBoletim(b){
  const linhas=S.tipos.filter(t=>qItem(b,t.codigo)>0).map(t=>{const it=b.itens[t.codigo];return{tipoItem:t.codigo,descarga:+it.d||0,remocao:+it.r||0,transferencia:+it.t||0};});
  return{armazemId:b.armazemId,data:b.data,linhas,equipe:b.equipe.map(e=>({matricula:e.matricula,tipoDiaria:e.tipo}))};
}

function viewBoletim(){
  const b=U.bol,ro=!!b.saved;
  const saved=[...S.boletins].sort((x,y)=>y.data.localeCompare(x.data)||x.armazemId-y.armazemId).slice(0,12);
  const rows=S.tipos.map(t=>{
    const preco=ro&&b.itens[t.codigo]&&b.itens[t.codigo].preco?b.itens[t.codigo].preco:t.precoUnitario;
    return '<tr><td>'+esc(t.descricao)+'</td><td class="r num pr">'+brl4(preco)+'</td>'+
    CAMPOS_Q.map(f=>'<td class="r"><input class="qty" type="text" inputmode="numeric" autocomplete="off" maxlength="8" data-bol="'+t.codigo+':'+f+'" value="'+((b.itens[t.codigo]||{})[f]||'')+'"'+(ro?' disabled':'')+' aria-label="'+esc(t.descricao)+', '+NOME_Q[f]+'"></td>').join('')+
    '<td class="r num" id="bq-'+t.codigo+'">0</td><td class="r num" id="bv-'+t.codigo+'">—</td></tr>';}).join('');
  return head('Boletim diário dos ensacadores','Lance o que a equipe movimentou no dia, por tipo de item, e quem trabalhou. O sistema calcula produção, piso e complemento com 4 casas decimais.','Quem usa: responsável pelo armazém, normalmente no dia seguinte',
   '<button class="btn" data-act="bol-exemplo">Carregar exemplo oficial</button>')+
  '<div class="filters"><label class="f">Armazém<select id="bol-arm">'+optsHtml(S.armazens.map(a=>[a.id,a.nome]),b.armazemId)+'</select></label><label class="f">Data de referência<input type="date" id="bol-data" value="'+b.data+'" max="'+hojeISO()+'"></label>'+
   '<span class="chip '+(ro?'info':'ok')+'">'+(ro?'Boletim salvo: somente leitura':'Novo boletim')+'</span>'+(ro?'<button class="btn sm" data-act="bol-novo">Novo boletim neste dia</button>':'')+'</div>'+
  (ro?'<div class="callout" style="margin-bottom:16px">Este boletim já foi gravado ('+origBadge(b.saved.origem)+'). Há só um boletim por armazém e por dia, e a gravação não é editável: confira os números abaixo.</div>':'')+
  '<div class="bol-layout"><div class="stack">'+
   '<div class="panel"><h2>Produção do dia</h2>'+
   '<p class="lead">Escolha o tipo de cada linha: o sistema não adivinha. Quantidade total = descarga + remoção + transferência. As quantidades são números inteiros; os preços são os da tabela vigente.</p>'+
   '<div class="tscroll"><table class="bol-table"><thead><tr><th>Tipo de item</th><th class="r">Preço unitário</th><th class="r">Descarga</th><th class="r">Remoção</th><th class="r">Transferência</th><th class="r">Qtd. total</th><th class="r">Valor</th></tr></thead><tbody>'+rows+'<tr class="total-line"><td colspan="5">Produção total</td><td class="r num" id="bq-tot">0</td><td class="r num" id="bv-tot">R$ 0,0000</td></tr></tbody></table></div>'+
   '<div id="bol-qerr" class="errs" style="margin-top:8px"></div></div>'+
   '<div class="panel" id="bol-equipe"></div></div>'+
  '<div class="sticky stack"><div class="panel resumo" id="bol-resumo"></div>'+(ro?'':'<div class="row"><button class="btn primary" data-act="bol-salvar">Salvar boletim</button><button class="btn" data-act="bol-limpar">Limpar</button></div>')+'<div id="bol-msg" class="errs"></div></div></div>'+
  '<div class="sec"><h2>Boletins salvos</h2>'+(saved.length?'<div class="tscroll panel tbl"><table><thead><tr><th>Data</th><th>Armazém</th><th class="r">Produção</th><th class="r">Diárias</th><th class="r">Complemento</th><th class="r">Total a pagar</th><th>Origem</th></tr></thead><tbody>'+saved.map(x=>'<tr class="click" data-act="bol-open" data-id="'+x.id+'"><td class="num">'+fmtBR(x.data)+'</td><td>'+esc(x.armazem)+'</td><td class="r num">'+brl4(x.producao)+'</td><td class="r num">'+nf1.format(+x.diarias)+'</td><td class="r num">'+(x.situacao==='CONSISTENTE'?brl4(x.complemento):'—')+'</td><td class="r num">'+(x.situacao==='CONSISTENTE'?brl4(x.total):'<span class="chip bad">Inconsistente</span>')+'</td><td>'+origBadge(x.origem)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">Nenhum boletim salvo ainda.</div>')+'</div>';
}
function equipeHtml(){
  const b=U.bol,L=b.equipe,ro=!!b.saved;
  return '<div class="row" style="justify-content:space-between"><h2>Equipe do dia</h2><span class="chip '+(L.length>=MAX_CHAPAS_BOLETIM?'warn':'')+' num">'+L.length+' de '+MAX_CHAPAS_BOLETIM+'</span></div><p class="lead">Digite a matrícula: o nome vem do cadastro. A mesma pessoa pode estar em mais de um armazém no mesmo dia.</p>'+
   (ro?'':'<div class="row" style="align-items:flex-end"><label class="f" style="flex:1;min-width:130px">Matrícula<input type="text" list="roster" id="eq-m" autocomplete="off" placeholder="Ex.: CHAPA_08"></label><label class="f" style="width:130px">Diária<select id="eq-t"><option value="COMPLETA">Completa</option><option value="MEIA">Meia</option></select></label><button class="btn" data-act="eq-add">Adicionar</button></div>'+
   '<datalist id="roster">'+S.chapas.map(r=>'<option value="'+esc(r.matricula)+'">'+esc(r.nome)+'</option>').join('')+'</datalist><div id="eq-msg" class="errs" style="margin:6px 0"></div>')+
   (L.length?L.map((e,i)=>{const r=S.chapas.find(x=>x.matricula===e.matricula);return '<div class="team-row"><span class="num">'+esc(e.matricula)+'</span><span>'+esc(r?r.nome:'—')+'</span>'+(ro?'<span>'+(e.tipo==='MEIA'?'Meia':'Completa')+'</span><span></span>':'<select data-eqtipo="'+i+'" aria-label="Diária de '+esc(e.matricula)+'"><option value="COMPLETA"'+(e.tipo==='COMPLETA'?' selected':'')+'>Completa</option><option value="MEIA"'+(e.tipo==='MEIA'?' selected':'')+'>Meia</option></select><button class="icon-btn" style="font-size:20px" data-act="eq-rm" data-i="'+i+'" aria-label="Remover">×</button>')+'</div>';}).join(''):'<div class="empty" style="margin-top:8px">Nenhum chapa lançado.</div>');
}
function resolveChapa(txt){
  const t=String(txt||'').trim().toUpperCase();if(!t)return null;
  return S.chapas.find(c=>c.matricula===t)||(/^\d{1,2}$/.test(t)?S.chapas.find(c=>c.matricula==='CHAPA_'+pad(+t)):null)||null;
}
function podeAdicionarChapa(b,txt){
  const ch=resolveChapa(txt);
  if(!String(txt||'').trim())return{ok:false,erro:'Informe a matrícula.'};
  if(!ch)return{ok:false,erro:'Matrícula '+txt.trim()+' não encontrada no cadastro.'};
  if(b.equipe.some(e=>e.matricula===ch.matricula))return{ok:false,erro:ch.nome+' já está neste boletim.'};
  if(b.equipe.length>=MAX_CHAPAS_BOLETIM)return{ok:false,erro:'Limite de '+MAX_CHAPAS_BOLETIM+' chapas por boletim.'};
  const outro=S.boletins.find(x=>x.data===b.data&&x.armazemId!==b.armazemId&&x.equipe.some(e=>e.matricula===ch.matricula));
  return{ok:true,ch,aviso:outro?('Também consta no boletim de '+outro.armazem+' nesta data. Isso é permitido.'):null};
}

/* linhas e total da produção: soma exata com inteiros (BigInt), sem float */
function atualizaLinhas(){
  const b=U.bol;let tot=0n,qt=0;
  S.tipos.forEach(t=>{
    const q=qItem(b,t.codigo);const preco=b.saved&&b.itens[t.codigo]&&b.itens[t.codigo].preco?b.itens[t.codigo].preco:t.precoUnitario;
    const v=cent4(preco)*BigInt(q);tot+=v;qt+=q;
    const qe=$('#bq-'+t.codigo),ve=$('#bv-'+t.codigo);if(qe){qe.textContent=nf0.format(q);ve.textContent=q?brl4(big4(v)):'—';}
  });
  const qe=$('#bq-tot');if(qe){qe.textContent=nf0.format(qt);$('#bv-tot').textContent=brl4(big4(tot));}
}
function refreshBoletimCalc(){
  const eqEl=$('#bol-equipe');if(eqEl&&!eqEl.dataset.ready){eqEl.innerHTML=equipeHtml();eqEl.dataset.ready='1';}
  atualizaLinhas();
  const b=U.bol;
  if(b.saved){U.calc=null;pintaResumo(dadosResumo(b.saved));return;}
  const pl=payloadBoletim(b);
  if(!pl.linhas.length&&!pl.equipe.length){U.calc=null;pintaResumo(null);return;}
  pintaResumo(dadosResumo(U.calc&&!U.calc.erro?U.calc:null),U.calc&&U.calc.erro,true);
  clearTimeout(calcTimer);calcTimer=setTimeout(()=>calcular(pl),220);
}
async function calcular(pl){
  const tok=++calcTok;let r=null,erro=null;
  try{r=await POST('/api/boletins/calculo',pl);if(r&&r.piso)S.piso=r.piso;}catch(e){erro=errTxt(e);}
  if(tok!==calcTok||!$('#bol-resumo'))return;
  U.calc=erro?{erro}:r;pintaResumo(erro?null:dadosResumo(r),erro);
}
function pintaResumo(c,erro,calculando){
  const R=$('#bol-resumo');if(!R)return;
  const piso=brl4(S.piso);
  let h='<h2>Fechamento</h2>';
  if(erro)h+='<div class="callout bad">'+esc(erro)+'</div>';
  if(!c){
    if(!erro)h+='<p class="muted">'+(calculando?'Calculando…':'Lance a produção e a equipe para ver o cálculo.')+'</p>';
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
async function bolSalvar(){
  const b=U.bol,pl=payloadBoletim(b);
  if(!b.data){setMsg('#bol-msg','Escolha a data de referência.');return;}
  if(!pl.linhas.length&&!pl.equipe.length){setMsg('#bol-msg','Lance ao menos uma quantidade ou uma pessoa antes de salvar.');return;}
  let r;
  try{r=await POST('/api/boletins',pl);}catch(e){setMsg('#bol-msg',errTxt(e));return;}
  setMsg('#bol-msg','');await refresh();U.bol=novoRascunho(b.armazemId,b.data);render();
  const c=dadosResumo(r);
  toast(c.situacao==='INCONSISTENTE'?'Boletim salvo como inconsistente: pendente de conferência.':'Boletim salvo. Total a pagar '+brl4(c.total)+'.');
}
function onBolInput(t){
  const [k,f]=t.dataset.bol.split(':');
  const limpo=t.value.replace(/\D/g,'');const err=$('#bol-qerr');
  if(limpo!==t.value){t.value=limpo;err.textContent='As quantidades são números inteiros, sem vírgula nem sinal.';}else err.textContent='';
  (U.bol.itens[k]=U.bol.itens[k]||{d:0,r:0,t:0})[f]=limpo===''?0:Number(limpo);
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
  'bol-abrir'(){const arm=Number($('#bol-arm').value),data=$('#bol-data').value;if(!data){toast('Escolha a data de referência.',true);return;}U.bol=novoRascunho(arm,data);U.calc=null;render();},
  'bol-open'(t){const b=S.boletins.find(x=>x.id===Number(t.dataset.id));U.bol=novoRascunho(b.armazemId,b.data);U.calc=null;render();const sc=$('#pv-boletim .pv-scroll');if(sc)sc.scrollTop=0;},
  'bol-novo'(){U.bol={armazemId:U.bol.armazemId,data:U.bol.data,saved:null,itens:{},equipe:[]};render();},
  'bol-limpar'(){U.bol={armazemId:U.bol.armazemId,data:U.bol.data,saved:null,itens:{},equipe:[]};U.calc=null;render();},
  'bol-exemplo'(){
    const ids=['CHAPA_08','CHAPA_09','CHAPA_15','CHAPA_48','CHAPA_37','CHAPA_38','CHAPA_41','CHAPA_42','CHAPA_43','CHAPA_49','CHAPA_30'].filter(m=>S.chapas.some(c=>c.matricula===m));
    U.bol={armazemId:armId('Adubo')||2,data:'2025-11-17',saved:null,itens:{FERTILIZANTES:{d:2778,r:0,t:0},AGROQUIMICO:{d:30,r:0,t:0},SERVICOS_DIVERSOS:{d:40,r:0,t:0}},equipe:ids.map(m=>({matricula:m,tipo:'COMPLETA'}))};
    U.calc=null;render();toast('Exemplo oficial carregado: R$ 918,20 de produção e 11 diárias. Troque uma diária para meia e compare.');
  },
  'bol-salvar'(){return bolSalvar();},
  'eq-add'(){
    const m=$('#eq-m').value.trim(),tp=$('#eq-t').value;
    const r=podeAdicionarChapa(U.bol,m);
    if(!r.ok){setMsg('#eq-msg',r.erro);return;}
    U.bol.equipe.push({matricula:r.ch.matricula,tipo:tp});
    $('#bol-equipe').innerHTML=equipeHtml();setMsg('#eq-msg',r.aviso||'');refreshBoletimCalc();$('#eq-m').focus();
  },
  'eq-rm'(t){U.bol.equipe.splice(Number(t.dataset.i),1);$('#bol-equipe').innerHTML=equipeHtml();refreshBoletimCalc();}
});
VIEWS.boletim=viewBoletim;
