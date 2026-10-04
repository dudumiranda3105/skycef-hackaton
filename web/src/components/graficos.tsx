import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface PontoArea {
  rotulo: string
  valor: number
  destaque?: boolean
}

/** Gráfico de área com grade leve, eixo de rótulos e dica ao passar o mouse (ou tocar). */
export function GraficoArea({
  pontos, cor = 'var(--primary)', unidade = '', className,
}: { pontos: PontoArea[]; cor?: string; unidade?: string; className?: string }) {
  const [ativo, setAtivo] = useState<number | null>(null)
  if (pontos.length < 2) return null
  const W = 640
  const H = 220
  const pad = { t: 16, r: 26, b: 28, l: 28 }
  const max = Math.max(1, ...pontos.map((p) => p.valor))
  const topo = Math.ceil(max / 4) * 4 || 4
  const x = (i: number) => pad.l + (i / (pontos.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / topo) * (H - pad.t - pad.b)
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ')
  const area = `${linha} L${x(pontos.length - 1)} ${H - pad.b} L${x(0)} ${H - pad.b} Z`
  const grade = [0, 1, 2, 3, 4].map((k) => (topo / 4) * k)
  const a = ativo !== null ? pontos[ativo] : null
  return (
    <div className={cn('relative', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfico de entregas por dia">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={cor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grade.map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray={g ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">{Number.isInteger(g) ? g : ''}</text>
          </g>
        ))}
        <path d={area} fill="url(#area-grad)" />
        <path d={linha} fill="none" stroke={cor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {pontos.map((p, i) => (
          <g key={i}>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" className={p.destaque ? 'fill-primary font-bold' : 'fill-muted-foreground'}>
              {p.rotulo}
            </text>
            {ativo === i && <line x1={x(i)} x2={x(i)} y1={pad.t} y2={H - pad.b} stroke={cor} strokeOpacity="0.35" />}
            <circle cx={x(i)} cy={y(p.valor)} r={ativo === i ? 5 : p.destaque ? 4 : 0} fill="var(--card)" stroke={cor} strokeWidth="2.2" />
            <rect
              x={x(i) - (W - pad.l - pad.r) / (pontos.length - 1) / 2}
              y={0}
              width={(W - pad.l - pad.r) / (pontos.length - 1)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
              onClick={() => setAtivo(ativo === i ? null : i)}
            />
          </g>
        ))}
      </svg>
      {a && ativo !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${(x(ativo) / W) * 100}%`, top: `${(y(a.valor) / H) * 100}%`, marginTop: -10 }}
        >
          <div className="text-muted-foreground">{a.rotulo}</div>
          <b className="num text-sm">{a.valor}{unidade}</b>
        </div>
      )}
    </div>
  )
}

export interface FatiaDonut {
  rotulo: string
  valor: number
  cor: string
}

/** Donut com o total no centro e legenda ao lado (empilha em telas estreitas). */
export function Donut({ fatias, total, legendaTotal }: { fatias: FatiaDonut[]; total: number; legendaTotal: string }) {
  const R = 52
  const C = 2 * Math.PI * R
  let acumulado = 0
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
      <div className="relative size-[148px] shrink-0">
        <svg viewBox="0 0 140 140" className="size-full -rotate-90" role="img" aria-label="Distribuição por situação">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--secondary)" strokeWidth="16" />
          {fatias.map((f) => {
            const len = (f.valor / total) * C
            const el = (
              <circle
                key={f.rotulo}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={f.cor}
                strokeWidth="16"
                strokeDasharray={`${Math.max(len - 2, 0)} ${C}`}
                strokeDashoffset={-acumulado}
              >
                <title>{`${f.rotulo}: ${f.valor}`}</title>
              </circle>
            )
            acumulado += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center leading-tight">
          <span className="num text-[28px] font-bold">{total}</span>
          <span className="text-[11.5px] text-muted-foreground">{legendaTotal}</span>
        </div>
      </div>
      <ul className="grid min-w-[150px] flex-1 gap-2">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} />
            <span className="flex-1 truncate">{f.rotulo}</span>
            <b className="num">{f.valor}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
