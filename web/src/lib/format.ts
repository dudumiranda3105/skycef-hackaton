import { MES } from './constants'

/* ---------- Datas: tudo no fuso de São Paulo, o mesmo que a API usa ---------- */
export const pad = (n: number) => String(n).padStart(2, '0')
const agoraSP = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }) // "2026-10-05 13:30:00"
export const hojeISO = () => agoraSP().slice(0, 10)
export const nowLocal = () => {
  const s = agoraSP()
  return s.slice(0, 10) + 'T' + s.slice(11, 16)
}
export const toISO = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (iso: string, n: number) => {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const dow = (iso: string) => fromISO(iso).getDay()
export const mondayOf = (iso: string) => {
  const d = fromISO(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toISO(d)
}
export const semanaAtual = () => {
  const h = hojeISO()
  const w = dow(h)
  return w === 0 ? addDays(h, 1) : w === 6 ? addDays(h, 2) : mondayOf(h)
}
export const fmtDM = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
export const fmtBR = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
export const fmtHM = (ts?: string | null) => (ts ? ts.slice(11, 16) : '—')
export const fmtTS = (ts?: string | null) => (ts ? fmtDM(ts.slice(0, 10)) + ' ' + ts.slice(11, 16) : '—')

/** A API manda instantes com offset (-03:00). Aqui se trabalha com "AAAA-MM-DDTHH:MM" local de São Paulo. */
export function loc(ts?: string | null): string | null {
  if (!ts) return null
  if (/-03:00$/.test(ts)) return ts.slice(0, 16)
  const s = new Date(ts).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  return s.slice(0, 10) + 'T' + s.slice(11, 16)
}
export const toOffset = (local: string) => local + ':00-03:00' // o Brasil não tem horário de verão desde 2019
export const minDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
export const fmtDur = (m?: number | null) =>
  m == null ? '—' : m >= 60 ? Math.floor(m / 60) + ' h ' + pad(Math.round(m % 60)) + ' min' : Math.round(m) + ' min'
export const addMin = (ts: string, m: number) => {
  const d = new Date(ts)
  d.setMinutes(d.getMinutes() + m)
  return toISO(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
export const lastDayOfMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return ym + '-' + pad(new Date(y, m, 0).getDate())
}
export const monthsBetween = (a: string, b: string) => {
  const out: string[] = []
  let [y, m] = a.split('-').map(Number)
  const [y2, m2] = b.split('-').map(Number)
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(y + '-' + pad(m))
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}
export const mLabel = (ym: string) => MES[+ym.slice(5) - 1] + '/' + ym.slice(2, 4)

/* ---------- Números e dinheiro. Dinheiro chega da API como texto decimal e nunca vira float ---------- */
export const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
export const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const sgn1 = (n: number) => (n > 0.049 ? '+' : n < -0.049 ? '−' : '') + nf1.format(Math.abs(n))
export const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
export const sum = <T,>(a: T[], k: keyof T) => a.reduce((s, r) => s + (Number(r[k]) || 0), 0)

/** Arredonda um texto decimal ("991.9041") para `dec` casas, meio para cima, sem passar por float. */
export function decRound(str: string | null | undefined, dec: number): string | null {
  if (str == null || str === '') return null
  let s = String(str)
  let neg = false
  if (s[0] === '-') {
    neg = true
    s = s.slice(1)
  }
  const [i, f0 = ''] = s.split('.')
  const f = f0.padEnd(dec + 1, '0')
  let v = BigInt((i || '0') + f.slice(0, dec))
  if (f[dec] >= '5') v += 1n
  const t = v.toString().padStart(dec + 1, '0')
  const ip = t.slice(0, t.length - dec)
  const fp = t.slice(t.length - dec)
  return (neg && v !== 0n ? '-' : '') + ip + (dec ? '.' + fp : '')
}
const milhar = (ip: string) => ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
export function brl(s: string | null | undefined, dec = 2): string {
  const r = decRound(s, dec)
  if (r == null) return '—'
  const neg = r[0] === '-'
  const [i, f] = r.replace('-', '').split('.')
  return (neg ? '−' : '') + 'R$ ' + milhar(i) + (f ? ',' + f : '')
}
export const brl4 = (s?: string | null) => brl(s, 4)
export const brl2 = (s?: string | null) => brl(s, 2)
export const brl0 = (s?: string | null) => brl(s, 0)
export const absS = (s: string | null | undefined) => String(s ?? '').replace('-', '')
export const fmtCnpj = (c?: string | null) =>
  c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c || ''
export const cnpjValido = (value: string) => {
  const c = value.replace(/\D/g, '')
  if (!/^\d{14}$/.test(c) || /^([\d])\1{13}$/.test(c)) return false
  const calc = (base: string, pesos: number[]) => {
    const soma = [...base].reduce((s, n, i) => s + Number(n) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = calc(c.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2])
  const d2 = calc(c.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2])
  return c.endsWith(`${d1}${d2}`)
}

/** Valores com 4 casas como inteiros (1e-4): soma exata com BigInt. */
export const cent4 = (s: string | number) => {
  const [i, f = ''] = String(s).split('.')
  return BigInt((i || '0') + f.padEnd(4, '0').slice(0, 4))
}
export const big4 = (v: bigint) => {
  const s = v.toString().padStart(5, '0')
  return s.slice(0, -4) + '.' + s.slice(-4)
}

/* ---------- Nota fiscal: padrão de 4 dígitos (ex.: 524 → 0524) ---------- */
export const fmtNF = (n: unknown) => {
  const d = String(n ?? '').replace(/\D/g, '')
  return d ? d.padStart(4, '0') : ''
}
export const nfValida = (n: unknown) => {
  const d = String(n ?? '').replace(/\D/g, '')
  return d.length >= 1 && d.length <= 9 && /[1-9]/.test(d)
}

export const semAcento = (s: string) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
