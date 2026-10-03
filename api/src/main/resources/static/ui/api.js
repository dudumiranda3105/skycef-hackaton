'use strict';
/* Cliente da API e o estado carregado dela. Nada é gravado no navegador: tudo vai para o PostgreSQL pela API. */

class ApiError extends Error{
  constructor(msg,status,codigo,erros){super(msg);this.status=status;this.codigo=codigo;this.erros=erros||[];}
}
const API_BASE=window.API_BASE||'';

async function http(method,url,body,form){
  const opt={method,headers:{Accept:'application/json'}};
  if(form){opt.body=form;}
  else if(body!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
  let r;
  try{r=await fetch(API_BASE+url,opt);}
  catch(e){throw new ApiError('Não foi possível falar com a API. Confira se o servidor está no ar.',0,'SEM_CONEXAO');}
  const txt=await r.text();let data=null;
  if(txt){try{data=JSON.parse(txt);}catch(e){data=null;}}
  if(!r.ok){
    const det=data&&(data.detail||data.message)||('Falha '+r.status+' ao chamar '+url);
    throw new ApiError(det,r.status,data&&data.codigo,data&&data.erros);
  }
  return data;
}
const GET=(u)=>http('GET',u);
const POST=(u,b)=>http('POST',u,b===undefined?{}:b);
const qs=o=>{const p=Object.entries(o).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v));return p.length?'?'+p.join('&'):'';};

/* ---------- Estado ---------- */
const S={forn:[],armazens:[],equip:[],tipos:[],chapas:[],ags:[],vagas:[],nr:[],boletins:[],diasAgenda:{},piso:PISO_PADRAO,carregado:false};

const semSufixo=n=>String(n||'').replace(/\s+(S\/?A\.?|S\.A\.?|LTDA\.?|EIRELI|ME|EPP)\s*$/i,'').trim();
const fornById=id=>S.forn.find(f=>f.id===id)||{id,nome:'—',curto:'—',cnpj:''};
const armById=id=>S.armazens.find(a=>a.id===id)||{id,nome:'—'};
const armNome=id=>armById(id).nome;
const armId=nome=>(S.armazens.find(a=>a.nome===nome)||{}).id;
const equipById=id=>S.equip.find(e=>e.id===id);
const agById=id=>S.ags.find(a=>a.id===id);

function mapFornecedor(f){return{id:f.id,nome:f.razaoSocial,curto:semSufixo(f.razaoSocial),cnpj:f.cnpj||''};}
function mapDescarga(d,ag){
  return{id:d.id,agId:ag.id,armazemId:d.armazemId,armazem:armNome(d.armazemId),chegada:loc(d.chegadaEm),entrada:loc(d.entradaEm),
    saida:loc(d.saidaEm),chapas:d.quantidadeChapas==null?null:d.quantidadeChapas,equip:d.equipamentoIds||[],origem:ag.origem};
}
function mapAg(a){
  const ag={id:a.id,fornecedorId:a.fornecedorId,data:a.data,horario:String(a.horario).slice(0,5),acond:a.acondicionamento,
    status:a.status,naHora:!!a.agendadoNaHora,limiteIgnorado:!!a.limiteIgnorado,origem:a.origem,criadoEm:a.criadoEm,chegadaEm:loc(a.chegadaEm),
    nfs:(a.notas||[]).map(n=>({id:n.id,numero:n.nfNumero||'',chave:n.nfChave||'',arquivo:n.arquivoNome||'',peso:n.pesoTotalKg,ativa:n.ativa})),
    compras:a.validacaoCompras?{pedido:a.validacaoCompras.pedidoReferencia,decisao:a.validacaoCompras.decisao,obs:a.validacaoCompras.observacao}:null,
    canc:a.cancelamento?{motivo:a.cancelamento.motivo,situacao:a.cancelamento.situacao}:null};
  ag.descs=(a.descargas||[]).map(d=>mapDescarga(d,ag));
  return ag;
}
const descsOf=id=>{const a=agById(id);return a?a.descs:[];};
const todasDescs=()=>S.ags.flatMap(a=>a.descs);
const vagaAbertaDe=agId=>S.vagas.find(v=>v.origemAgendamentoId===agId&&v.status==='ABERTA');

