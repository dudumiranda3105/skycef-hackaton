/* Pergunte aos Dados.
   Arquitetura segura: pergunta → interpretação → UMA métrica permitida → a camada de métricas calcula → resposta com
   número, período, filtros e origem. A interpretação nunca calcula nem inventa números e não existe SQL livre.
   Hoje a interpretação usa regras locais (palavras-chave, armazém, período). Um modelo de linguagem pode ser ligado
   em interpretar() sem mudar o resto: ele só escolheria uma métrica do catálogo e os parâmetros dela. */
import { GET, qs } from './api'
import { ACOND, DOW_LONGO, MOTIVOS_NR, SLOTS } from './constants'
import { calcularD1, D1_PERIODOS, NIVEL_TXT } from './d1'
import {
  addDays, brl0, brl2, dow, fmtBR, fmtDM, fmtDur, hojeISO, lastDayOfMonth, mLabel, mondayOf, nf0, nf1, pad, semAcento, sgn1, sum,
} from './format'
import type { Agendamento, Armazem, Boletim, Fornecedor } from './types'

export const PERGUNTAS_EXEMPLO = [
  'Quanto pagamos de complemento no Adubo em setembro?',
  'Qual foi o tempo médio de espera na última semana?',
  'Quantos não recebimentos ocorreram por divergência?',
  'Qual armazém teve mais recebimentos no período?',
  'Como está o planejamento para amanhã?',
  'Por que existe pressão operacional amanhã de manhã?',
]

const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_SEM_ACENTO = NOME_MES.map(semAcento)

export interface Periodo {
  de: string
  ate: string
  rotulo: string
}
export interface Interpretacao {
  metrica: string | null
  periodo: Periodo | null
  arm: Armazem | null
  motivo: string | null
  periodoDia: 'manha' | 'tarde' | null
  texto: string
}
export interface Resposta {
  vazio?: string
  valor?: string
  texto?: string
  registros?: string
  origens?: Record<string, number>
  linhas?: [string, string][]
  abrir?: { rotulo: string; secao: 'd1' }
  naoEntendi?: boolean
  erro?: string
}
export interface Contexto {
  ags: Agendamento[]
  armazens: Armazem[]
  boletins: Boletim[]
  fornById: (id: number) => Fornecedor
}

function interpretarPeriodo(t: string): Periodo | null {
  const hoje = hojeISO()
  const ym = hoje.slice(0, 7)
  const M = (de: string, ate: string, rotulo: string): Periodo => ({ de, ate, rotulo })
  if (/\bhoje\b/.test(t)) return M(hoje, hoje, `hoje (${fmtBR(hoje)})`)
  if (/\bontem\b/.test(t)) {
    const d = addDays(hoje, -1)
    return M(d, d, `ontem (${fmtBR(d)})`)
  }
  if (/(ultima|ultimas) semana|semana passada|ultimos 7 dias/.test(t)) {
    return M(addDays(hoje, -6), hoje, `últimos 7 dias (${fmtDM(addDays(hoje, -6))} a ${fmtDM(hoje)})`)
  }
  if (/(esta|nesta) semana/.test(t)) return M(mondayOf(hoje), hoje, `esta semana (${fmtDM(mondayOf(hoje))} a ${fmtDM(hoje)})`)
  if (/mes passado|ultimo mes/.test(t)) {
    const [y, m] = ym.split('-').map(Number)
    const p = m === 1 ? y - 1 + '-12' : y + '-' + pad(m - 1)
    return M(p + '-01', lastDayOfMonth(p), mLabel(p))
  }
  if (/(este|neste) mes|mes atual/.test(t)) return M(ym + '-01', hoje, `este mês (${mLabel(ym)})`)
  const mm = MESES_SEM_ACENTO.findIndex((n) => new RegExp('\\b' + n + '\\b').test(t))
  const ano = t.match(/\b(20\d{2})\b/)?.[1]
  if (mm >= 0) {
    let y = ano ? Number(ano) : Number(ym.slice(0, 4))
    if (!ano && mm + 1 > Number(ym.slice(5))) y--
    const p = y + '-' + pad(mm + 1)
    return M(p + '-01', lastDayOfMonth(p), `${NOME_MES[mm]} de ${y}`)
  }
  if (ano) return M(ano + '-01-01', ano + '-12-31', `ano de ${ano}`)
  return null
}

