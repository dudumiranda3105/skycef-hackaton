import { useCallback, useSyncExternalStore } from 'react'
import { PAPEL_SECOES, type Secao } from './constants'

/* Rotas por hash (#/agenda, #/painel, #/checkin/12): funcionam em qualquer servidor estático, sem configurar nada. */

export interface Rota {
  secao: Secao | null
  checkin: number | null
}

const SECOES = Object.values(PAPEL_SECOES).flat()
const lerHash = () => (typeof location === 'undefined' ? '' : location.hash)

function inscrever(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function parseRota(hash: string): Rota {
  const h = hash.replace(/^#\/?/, '')
  const m = h.match(/^checkin\/(\d+)/)
  if (m) return { secao: null, checkin: Number(m[1]) }
  const secao = SECOES.includes(h as Secao) ? (h as Secao) : null
  return { secao, checkin: null }
}

export function useRota() {
  const hash = useSyncExternalStore(inscrever, lerHash, () => '')
  const rota = parseRota(hash)
  const ir = useCallback((destino: Secao | null) => {
    const novo = destino ? '#/' + destino : '#/'
    if (location.hash !== novo) location.hash = novo
  }, [])
  return { ...rota, ir }
}
