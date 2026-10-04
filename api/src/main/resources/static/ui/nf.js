'use strict';
/* Diferencial 5: leitura assistida da Nota Fiscal.
   O fornecedor anexa o XML ou o PDF da NF-e e o sistema tenta preencher número, chave, emitente, itens, peso e volumes.
   O resultado aparece para o fornecedor CONFIRMAR OU CORRIGIR antes de ir para o agendamento.
   Princípios: reduz digitação, não aprova a entrega e não substitui a validação NF × pedido de Compras.
   Falha segura: se a leitura falhar, o fluxo manual continua exatamente como antes.
   Limite honesto: lê XML e PDF com texto; imagem escaneada (PDF sem texto) exigiria um motor de OCR, que não vai embutido. */

/* ---------- chave de acesso: 44 dígitos com dígito verificador (módulo 11) ---------- */
function chaveValida(c){
  if(!/^\d{44}$/.test(c))return false;
  let s=0,p=2;for(let i=42;i>=0;i--){s+=Number(c[i])*p;p=p===9?2:p+1;}
  const r=s%11,dv=r<2?0:11-r;return dv===Number(c[43]);
}
/* a própria chave carrega UF, mês/ano, CNPJ do emitente, modelo, série e número da nota */
const dadosDaChave=c=>({uf:c.slice(0,2),aamm:c.slice(2,6),cnpj:c.slice(6,20),modelo:c.slice(20,22),serie:String(Number(c.slice(22,25))),numero:String(Number(c.slice(25,34)))});

/* ---------- XML da NF-e ---------- */
function lerXmlNfe(txt){
  const doc=new DOMParser().parseFromString(txt,'application/xml');
  if(doc.querySelector('parsererror'))throw new Error('O arquivo não é um XML válido.');
  const ns=(el,n)=>el.getElementsByTagNameNS('*',n);
  const t=(el,n)=>{const r=ns(el,n)[0];return r?r.textContent.trim():'';};
  const inf=ns(doc,'infNFe')[0];
  if(!inf)throw new Error('O XML não parece uma NF-e (não achei o grupo infNFe).');
  const chave=(t(doc,'chNFe')||(inf.getAttribute('Id')||'')).replace(/\D/g,'').slice(-44);
  const emit=ns(doc,'emit')[0];
  const itens=[...ns(doc,'det')].map(d=>({desc:t(d,'xProd'),qtd:t(d,'qCom'),un:t(d,'uCom')})).filter(i=>i.desc);
  const vols=[...ns(doc,'vol')];
  const volumes=vols.reduce((s,v)=>s+(Number(t(v,'qVol'))||0),0);
  const pesoB=t(doc,'pesoB'),pesoL=t(doc,'pesoL');
  return{fonte:'XML',numero:t(inf,'nNF'),chave:/^\d{44}$/.test(chave)?chave:'',emitCnpj:emit?t(emit,'CNPJ'):'',emitNome:emit?t(emit,'xNome'):'',itens,volumes,
    peso:pesoB||pesoL||'',pesoTipo:pesoB?'bruto':pesoL?'líquido':''};
}

