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
  let b = text(790,42,'Casos de uso — recebimento inteligente',26,700,'middle');
  b += `<rect x="230" y="62" width="1115" height="888" rx="18" fill="#f8fbfe" stroke="#4a6684" stroke-width="2"/>${text(255,905,'Sistema de recebimento inteligente',18,700)}`;
  const actor = (x,y,name) => `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#233247" stroke-width="2"/><path d="M${x} ${y+15}v47 m-28 -25h56 m-28 25l-23 31 m23 -31l23 31" fill="none" stroke="#233247" stroke-width="2"/>${text(x,y+116,name,15,600,'middle')}`;
  const uc = (x,y,label) => `<ellipse cx="${x}" cy="${y}" rx="150" ry="30" fill="#e6f1fa" stroke="#507090" stroke-width="2"/>${text(x,y+5,label,14,600,'middle')}`;
  const assoc = (x1,y1,x2,y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#56708e" stroke-width="2"/>`;
  const dep = (x1,y1,x2,y2,tipo,lx,ly) => line(x1,y1,x2,y2,'#56708e','5 4')+text(lx,ly,`«${tipo}»`,12,400,'middle');
  b += actor(115,110,'Fornecedor')+actor(115,290,'Compras')+actor(115,450,'Porteiro')+actor(115,670,'Setor de Insumos');
  b += actor(1475,140,'Resp. armazém')+actor(1475,500,'Encarregado')+actor(1475,730,'Diretoria');
  [
    [450,120,'Criar agendamento'],[450,200,'Pedir cancelamento/reagendamento'],
    [450,320,'Autorizar recebimento'],
    [450,470,'Conferir caminhão via QR'],[450,550,'Enviar documentos a Insumos'],
    [450,700,'Validar e direcionar destinos'],[450,800,'Recusar recebimento'],
    [820,95,'Anexar NF e acondicionamento'],[820,165,'Validar capacidade global'],
    [820,320,'Conferir NF × pedido'],
    [820,470,'Registrar chegada'],[820,570,'Perder agenda (atraso ≥ 30 min)'],
    [820,700,'Criar descarga por destino'],[820,800,'Gravar não recebimento'],
    [1170,100,'Registrar entrada e saída'],[1170,190,'Informar chapas e equipamentos'],
    [1170,270,'Efetivar cancelamento e decidir vaga'],[1170,345,'Reagendar por caso fortuito'],
    [1170,420,'Registrar não recebimento'],
    [1170,510,'Lançar boletim do dia'],[1170,590,'Calcular piso e complemento'],
    [1170,715,'Consultar painel'],[1170,795,'Analisar sobra/falta em R$'],[1170,880,'Perguntar aos dados']
  ].forEach(u=>b+=uc(...u));
  // Associações (ator — caso de uso)
  b += assoc(145,150,300,120)+assoc(145,165,300,200);
  b += assoc(145,335,300,320);
  b += assoc(145,495,300,470)+assoc(145,510,300,550);
  b += assoc(145,715,300,700)+assoc(145,730,300,800);
  b += assoc(1445,180,1320,100)+assoc(1445,188,1320,270)+assoc(1445,196,1320,345)+assoc(1445,204,1320,420);
  b += assoc(1445,545,1320,510);
  b += assoc(1445,775,1320,715)+assoc(1445,790,1320,880);
  // «include» e «extend»
  b += dep(598,110,672,98,'include',635,86)+dep(598,130,672,160,'include',628,172);
  b += dep(600,320,670,320,'include',635,308);
  b += dep(600,470,670,470,'include',635,458);
  b += dep(820,540,820,502,'extend',875,527);
  b += dep(600,700,670,700,'include',635,688);
  b += dep(600,800,670,800,'include',635,788);
  b += dep(450,770,450,732,'extend',505,756);
  b += dep(1170,130,1170,158,'include',1230,149);
  b += dep(1170,540,1170,558,'include',1230,553);
  b += dep(1170,745,1170,763,'include',1230,758);
  b += text(255,940,'Linhas contínuas: associação · setas tracejadas: «include»/«extend». Regras e origem de cada uma em caso-de-uso.md.',13);
  fs.writeFileSync(path.join(out,'caso-de-uso.svg'),svg(1580,975,b));
}

