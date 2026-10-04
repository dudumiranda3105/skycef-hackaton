import { ACOND } from '@/lib/constants'
import { fmtNF, pad } from '@/lib/format'
import type { Agendamento } from '@/lib/types'

export const codigoAg = (id: number) => 'AG-' + String(id).padStart(4, '0')
export const linkCheckin = (id: number) => `${location.origin}/ui/#/checkin/${id}`

/** Aceita "AG-0012", "12" ou o link inteiro do QR. */
export function idDoCodigo(txt: string): number | null {
  const t = String(txt || '').trim()
  let m = t.match(/^(?:AG[-\s]?)?0*(\d+)$/i)
  if (!m) {
    try {
      const url = new URL(t)
      if (url.origin !== location.origin || url.pathname.replace(/\/$/, '') !== '/ui') return null
      m = url.hash.match(/^#\/checkin\/(\d+)$/)
    } catch { return null }
  }
  const id = m ? Number(m[1]) : 0
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Evento de calendário (.ics, RFC 5545). O calendário é só conveniência: o sistema da Cocapec é a fonte oficial. */
export function gerarIcs(a: Agendamento, nomeFornecedor: string): string {
  const [y, m, d] = a.data.split('-').map(Number)
  const [hh, mm] = a.horario.split(':').map(Number)
  const ini = new Date(Date.UTC(y, m - 1, d, hh + 3, mm)) // São Paulo = UTC−3, sem horário de verão
  const fim = new Date(ini.getTime() + 2 * 3600 * 1000)
  const z = (dt: Date) =>
    dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) + 'T' + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + pad(dt.getUTCSeconds()) + 'Z'
  const tx = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
  const nfs = a.nfs.map((n) => (n.numero ? fmtNF(n.numero) : 'sem número')).join(', ')
  const desc = [
    'Código da entrega: ' + codigoAg(a.id), 'Fornecedor: ' + nomeFornecedor, 'Notas fiscais: ' + nfs,
    'Acondicionamento: ' + ACOND[a.acond].nome, 'Horário da entrega: ' + a.horario + ' (chegar com a nota fiscal e o QR Code)',
    'Check-in: ' + linkCheckin(a.id), '',
    'O calendário é só uma conveniência. Se mudar o compromisso no celular, o agendamento na Cocapec não muda: o sistema da Cocapec é a fonte oficial.',
  ].join('\n')
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cocapec//Recebimento Inteligente//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:agendamento-' + a.id + '@cocapec-recebimento', 'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(ini), 'DTEND:' + z(fim),
    'SUMMARY:' + tx('Entrega na Cocapec · ' + codigoAg(a.id) + ' · ' + a.horario), 'LOCATION:' + tx('Cocapec · Franca/SP'), 'DESCRIPTION:' + tx(desc),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + tx('Entrega na Cocapec ' + codigoAg(a.id) + ' em 1 hora'), 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  const enc = new TextEncoder()
  const dobra = (l: string) => {
    if (enc.encode(l).length <= 75) return l
    let out = ''
    let cur = ''
    for (const ch of l) {
      if (enc.encode(cur + ch).length > (out ? 74 : 75)) {
        out += (out ? '\r\n ' : '') + cur
        cur = ch
      } else cur += ch
    }
    return out + (out ? '\r\n ' : '') + cur
  }
  return linhas.map(dobra).join('\r\n') + '\r\n'
}

export function baixarIcs(a: Agendamento, nomeFornecedor: string) {
  const blob = new Blob([gerarIcs(a, nomeFornecedor)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  el.download = codigoAg(a.id) + '.ics'
  document.body.appendChild(el)
  el.click()
  el.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
