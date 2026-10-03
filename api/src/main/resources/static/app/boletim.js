const $ = (id) => document.getElementById(id);
const state = { chapas: [], armazens: [], tipos: [], busy: false };
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const integer = new Intl.NumberFormat('pt-BR');

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function money(value) {
  return value == null ? '—' : currency.format(Number(value));
}

function message(text, error = false) {
  $('form-message').textContent = text;
  $('form-message').classList.toggle('error', error);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fields = Array.isArray(data.erros) ? data.erros.map((item) => `${item.campo}: ${item.mensagem}`).join('; ') : '';
    throw new Error(fields || data.detail || `Falha HTTP ${response.status}`);
  }
  return data;
}

function invalidatePreview() {
  $('previa').replaceChildren(node('p', 'Os dados mudaram. Selecione “Ver prévia” para atualizar a apuração.', 'muted'));
}

function setBusy(busy) {
  state.busy = busy;
  $('calcular').disabled = busy;
  $('gravar').disabled = busy;
}

function renderTypes() {
  const body = $('linhas');
  body.replaceChildren();
  for (const item of state.tipos) {
    const row = node('tr');
    row.dataset.tipo = item.codigo;
    const label = node('td');
    label.append(node('strong', item.descricao), node('small', item.codigo));
    row.append(label, node('td', money(item.precoUnitario), 'price'));
    for (const field of ['descarga', 'remocao', 'transferencia']) {
      const cell = node('td');
      const input = node('input');
      input.type = 'number';
      input.min = '0';
      input.max = '10000000';
      input.step = '1';
      input.value = '0';
      input.dataset.field = field;
      input.setAttribute('aria-label', `${field} de ${item.descricao}`);
      cell.append(input);
      row.append(cell);
    }
    body.append(row);
  }
}

function addChapa() {
  if (document.querySelectorAll('.team-row').length >= 20) {
    message('O limite é de 20 chapas por boletim.', true);
    return;
  }
  const row = node('div', undefined, 'team-row');
  const memberLabel = node('label', 'Matrícula');
  const member = node('select');
  member.required = true;
  member.append(new Option('Selecione uma matrícula', ''));
  for (const chapa of state.chapas) {
    member.append(new Option(`${chapa.matricula} · ${chapa.nome || 'Sem nome'}`, chapa.matricula));
  }
  memberLabel.append(member);
  const dayLabel = node('label', 'Diária');
  const day = node('select');
  day.append(new Option('Completa', 'COMPLETA'), new Option('Meia', 'MEIA'));
  dayLabel.append(day);
  const remove = node('button', 'Remover', 'secondary');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remover chapa da equipe');
  remove.addEventListener('click', () => { row.remove(); invalidatePreview(); });
  row.append(memberLabel, dayLabel, remove);
  $('equipe').append(row);
  invalidatePreview();
}

function payload() {
  if (!$('boletim-form').reportValidity()) throw new Error('Preencha armazém, data e matrícula de cada chapa.');
  const linhas = [...$('linhas').querySelectorAll('tr[data-tipo]')].map((row) => {
    const quantities = {};
    for (const field of ['descarga', 'remocao', 'transferencia']) {
      const input = row.querySelector(`[data-field="${field}"]`);
      const value = Number(input.value);
      if (!Number.isSafeInteger(value) || value < 0 || value > 10000000) {
        throw new Error(`Informe uma quantidade inteira válida para ${field} de ${row.dataset.tipo}.`);
      }
      quantities[field] = value;
    }
    return { tipoItem: row.dataset.tipo, ...quantities };
  }).filter((line) => line.descarga + line.remocao + line.transferencia > 0);
  const equipe = [...document.querySelectorAll('.team-row')].map((row) => ({
    matricula: row.querySelector('label:first-child select').value,
    tipoDiaria: row.querySelector('label:nth-child(2) select').value,
  }));
  if (new Set(equipe.map((member) => member.matricula)).size !== equipe.length) {
    throw new Error('Cada matrícula pode aparecer somente uma vez na equipe.');
  }
  if (!linhas.length && !equipe.length) throw new Error('Informe produção e/ou equipe para lançar o boletim.');
  return { armazemId: Number($('armazem').value), data: $('data').value, linhas, equipe };
}

