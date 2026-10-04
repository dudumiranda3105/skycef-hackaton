'use strict';
/* Diferencial 7: Qualidade dos Dados.
   Deixa explícito de onde vêm os números, que tratamentos foram aplicados e quais conclusões NÃO se sustentam.
   O que é da plataforma é contado ao vivo; o que é do pacote histórico da Cocapec vem da carga documentada em
   docs/relatorio-gerencial.md (seção 7), e fica marcado como tal. */

const QD={histAll:null,op:null,plat:null,erro:null,carregando:false};
/* seção 7 do relatório gerencial: o que a carga do pacote encontrou e como tratou */
const INCONSISTENCIAS_HIST=[
  ['Linhas 100% duplicadas na movimentação','540','Descartadas (41.779 → 41.239 linhas)'],
  ['Uma linha por item, não por caminhão','41.239 linhas → 18.821 recebimentos','A carga é o recebimento (data, nº, armazém); contar linhas inflaria a demanda'],
  ['Recebimentos por dia × caminhões informados','mediana de 15 por dia, contra 5 a 6 no Dossiê','Recebimento usado só como índice relativo de demanda; a confirmar com a Cocapec'],
  ['Recebimentos em sábados','21 linhas em 5 dias','Preservados e contados; a análise de equipe usa só segunda a sexta'],
  ['Data de recebimento anterior à data do documento','308','Preservadas e contadas (provável lançamento retroativo)'],
  ['Coluna de peso inutilizável','mediana do Adubo ≈ 573 toneladas por recebimento','Peso não é usado em nenhum cálculo'],
  ['Chave de acesso ausente','224','Guardada como nula'],
  ['Chave de acesso malformada (≠ 44 dígitos)','111','Guardada como nula'],
  ['Depósitos fora do Dossiê','11 linhas','Ficam fora da quebra por armazém; contados'],
  ['Folha sem ago e dez de 2025; jan de 2025 com 5 dias','2 meses + 1 parcial','Meses com menos de 10 dias de folha ficam fora do saldo'],
  ['Folha de sábado','72 dias','Fora do saldo: sábado é organização de estoque'],
  ['Código do item do XML é do fornecedor','837 de 838 itens não casam','Amarração pelo pedido de compra validado por Compras, não pelo código do XML'],
  ['NF-e sem peso bruto na amostra de XML','29 de 460','Usa-se o peso líquido quando existe'],
  ['Peso e quantidade repetidos em recebimentos parciais','1.281 pares pedido-item (levantamento anterior, não reverificado)','Não se somam peso nem quantidade como carga']
];
async function carregarQualidade(){
  QD.carregando=true;QD.erro=null;if(U.route==='qualidade')renderPanel('qualidade');
  try{
    const [h,o,p]=await Promise.all([GET('/api/painel/dimensionamento/historico'),GET('/api/painel/operacao'),GET('/api/painel/dimensionamento/plataforma')]);
    QD.histAll=h;QD.op=o;QD.plat=p;
  }catch(e){QD.erro=errTxt(e);}
  QD.carregando=false;if(U.route==='qualidade')renderPanel('qualidade');
}
const intervalo=ds=>{ds=ds.filter(Boolean).sort();return ds.length?fmtBR(ds[0])+' a '+fmtBR(ds[ds.length-1]):'sem registros';};
const contaPor=(arr,k)=>{const c={};arr.forEach(x=>c[x[k]]=(c[x[k]]||0)+1);return c;};
const txtOrig=c=>Object.entries(c).map(([k,v])=>nf0.format(v)+' '+k.toLowerCase()).join(' · ')||'—';
const pct=(a,b)=>b?nf1.format(a/b*100)+'%':'—';

