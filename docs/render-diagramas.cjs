// Gera SVGs estáticos, sem dependências, para exibição direta no GitHub.
// Uso: node docs/render-diagramas.cjs
const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (x,y,s,size=15,weight=400,anchor='start',fill='#233247') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;
const line = (x1,y1,x2,y2,color='#56708e',dash='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#arrow)"/>`;
const box = (x,y,w,h,label,fill='#f1f6fa') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="#507090" stroke-width="2"/>${text(x+w/2,y+h/2+5,label,15,600,'middle')}`;
const svg = (w,h,body) => `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#56708e"/></marker></defs><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;

// Casos de uso UML: atores fora do sistema, elipses dentro do limite.
{
  let b = text(660,42,'Casos de uso — recebimento inteligente',26,700,'middle');
  b += `<rect x="235" y="70" width="950" height="795" rx="18" fill="#f8fbfe" stroke="#4a6684" stroke-width="2"/>${text(260,101,'Sistema de recebimento inteligente',18,700)}`;
  const actor = (x,y,name) => `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#233247" stroke-width="2"/><path d="M${x} ${y+15}v47 m-28 -25h56 m-28 25l-23 31 m23 -31l23 31" fill="none" stroke="#233247" stroke-width="2"/>${text(x,y+116,name,15,600,'middle')}`;
  const uc = (x,y,label) => `<ellipse cx="${x}" cy="${y}" rx="145" ry="32" fill="#e6f1fa" stroke="#507090" stroke-width="2"/>${text(x,y+5,label,14,600,'middle')}`;
  b += actor(100,130,'Fornecedor')+actor(100,390,'Compras')+actor(100,635,'Resp. armazém')+actor(1220,185,'Encarregado')+actor(1220,600,'Gestão');
  const uses = [
    [440,155,'Criar agendamento'],[760,155,'Anexar NFs'],[760,235,'Validar capacidade'],
    [440,330,'Autorizar recebimento'],[760,330,'Conferir NF × pedido'],
    [440,465,'Registrar descarga'],[760,465,'Marcos, chapas, equipamentos'],
    [440,600,'Tratar cancelamento'],[760,600,'Reagendar caso fortuito'],
    [440,735,'Registrar não recebimento'],[760,735,'Fechar boletim'],
    [760,820,'Calcular piso e complemento'],[1010,685,'Consultar painel'],[1010,765,'Sobra/falta em R$']
  ];
  uses.forEach(u=>b+=uc(...u));
  [[145,175,295,155],[145,435,295,330],[145,680,295,465],[145,710,295,600],[145,735,295,735],[1175,240,905,735],[1175,650,1140,685]].forEach(p=>b+=`<line x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}" stroke="#56708e" stroke-width="2"/>`);
  [[585,155,615,155],[585,330,615,330],[585,465,615,465],[760,767,760,788],[1010,718,1010,733]].forEach(p=>b+=line(...p,'#56708e','5 4'));
  b += text(600,145,'«include»',12,400,'middle')+text(600,318,'«include»',12,400,'middle')+text(600,453,'«include»',12,400,'middle')+text(837,787,'«include»',12,400)+text(1090,730,'«include»',12,400);
  b += text(260,876,'Linhas contínuas: associação · setas tracejadas: inclusão · cancelamento e reagendamento: alternativas',13);
  fs.writeFileSync(path.join(out,'caso-de-uso.svg'),svg(1320,900,b));
}

// BPMN compacto com raias, eventos, tarefas e gateways exclusivos.
{
  let b = text(760,42,'BPMN — processo proposto',26,700,'middle');
  const lanes = [['Fornecedor',80,250],['Compras',330,145],['Armazém',475,260],['Chapas',735,150],['Gestão',885,145]];
  lanes.forEach(([n,y,h],i)=>{b+=`<rect x="30" y="${y}" width="1460" height="${h}" fill="${i%2?'#f8fbfe':'#f1f6fa'}" stroke="#a1b2c4"/><rect x="30" y="${y}" width="155" height="${h}" fill="#e1ecf5" stroke="#a1b2c4"/>${text(108,y+h/2+5,n,17,700,'middle')}`});
  const event=(x,y,label,end=false)=>`<circle cx="${x}" cy="${y}" r="22" fill="#fff" stroke="#42698d" stroke-width="${end?5:2}"/>${text(x,y+42,label,13,500,'middle')}`;
  const gate=(x,y,label)=>`<path d="M${x} ${y-28}l28 28-28 28-28-28z" fill="#fff4d7" stroke="#9e7924" stroke-width="2"/>${text(x,y+5,'×',22,700,'middle')}${text(x,y+49,label,13,500,'middle')}`;
  b+=event(225,182,'Início')+box(300,150,185,64,'Agendar + anexar NF')+gate(540,182,'Vaga?')+box(615,150,185,64,'Confirmar slot')+box(840,150,180,64,'Pedir cancelamento')+box(1070,150,180,64,'Pedir reagendamento');
  b+=box(630,365,200,64,'Conferir NF × pedido')+gate(900,397,'Autoriza?');
  b+=box(1010,540,190,64,'Definir destinos')+box(755,540,210,64,'Registrar chegada')+box(465,540,235,64,'Descarga por destino')+box(205,540,215,64,'Marcos + recursos')+event(1300,565,'Recebimento concluído',true);
  b+=box(320,775,210,64,'Boletim por armazém')+box(615,775,230,64,'Produção + equipe')+box(920,775,230,64,'Piso + complemento');
  b+=box(395,925,250,64,'Filtrar período/armazém')+box(760,925,265,64,'Analisar sobra/falta R$')+event(1180,955,'Fim',true);
  b+=box(1095,365,220,64,'Não recebimento', '#fff0ed')+box(1260,230,170,64,'Decidir vaga', '#fff4d7');
  [[247,182,300,182],[485,182,512,182],[568,182,615,182],[720,215,720,365],[830,397,872,397],[928,397,1100,540],[1200,572,1278,572],[965,572,1010,572],[755,572,700,572],[465,572,420,572],[530,807,615,807],[845,807,920,807],[645,957,760,957],[1025,957,1158,957],[930,397,1095,397]].forEach(p=>b+=line(...p));
  b+=`<path d="M540 210 V275 H1180 V365" fill="none" stroke="#56708e" stroke-width="2" marker-end="url(#arrow)"/>${text(566,265,'não: escolher outro slot ou registrar não recebimento',13)}`;
  b+=`<path d="M310 605 V740 H425 V775" fill="none" stroke="#56708e" stroke-width="2" marker-end="url(#arrow)"/>`;
  b+=`<path d="M1035 840 V900 H520 V925" fill="none" stroke="#56708e" stroke-width="2" marker-end="url(#arrow)"/>`;
  b+=`<path d="M930 182 H840 M1250 182 H1350 V230" fill="none" stroke="#56708e" stroke-width="2" marker-end="url(#arrow)"/>`;
  b+=text(190,1058,'Alternativas: cancelamento em duas etapas; reagendamento por caso fortuito registra histórico e pode exceder capacidade.',14);
  fs.writeFileSync(path.join(out,'bpmn.svg'),svg(1520,1080,b));
}

// DER: cartões com PK/FK e arestas rotuladas. Histórico isolado porque não possui FKs operacionais.
{
  let b=text(1040,40,'DER — esquema PostgreSQL após V7',26,700,'middle');
  const cards=[
    ['fornecedor',40,95,['id PK','codigo · cnpj']],['agendamento',335,95,['id PK · fornecedor_id FK','data_agendada · horario','status · origem · chegada_em']],['nota_fiscal',680,95,['id PK · agendamento_id FK','nf_chave · ativa · conteudo']],['validacao_compras',1035,95,['agendamento_id PK/FK','decisao · pedido_referencia']],['evento_agendamento',1390,95,['id PK · agendamento_id FK','tipo · detalhe']],
    ['reagendamento',40,340,['id PK · agendamento_id FK','data/horario anterior e novo']],['cancelamento',335,340,['agendamento_id PK/FK','situacao · motivo']],['vaga_liberada',680,340,['id PK · origem_agendamento_id FK','atribuida_a_agendamento_id FK']],['nao_recebimento',1035,340,['id PK · agendamento_id FK?','fornecedor_id FK? · motivo']],['data_nao_operacional',1390,340,['data PK · descricao']],
    ['armazem',40,600,['id PK · codigo UK','nome']],['descarga',335,600,['id PK · agendamento_id FK','armazem_id FK · chegada_em','entrada_em · saida_em','quantidade_chapas']],['descarga_equipamento',680,600,['descarga_id PK/FK','equipamento_id PK/FK']],['equipamento',1035,600,['id PK · armazem_id FK','identificacao UK · tipo']],['grupo_produto',1390,600,['codigo PK · armazem_id FK']],
    ['boletim',40,900,['id PK · armazem_id FK','data UK com armazem','producao_total · total_a_pagar','complemento · situacao']],['boletim_producao',335,900,['boletim_id PK/FK','tipo_item PK/FK','quantidades · preco_unitario']],['tipo_item',680,900,['codigo PK · descricao','preco_unitario']],['boletim_equipe',1035,900,['boletim_id PK/FK','matricula PK/FK','tipo_diaria']],['chapa',1390,900,['matricula PK · nome']],
    ['produto',40,1200,['id PK · codigo','grupo · deposito · peso']],['parametro',335,1200,['chave PK · valor']],['deposito_armazem',680,1200,['deposito PK','armazem_id FK?']],['hist_recebimento_item',1035,1200,['id PK · nr_recebimento','data_recebimento · deposito']],['hist_chapa_dia',1390,1200,['data PK · qtd_presentes','qtd_cafe · valor_pago']],['hist_chapa_presenca',1390,1430,['data + matricula PK']]
  ];
  const W=270;
  let edges='';
  const positions=Object.fromEntries(cards.map(([n,x,y,fields])=>[n,{x,y,h:54+fields.length*22}]));
  function edge(a,z,label){
    const s=positions[a],t=positions[z];
    if(s.y===t.y){
      const right=s.x<t.x, x1=right?s.x+W:s.x, x2=right?t.x+W*0:t.x+W;
      const y=s.y+48;
      edges+=`<path d="M${x1} ${y} H${x2}" fill="none" stroke="#a4b6c8" stroke-width="2" marker-end="url(#arrow)"/>`;
      edges+=text((x1+x2)/2,y-8,label,11,600,'middle','#50677f');
      return;
    }
    const x1=s.x+W/2,y1=s.y+s.h,x2=t.x+W/2,y2=t.y;
    const mid=(y1+y2)/2;
    edges+=`<path d="M${x1} ${y1} V${mid} H${x2} V${y2}" fill="none" stroke="#a4b6c8" stroke-width="2" marker-end="url(#arrow)"/>`;
    edges+=text(x2+6,y2-9,label,11,600,'start','#50677f');
  }
  [
    ['fornecedor','agendamento','1:N'],['agendamento','nota_fiscal','1:N'],
    ['agendamento','validacao_compras','1:0..1'],['agendamento','evento_agendamento','1:N'],
    ['agendamento','reagendamento','1:N'],['agendamento','cancelamento','1:0..1'],
    ['agendamento','vaga_liberada','1:0..1'],['agendamento','nao_recebimento','1:N'],
    ['agendamento','descarga','1:N'],['armazem','descarga','1:N'],
    ['armazem','equipamento','1:N'],['descarga','descarga_equipamento','1:N'],
    ['equipamento','descarga_equipamento','1:N'],['armazem','grupo_produto','1:N'],
    ['armazem','boletim','1:N'],['boletim','boletim_producao','1:N'],
    ['tipo_item','boletim_producao','1:N'],['boletim','boletim_equipe','1:N'],
    ['chapa','boletim_equipe','1:N'],['armazem','deposito_armazem','1:N?']
  ].forEach(e=>edge(...e));
  b+=edges;
  function card(n,x,y,fields){const h=54+fields.length*22; b+=`<rect x="${x}" y="${y}" width="${W}" height="${h}" rx="8" fill="#fff" stroke="#4f6e8c" stroke-width="2"/><path d="M${x+1} ${y+34}H${x+W-1}" stroke="#9bb2ca"/>`+`<path d="M${x+8} ${y+7}H${x+W-8}V${y+31}H${x+8}z" fill="#dceaf5"/>`+text(x+14,y+25,n,16,700);fields.forEach((f,i)=>b+=text(x+13,y+62+i*22,f,13));}
  cards.forEach(c=>card(...c));
  b+=text(40,1555,'T1: agendamento, NF, validação, descarga, equipamentos e desvios · T2: boletim, produção e equipe · T3: dados históricos separados',15,600);
  b+=text(40,1585,'Linhas e rótulos mostram relações principais; a lista completa de FKs e cardinalidades está em der.md.',13);
  fs.writeFileSync(path.join(out,'der.svg'),svg(1700,1620,b));
}