// BPMN com raias, eventos, tarefas e gateways exclusivos (processo proposto, T1 a T3).
{
  let b = text(900,42,'BPMN — processo proposto',26,700,'middle');
  const lanes = [['Fornecedor',70,170],['Compras',240,130],['Portaria',370,200],['Insumos',570,170],['Armazém',740,200],['Encarregado',940,130],['Gestão',1070,130]];
  lanes.forEach(([n,y,h],i)=>{b+=`<rect x="30" y="${y}" width="1740" height="${h}" fill="${i%2?'#f8fbfe':'#f1f6fa'}" stroke="#a1b2c4"/><rect x="30" y="${y}" width="155" height="${h}" fill="#e1ecf5" stroke="#a1b2c4"/>${text(108,y+h/2+5,n,17,700,'middle')}`});
  const event=(x,y,label,end=false)=>`<circle cx="${x}" cy="${y}" r="22" fill="#fff" stroke="#42698d" stroke-width="${end?5:2}"/>${text(x,y+42,label,13,500,'middle')}`;
  const gate=(x,y,label,acima=false)=>`<path d="M${x} ${y-28}l28 28-28 28-28-28z" fill="#fff4d7" stroke="#9e7924" stroke-width="2"/>${text(x,y+5,'×',22,700,'middle')}${text(x,acima?y-38:y+49,label,13,500,'middle')}`;
  const t = (x,y,w,label,fill) => box(x,y-28,w,56,label,fill);
  const nr = '#fff0ed', alt = '#fff4d7';
  const seta = (pts) => `<path d="M${pts}" fill="none" stroke="#56708e" stroke-width="2" marker-end="url(#arrow)"/>`;
  const rot = (x,y,s) => text(x,y,s,13,600,'middle','#42698d');

  // Fornecedor
  b+=event(225,155,'Início')+t(275,155,265,'Agendar: NF + acondicionamento')+gate(600,155,'Vaga no horário?')+t(665,155,170,'Horário reservado');
  b+=line(247,155,275,155)+line(540,155,572,155)+line(628,155,665,155)+rot(646,146,'sim');
  b+=seta('600 127 V92 H407 V127')+rot(503,86,'não: outro horário');
  b+=t(1400,155,330,'Pedir cancelamento ou reagendamento',alt);
  // Compras
  b+=line(750,183,750,277)+t(650,305,200,'Conferir NF × pedido')+gate(905,305,'Autoriza?',true)+line(850,305,877,305);
  b+=line(933,305,980,305)+rot(956,296,'não')+t(980,305,265,'Não recebimento: divergência',nr)+line(1245,305,1273,305)+event(1295,305,'Vaga liberada',true);
  // Portaria
  b+=line(905,333,905,402)+rot(920,375,'sim');
  b+=t(700,430,360,'QR: conferir caminhão e registrar chegada')+line(1060,430,1097,430)+gate(1125,430,'Atraso ≥ 30 min?',true);
  b+=line(1153,430,1190,430)+rot(1171,421,'sim')+t(1190,430,260,'Não recebimento por atraso',nr)+line(1450,430,1483,430)+event(1505,430,'Agenda perdida',true);
  b+=line(1125,458,1125,492)+rot(1140,480,'não')+t(985,520,280,'Anexar NFs e enviar a Insumos');
  // Insumos
  b+=line(1125,548,1125,592)+t(980,620,290,'Conferir documentos das NFs')+line(980,620,908,620)+gate(880,620,'Aprova?',true);
  b+=line(852,620,780,620)+rot(816,611,'sim')+t(480,620,300,'Direcionar a 1–4 armazéns');
  b+=line(880,648,880,677)+rot(895,668,'não')+t(760,705,250,'Não recebimento: recusa',nr)+line(1010,705,1038,705)+event(1060,705,'Recusado',true);
  // Armazém (uma descarga por destino)
  b+=line(630,648,630,772)+t(500,800,290,'Entrada: início da descarga')+line(500,800,450,800);
  b+=t(195,800,255,'Saída + chapas + equipamentos')+line(322,828,322,868)+event(322,890,'Descarga concluída',true);
  b+=line(1565,183,1565,772)+t(1400,800,330,'Efetivar cancelamento ou reagendar',alt)+line(1565,828,1565,868)+event(1565,890,'Vaga decidida pelo armazém',true);
  // Encarregado (boletim, dia seguinte)
  b+=event(225,1005,'Dia seguinte')+line(247,1005,290,1005)+t(290,1005,270,'Boletim do dia (4 armazéns)')+line(560,1005,600,1005);
  b+=t(600,1005,310,'Produção + equipe (completa/meia)')+line(910,1005,960,1005)+t(960,1005,240,'Piso + complemento');
  // Gestão
  b+=line(1080,1033,1080,1107)+t(950,1135,270,'Painel por período e armazém')+line(1220,1135,1270,1135);
  b+=t(1270,1135,290,'Sobra/falta de chapas em R$')+line(1560,1135,1608,1135)+event(1630,1135,'Fim',true);
  b+=text(40,1228,'Exceções: caminhão sem agendamento entra só se houver vaga e for agendado na hora; sem vaga, Portaria ou Armazém registram não recebimento (também caso fortuito ou outro).',14);
  b+=text(40,1252,'Atraso: tolerância de 15 min, aviso de 16 a 29 min, perda da agenda a partir de 30 min (esclarecimento da Cocapec registrado pela equipe). Reagendamento por caso fortuito pode exceder o limite do horário.',14);
  fs.writeFileSync(path.join(out,'bpmn.svg'),svg(1800,1270,b));
}