function viewQualidade(){
  const cab=head('Qualidade dos dados','De onde vêm os números, quais tratamentos foram aplicados e quais conclusões não podem ser sustentadas com segurança. A solução não mostra só um número: ela explica como chegou nele.','Quem usa: direção, gestores e avaliadores',QD.carregando?'<span class="chip info">Atualizando…</span>':'');
  if(QD.erro&&!QD.histAll)return cab+'<div class="callout bad">Não foi possível carregar: '+esc(QD.erro)+' <button class="btn sm" data-act="qd-retry">Tentar de novo</button></div>';
  if(!QD.histAll)return cab+'<div class="empty">Carregando…</div>';
  const H=QD.histAll,O=QD.op||{},Z=QD.plat||{};
  /* --- histórico --- */
  const meses=(H.meses||[]).map(m=>m.mes),primeiro=meses[0],ultimo=meses[meses.length-1];
  const lacunas=meses.length?monthsBetween(primeiro,ultimo).filter(m=>!meses.includes(m)):[];
  /* --- plataforma (contado ao vivo) --- */
  const ags=S.ags,ds=todasDescs(),bs=S.boletins;
  const concl=ds.filter(d=>d.saida),semNum=ags.filter(a=>a.nfs.every(n=>!n.numero)).length,semArq=ags.filter(a=>a.nfs.some(n=>!n.arquivo)).length;
  const incons=bs.filter(b=>b.situacao!=='CONSISTENTE').length,semCnpj=S.forn.filter(f=>!f.cnpj).length;
  const descSem={chegada:ds.filter(d=>d.entrada&&!d.chegada).length,chapas:concl.filter(d=>d.chapas==null).length};
  const linhaP=(rotulo,total,validos,obs)=>'<tr><td>'+rotulo+'</td><td class="r num">'+nf0.format(total)+'</td><td class="r num">'+nf0.format(validos)+'</td><td class="r num">'+pct(validos,total)+'</td><td class="muted small">'+obs+'</td></tr>';
  const sobre=[
    ['Cargas recebidas por dia','recebimentos-destino únicos ÷ dias úteis com folha','Histórico Cocapec',nf0.format(sum(H.meses||[],'diasUteis'))+' dias úteis em '+meses.length+' mês(es)','Um recebimento não é um caminhão; unidade documental.'],
    ['Sobra ou falta (histórico)','chapas presentes − esforço do mês ÷ equilíbrio do histórico','Histórico Cocapec',nf0.format((H.equilibrio||{}).diasUteisAnalisados||0)+' dias úteis analisados','Relativo ao próprio histórico; ordem de grandeza, não economia comprovada.'],
    ['Sobra ou falta (plataforma)','sobra = Σ complemento; falta = Σ (produção − piso × diárias) quando positivo','Boletins da plataforma',nf0.format((Z.total||{}).boletins||0)+' boletim(ns)','Só dias com boletim; inconsistentes ficam fora dos valores.'],
    ['Tempo médio de espera','entrada − chegada','Nova plataforma',nf0.format((O.tempoMedioEsperaMin||{}).amostra||0)+' descarga(s)','O histórico não registra chegada.'],
    ['Tempo médio de descarga','saída − entrada','Nova plataforma',nf0.format((O.tempoMedioDescargaMin||{}).amostra||0)+' descarga(s)','Registros incompletos ficam de fora; estimativas do Dossiê não entram.'],
    ['Chapas por descarga','média de quantidade_chapas por descarga','Nova plataforma',nf0.format((O.chapasPorRecebimento||{}).amostra||0)+' descarga(s)','Não é o efetivo do dia.'],
    ['Custo da operação','Σ total a pagar dos boletins consistentes','Boletins da plataforma',nf0.format((O.custoDaOperacao||{}).boletins||0)+' boletim(ns)','Sem encargos nem equipamentos (nunca R$ 180 por pessoa).'],
    ['Utilização dos locais','horas ocupadas (saída − entrada) por armazém','Nova plataforma',nf0.format(concl.length)+' descarga(s) concluída(s)','Sem percentual oficial: a Cocapec não definiu a fórmula.'],
    ['Fornecedores com maior volume','recebimentos distintos por fornecedor','Histórico Cocapec','todo o histórico','A unidade é recebimento, nunca kg.'],
    ['Pressão do Planejamento D-1','chapas simultâneas pela norma ÷ equipe de referência','Agendamentos + boletins','agendamentos do dia','Nível, não número exato; limiares são parâmetros do projeto; DQ-016 em aberto.']
  ];
  return cab+
  '<div class="callout" style="margin-bottom:18px"><b>Como ler:</b> cada indicador do painel tem um botão “Ver cálculo” e um bloco “Sobre este dado” (fórmula, fonte, período, registros e limitação). Esta página reúne a visão geral da base.</div>'+
  '<div class="cols2"><div class="panel"><h2>Histórico Cocapec</h2><p class="lead">Pacote de dados do evento, carregado uma vez e marcado como <span class="badge hist">HISTÓRICO</span>.</p>'+
   '<table class="mini"><tbody><tr><td>Movimentação</td><td class="r">jun/2022 a set/2026 · 41.779 linhas</td></tr><tr><td>Linhas válidas após limpeza</td><td class="r">41.239 · '+pct(41239,41779)+'</td></tr><tr><td>Folha com saldo calculado</td><td class="r">'+(meses.length?mLabel(primeiro)+' a '+mLabel(ultimo)+' · '+meses.length+' mês(es)':'sem histórico carregado')+'</td></tr><tr><td>Dias úteis analisados</td><td class="r num">'+nf0.format((H.equilibrio||{}).diasUteisAnalisados||0)+'</td></tr></tbody></table>'+
   '<div class="sec-t" style="margin-top:12px">Períodos com cobertura incompleta</div>'+(lacunas.length||meses.length?'<ul class="dl-list">'+(lacunas.length?'<li>Meses sem folha dentro do intervalo: '+lacunas.map(mLabel).join(', ')+'.</li>':'')+'<li>Fora do saldo por regra: meses com menos de 10 dias de folha (jan/2025 parcial; ago e dez/2025 sem folha). O recebimento desses meses aparece na demanda, mas não no saldo.</li></ul>':'<p class="muted">Sem histórico carregado.</p>')+
   '</div>'+
   '<div class="panel"><h2>Nova plataforma</h2><p class="lead">Registros do uso real e de demonstração, contados agora.</p>'+
   '<div class="tscroll"><table class="mini"><thead><tr><th>Registro</th><th class="r">Total</th><th class="r">Completos</th><th class="r">%</th><th>Critério</th></tr></thead><tbody>'+
   linhaP('Agendamentos',ags.length,ags.length-semNum,'com ao menos um número de NF')+
   linhaP('Descargas',ds.length,concl.length,'com saída registrada')+
   linhaP('Descargas concluídas',concl.length,concl.length-descSem.chapas,'com chapas informadas')+
   linhaP('Boletins',bs.length,bs.length-incons,'consistentes (com equipe)')+
   linhaP('Fornecedores',S.forn.length,S.forn.length-semCnpj,'com CNPJ')+
   '</tbody></table></div>'+
   '<ul class="dl-list" style="margin-top:10px"><li>Origem dos agendamentos: '+txtOrig(contaPor(ags,'origem'))+'. Boletins: '+txtOrig(contaPor(bs,'origem'))+'.</li><li>Período coberto: agendamentos '+intervalo(ags.map(a=>a.data))+'; boletins '+intervalo(bs.map(b=>b.data))+'.</li><li>Campos ausentes relevantes: '+semArq+' agendamento(s) com nota sem arquivo anexado; '+descSem.chapas+' descarga(s) concluída(s) sem chapas informadas; '+incons+' boletim(ns) inconsistente(s).</li></ul></div></div>'+
  '<div class="sec"><div class="panel"><h2>Duplicidades e problemas encontrados no pacote, e o tratamento</h2><p class="lead">Contagens da carga documentada em <code>docs/relatorio-gerencial.md</code> (seção 7). Cada uma foi tratada e documentada em vez de escondida.</p>'+
   '<div class="tscroll"><table class="mini"><thead><tr><th>Problema</th><th class="r">Quantidade</th><th>Tratamento</th></tr></thead><tbody>'+INCONSISTENCIAS_HIST.map(r=>'<tr><td>'+esc(r[0])+'</td><td class="r">'+esc(r[1])+'</td><td>'+esc(r[2])+'</td></tr>').join('')+'</tbody></table></div></div></div>'+
  '<div class="sec"><div class="panel"><h2>Sobre este dado</h2><p class="lead">Cada indicador, a fórmula, de onde vem, quantos registros entram e o que limita a leitura.</p>'+
   '<div class="tscroll"><table class="mini"><thead><tr><th>Indicador</th><th>Fórmula</th><th>Fonte</th><th>Registros</th><th>Limitação</th></tr></thead><tbody>'+sobre.map(r=>'<tr><td><b>'+esc(r[0])+'</b></td><td>'+esc(r[1])+'</td><td>'+esc(r[2])+'</td><td>'+esc(r[3])+'</td><td>'+esc(r[4])+'</td></tr>').join('')+'</tbody></table></div></div></div>'+
  '<div class="sec"><div class="panel"><h2>Limitações conhecidas</h2><ul class="dl-list">'+(H.limitacoes||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+
   '<li>O histórico nunca registrou chegada, entrada, saída, chapas ou equipamentos por recebimento: esses indicadores só existem na plataforma.</li><li>Quando Compras não autoriza uma entrega, a plataforma registra o não recebimento por divergência entre NF e pedido (assunção da equipe, a confirmar com a Cocapec).</li><li>As quantidades e preços do boletim seguem o Dossiê; o custo da operação é sempre o total a pagar do boletim.</li></ul></div></div>';
}
Object.assign(ACT,{'qd-retry'(){return carregarQualidade();}});
VIEWS.qualidade=viewQualidade;