function interpretarArmazem(t: string, armazens: Armazem[]) {
  return armazens.find((x) => t.includes(semAcento(x.nome))) ?? (/patio|maquina/.test(t) ? armazens.find((x) => /Pátio/.test(x.nome)) : undefined) ?? null
}

export function interpretar(pergunta: string, armazens: Armazem[]): Interpretacao {
  const t = semAcento(pergunta).replace(/[?!.]/g, ' ')
  const periodo = interpretarPeriodo(t)
  const arm = interpretarArmazem(t, armazens)
  let motivo: string | null = null
  if (/divergenc/.test(t)) motivo = 'DIVERGENCIA_NF_PEDIDO'
  else if (/fortuito|chuva/.test(t)) motivo = 'CASO_FORTUITO'
  else if (/sem agendamento|sem vaga/.test(t)) motivo = 'SEM_AGENDAMENTO_SEM_VAGA'
  const manha = /\bmanha\b/.test(t)
  const tarde = /\btarde\b/.test(t)
  let metrica: string | null = null
  if (/(por que|porque|pq).*(pressao|alerta)|pressao (operacional )?(amanha|prevista)|existe pressao/.test(t)) metrica = 'd1_porque'
  else if (/planejamento|\bd-?1\b|como esta.*amanha|previsto para amanha|o que (esta )?previsto/.test(t)) metrica = 'd1_resumo'
  else if (/complemento|piso/.test(t)) metrica = 'complemento'
  else if (/espera|esperou|aguardou|fila/.test(t)) metrica = 'espera'
  else if (/(tempo|duracao).*(descarga|descarreg)|quanto tempo.*descarreg|descarga (media|demora)/.test(t)) metrica = 'descarga'
  else if (/chapas.*(descarga|recebimento)|quantas chapas/.test(t)) metrica = 'chapas'
  else if (/nao receb|nao-receb|recusad|devolvid/.test(t)) metrica = 'nao_receb'
  else if (/qual armazem|que armazem|armazem.*(mais|maior)/.test(t)) metrica = 'armazem_top'
  else if (/fornecedor.*(mais|maior)|maior fornecedor/.test(t)) metrica = 'forn_top'
  else if (/sobrando|faltando|sobra|falta de chapa|folga|pressao de equipe/.test(t)) metrica = 'sobra_falta'
  else if (/custo|gastamos|gasto|total a pagar|quanto pagamos/.test(t)) metrica = 'custo'
  else if (/(quantas?|quantos?).*(entregas|cargas|recebimentos|descargas|caminhoes)/.test(t)) metrica = 'entregas'
  return { metrica, periodo, arm, motivo, periodoDia: manha ? 'manha' : tarde ? 'tarde' : null, texto: pergunta }
}

/* ---------- catálogo de métricas permitidas ---------- */
const qPeriodo = (p: Periodo | null) => (p ? { de: p.de, ate: p.ate } : {})
const op = (i: Interpretacao) => GET<any>('/api/painel/operacao' + qs({ ...qPeriodo(i.periodo), armazemId: i.arm?.id }))

async function proxDiaOperacional(): Promise<string> {
  let d = addDays(hojeISO(), 1)
  for (let n = 0; n < 14; n++) {
    try {
      const a = await GET<{ diaUtil: boolean }>('/api/agenda' + qs({ data: d }))
      if (a.diaUtil) return d
    } catch {
      if (dow(d) !== 0 && dow(d) !== 6) return d
    }
    d = addDays(d, 1)
  }
  return d
}

export interface Metrica {
  nome: string
  def: string
  fonte: string
  limite?: string
  calc: (i: Interpretacao, ctx: Contexto) => Promise<Resposta>
}
const fmtKg = (n: number) => nf0.format(n)

