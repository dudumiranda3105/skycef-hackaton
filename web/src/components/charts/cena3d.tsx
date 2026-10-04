import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ItemColuna {
  rotulo: string
  valor: number
  texto: string
  sub?: string
  cor: string
  esmaecida?: boolean
}

export function Logo3D({ tamanho = 80, className }: { tamanho?: number; className?: string }) {
  const s = Math.round(tamanho * 0.5)
  return (
    <svg
      width={s} height={s} viewBox="0 0 40 40"
      aria-hidden
      className={cn('shrink-0', className)}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.12))' }}
    >
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d4a017" />
          <stop offset="100%" stopColor="#e8b830" />
        </linearGradient>
        <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a6b3c" />
          <stop offset="100%" stopColor="#2e7d32" />
        </linearGradient>
        <linearGradient id="lg3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a6b3c" />
          <stop offset="100%" stopColor="#3a8a40" />
        </linearGradient>
      </defs>
      <rect x="4" y="6" width="32" height="8" rx="3" fill="url(#lg1)" />
      <rect x="4" y="16" width="32" height="8" rx="3" fill="url(#lg2)" />
      <rect x="4" y="26" width="32" height="8" rx="3" fill="url(#lg3)" />
    </svg>
  )
}

export function Colunas3D({
  itens, altura,
}: { itens: ItemColuna[]; altura?: number }) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  const h = altura ?? 280
  const barW = Math.max(18, Math.min(48, (h - 40) / itens.length * 0.6))
  const gap = Math.max(4, barW * 0.4)
  const totalW = itens.length * (barW + gap) - gap
  const padX = Math.max(20, (h - totalW) / 2)

  return (
    <div className="relative w-full select-none" style={{ height: h }}>
      <svg viewBox={`0 0 ${h} ${h}`} width="100%" height="100%" className="block" aria-label="Gráfico de colunas">
        {itens.map((item, i) => {
          const barH = Math.max(8, (item.valor / max) * (h - 60))
          const x = padX + i * (barW + gap)
          const y = h - 30 - barH
          const opac = item.esmaecida ? '0.35' : '1'
          return (
            <g key={i} opacity={opac}>
              <rect x={x} y={y} width={barW} height={barH} rx={3} fill={item.cor} />
              <text x={x + barW / 2} y={h - 14} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {item.rotulo}
              </text>
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-[11px] font-bold num">
                {item.texto}
              </text>
              {item.sub && (
                <text x={x + barW / 2} y={y + barH / 2 + 3} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {item.sub}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