/* ---------- PDF (somente texto; sem OCR de imagem) ---------- */
const bytesParaTexto=u8=>{let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return s;};
async function inflar(u8){
  const ds=new DecompressionStream('deflate'),w=ds.writable.getWriter();w.closed.catch(()=>{});w.write(u8).catch(()=>{});w.close().catch(()=>{});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
/* o fim do fluxo tem quebra de linha antes de endstream: tenta o tamanho exato e depois sem 1 ou 2 bytes finais */
async function inflarSeguro(u8){for(const corte of [0,1,2]){try{return await inflar(u8.subarray(0,u8.length-corte));}catch(e){}}throw new Error('fluxo comprimido ilegível');}
async function objetosPdf(u8){
  const s=bytesParaTexto(u8),objs=new Map();
  const re=/(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;let m;const pend=[];
  while((m=re.exec(s))){
    const id=Number(m[1]),corpo=m[2],si=corpo.indexOf('stream');
    if(si<0){objs.set(id,{dict:corpo,data:null});continue;}
    const dict=corpo.slice(0,si);let ini=m.index+m[0].indexOf(corpo)+si+6;
    if(u8[ini]===13)ini++;if(u8[ini]===10)ini++;
    const fim=s.indexOf('endstream',ini);const bruto=u8.subarray(ini,fim);
    const o={dict,data:null};objs.set(id,o);
    if(/FlateDecode/.test(dict))pend.push(inflarSeguro(bruto).then(d=>{o.data=bytesParaTexto(d);}).catch(()=>{}));
    else o.data=bytesParaTexto(bruto);
  }
  await Promise.all(pend);
  /* objetos comprimidos (PDF 1.5+) */
  for(const [,o] of [...objs]){
    if(o.data&&/\/Type\s*\/ObjStm/.test(o.dict)){
      const n=Number((o.dict.match(/\/N\s+(\d+)/)||[])[1]),first=Number((o.dict.match(/\/First\s+(\d+)/)||[])[1]);
      const nums=(o.data.slice(0,first).match(/\d+/g)||[]).map(Number);
      for(let i=0;i<n;i++){const id=nums[i*2],off=nums[i*2+1],fim=i+1<n?nums[(i+1)*2+1]:o.data.length-first;objs.set(id,{dict:o.data.slice(first+off,first+fim),data:null});}
    }
  }
  return objs;
}
function lerCmap(t){
  const map=new Map();if(!t)return map;
  for(const bc of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const p of bc[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))map.set(parseInt(p[1],16),p[2]);
  for(const br of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))for(const p of br[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)){
    const a=parseInt(p[1],16),e=parseInt(p[2],16),u=parseInt(p[3],16);for(let i=a;i<=e;i++)map.set(i,(u+i-a).toString(16).padStart(4,'0'));
  }
  const cs=t.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/);map.bytes=cs?cs[1].length/2:1;
  return map;
}
function decodificaTexto(bytesStr,cmap){
  if(!cmap||!cmap.size)return bytesStr;
  const n=cmap.bytes||1;let out='';
  for(let i=0;i+n<=bytesStr.length;i+=n){let c=0;for(let j=0;j<n;j++)c=c*256+bytesStr.charCodeAt(i+j);const u=cmap.get(c);if(u){for(let k=0;k+3<u.length;k+=4)out+=String.fromCharCode(parseInt(u.slice(k,k+4),16));}}
  return out;
}
const hexParaBytes=h=>{h=h.replace(/\s+/g,'');if(h.length%2)h+='0';let s='';for(let i=0;i<h.length;i+=2)s+=String.fromCharCode(parseInt(h.slice(i,i+2),16));return s;};
const unescapePdf=s=>s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g,(m,c)=>({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','(':'(',')':')','\\':'\\'}[c]||String.fromCharCode(parseInt(c,8))));
async function textoDoPdf(buf){
  const u8=new Uint8Array(buf);if(bytesParaTexto(u8.subarray(0,5))!=='%PDF-')throw new Error('O arquivo não é um PDF.');
  const objs=await objetosPdf(u8);
  const cmaps=new Map(),nomeFonte=new Map();
  for(const [id,o] of objs){
    if(/\/Type\s*\/Font\b/.test(o.dict)){const m=o.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);if(m&&objs.get(Number(m[1])))cmaps.set(id,lerCmap(objs.get(Number(m[1])).data));}
    for(const m of o.dict.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g))if(!nomeFonte.has(m[1]))nomeFonte.set(m[1],Number(m[2]));
  }
  let texto='';
  for(const [,o] of objs){
    if(!o.data||!/\bTf\b/.test(o.data)||!/\bT[jJ]\b/.test(o.data))continue;
    let cmap=null;
    const tok=/\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s+Tf|\(((?:\\[\s\S]|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>|\b(TJ|Tj|ET)\b|(-?\d+\.?\d*)/g;let m;
    let linha='';
    while((m=tok.exec(o.data))){
      if(m[1]!==undefined)cmap=cmaps.get(nomeFonte.get(m[1]))||null;
      else if(m[2]!==undefined)linha+=decodificaTexto(unescapePdf(m[2]),cmap);
      else if(m[3]!==undefined)linha+=decodificaTexto(hexParaBytes(m[3]),cmap);
      else if(m[4]!==undefined){texto+=linha+' ';linha='';}
      else if(m[5]!==undefined&&Number(m[5])<-200&&linha)linha+=' ';
    }
    texto+='\n';
  }
  return texto;
}
function chavesNoTexto(texto){
  const achadas=[];
  for(const run of texto.matchAll(/\d[\d\s]{40,90}\d/g)){
    const d=run[0].replace(/\s+/g,'');
    for(let i=0;i+44<=d.length;i++){const c=d.slice(i,i+44);if(c.slice(20,22)==='55'&&chaveValida(c)&&!achadas.includes(c))achadas.push(c);}
  }
  return achadas;
}
async function lerPdfNfe(file){
  const texto=await textoDoPdf(await file.arrayBuffer());
  const chaves=chavesNoTexto(texto);
  if(!chaves.length)throw new Error('Não encontrei a chave de acesso no PDF. Se ele for uma imagem escaneada, a leitura automática não funciona: preencha os dados manualmente.');
  const c=chaves[0],d=dadosDaChave(c);
  return{fonte:'PDF',numero:d.numero,chave:c,emitCnpj:d.cnpj,emitNome:'',itens:[],volumes:0,peso:'',pesoTipo:'',extras:chaves.length>1?chaves.length+' chaves no PDF; usei a primeira':''};
}

/* ---------- interface: cartão de confirmação dentro de cada linha de nota ---------- */
async function lerNotaArquivo(inp){
  const row=inp.closest('.nfrow'),box=row.querySelector('.nfread'),file=inp.files[0];
  row._lido=null;box.hidden=true;box.innerHTML='';
  if(!file)return;
  box.hidden=false;box.innerHTML='<p class="hint">Lendo a nota…</p>';
  let r;
  try{
    if(!/\.(xml|pdf)$/i.test(file.name))throw new Error('Use um arquivo .xml ou .pdf.');
    r=/\.xml$/i.test(file.name)?lerXmlNfe(await file.text()):await lerPdfNfe(file);
  }catch(e){
    box.innerHTML='<div class="callout warn" style="font-size:13.5px"><b>Não foi possível ler a nota automaticamente.</b> '+esc(errTxt(e))+' O agendamento continua normal: informe o número da NF à mão. O arquivo ainda será anexado.</div>';
    return;
  }
  r.confirmado=false;row._lido=r;
  const forn=r.emitCnpj?S.forn.find(f=>f.cnpj===r.emitCnpj):null,sel=resolveForn($('#na-forn')&&$('#na-forn').value);
  let nota='';
  if(forn&&$('#na-forn')&&!$('#na-forn').value.trim()){$('#na-forn').value=fornOpcao(forn);nota='Fornecedor preenchido pelo CNPJ do emitente: '+esc(forn.nome)+'.';}
  else if(forn&&sel&&forn.id!==sel.id)nota='<span class="neg">Atenção: o emitente da nota ('+esc(forn.nome)+') é diferente do fornecedor escolhido.</span>';
  else if(r.emitCnpj&&!forn)nota='O CNPJ do emitente ('+esc(fmtCnpj(r.emitCnpj))+') não está no cadastro de fornecedores.';
  const valida=r.chave?chaveValida(r.chave):false;
  box.innerHTML='<div class="nfcard"><div class="row" style="justify-content:space-between"><b>Dados lidos da nota ('+r.fonte+')</b><span class="chip warn nl-st">Confirme ou corrija</span></div>'+
    '<p class="hint">A leitura só reduz digitação: ela não aprova a entrega e não substitui a validação da nota contra o pedido feita por Compras.</p>'+
    '<div class="grid3"><label class="f">Número da NF<input type="text" class="nl-num" inputmode="numeric" maxlength="9" value="'+esc(fmtNF(r.numero))+'"></label>'+
    '<label class="f" style="grid-column:span 2">Chave de acesso '+(r.chave?(valida?'<span class="hint">dígito verificador confere</span>':'<span class="hint neg">dígito verificador não confere</span>'):'<span class="hint">não encontrada</span>')+'<input type="text" class="nl-chave" inputmode="numeric" maxlength="44" value="'+esc(r.chave)+'"></label></div>'+
    '<div class="grid3"><label class="f">Peso '+(r.pesoTipo?'<span class="hint">'+r.pesoTipo+' (kg)</span>':'<span class="hint">kg, opcional</span>')+'<input type="text" class="nl-peso" inputmode="decimal" value="'+esc(r.peso)+'"></label>'+
    '<div class="f"><span>Volumes</span><b class="num">'+(r.volumes||'—')+'</b></div><div class="f"><span>Emitente</span><b>'+esc(r.emitNome||fmtCnpj(r.emitCnpj)||'—')+'</b></div></div>'+
    (r.itens.length?'<details class="more"><summary>'+r.itens.length+' item(ns) lido(s)</summary><ul class="dl-list">'+r.itens.slice(0,12).map(i=>'<li>'+esc(i.desc)+' · '+esc(i.qtd)+' '+esc(i.un)+'</li>').join('')+(r.itens.length>12?'<li>… e mais '+(r.itens.length-12)+'</li>':'')+'</ul></details>':'')+
    (nota||r.extras?'<p class="hint">'+nota+(nota&&r.extras?' · ':'')+esc(r.extras||'')+'</p>':'')+
    '<div class="row"><button class="btn sm primary" data-act="nl-ok">Confirmar dados</button><button class="btn sm" data-act="nl-no">Descartar leitura</button></div></div>';
  inp.dispatchEvent(new Event('lido',{bubbles:true}));
}
function nlConfirmar(btn){
  const row=btn.closest('.nfrow'),r=row._lido;if(!r)return;
  const num=fmtNF(row.querySelector('.nl-num').value),chave=row.querySelector('.nl-chave').value.replace(/\D/g,''),peso=row.querySelector('.nl-peso').value.trim().replace(',','.');
  const msgs=[];
  if(!num||!nfValida(num))msgs.push('informe um número de NF válido');
  if(chave&&chave.length!==44)msgs.push('a chave de acesso precisa ter 44 dígitos (ou fique em branco)');
  if(peso&&!/^\d+(\.\d{1,3})?$/.test(peso))msgs.push('o peso deve ser um número (kg)');
  if(msgs.length){toast('Corrija antes de confirmar: '+msgs.join('; ')+'.',true);return;}
  r.numero=num;r.chave=chave;r.pesoNum=peso||null;r.confirmado=true;
  row.querySelector('input.nf').value=num;
  const st=row.querySelector('.nl-st');st.textContent='Confirmado';st.className='chip ok nl-st';
  btn.disabled=true;
}
function nlDescartar(btn){
  const row=btn.closest('.nfrow');row._lido=null;const box=row.querySelector('.nfread');box.hidden=true;box.innerHTML='';
  const f=row.querySelector('input[type=file]');if(f)f.value='';
}
Object.assign(ACT,{'nl-ok'(t){nlConfirmar(t);},'nl-no'(t){nlDescartar(t);}});
