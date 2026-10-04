/* Motor do Planejamento D-1.
   Não há número exato de chapas: o módulo trabalha com NÍVEIS e declara as limitações. Os limiares são parâmetros
   do projeto, não regra da Cocapec. */
import { LIBERAM_VAGA, SLOTS } from './constants'
import { addDays, dow } from './format'
import type { Acond, Agendamento, Armazem, Boletim, Descarga } from './types'

export const D1_PERIODOS = {
  manha: { nome: 'Manhã', slots: ['08:00', '10:00'] },
  tarde: { nome: 'Tarde', slots: ['13:00', '15:00'] },
} as const
export const D1_LIM = { moderada: 0.7, alta: 1.0, realocavel: 0.4 }

export type NivelK = 'ALTA' | 'MODERADA' | 'BAIXA' | 'SEM' | 'ND'
export const NIVEL_TXT: Record<NivelK, string> = {
  ALTA: 'Pressão alta',
  MODERADA: 'Pressão moderada',
  BAIXA: 'Cenário compatível',
  SEM: 'Sem carga prevista',
  ND: 'Sem equipe de referência',
}
export const NIVEL_TOM: Record<NivelK, 'ruim' | 'aviso' | 'ok' | 'neutro'> = {
  ALTA: 'ruim', MODERADA: 'aviso', BAIXA: 'ok', SEM: 'neutro', ND: 'neutro',
}
export interface Nivel {
  k: NivelK
  r: number | null
  realoc?: boolean
}
const ORDEM: Record<NivelK, number> = { ALTA: 4, MODERADA: 3, BAIXA: 2, SEM: 0, ND: 1 }
export const pior = (niveis: Nivel[]) => niveis.slice().sort((a, b) => ORDEM[b.k] - ORDEM[a.k])[0]

/** Chapas simultâneas pela norma do Dossiê (§7). */
export function normaChapas(a: Agendamento, fmtKg: (n: number) => string): { n: number; nota: string } {
  const pesos = a.nfs.filter((n) => n.peso != null).map((n) => Number(n.peso))
  const conhecido = a.nfs.length > 0 && pesos.length === a.nfs.length
  const kg = pesos.reduce((s, x) => s + x, 0)
  if (a.acond === 'BATIDO') {
    if (conhecido && kg === 500)
      return { n: 5, nota: 'Peso total de 500 kg: o Dossiê não define esse limite exato. A estimativa usa 5 chapas como referência e exige confirmação do armazém.' }
    return conhecido && kg < 500
      ? { n: 0, nota: `Carga batida abaixo de 500 kg (${fmtKg(kg)} kg): a norma não prevê chapas.` }
      : { n: 5, nota: conhecido ? '' : 'Peso da carga desconhecido: usamos a referência de carga batida acima de 500 kg (5 chapas).' }
  }
  return {
    n: 2,
    nota: conhecido ? '' : 'Peso da carga desconhecido: usamos a referência de 2 chapas para paletizado ou big bag.',
  }
}

export function nivelPressao(need: number, team: number | null): Nivel {
  if (!need) return { k: 'SEM', r: 0 }
  if (!team) return { k: 'ND', r: null }
  const r = need / team
  if (r > D1_LIM.alta) return { k: 'ALTA', r }
  if (r > D1_LIM.moderada) return { k: 'MODERADA', r }
  return { k: 'BAIXA', r, realoc: r <= D1_LIM.realocavel }
}

/** Equipe de referência de um armazém = média de chapas dos últimos 5 boletins (não é a escala de amanhã). */
export function equipeReferencia(boletins: Boletim[], armazemId: number) {
  const L = boletins.filter((b) => b.armazemId === armazemId && b.chapas > 0).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5)
  if (!L.length) return null
  const m = L.reduce((s, b) => s + b.chapas, 0) / L.length
  return { n: Math.round(m), amostra: L.length, desde: L[L.length - 1].data }
}

export interface Contribuicao {
  ag: Agendamento
  armId: number | null
  h: string
  chapas: number
  nota: string
}
export interface CelulaSlot {
  need: number
  itens: Contribuicao[]
  nivel: Nivel
}
export interface LinhaD1 {
  id: number | null
  nome: string
  team: number | null
  tipo: 'referência' | null
  ref: { n: number; amostra: number; desde: string } | null
  slots: Record<string, CelulaSlot>
  pico: number
  periodos: Record<string, { need: number; nivel: Nivel; slots: readonly string[] }>
  nivel: Nivel
  entregas: number
}
export interface PlanoD1 {
  data: string
  ags: Agendamento[]
  contribs: Contribuicao[]
  linhas: LinhaD1[]
}

export function calcularD1(
  data: string, ags: Agendamento[], armazens: Armazem[], boletins: Boletim[], fmtKg: (n: number) => string,
): PlanoD1 {
  const doDia = ags.filter((a) => a.data === data && !LIBERAM_VAGA.includes(a.status)).sort((a, b) => a.horario.localeCompare(b.horario))
  const contribs: Contribuicao[] = []
  doDia.forEach((a) => {
    const nm = normaChapas(a, fmtKg)
    if (a.descs.length) a.descs.forEach((d: Descarga) => contribs.push({ ag: a, armId: d.armazemId, h: a.horario, chapas: nm.n, nota: nm.nota }))
    else contribs.push({ ag: a, armId: null, h: a.horario, chapas: nm.n, nota: nm.nota })
  })
  const base: { id: number | null; nome: string }[] = [...armazens.map((a) => ({ id: a.id as number | null, nome: a.nome })), { id: null, nome: 'Destino a definir' }]
  const linhas = base.map((L): LinhaD1 => {
    const ref = L.id == null ? null : equipeReferencia(boletins, L.id)
    const team = ref?.n ?? null
    const tipo = ref ? 'referência' : null
    const slots: Record<string, CelulaSlot> = {}
    SLOTS.forEach((h) => {
      const itens = contribs.filter((c) => c.armId === L.id && c.h === h)
      const need = itens.reduce((s, c) => s + c.chapas, 0)
      slots[h] = { need, itens, nivel: nivelPressao(need, team) }
    })
    const pico = Math.max(0, ...SLOTS.map((h) => slots[h].need))
    const periodos = Object.fromEntries(
      Object.entries(D1_PERIODOS).map(([k, p]) => {
        const need = Math.max(0, ...p.slots.map((h) => slots[h].need))
        return [k, { need, nivel: nivelPressao(need, team), slots: p.slots }]
      }),
    )
    return {
      id: L.id, nome: L.nome, team, tipo, ref, slots, pico, periodos,
      nivel: pior(SLOTS.map((h) => slots[h].nivel)),
      entregas: new Set(contribs.filter((c) => c.armId === L.id).map((c) => c.ag.id)).size,
    }
  })
  return { data, ags: doDia, contribs, linhas }
}

/** Próximo dia útil depois de hoje (sem consultar feriados; quem precisa deles usa a API de agenda). */
export function proximoDiaUtilSimples(hoje: string) {
  let d = addDays(hoje, 1)
  while (dow(d) === 0 || dow(d) === 6) d = addDays(d, 1)
  return d
}

export const rotuloAcond = (a: Acond) => a