// DER (migrações V1–V16): cartões com PK/FK e arestas ortogonais que correm pelos corredores
// entre os cartões, sem passar por baixo deles. A seta sai da tabela referenciada (lado 1)
// e chega à tabela que guarda a FK (lado N); "0..1" marca FK opcional (coluna aceita nulo).
{
  const W=290, X=[70,440,810,1180,1550], C=X.map(x=>x+W/2);
  const R={1:120,2:310,3:590,4:810,5:1010,6:1245,7:1440};
  let b=text(945,42,'DER — esquema PostgreSQL após V16',26,700,'middle');
  [[80,870,'T1 · agendamento, portaria, acesso, descarga e cadastros'],[965,225,'T2 · boletim, produção e equipe'],[1205,370,'T3 · base histórica e arquivos oficiais (carga ETL)']]
    .forEach(([y,h,label])=>b+=`<rect x="50" y="${y}" width="1810" height="${h}" rx="12" fill="#f7fafd" stroke="#d3dfea"/>`+text(70,y+22,label,14,700,'start','#4a6684'));
  const cards=[
    ['nota_fiscal',X[0],R[1],['id PK · agendamento_id FK','nf_numero · nf_chave · ativa','peso_total_kg · conteudo']],
    ['validacao_compras',X[1],R[1],['agendamento_id PK/FK','decisao · pedido_referencia']],
    ['evento_agendamento',X[2],R[1],['id PK · agendamento_id FK','tipo · de/para_status · detalhe']],
    ['reagendamento',X[3],R[1],['id PK · agendamento_id FK','data/horario anterior e novo','motivo · limite_excedido']],
    ['cancelamento',X[4],R[1],['agendamento_id PK/FK','situacao · motivo']],
    ['nao_recebimento',X[0],R[2],['id PK · agendamento_id FK?','fornecedor_id FK? · data','motivo · fornecedor_nome']],
    ['fornecedor',X[1],R[2],['id PK · codigo · cnpj','razao_social']],
    ['agendamento',X[2],R[2],['id PK · fornecedor_id FK','solicitado_por_usuario_id FK?','data_agendada · horario · status','acondicionamento · origem','placa_veiculo · chegada_em','exige_conferencia_portaria']],
    ['usuario',X[3],R[2],['id PK · login UK · papel','nome · ativo · senha_hash','ultimo_acesso_em']],
    ['portaria_recebimento',X[4],R[2],['agendamento_id PK/FK','conferido_por_usuario_id FK','decidido_por_usuario_id FK?','situacao · placa','conferido_em · enviado_em','decidido_em · observacao']],
    ['vaga_liberada',X[0],R[3],['id PK · status','origem_agendamento_id FK UK','atribuida_a_agendamento_id FK?','data_vaga · horario']],
    ['descarga_equipamento',X[1],R[3],['descarga_id PK/FK','equipamento_id PK/FK']],
    ['descarga',X[2],R[3],['id PK · agendamento_id FK','armazem_id FK','UK (agendamento_id, armazem_id)','chegada_em · entrada_em · saida_em','quantidade_chapas']],
    ['sessao',X[3],R[3],['token_hash PK (SHA-256)','usuario_id FK · expira_em']],
    ['data_nao_operacional',X[4],R[3],['data PK · descricao']],
    ['parametro',X[4],R[3]+96,['chave PK · valor']],
    ['produto',X[0],R[4],['id PK · codigo · grupo','deposito · peso_unitario']],
    ['equipamento',X[1],R[4],['id PK · armazem_id FK','identificacao UK · tipo']],
    ['armazem',X[2],R[4],['id PK · codigo UK','nome']],
    ['grupo_produto',X[3],R[4],['codigo PK · armazem_id FK','descricao']],
    ['deposito_armazem',X[4],R[4],['deposito PK · observacao','armazem_id FK?']],
    ['chapa',X[0],R[5],['matricula PK','nome']],
    ['boletim_equipe',X[1],R[5],['boletim_id PK/FK','matricula PK/FK','tipo_diaria']],
    ['boletim',X[2],R[5],['id PK · armazem_id FK','UK (armazem_id, data)','producao_total · total_a_pagar','complemento · situacao','arquivo_origem']],
    ['boletim_producao',X[3],R[5],['boletim_id PK/FK','tipo_item PK/FK','quantidades · preco_unitario']],
    ['tipo_item',X[4],R[5],['codigo PK · descricao','preco_unitario']],
    ['hist_estoque_item',X[0],R[6],['arquivo_origem + linha_origem PK','armazem_id FK · produto_codigo','descricao · quantidade','importado_em']],
    ['hist_documento_anexo',X[1],R[6],['id PK · arquivo_origem UK','nota_fiscal_id FK?','tipo · sha256 · conteudo']],
    ['hist_nota_fiscal',X[2],R[6],['id PK · arquivo_origem UK','chave_acesso · numero · data_emissao','emitente_* · destinatario_*','valor_total · pesos · sha256','conteudo_xml']],
    ['hist_nota_fiscal_item',X[3],R[6],['nota_fiscal_id PK/FK','numero_item PK','ncm · quantidade · valores']],
    ['hist_recebimento_item',X[4],R[6],['id PK · linha_origem UK parcial','nr_recebimento · data_recebimento','pedido_compra · item_codigo','nf_chave · deposito · peso_kg']],
    ['hist_chapa_dia',X[0],R[7],['data PK · dia_semana','qtd_presentes · qtd_cafe','valor_pago']],
    ['hist_chapa_presenca',X[1],R[7],['data + matricula PK']],
    ['equipamento_catalogo_oficial',X[2],R[7],['tipo PK · utilizacao','arquivo_origem']]
  ];
  const pos=Object.fromEntries(cards.map(([n,x,y,f])=>[n,{x,y,fim:y+54+f.length*22}]));
  const fy=(n,i)=>pos[n].y+58+i*22; // altura da i-ésima linha de campos do cartão
  let edges='', labels='';
  const seta=(pts,arrow=true)=>edges+=`<path d="M${pts.map(p=>p.join(' ')).join(' L')}" fill="none" stroke="#a4b6c8" stroke-width="2"${arrow?' marker-end="url(#arrow)"':''}/>`;
  const rotulo=(x,y,s,anchor='start')=>labels+=text(x,y,s,11,600,anchor,'#50677f');
  // Cartões vizinhos na mesma linha: a seta chega à linha de texto que contém a FK.
  function lado(a,z,y,card){const s=pos[a],t=pos[z],dir=s.x<t.x,x1=dir?s.x+W:s.x,x2=dir?t.x:t.x+W;seta([[x1,y],[x2,y]]);rotulo((x1+x2)/2,y-6,card,'middle');}
  // Cartões na mesma coluna: liga base e topo.
  function coluna(a,z,x,card){const s=pos[a],t=pos[z],desce=s.y<t.y,y1=desce?s.fim:s.y,y2=desce?t.y:t.fim;seta([[x,y1],[x,y2]]);rotulo(x+6,desce?y2-8:y2+16,card);}
  // Barramento das FKs agendamento_id: sobe do agendamento e distribui para as tabelas dependentes.
  const yA=R[2]-35;
  seta([[C[2],R[2]],[C[2],yA]],false); seta([[C[0],yA],[C[4],yA]],false);
  [['nota_fiscal','1:N'],['validacao_compras','1:0..1'],['evento_agendamento','1:N'],['reagendamento','1:N'],['cancelamento','1:0..1']]
    .forEach(([n,card],i)=>{seta([[C[i],yA],[C[i],pos[n].fim]]);rotulo(C[i]+6,pos[n].fim+16,card);});
  seta([[X[0]+215,yA],[X[0]+215,R[2]]]); rotulo(X[0]+221,R[2]-8,'0..1:N');
  seta([[X[4]+75,yA],[X[4]+75,R[2]]]); rotulo(X[4]+81,R[2]-8,'1:0..1');
  edges+=`<circle cx="${C[2]}" cy="${yA}" r="5" fill="#7f97b0"/>`;
  labels+=text(C[2]+12,yA-7,'agendamento_id',11,400,'start','#7a8ea3');
  lado('fornecedor','agendamento',fy('agendamento',0),'1:N');
  lado('fornecedor','nao_recebimento',fy('nao_recebimento',1),'0..1:N');
  lado('usuario','agendamento',fy('agendamento',1),'0..1:N');
  lado('usuario','portaria_recebimento',fy('portaria_recebimento',1),'1:N');
  lado('usuario','portaria_recebimento',fy('portaria_recebimento',2),'0..1:N');
  coluna('agendamento','descarga',C[2],'1:N');
  const yB=pos.agendamento.fim;
  seta([[X[2]+50,yB],[X[2]+50,yB+26],[X[0]+90,yB+26],[X[0]+90,R[3]]]); rotulo(X[0]+96,R[3]-8,'origem 1:0..1');
  seta([[X[2]+80,yB],[X[2]+80,yB+52],[X[0]+220,yB+52],[X[0]+220,R[3]]]); rotulo(X[0]+226,R[3]-8,'atribuída 0..1:N');
  coluna('usuario','sessao',C[3],'1:N');
  lado('descarga','descarga_equipamento',fy('descarga_equipamento',0),'1:N');
  coluna('equipamento','descarga_equipamento',C[1],'1:N');
  coluna('armazem','descarga',C[2],'1:N');
  lado('armazem','equipamento',fy('equipamento',0),'1:N');
  lado('armazem','grupo_produto',fy('grupo_produto',0),'1:N');
  const yL=pos.armazem.fim+32, yE=fy('hist_estoque_item',1);
  seta([[X[2]+235,pos.armazem.fim],[X[2]+235,yL],[C[4],yL],[C[4],pos.deposito_armazem.fim]]); rotulo(C[4]+6,yL-10,'0..1:N');
  seta([[X[2]+55,pos.armazem.fim],[X[2]+55,yL],[35,yL],[35,yE],[X[0],yE]]); rotulo(40,yE-7,'1:N');
  coluna('armazem','boletim',C[2],'1:N');
  lado('boletim','boletim_equipe',fy('boletim_equipe',0),'1:N');
  lado('chapa','boletim_equipe',fy('boletim_equipe',1),'1:N');
  lado('boletim','boletim_producao',fy('boletim_producao',0),'1:N');
  lado('tipo_item','boletim_producao',fy('boletim_producao',1),'1:N');
  lado('hist_nota_fiscal','hist_nota_fiscal_item',fy('hist_nota_fiscal_item',0),'1:N');
  lado('hist_nota_fiscal','hist_documento_anexo',fy('hist_documento_anexo',1),'0..1:N');
  b+=edges;
  function card(n,x,y,fields){const h=54+fields.length*22; b+=`<rect x="${x}" y="${y}" width="${W}" height="${h}" rx="8" fill="#fff" stroke="#4f6e8c" stroke-width="2"/><path d="M${x+1} ${y+34}H${x+W-1}" stroke="#9bb2ca"/>`+`<path d="M${x+8} ${y+7}H${x+W-8}V${y+31}H${x+8}z" fill="#dceaf5"/>`+text(x+14,y+25,n,16,700);fields.forEach((f,i)=>b+=text(x+13,y+62+i*22,f,13));}
  cards.forEach(c=>card(...c));
  b+=labels;
  b+=text(70,1612,'Seta: da tabela referenciada (lado 1) para a tabela que guarda a FK (lado N) · 0..1 = FK opcional (coluna aceita nulo) · ponto: barramento das FKs agendamento_id',14,600);
  b+=text(70,1638,'Tabelas sem seta não têm FK. A lista completa de FKs, cardinalidades e restrições está em der.md; flyway_schema_history (controle das migrações) fica fora do diagrama.',13);
  fs.writeFileSync(path.join(out,'der.svg'),svg(1890,1665,b));
}
