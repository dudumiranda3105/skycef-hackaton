import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
export { Badge } from '@/components/ui/badge'
import { ACOND, STATUS, STATUS_TOM } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Acond, StatusAg } from '@/lib/types'

/** Selo de origem do dado oficial importado ou registrado por usuários na plataforma. */
export function OrigemBadge({ origem }: { origem: string }) {
  const cls = origem === 'PLATAFORMA' ? 'bg-success-soft text-success' : 'bg-info-soft text-info'
  return (
    <span className={cn('inline-block rounded-[5px] px-1.5 text-[11.5px] leading-[1.6] font-semibold tracking-[.01em]', cls)}>
      {origem === 'HISTORICO' ? 'HISTÓRICO' : origem}
    </span>
  )
}

export function StatusBadge({ status }: { status: StatusAg }) {
  return <Badge tom={STATUS_TOM[status]}>{STATUS[status]}</Badge>
}

export function AcondBadge({ acond }: { acond: Acond }) {
  return (
    <Badge>
      <span className="size-2.5 rounded-full" style={{ background: ACOND[acond].cor }} />
      {ACOND[acond].nome}
    </Badge>
  )
}

export function Callout({
  tom = 'info', children, className,
}: { tom?: 'info' | 'aviso' | 'ruim' | 'ok'; children: ReactNode; className?: string }) {
  const estilo = {
    info: 'border-info bg-info-soft',
    aviso: 'border-brand-yellow bg-warning-soft',
    ruim: 'border-destructive bg-danger-soft',
    ok: 'border-brand-green bg-success-soft',
  }[tom]
  const Icone = { info: Info, aviso: AlertTriangle, ruim: XCircle, ok: CheckCircle2 }[tom]
  return (
    <div className={cn('flex gap-3 rounded-xl border-l-4 px-3.5 py-3 text-sm text-foreground', estilo, className)} role={tom === 'ruim' ? 'alert' : undefined}>
      <Icone className="mt-0.5 size-4 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Vazio({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border-[1.5px] border-dashed p-6 text-center text-muted-foreground', className)}>{children}</div>
  )
}

export function Erros({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <div className="grid gap-0.5 text-[13.5px] text-destructive" role="alert" aria-live="polite">
      {children}
    </div>
  )
}

export function SecTitulo({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('font-display text-[15px] font-bold', className)}>{children}</div>
}

/** Cabeçalho padrão das seções: título, quem usa, explicação e ações. */
export function CabecalhoPagina({
  titulo, quem, sub, acoes,
}: { titulo: string; quem?: string; sub: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-[1_1_420px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[clamp(22px,3vw,30px)] font-bold">{titulo}</h1>
          {quem && <span className="rounded-full bg-info-soft px-3 py-0.5 text-[12px] text-info font-medium">{quem}</span>}
        </div>
        <p className="mt-2 max-w-[64ch] text-muted-foreground text-sm">{sub}</p>
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  )
}

export function Painel({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return <section id={id} className={cn('rounded-xl border bg-card p-5', className)}>{children}</section>
}

export function Tile({ rotulo, valor, sub }: { rotulo: string; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-xl bg-background px-4 py-3">
      <span className="text-[12px] text-muted-foreground">{rotulo}</span>
      <span className="num text-[clamp(20px,3vw,30px)] font-bold tracking-tight">{valor}</span>
      {sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

export function Tiles({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3', className)}>{children}</div>
}

/** Barras horizontais simples (rótulo, barra proporcional, valor). */
export function Barras({
  itens, fmt, cor = 'azul',
}: { itens: [string, number][]; fmt?: (v: number) => string; cor?: 'azul' | 'verde' }) {
  const max = Math.max(1, ...itens.map((i) => i[1]))
  return (
    <div className="grid gap-2">
      {itens.map(([l, v]) => (
        <div key={l} className="grid grid-cols-[minmax(90px,150px)_1fr_64px] items-center gap-2.5 text-[13.5px] max-sm:grid-cols-[96px_1fr_56px]">
          <span className="truncate" title={l}>{l}</span>
          <div className="h-3 overflow-hidden rounded bg-secondary">
            <div
              className={cn('h-full rounded transition-[width] duration-700', cor === 'verde' ? 'bg-brand-green' : 'bg-brand-blue')}
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
          <span className="num text-right">{fmt ? fmt(v) : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</span>
        </div>
      ))}
    </div>
  )
}

export function Lista({ itens, className }: { itens: ReactNode[]; className?: string }) {
  return (
    <ul className={cn('grid list-disc gap-1 pl-[18px] text-sm', className)}>
      {itens.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}
