import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NIVEL_TXT, calcularD1, type NivelK } from '@/lib/d1'
import { DOW } from '@/lib/constants'
import { addDays, dow, fmtDM, hojeISO, nf0 } from '@/lib/format'
import { useDados } from '@/lib/store'
import { useRota } from '@/lib/rota'

const DIAS = 5

const ESTILO: Record<NivelK, string> = {
  ALTA: 'bg-danger-soft text-destructive',
  MODERADA: 'bg-warning-soft text-warning',
  BAIXA: 'bg-success-soft text-success',
  SEM: 'bg-secondary text-muted-foreground',
  ND: 'bg-secondary text-muted-foreground',
}
const CURTO: Record<NivelK, string> = { ALTA: 'Alta', MODERADA: 'Moderada', BAIXA: 'Compatível', SEM: '—', ND: 'Sem ref.' }

/** Próximos dias úteis (hoje incluso, se for dia útil). Feriados não são consultados aqui, como no D-1. */
function proximosDiasUteis(n: number) {
  const dias: string[] = []
  for (let d = hojeISO(); dias.length < n; d = addDays(d, 1)) {
    if (dow(d) !== 0 && dow(d) !== 6) dias.push(d)
  }
  return dias
}

/**
 * Mapa de pressão dos próximos dias úteis: para cada armazém, o nível do pior horário de cada dia, calculado pelo
 * mesmo motor do Planejamento D-1 (agenda × norma de chapas × equipe de referência dos últimos boletins).
 * Trabalha com NÍVEIS, não com um número exato de chapas nem com R$: as regras de negócio não permitem esse cálculo.
 */
export function MapaPressao() {
  const { ags, armazens, boletins } = useDados()
  const { ir } = useRota()

  const { dias, linhas, semDestino } = useMemo(() => {
    const ds = proximosDiasUteis(DIAS)
    const planos = ds.map((d) => calcularD1(d, ags, armazens, boletins, (n) => nf0.format(n)))
    const base = planos[0]?.linhas ?? []
    const ls = base
      .filter((l) => l.id != null)
      .map((l, i) => ({
        id: l.id as number,
        nome: l.nome,
        celulas: planos.map((p) => {
          const x = p.linhas.filter((y) => y.id != null)[i]
          return { nivel: x.nivel.k, entregas: x.entregas }
        }),
      }))
    const sd = planos.map((p) => p.linhas.find((y) => y.id == null)?.entregas ?? 0)
    return { dias: ds, linhas: ls, semDestino: sd }
  }, [ags, armazens, boletins])

  if (!linhas.length) return null
  const vazio = linhas.every((l) => l.celulas.every((c) => c.nivel === 'SEM')) && semDestino.every((n) => n === 0)

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Pressão prevista nos próximos dias úteis</h2>
          <p className="mt-0.5 max-w-[70ch] text-[12.5px] text-muted-foreground">
            Pior horário do dia em cada armazém, pela agenda e pela norma de chapas do Dossiê. A equipe de referência é a média dos últimos 5 boletins,
            não a escala do dia. Mostra níveis, não um número exato de chapas.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => ir('d1')}>Abrir Planejamento D-1 <ArrowRight /></Button>
      </header>

      {vazio ? (
        <p className="rounded-lg border-[1.5px] border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma entrega agendada para os próximos {DIAS} dias úteis ({fmtDM(dias[0])} a {fmtDM(dias[dias.length - 1])}).
        </p>
      ) : (
      <>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1.5 text-sm">
          <thead>
            <tr>
              <th className="w-[150px]" />
              {dias.map((d) => (
                <th key={d} className="px-1 pb-1 text-center font-medium">
                  <span className="block text-[11px] tracking-wider text-muted-foreground uppercase">{DOW[dow(d)]}</span>
                  <span className={cn('num text-[13px]', d === hojeISO() && 'font-bold text-primary')}>{fmtDM(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <th scope="row" className="pr-2 text-left text-[13.5px] font-semibold">{l.nome}</th>
                {l.celulas.map((c, i) => (
                  <td key={i}>
                    <div
                      className={cn('grid h-12 content-center rounded-lg px-1.5 text-center leading-tight', ESTILO[c.nivel])}
                      title={`${l.nome}, ${fmtDM(dias[i])}: ${NIVEL_TXT[c.nivel]}${c.entregas ? ` · ${c.entregas} ${c.entregas === 1 ? 'entrega' : 'entregas'}` : ''}`}
                    >
                      <b className="text-[12.5px]">{CURTO[c.nivel]}</b>
                      {c.entregas > 0 && <span className="num text-[11px] opacity-80">{c.entregas} {c.entregas === 1 ? 'entrega' : 'entregas'}</span>}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {semDestino.some((n) => n > 0) && (
              <tr>
                <th scope="row" className="pr-2 text-left text-[13.5px] font-semibold text-muted-foreground">Destino a definir</th>
                {semDestino.map((n, i) => (
                  <td key={i}>
                    <div className="grid h-12 content-center rounded-lg border border-dashed px-1.5 text-center text-[12px] text-muted-foreground">
                      {n > 0 ? `${n} ${n === 1 ? 'entrega' : 'entregas'}` : '—'}
                    </div>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
        {(['ALTA', 'MODERADA', 'BAIXA', 'SEM', 'ND'] as NivelK[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={cn('size-3 rounded-[4px]', ESTILO[k].split(' ')[0])} />
            {NIVEL_TXT[k]}
          </li>
        ))}
      </ul>
      </>
      )}
    </section>
  )
}
