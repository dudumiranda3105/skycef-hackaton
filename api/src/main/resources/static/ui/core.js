'use strict';
/* Constantes de domínio, formatação e utilitários. A lógica de negócio (vagas, boletim, painel) fica na API;
   aqui só entra o que a interface precisa para mostrar e para ajudar a preencher. */

const SLOTS=['08:00','10:00','13:00','15:00'];
const DOW=['dom','seg','ter','qua','qui','sex','sáb'];
const DOW_LONGO=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const ACOND={
  BATIDO:{nome:'Batido',chapas:5,desc:'Ocupa o horário inteiro'},
  PALETIZADO:{nome:'Paletizado',chapas:2,desc:'Até 2 caminhões por horário'},
  BIG_BAG:{nome:'Big bag',chapas:2,desc:'Até 2 caminhões por horário'}
};
const MOTIVOS_NR={DIVERGENCIA_NF_PEDIDO:'Divergência entre NF e pedido',SEM_AGENDAMENTO_SEM_VAGA:'Chegou sem agendamento e sem vaga',CASO_FORTUITO:'Caso fortuito',OUTRO:'Outro'};
const STATUS={PENDENTE_COMPRAS:'Aguardando Compras',AUTORIZADO:'Autorizado',NAO_AUTORIZADO:'Não autorizado',EM_DESCARGA:'Descarregando',CONCLUIDO:'Concluído',CANCELADO:'Cancelado',NAO_RECEBIDO:'Não recebido'};
const STATUS_CLS={PENDENTE_COMPRAS:'warn',AUTORIZADO:'info',NAO_AUTORIZADO:'bad',EM_DESCARGA:'info',CONCLUIDO:'ok',CANCELADO:'',NAO_RECEBIDO:'bad'};
const LIBERAM_VAGA=['CANCELADO','NAO_AUTORIZADO','NAO_RECEBIDO'];   /* mesma regra da API: não ocupam o horário */
const TOLERANCIA_MIN=15;      /* DQ-015: a Cocapec não definiu o valor; é só um parâmetro para sinalizar "atrasado" */
const MAX_UNITIZADOS=2, MAX_CHAPAS_BOLETIM=20;
const PISO_PADRAO='90.1731';  /* a API devolve o valor vigente (campo piso); este é só o reserva */
const ORDEM_TIPOS=['SACARIA_MALAS_25','SACARIA_MALAS_40','SACARIA_MALAS_50','SACARIA_FARDO_250','SACARIA_FARDO_500','PECAS','MAQUINAS','AGROQUIMICO','FERTILIZANTES','SEMENTES','MEDICAMENTOS','ALIMENTACAO_ANIMAL','ACESSORIOS','SERVICOS_DIVERSOS'];

