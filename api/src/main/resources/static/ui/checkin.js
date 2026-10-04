'use strict';
/* Diferenciais 1 e 4: QR Code + check-in e "Adicionar ao calendário".
   O QR só identifica a entrega. Toda ação passa pelas mesmas regras e validações da API:
   ele não autoriza o recebimento, não pula etapa e não substitui as permissões. */

const codigoAg=id=>'AG-'+String(id).padStart(4,'0');
const linkCheckin=id=>location.origin+'/ui/#/checkin/'+id;
const idDoCodigo=txt=>{
  const t=String(txt||'').trim();
  let m=t.match(/checkin\/(\d+)/i)||t.match(/AG[-\s]?0*(\d+)/i)||t.match(/^0*(\d+)$/);
  return m?Number(m[1]):null;
};

/* ---------- Calendário (.ics) ---------- */
function icsAg(a){
  const f=fornById(a.fornecedorId);
  const [y,m,d]=a.data.split('-').map(Number),[hh,mm]=a.horario.split(':').map(Number);
  const ini=new Date(Date.UTC(y,m-1,d,hh+3,mm)),fim=new Date(ini.getTime()+2*3600*1000);   /* São Paulo = UTC−3, sem horário de verão */
  const z=dt=>dt.getUTCFullYear()+pad(dt.getUTCMonth()+1)+pad(dt.getUTCDate())+'T'+pad(dt.getUTCHours())+pad(dt.getUTCMinutes())+pad(dt.getUTCSeconds())+'Z';
  const tx=s=>String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
  const nfs=a.nfs.map(n=>n.numero?fmtNF(n.numero):'sem número').join(', ');
  const desc=['Código da entrega: '+codigoAg(a.id),'Fornecedor: '+f.nome,'Notas fiscais: '+nfs,'Acondicionamento: '+ACOND[a.acond].nome,'Horário da entrega: '+a.horario+' (chegar com a nota fiscal e o QR Code)','Check-in: '+linkCheckin(a.id),'','O calendário é só uma conveniência. Se mudar o compromisso no celular, o agendamento na Cocapec não muda: o sistema da Cocapec é a fonte oficial.'].join('\n');
  const linhas=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Cocapec//Recebimento Inteligente//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:agendamento-'+a.id+'@cocapec-recebimento','DTSTAMP:'+z(new Date()),'DTSTART:'+z(ini),'DTEND:'+z(fim),
    'SUMMARY:'+tx('Entrega na Cocapec · '+codigoAg(a.id)+' · '+a.horario),'LOCATION:'+tx('Cocapec · Franca/SP'),'DESCRIPTION:'+tx(desc),
    'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+tx('Entrega na Cocapec '+codigoAg(a.id)+' em 1 hora'),'TRIGGER:-PT1H','END:VALARM','END:VEVENT','END:VCALENDAR'];
  /* linhas com mais de 75 bytes são dobradas (RFC 5545) */
  const dobra=l=>{const enc=new TextEncoder();if(enc.encode(l).length<=75)return l;let out='',cur='';for(const ch of l){if(enc.encode(cur+ch).length>(out?74:75)){out+=(out?'\r\n ':'')+cur;cur=ch;}else cur+=ch;}return out+(out?'\r\n ':'')+cur;};
  return linhas.map(dobra).join('\r\n')+'\r\n';
}
function baixarIcs(id){
  const a=agById(id);if(!a)return;
  const blob=new Blob([icsAg(a)],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob),el=document.createElement('a');
  el.href=url;el.download=codigoAg(a.id)+'.ics';document.body.appendChild(el);el.click();el.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

/* ---------- QR Code da entrega ---------- */
function openQr(id,confirmacao){
  const a=agById(id);if(!a)return;
  const f=fornById(a.fornecedorId),link=linkCheckin(id);
  modal(confirmacao?'Agendamento confirmado':'QR Code da entrega',
    (confirmacao?'<div class="callout ok">Entrega agendada para <b>'+fmtBR(a.data)+' às '+a.horario+'</b>. Agora ela segue para a validação de Compras.</div>':'')+
    '<div class="qrbox"><div class="qrimg" aria-label="QR Code do agendamento">'+qrSvg(link,{escala:6,rotulo:'QR Code do agendamento '+codigoAg(id)})+'</div>'+
    '<div class="qrinfo"><div class="qrcod num">'+codigoAg(id)+'</div><div class="kv" style="display:grid;gap:2px"><span>Fornecedor <b>'+esc(f.nome)+'</b></span><span>Entrega <b class="num">'+fmtBR(a.data)+' · '+a.horario+'</b></span><span>Notas <b>'+nfsTxt(a)+'</b></span><span>'+acChipS(a.acond)+'</span></div>'+
    '<p class="hint" style="margin-top:8px">Na chegada, o responsável lê o QR e o sistema localiza a entrega. O QR só identifica o agendamento: ele não autoriza o recebimento nem pula nenhuma validação.</p></div></div>'+
    '<div class="row"><button class="btn accent" data-act="ics" data-id="'+id+'">Adicionar ao calendário</button><button class="btn" data-act="copiar-link" data-id="'+id+'">Copiar link do check-in</button>'+(pf('armazem')?'<button class="btn" data-act="abrir-checkin" data-id="'+id+'">Abrir o check-in</button>':'')+'</div>'+
    '<p class="hint">O calendário é só uma conveniência (arquivo .ics, aceito pelos calendários comuns): alterar o compromisso no celular não altera o agendamento. O sistema da Cocapec continua sendo a fonte oficial.</p>',
    '<button class="btn" data-act="close-dlg">Fechar</button>',true);
}

/* ---------- Check-in ---------- */
async function openCheckin(id){
  try{await carregarMovimento();}catch(e){toast(errTxt(e),true);return;}
  const a=agById(id);
  if(!a){modal('Check-in','<div class="callout bad">Não encontrei a entrega '+esc(codigoAg(id))+'. Confira o código ou o QR.</div>','<button class="btn" data-act="close-dlg">Fechar</button>');return;}
  const f=fornById(a.fornecedorId),ds=a.descs;
  const fim=['CONCLUIDO','CANCELADO','NAO_RECEBIDO','NAO_AUTORIZADO'].includes(a.status);
  const aviso={PENDENTE_COMPRAS:'Aguardando a validação de Compras: a descarga só pode começar depois da autorização.',NAO_AUTORIZADO:'Compras não autorizou esta entrega: ela não pode ser recebida.',CANCELADO:'Entrega cancelada.',NAO_RECEBIDO:'Esta entrega foi registrada como não recebida.',CONCLUIDO:'Todas as descargas desta entrega já foram concluídas.'}[a.status]||'';
  let corpo='<div class="kv"><span>Código <b class="num">'+codigoAg(a.id)+'</b></span><span>Agendado <b class="num">'+fmtBR(a.data)+' · '+a.horario+'</b></span><span>Notas <b>'+nfsTxt(a)+'</b></span>'+(a.chegadaEm?'<span>Chegou <b class="num">'+fmtHM(a.chegadaEm)+'</b></span>':'')+'</div>'+
    '<div class="row">'+stChip(a.status)+acChipS(a.acond)+origBadge(a.origem)+'</div>';
  if(aviso)corpo+='<div class="callout '+(a.status==='PENDENTE_COMPRAS'?'warn':a.status==='CONCLUIDO'?'ok':'bad')+'">'+aviso+'</div>';
  if(!fim&&!ds.length){
    corpo+=a.status==='AUTORIZADO'?'<div class="callout">Entrega autorizada. O armazém ainda não definiu o destino: a chegada já pode ser registrada.</div>':'';
    if(!a.chegadaEm)corpo+='<div class="row"><button class="btn primary" data-act="ck-chegada-ag" data-id="'+a.id+'">Registrar chegada do caminhão</button></div>';
  }
  corpo+=ds.map(d=>{
    const esp=d.chegada&&d.entrada?minDiff(d.chegada,d.entrada):null,dur=d.entrada&&d.saida?minDiff(d.entrada,d.saida):null;
    const passo=(rot,val)=>'<div class="ckstep'+(val?' feito':'')+'"><span class="dot" style="background:'+(val?'var(--green)':'var(--line)')+'"></span><b>'+rot+'</b><span class="num">'+(val?fmtHM(val)+' registrada':'—')+'</span></div>';
    let acao='';
    if(!fim){
      if(!d.chegada)acao='<button class="btn primary" data-act="ck-marco" data-d="'+d.id+'" data-m="chegada">Registrar chegada</button>';
      else if(!d.entrada)acao='<button class="btn primary" data-act="ck-marco" data-d="'+d.id+'" data-m="entrada"'+(['AUTORIZADO','EM_DESCARGA'].includes(a.status)?'':' disabled')+'>Iniciar descarga</button>';
      else if(!d.saida){
        const eqs=S.equip.filter(e=>e.armazemId===d.armazemId);
        acao='<div class="grid2"><label class="f">Chapas nesta descarga<input type="number" min="0" max="100" step="1" id="ck-ch-'+d.id+'"></label><div></div></div>'+
          '<div><div class="sec-t">Equipamentos usados</div><div class="eqs">'+eqs.map(e=>'<label class="eq" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" class="ck-eq-'+d.id+'" value="'+e.id+'"> '+esc(e.identificacao)+'</label>').join('')+'</div></div>'+
          '<div class="row"><button class="btn primary" data-act="ck-saida" data-d="'+d.id+'">Finalizar descarga</button></div>';
      }
    }
    return '<div class="card ac-'+a.acond+'"><div class="card-head"><h3>'+esc(d.armazem)+'</h3><span class="chip '+(d.saida?'ok':'info')+'">'+({AGUARDANDO:'Aguardando chegada',NA_FILA:'Na fila',EM_DESCARGA:'Em descarga',CONCLUIDA:'Concluída'})[dStatus(d)]+'</span></div>'+
      '<div class="ckline">'+passo('Chegada',d.chegada)+passo('Entrada',d.entrada)+passo('Saída',d.saida)+'</div>'+
      ((esp!=null||dur!=null)?'<div class="row">'+(esp!=null?'<span class="chip">Espera '+fmtDur(esp)+'</span>':'')+(dur!=null?'<span class="chip">Descarga '+fmtDur(dur)+'</span>':'')+(d.chapas!=null?'<span class="chip">'+d.chapas+' chapas</span>':'')+'</div>':'')+
      (acao?'<div class="stack" style="gap:10px">'+acao+'</div>':'')+'<div id="ck-err-'+d.id+'" class="errs"></div></div>';
  }).join('');
  corpo+='<p class="hint">O QR Code identifica a entrega; ele não autoriza sozinho o recebimento nem ignora validações. Cada registro usa a hora do servidor e segue as regras do fluxo oficial (chegada ≤ entrada ≤ saída).</p>';
  modal('Check-in · '+esc(f.nome),corpo,'<button class="btn" data-act="close-dlg">Fechar</button><button class="btn" data-act="qr" data-id="'+a.id+'">Ver QR Code</button>',true);
}
async function ckDepois(id,msg){await refresh();await openCheckin(id);toast(msg);}

/* ---------- Leitor (código digitado, link colado ou câmera) ---------- */
let leitorStream=null;
function pararCamera(){if(leitorStream){leitorStream.getTracks().forEach(t=>t.stop());leitorStream=null;}}
function openLeitor(){
  const cam=typeof BarcodeDetector!=='undefined'&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia;
  modal('Check-in por QR Code','<p class="muted">Aponte a câmera do celular para o QR da entrega (ele abre direto o check-in) ou digite o código impresso abaixo do QR.</p>'+
    '<label class="f">Código da entrega ou link do QR<input type="text" id="lt-cod" autocomplete="off" placeholder="Ex.: AG-0012"></label>'+
    (cam?'<div><button class="btn" data-act="lt-camera">Ler com a câmera deste computador</button></div><video id="lt-video" playsinline muted style="display:none;width:100%;max-width:420px;border-radius:12px;margin-top:8px"></video>':'')+
    '<div id="lt-msg" class="errs"></div>',
    '<button class="btn" data-act="lt-fechar">Fechar</button><button class="btn primary" data-act="lt-ir">Localizar entrega</button>');
  const el=$('#lt-cod');if(el)el.focus();
}
async function ltIr(){
  const id=idDoCodigo($('#lt-cod').value);
  if(!id){setMsg('#lt-msg','Informe o código no formato AG-0012 ou cole o link do QR.');return;}
  pararCamera();closeAll();await openCheckin(id);
}
async function ltCamera(){
  const v=$('#lt-video');
  try{
    leitorStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    v.srcObject=leitorStream;v.style.display='block';await v.play();
    const det=new BarcodeDetector({formats:['qr_code']});
    const laco=async()=>{
      if(!leitorStream||!$('#lt-video'))return;
      try{const r=await det.detect(v);if(r.length){const id=idDoCodigo(r[0].rawValue);if(id){pararCamera();closeAll();await openCheckin(id);return;}}}catch(e){}
      setTimeout(laco,350);
    };
    laco();
  }catch(e){setMsg('#lt-msg','Não foi possível usar a câmera ('+errTxt(e)+'). Digite o código da entrega.');}
}

Object.assign(ACT,{
  qr(t){openQr(Number(t.dataset.id));},
  ics(t){baixarIcs(Number(t.dataset.id));},
  'copiar-link':async t=>{try{await navigator.clipboard.writeText(linkCheckin(Number(t.dataset.id)));toast('Link do check-in copiado.');}catch(e){toast('Não foi possível copiar. Link: '+linkCheckin(Number(t.dataset.id)),true);}},
  'abrir-checkin'(t){closeAll();drawer.open&&drawer.close();return openCheckin(Number(t.dataset.id));},
  leitor(){openLeitor();},
  'lt-ir'(){return ltIr();},
  'lt-camera'(){return ltCamera();},
  'lt-fechar'(){pararCamera();closeAll();},
  'ck-chegada-ag':async t=>{
    const id=Number(t.dataset.id);
    try{await POST('/api/agendamentos/'+id+'/chegada',{});}catch(e){toast(errTxt(e),true);return;}
    await ckDepois(id,'Chegada do caminhão registrada.');
  },
  'ck-marco':async t=>{
    const d=descById(Number(t.dataset.d)),m=t.dataset.m;
    try{await POST('/api/descargas/'+d.id+'/'+m,{});}catch(e){setMsg('#ck-err-'+d.id,errTxt(e));return;}
    await ckDepois(d.agId,m==='chegada'?'Chegada registrada.':'Descarga iniciada.');
  },
  'ck-saida':async t=>{
    const d=descById(Number(t.dataset.d));const ch=$('#ck-ch-'+d.id).value;
    if(ch===''||!Number.isInteger(Number(ch))||Number(ch)<0||Number(ch)>100){setMsg('#ck-err-'+d.id,'Informe a quantidade de chapas (zero se a carga não exigiu).');return;}
    const eq=$$('.ck-eq-'+d.id+':checked').map(i=>Number(i.value));
    try{await POST('/api/descargas/'+d.id+'/saida',{quantidadeChapas:Number(ch),equipamentoIds:eq});}catch(e){setMsg('#ck-err-'+d.id,errTxt(e));return;}
    await ckDepois(d.agId,'Descarga finalizada e registrada.');
  }
});