function renderPreview(result, saved = false) {
  const box = $('previa');
  box.replaceChildren();
  box.append(node('p', saved ? `Boletim #${result.id} gravado · ${result.situacao}` : `Situação: ${result.situacao}`));
  if (result.situacao === 'INCONSISTENTE') {
    box.append(node('p', 'Sem equipe, não é possível dividir a produção nem apurar o pagamento. O boletim exige conferência.', 'warning'));
  }
  const lines = [
    ['Produção total', money(result.exibicao.producaoTotal)],
    ['Chapas: completas / meias', `${result.chapasDiariaCompleta} / ${result.chapasMeiaDiaria}`],
    ['Diárias equivalentes', String(result.diariasEquivalentes).replace('.', ',')],
    ['Piso por diária completa', money(result.piso)],
    ['Valor por diária', money(result.exibicao.valorPorDiaria)],
    ['Complemento do piso', money(result.exibicao.complemento)],
    ['Total a pagar', money(result.exibicao.totalAPagar)],
  ];
  const dl = node('dl');
  for (const [label, value] of lines) {
    if (label.startsWith('Piso') && result.piso == null) continue;
    dl.append(node('dt', label), node('dd', value, label === 'Total a pagar' ? 'total' : ''));
  }
  box.append(dl);
  if (result.abaixoDoPiso) box.append(node('p', 'O piso foi aplicado neste boletim.', 'warning'));
}

function renderHistory(items) {
  const box = $('historico');
  box.replaceChildren();
  if (!items.length) {
    box.append(node('p', 'Nenhum boletim encontrado para este armazém.', 'muted'));
    return;
  }
  for (const item of items) {
    const article = node('article');
    article.append(node('strong', `${item.data.split('-').reverse().join('/')} · ${item.armazemNome || `Armazém ${item.armazemId}`}`));
    article.append(node('small', `#${item.id} · ${item.situacao} · ${item.quantidadeChapas} chapa(s)`));
    article.append(node('p', `${money(item.exibicao.producaoTotal)} de produção · ${money(item.exibicao.totalAPagar)} a pagar`));
    const details = node('details');
    details.append(node('summary', 'Ver produção e equipe'));
    const lines = node('ul');
    for (const line of item.linhas) lines.append(node('li', `${line.descricao}: ${integer.format(line.quantidadeTotal)} unidades · ${money(line.valor)}`));
    if (!item.linhas.length) lines.append(node('li', 'Sem produção registrada'));
    details.append(lines);
    const team = node('p', item.equipe.length ? item.equipe.map((m) => `${m.matricula} (${m.tipoDiaria === 'MEIA' ? 'meia' : 'completa'})`).join(', ') : 'Sem equipe registrada');
    details.append(team);
    article.append(details);
    box.append(article);
  }
}

async function loadHistory() {
  const id = $('armazem').value;
  if (!id) { $('historico').replaceChildren(node('p', 'Selecione um armazém.', 'muted')); return; }
  try {
    $('historico').replaceChildren(node('p', 'Carregando…', 'muted'));
    renderHistory(await request(`/api/boletins?armazemId=${encodeURIComponent(id)}`));
  } catch (error) {
    $('historico').replaceChildren(node('p', error.message, 'error'));
  }
}

async function submit(action) {
  if (state.busy) return;
  try {
    const body = payload();
    setBusy(true);
    message(action === 'save' ? 'Gravando boletim…' : 'Calculando prévia…');
    const result = await request(action === 'save' ? '/api/boletins' : '/api/boletins/calculo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    renderPreview(result, action === 'save');
    message(action === 'save' ? `Boletim #${result.id} gravado com sucesso.` : 'Prévia calculada. O boletim ainda não foi gravado.');
    if (action === 'save') await loadHistory();
  } catch (error) {
    message(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function init() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  $('data').value = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  $('boletim-form').addEventListener('input', invalidatePreview);
  $('boletim-form').addEventListener('change', invalidatePreview);
  $('boletim-form').addEventListener('submit', (event) => { event.preventDefault(); submit('save'); });
  $('calcular').addEventListener('click', () => submit('preview'));
  $('adicionar-chapa').addEventListener('click', addChapa);
  $('armazem').addEventListener('change', loadHistory);
  $('atualizar').addEventListener('click', loadHistory);
  try {
    const [armazens, tipos, chapas] = await Promise.all([
      request('/api/armazens'), request('/api/boletim/tipos-item'), request('/api/chapas'),
    ]);
    state.armazens = armazens;
    state.tipos = tipos;
    state.chapas = chapas;
    $('armazem').replaceChildren(new Option('Selecione um armazém', ''));
    for (const armazem of armazens) $('armazem').append(new Option(`${armazem.codigo} · ${armazem.nome}`, String(armazem.id)));
    if (armazens.length === 1) $('armazem').value = String(armazens[0].id);
    renderTypes();
    loadHistory();
    if (tipos.length !== 14) message(`A API retornou ${tipos.length} tipos de item; eram esperados 14. Confira a carga de dados.`, true);
  } catch (error) {
    message(`Não foi possível carregar os cadastros: ${error.message}`, true);
    $('linhas').replaceChildren(node('tr'));
  }
}

init();
