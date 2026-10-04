import { useEffect, useState } from 'react'
import { GET } from './api'

/* O histórico completo (sem filtro) alimenta a pergunta da direção no início, a sazonalidade e a qualidade dos dados.
   Fica em cache enquanto a pessoa está logada; sair limpa tudo para não vazar dados entre usuários. */
export interface Historico {
  piso?: string
  periodo?: { de: string | null; ate: string | null }
  equilibrio: { pessoaMinutosPorChapaDia: number; diasUteisAnalisados: number; diasUteisExibidos: number }
  meses: {
    mes: string; estacao: 'SAFRA' | 'ENTRESSAFRA'; diasUteis: number; recebimentosPorDia: number; chapasPorDia: number
    chapasNecessariasPorDia: number; saldoDiarias: number; saldoReais: string; situacao: string
  }[]
  estacoes: { estacao: string; rotulo: string; diasUteis: number; recebimentosPorDia: number; chapasPorDia: number; saldoDiarias: number; saldoReais: string }[]
  totais: { sobraDiarias: number; faltaDiarias: number; sobraReais: string; faltaReais: string; saldoReais: string }
  armazens: {
    armazemId: number; armazem: string; recebimentos: number; esforcoPessoaMinutos: number; participacaoNaNecessidade: number
    parcelaDaSobraReais: string; parcelaDaFaltaReais: string; premissa: string
  }[]
  cenarios: { nome: string; pessoaMinutosPorChapaDia: number; sobraReais: string; faltaReais: string; saldoReais: string }[]
  robustez?: { correlacaoEquipeEDemanda: number | null; correlacaoEquipeEDemandaSemPeso: number | null }
  demandaPorMesEArmazem: { mes: string; armazemId: number; armazem: string; recebimentos: number }[]
  limitacoes: string[]
}

let cache: Historico | null = null
let promessa: Promise<Historico> | null = null

export function carregarHistoricoCompleto(): Promise<Historico> {
  if (cache) return Promise.resolve(cache)
  if (!promessa) {
    promessa = GET<Historico>('/api/painel/dimensionamento/historico')
      .then((h) => (cache = h))
      .finally(() => {
        promessa = null
      })
  }
  return promessa
}
export function limparCachePainel() {
  cache = null
  promessa = null
}

export function useHistoricoCompleto(ativo: boolean) {
  const [h, setH] = useState<Historico | null>(cache)
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    carregarHistoricoCompleto().then((x) => vivo && setH(x)).catch(() => {})
    return () => {
      vivo = false
    }
  }, [ativo])
  return h
}

/** A pergunta da direção: folga e pressão em diárias e em R$, ao piso. */
export function respostaDirecao(H: Historico | null) {
  if (!H || !H.totais || !H.meses.length) return null
  const t = H.totais
  const s = Number(t.sobraDiarias)
  const f = Number(t.faltaDiarias)
  const menor = s <= f ? { d: t.sobraDiarias, r: t.sobraReais } : { d: t.faltaDiarias, r: t.faltaReais }
  const safra = H.estacoes.find((e) => e.estacao === 'SAFRA')
  const ent = H.estacoes.find((e) => e.estacao === 'ENTRESSAFRA')
  const descompasso = s > 0 && f > 0 && !!safra && !!ent && safra.saldoDiarias * ent.saldoDiarias < 0
  return { menor, totais: t, descompasso, safra, ent, de: H.meses[0].mes, ate: H.meses[H.meses.length - 1].mes }
}