function mapBoletim(b){
  return{id:b.id,armazemId:b.armazemId,armazem:b.armazemNome,data:b.data,situacao:b.situacao,origem:b.origem,criadoEm:b.criadoEm,
    linhas:b.linhas||[],equipe:b.equipe||[],chapas:b.quantidadeChapas,completas:b.chapasDiariaCompleta,meias:b.chapasMeiaDiaria,
    diarias:b.diariasEquivalentes,producao:b.producaoTotal,vpd:b.valorPorDiaria,total:b.totalAPagar,complemento:b.complemento,
    abaixo:b.abaixoDoPiso,exib:b.exibicao||{}};
}

/* ---------- Carregamento ---------- */
async function carregarCadastros(){
  const [forn,arm,eq,tipos,chapas]=await Promise.all([GET('/api/fornecedores'),GET('/api/armazens'),GET('/api/equipamentos'),GET('/api/boletim/tipos-item'),GET('/api/chapas')]);
  S.armazens=arm;S.equip=eq;S.forn=forn.map(mapFornecedor);S.chapas=chapas;
  const ord=c=>{const i=ORDEM_TIPOS.indexOf(c);return i<0?99:i;};
  S.tipos=tipos.slice().sort((a,b)=>ord(a.codigo)-ord(b.codigo)||a.codigo.localeCompare(b.codigo));
}
async function carregarMovimento(){
  const [ags,vagas,nr,bols]=await Promise.all([GET('/api/agendamentos'),GET('/api/vagas-liberadas'),GET('/api/nao-recebimentos'),GET('/api/boletins')]);
  S.ags=ags.map(mapAg);S.vagas=vagas;S.nr=nr;S.boletins=bols.map(mapBoletim);
}
/* Dias da semana: a API diz se o dia é útil e por que não é (fim de semana, feriado cadastrado). */
async function carregarDiasAgenda(dias){
  const falta=dias.filter(d=>!S.diasAgenda[d]);
  await Promise.all(falta.map(async d=>{try{S.diasAgenda[d]=await GET('/api/agenda'+qs({data:d}));}catch(e){}}));
}
const motivoDiaBloqueado=iso=>{
  const w=dow(iso);if(w===0)return 'Domingo: não há recebimento';if(w===6)return 'Sábado: não há recebimento';
  const a=S.diasAgenda[iso];return a&&a.diaUtil===false?String(a.motivoIndisponivel||'Sem recebimento').replace(/\.$/,''):null;
};

/* ---------- Vagas: mesma conta da API (cancelados não ocupam; vaga liberada aberta ainda ocupa) ---------- */
function ocupantes(data,hora,excetoId){
  const ags=S.ags.filter(a=>a.data===data&&a.horario===hora&&a.id!==excetoId&&!LIBERAM_VAGA.includes(a.status));
  const vagas=S.vagas.filter(v=>v.data===data&&String(v.horario).slice(0,5)===hora&&v.status==='ABERTA');
  return{ags,vagas,tipos:[...ags.map(a=>a.acond),...vagas.map(v=>v.acondicionamento)]};
}
function cabe(tipos,acond){return !tipos.includes('BATIDO')&&(acond==='BATIDO'?tipos.length===0:tipos.length<MAX_UNITIZADOS);}
function motivoSemVaga(tipos,acond){
  if(tipos.includes('BATIDO'))return 'Horário reservado a uma carga batida (ocupa o horário inteiro).';
  if(acond==='BATIDO')return 'Carga batida precisa do horário inteiro, e ele já tem caminhões agendados.';
  return 'Horário lotado: no máximo 2 caminhões paletizados ou big bag, somando toda a cooperativa.';
}
