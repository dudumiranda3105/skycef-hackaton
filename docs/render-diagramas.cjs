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
  b+=box(320,775,210,64,'Boletim dos 4 armazéns')+box(615,775,230,64,'Produção + equipe')+box(920,775,230,64,'Piso + complemento');
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
