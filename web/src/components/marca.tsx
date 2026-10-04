import { cn } from '@/lib/utils'

const LOGO = `${import.meta.env.BASE_URL}cocapec-logo.webp`

/**
 * Logotipo oficial da Cocapec (390×100, fundo transparente). No tema escuro ele vai sobre uma pastilha branca,
 * porque o azul da marca some no fundo azul-marinho.
 */
export function LogoCocapec({ className, pastilha }: { className?: string; pastilha?: boolean }) {
  return (
    <img
      src={LOGO}
      alt="Cocapec — o melhor café está aqui"
      width={390}
      height={100}
      draggable={false}
      className={cn(
        'h-auto select-none',
        pastilha && 'rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5',
        !pastilha && 'dark:rounded-lg dark:bg-white dark:px-2 dark:py-1',
        className,
      )}
    />
  )
}

/** Iniciais para o avatar (primeira e última palavra do nome). */
export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/** Minigráfico de linha para os cartões de indicador. Não exibe nada com menos de 2 pontos. */
export function Sparkline({
  pontos, cor = 'var(--primary)', className,
}: { pontos: number[]; cor?: string; className?: string }) {
  if (pontos.length < 2 || Math.min(...pontos) === Math.max(...pontos)) return null
  const W = 120
  const H = 36
  const min = Math.min(...pontos)
  const max = Math.max(...pontos)
  const faixa = max - min || 1
  const xy = pontos.map((v, i) => [3 + (i / (pontos.length - 1)) * (W - 6), H - 4 - ((v - min) / faixa) * (H - 8)] as const)
  const linha = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${linha} L${W} ${H} L0 ${H} Z`
  const id = `sp-${cor.replace(/[^a-z0-9]/gi, '')}`
  const [ux, uy] = xy[xy.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('h-9 w-full', className)} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke={cor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ux} cy={uy} r="2.4" fill={cor} />
    </svg>
  )
}