/* ---------- Datas: tudo no fuso de São Paulo, o mesmo que a API usa ---------- */
const pad=n=>String(n).padStart(2,'0');
const agoraSP=()=>new Date().toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo'});   /* "2026-10-05 13:30:00" */
const hojeISO=()=>agoraSP().slice(0,10);
const nowLocal=()=>{const s=agoraSP();return s.slice(0,10)+'T'+s.slice(11,16);};
const toISO=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const fromISO=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const addDays=(iso,n)=>{const d=fromISO(iso);d.setDate(d.getDate()+n);return toISO(d);};
const dow=iso=>fromISO(iso).getDay();
const mondayOf=iso=>{const d=fromISO(iso);d.setDate(d.getDate()-((d.getDay()+6)%7));return toISO(d);};
const semanaAtual=()=>{const h=hojeISO(),w=dow(h);return w===0?addDays(h,1):w===6?addDays(h,2):mondayOf(h);};
const fmtDM=iso=>iso.slice(8,10)+'/'+iso.slice(5,7);
const fmtBR=iso=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
const fmtHM=ts=>ts?ts.slice(11,16):'—';
const fmtTS=ts=>ts?fmtDM(ts.slice(0,10))+' '+ts.slice(11,16):'—';
/* A API manda instantes com offset (-03:00). Aqui trabalhamos com "AAAA-MM-DDTHH:MM" local de São Paulo. */
function loc(ts){
  if(!ts)return null;
  if(/-03:00$/.test(ts))return ts.slice(0,16);
  const s=new Date(ts).toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo'});
  return s.slice(0,10)+'T'+s.slice(11,16);
}
const toOffset=local=>local+':00-03:00';   /* o Brasil não tem horário de verão desde 2019 */
const minDiff=(a,b)=>Math.round((new Date(b)-new Date(a))/60000);
const fmtDur=m=>m==null?'—':(m>=60?Math.floor(m/60)+' h '+pad(Math.round(m%60))+' min':Math.round(m)+' min');
const addMin=(ts,m)=>{const d=new Date(ts);d.setMinutes(d.getMinutes()+m);return toISO(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes());};
const lastDayOfMonth=ym=>{const [y,m]=ym.split('-').map(Number);return ym+'-'+pad(new Date(y,m,0).getDate());};
const monthsBetween=(a,b)=>{const out=[];let [y,m]=a.split('-').map(Number);const [y2,m2]=b.split('-').map(Number);while(y<y2||(y===y2&&m<=m2)){out.push(y+'-'+pad(m));m++;if(m>12){m=1;y++;}}return out;};
const mLabel=ym=>MES[+ym.slice(5)-1]+'/'+ym.slice(2,4);

/* ---------- Números e dinheiro. Dinheiro chega da API como texto decimal e nunca vira float ---------- */
const nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const sgn1=n=>(n>0.049?'+':n<-0.049?'−':'')+nf1.format(Math.abs(n));
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const sum=(a,k)=>a.reduce((s,r)=>s+(+r[k]||0),0);
/* arredonda um texto decimal ("991.9041") para `dec` casas, meio para cima, sem passar por float */
function decRound(str,dec){
  if(str==null||str==='')return null;
  let s=String(str),neg=false;if(s[0]==='-'){neg=true;s=s.slice(1);}
  let [i,f='']=s.split('.');f=f.padEnd(dec+1,'0');
  let v=BigInt((i||'0')+f.slice(0,dec));if(f[dec]>='5')v+=1n;
  const t=v.toString().padStart(dec+1,'0');
  const ip=t.slice(0,t.length-dec),fp=t.slice(t.length-dec);
  return (neg&&v!==0n?'-':'')+ip+(dec?'.'+fp:'');
}
const milhar=ip=>ip.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
function brl(s,dec=2){
  const r=decRound(s,dec);if(r==null)return '—';
  const neg=r[0]==='-';const [i,f]=r.replace('-','').split('.');
  return (neg?'−':'')+'R$ '+milhar(i)+(f?','+f:'');
}
const brl4=s=>brl(s,4), brl2=s=>brl(s,2), brl0=s=>brl(s,0);
const fmtCnpj=c=>c&&c.length===14?c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):(c||'');
const fmtPrecoIn=p=>String(p).replace('.',',');

/* ---------- Nota fiscal: padrão de 4 dígitos (ex.: 524 → 0524) ---------- */
const fmtNF=n=>{const d=String(n??'').replace(/\D/g,'');return d?d.padStart(4,'0'):'';};
const nfValida=n=>{const d=String(n??'').replace(/\D/g,'');return d.length>=1&&d.length<=9&&/[1-9]/.test(d);};

/* ---------- HTML ---------- */
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const optsHtml=(arr,sel)=>arr.map(([v,l])=>'<option value="'+esc(v)+'"'+(String(v)===String(sel)?' selected':'')+'>'+esc(l)+'</option>').join('');
const byKey=(a,b,...ks)=>{for(const k of ks){const c=String(a[k]).localeCompare(String(b[k]));if(c)return c;}return 0;};
const porDataHora=(a,b)=>(a.data+a.horario).localeCompare(b.data+b.horario);