export const METRICAS: Record<string, Metrica> = {
  complemento: {
    nome: 'Complemento pago ao piso',
    def: 'Soma do complemento dos boletins: o que se paga para completar o piso de R$ 90,1731 por diária quando a produção fica abaixo dele.',
    fonte: 'Boletim diário (plataforma)',
    async calc(i) {
      const r = await GET<any>('/api/painel/dimensionamento/plataforma' + qs({ ...qPeriodo(i.periodo), armazemId: i.arm?.id, agrupar: 'mes' }))
      const T = r.total || {}
      if (!T.boletins) return { vazio: 'Não há boletins salvos neste filtro.', origens: r.origens }
      return {
        valor: brl2(T.sobraReais),
        texto: `Foi pago ${brl2(T.sobraReais)} de complemento${i.arm ? ' no ' + i.arm.nome : ' nos armazéns'} (${nf0.format(T.boletins)} boletim(ns), ${nf1.format(+T.diariasEquivalentes)} diárias).`,
        registros: `${T.boletins} boletim(ns)${T.boletinsInconsistentes ? ', ' + T.boletinsInconsistentes + ' inconsistente(s) fora dos valores' : ''}`,
        origens: r.origens,
        linhas: (r.porArmazem || []).map((a: any): [string, string] => [a.armazem, brl2(a.sobraReais)]),
      }
    },
  },
  espera: {
    nome: 'Tempo médio de espera',
    def: 'Média de (entrada − chegada) de cada descarga concluída.',
    fonte: 'Descargas registradas na plataforma',
    limite: 'O histórico da Cocapec não tem horário de chegada: só existe na plataforma. Descargas sem chegada ou entrada ficam fora.',
    async calc(i) {
      const r = await op(i)
      const x = r.tempoMedioEsperaMin || {}
      if (x.media == null) return { vazio: 'Não há descargas com chegada e entrada registradas neste filtro.', origens: r.origens }
      return {
        valor: fmtDur(x.media), texto: `O tempo médio de espera foi de ${fmtDur(x.media)}.`, registros: `${nf0.format(x.amostra)} descarga(s)`, origens: r.origens,
        linhas: (r.porArmazem || []).filter((a: any) => a.esperaMediaMin != null).map((a: any): [string, string] => [a.armazem, fmtDur(a.esperaMediaMin)]),
      }
    },
  },
  descarga: {
    nome: 'Tempo médio de descarga',
    def: 'Média de (saída − entrada) de cada descarga concluída.',
    fonte: 'Descargas registradas na plataforma',
    limite: 'Estimativas do Dossiê (ex.: 10 paletes ≈ 15 min) não entram.',
    async calc(i) {
      const r = await op(i)
      const x = r.tempoMedioDescargaMin || {}
      if (x.media == null) return { vazio: 'Não há descargas concluídas neste filtro.', origens: r.origens }
      return {
        valor: fmtDur(x.media), texto: `O tempo médio de descarga foi de ${fmtDur(x.media)}.`, registros: `${nf0.format(x.amostra)} descarga(s)`, origens: r.origens,
        linhas: (r.porArmazem || []).filter((a: any) => a.descargaMediaMin != null).map((a: any): [string, string] => [a.armazem, fmtDur(a.descargaMediaMin)]),
      }
    },
  },
  chapas: {
    nome: 'Chapas por descarga',
    def: 'Média da quantidade de chapas informada em cada descarga.',
    fonte: 'Descargas registradas na plataforma',
    limite: 'Mede a intensidade de cada descarga; não é o efetivo do dia.',
    async calc(i) {
      const r = await op(i)
      const x = r.chapasPorRecebimento || {}
      if (x.media == null) return { vazio: 'Não há descargas com chapas informadas neste filtro.', origens: r.origens }
      return {
        valor: nf1.format(x.media), texto: `Foram usadas em média ${nf1.format(x.media)} chapas por descarga.`, registros: `${nf0.format(x.amostra)} descarga(s)`, origens: r.origens,
        linhas: (r.porArmazem || []).filter((a: any) => a.chapasPorRecebimento != null).map((a: any): [string, string] => [a.armazem, nf1.format(a.chapasPorRecebimento)]),
      }
    },
  },
  custo: {
    nome: 'Custo da operação',
    def: 'Soma do total a pagar dos boletins consistentes (produção, ou piso + complemento). Sem encargos nem equipamentos.',
    fonte: 'Boletim diário (plataforma)',
    async calc(i) {
      const r = await op(i)
      const c = r.custoDaOperacao || {}
      if (!c.boletins) return { vazio: 'Não há boletins neste filtro.', origens: r.origens }
      return {
        valor: brl2(c.totalAPagar),
        texto: `O custo da operação foi de ${brl2(c.totalAPagar)} (produção ${brl2(c.producao)}, complemento ${brl2(c.complemento)}).`,
        registros: `${nf0.format(c.boletins)} boletim(ns)${c.boletinsInconsistentes ? ', ' + c.boletinsInconsistentes + ' inconsistente(s) fora do total' : ''}`,
        origens: r.origens,
      }
    },
  },
  nao_receb: {
    nome: 'Não recebimentos',
    def: 'Contagem de ocorrências de não recebimento, por motivo.',
    fonte: 'Não recebimentos registrados na plataforma',
    limite: 'Quando Compras não autoriza, o sistema registra o não recebimento por divergência entre NF e pedido (assunção da equipe).',
    async calc(i) {
      const r = await op(i)
      const L: { motivo: string; quantidade: number }[] = r.naoRecebimentos || []
      const total = L.reduce((s, x) => s + x.quantidade, 0)
      const sel = i.motivo ? (L.find((x) => x.motivo === i.motivo)?.quantidade ?? 0) : total
      return {
        valor: nf0.format(sel),
        texto: `Ocorreram ${nf0.format(sel)} não recebimento(s) ${i.motivo ? 'por ' + MOTIVOS_NR[i.motivo].toLowerCase() : 'no total'}.`,
        registros: `${nf0.format(total)} ocorrência(s) no filtro`,
        origens: { ...(r.origens || {}) },
        linhas: Object.keys(MOTIVOS_NR).map((k): [string, string] => [MOTIVOS_NR[k], nf0.format(L.find((x) => x.motivo === k)?.quantidade ?? 0)]),
      }
    },
  },
  armazem_top: {
    nome: 'Armazém com mais recebimentos',
    def: 'Armazém com mais descargas concluídas no filtro (plataforma). Sem registros da plataforma, usa os recebimentos-destino do histórico.',
    fonte: 'Descargas (plataforma) ou histórico Cocapec',
    async calc(i) {
      const r = await op({ ...i, arm: null })
      const L: any[] = (r.porArmazem || []).slice().sort((a: any, b: any) => b.cargas - a.cargas)
      if (L.length) {
        return {
          valor: L[0].armazem, texto: `O armazém com mais recebimentos foi o ${L[0].armazem} (${nf0.format(L[0].cargas)} descarga(s) concluída(s)).`,
          registros: `${nf0.format(L.reduce((s, a) => s + a.cargas, 0))} descarga(s)`, origens: r.origens,
          linhas: L.map((a): [string, string] => [a.armazem, nf0.format(a.cargas) + ' descargas']),
        }
      }
      const h = await GET<any>('/api/painel/dimensionamento/historico' + qs(qPeriodo(i.periodo)))
      const A: any[] = (h.armazens || []).slice().sort((a: any, b: any) => b.recebimentos - a.recebimentos)
      if (!A.length || !A[0].recebimentos) return { vazio: 'Não há recebimentos registrados neste filtro.', origens: {} }
      return {
        valor: A[0].armazem, texto: `Sem descargas da plataforma no filtro, o histórico indica o ${A[0].armazem} (${nf0.format(A[0].recebimentos)} recebimentos-destino).`,
        registros: `${nf0.format(sum(A, 'recebimentos'))} recebimentos-destino`, origens: { HISTORICO: 1 },
        linhas: A.map((a): [string, string] => [a.armazem, nf0.format(a.recebimentos) + ' recebimentos']),
      }
    },
  },
  forn_top: {
    nome: 'Fornecedores com maior volume',
    def: 'Fornecedores com mais recebimentos distintos em todo o histórico (a unidade é recebimento, não kg).',
    fonte: 'Histórico Cocapec',
    limite: 'Não muda com período nem armazém.',
    async calc(): Promise<Resposta> {
      const r = await GET<any>('/api/painel/historico/indicadores')
      const L: any[] = r.fornecedoresMaiorVolume || []
      if (!L.length) return { vazio: 'O histórico ainda não foi carregado.', origens: {} }
      return {
        valor: L[0].fornecedor, texto: `O fornecedor com maior volume é ${L[0].fornecedor} (${nf0.format(L[0].recebimentos)} recebimentos).`,
        registros: 'ranking do histórico completo', origens: { HISTORICO: 1 },
        linhas: L.slice(0, 6).map((x): [string, string] => [x.fornecedor, nf0.format(x.recebimentos) + ' recebimentos']),
      }
    },
  },
  entregas: {
    nome: 'Descargas concluídas',
    def: 'Quantidade de descargas com saída registrada (um caminhão com 2 destinos conta 2).',
    fonte: 'Descargas registradas na plataforma',
    async calc(i) {
      const r = await op(i)
      const c = r.cargasRecebidas?.total || 0
      if (!c) return { vazio: 'Não há descargas concluídas neste filtro.', origens: r.origens }
      return {
        valor: nf0.format(c), texto: `Foram concluídas ${nf0.format(c)} descarga(s).`, registros: `${nf0.format(c)} descarga(s)`, origens: r.origens,
        linhas: (r.porArmazem || []).map((a: any): [string, string] => [a.armazem, nf0.format(a.cargas)]),
      }
    },
  },
  sobra_falta: {
    nome: 'Sobra ou falta de chapas',
    def: 'Histórico: saldo mês a mês entre chapas presentes e necessárias pela norma do Dossiê, em diárias e em R$ ao piso. Plataforma: complemento pago (sobra) e produção acima do piso (falta).',
    fonte: 'Histórico Cocapec e boletins da plataforma',
    limite: 'O saldo do histórico é relativo ao próprio histórico (não o tamanho ideal absoluto) e é ordem de grandeza.',
    async calc(i): Promise<Resposta> {
      const h = await GET<any>('/api/painel/dimensionamento/historico' + qs(qPeriodo(i.periodo)))
      const t = h.totais || {}
      if (!(h.meses || []).length) return { vazio: 'Não há histórico de folha no período pedido (o pacote cobre só alguns meses).', origens: {} }
      return {
        valor: `${brl0(t.sobraReais)} / ${brl0(t.faltaReais)}`,
        texto: `No histórico há folga de ${nf1.format(+t.sobraDiarias)} diárias (${brl0(t.sobraReais)}) em alguns meses e pressão de ${nf1.format(+t.faltaDiarias)} diárias (${brl0(t.faltaReais)}) em outros, ao piso. O saldo líquido é ${brl0(t.saldoReais)}: há descompasso no tempo, não sobra nem falta permanente.`,
        registros: `${nf0.format(h.meses.length)} mês(es)`, origens: { HISTORICO: 1 },
        linhas: (h.estacoes || []).map((e: any): [string, string] => [e.rotulo, `${sgn1(e.saldoDiarias)} diárias · ${brl0(e.saldoReais)}`]),
      }
    },
  },
  d1_resumo: {
    nome: 'Planejamento D-1',
    def: 'Entregas agendadas para o próximo dia operacional, distribuídas por horário e armazém, com nível de pressão.',
    fonte: 'Agendamentos (plataforma) e equipe de referência dos boletins',
    limite: 'Trabalha com níveis, não com número exato de chapas.',
    async calc(_i, ctx) {
      const data = await proxDiaOperacional()
      const P = calcularD1(data, ctx.ags, ctx.armazens, ctx.boletins, fmtKg)
      const n = P.ags.length
      if (!n) return { vazio: `Não há entregas agendadas para ${fmtBR(data)}.`, origens: {} }
      const al: string[] = []
      P.linhas.forEach((L) =>
        SLOTS.forEach((h) => {
          const k = L.slots[h].nivel.k
          if (k === 'ALTA' || k === 'MODERADA') al.push(`${L.nome} às ${h}: ${NIVEL_TXT[k].toLowerCase()}`)
        }),
      )
      const orig: Record<string, number> = {}
      P.ags.forEach((a) => (orig[a.origem] = (orig[a.origem] || 0) + 1))
      return {
        valor: `${nf0.format(n)} entregas`,
        texto: `Para ${DOW_LONGO[dow(data)]}, ${fmtBR(data)} há ${n} entrega(s) agendada(s)${al.length ? `, com ${al.length} alerta(s) de pressão.` : ', sem pressão moderada ou alta com a equipe de referência.'}`,
        registros: `${n} agendamento(s)`, origens: orig,
        linhas: [
          ...SLOTS.map((h): [string, string] => [h.slice(0, 2) + 'h', `${P.ags.filter((a) => a.horario === h).length} entrega(s)`]),
          ...al.map((x): [string, string] => ['Alerta', x]),
        ],
        abrir: { rotulo: 'Abrir o Planejamento D-1', secao: 'd1' },
      }
    },
  },
  d1_porque: {
    nome: 'Por que existe pressão (D-1)',
    def: 'Explica quais agendamentos contribuem para os alertas de pressão do próximo dia operacional.',
    fonte: 'Agendamentos (plataforma) e equipe de referência dos boletins',
    limite: 'Trabalha com níveis, não com número exato de chapas.',
    async calc(i, ctx) {
      const data = await proxDiaOperacional()
      const P = calcularD1(data, ctx.ags, ctx.armazens, ctx.boletins, fmtKg)
      const slots: readonly string[] = i.periodoDia ? D1_PERIODOS[i.periodoDia].slots : SLOTS
      const al: { L: (typeof P.linhas)[number]; h: string; c: (typeof P.linhas)[number]['slots'][string] }[] = []
      P.linhas.forEach((L) =>
        slots.forEach((h) => {
          const c = L.slots[h]
          if (c.nivel.k === 'ALTA' || c.nivel.k === 'MODERADA') al.push({ L, h, c })
        }),
      )
      const per = i.periodoDia ? ' ' + D1_PERIODOS[i.periodoDia].nome.toLowerCase() : ''
      if (!al.length) {
        return {
          valor: 'Sem pressão',
          texto: `Para ${fmtBR(data)}${per} não há pressão moderada ou alta com a equipe de referência. Entregas previstas: ${P.ags.length}.`,
          registros: `${P.ags.length} agendamento(s)`, origens: {}, abrir: { rotulo: 'Abrir o Planejamento D-1', secao: 'd1' },
        }
      }
      al.sort((a, b) => Number(b.c.nivel.k === 'ALTA') - Number(a.c.nivel.k === 'ALTA'))
      const m = al[0]
      return {
        valor: NIVEL_TXT[m.c.nivel.k],
        texto: `${m.L.nome} às ${m.h} concentra o maior nível (${NIVEL_TXT[m.c.nivel.k].toLowerCase()}): ${m.c.need} chapa(s) simultâneas exigidas pela norma para uma equipe de referência de ${m.L.team}. Contribuem: ${m.c.itens
          .map((x) => `AG-${String(x.ag.id).padStart(4, '0')} (${ctx.fornById(x.ag.fornecedorId).curto}, ${ACOND[x.ag.acond].nome.toLowerCase()})`)
          .join('; ')}.`,
        registros: `${al.length} alerta(s) em ${fmtBR(data)}`, origens: {},
        linhas: al.map((x): [string, string] => [`${x.L.nome} às ${x.h}`, `${NIVEL_TXT[x.c.nivel.k]} · ${x.c.need} chapa(s)`]),
        abrir: { rotulo: 'Ver no Planejamento D-1', secao: 'd1' },
      }
    },
  },
}

export const filtrosTxt = (i: Interpretacao): [string, string][] => [
  ['período', i.periodo ? i.periodo.rotulo : 'todo o período registrado'],
  ['armazém', i.arm ? i.arm.nome : 'todos'],
]
