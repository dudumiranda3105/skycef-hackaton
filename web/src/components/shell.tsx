import { useMemo, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3, CalendarClock, ClipboardList, FileCheck2, KeyRound, LogOut, MessageCircleQuestionMark, Moon, RefreshCw,
  ShieldCheck, Sun, Users, Warehouse, BookOpen, CalendarDays,
} from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { LogoCocapec, iniciais } from '@/components/marca'
import { cn } from '@/lib/utils'
import { PAPEL_ROTULO, SECAO_ROTULO, type Secao } from '@/lib/constants'
import { useAuth, useDados, avisar } from '@/lib/store'
import { useRota } from '@/lib/rota'
import { useTema } from '@/lib/tema'
import { useJanelas } from '@/lib/janelas'
import { descAberta } from '@/lib/api'
import { errTxt } from '@/lib/api'

export const ICONES: Record<Secao, typeof BarChart3> = {
  agenda: CalendarDays,
  compras: FileCheck2,
  armazem: Warehouse,
  boletim: ClipboardList,
  painel: BarChart3,
  d1: CalendarClock,
  perguntar: MessageCircleQuestionMark,
  qualidade: ShieldCheck,
  usuarios: Users,
}

const GRUPOS_NAV: [string, Secao[]][] = [
  ['Recebimento', ['agenda', 'compras', 'armazem']],
  ['Equipe', ['boletim']],
  ['Gestão', ['painel', 'd1', 'perguntar', 'qualidade']],
  ['Administração', ['usuarios']],
]

export function Shell({ children }: { children: ReactNode }) {
  const { eu, pode, sair } = useAuth()
  const { ags, carregado, erro, carregarTudo, refresh } = useDados()
  const { secao, ir } = useRota()
  const { tema, alternar } = useTema()
  const { abrirSenha } = useJanelas()

  const contagem = useMemo(() => {
    const pend = ags.filter((a) => a.status === 'PENDENTE_COMPRAS').length
    const aguard = ags.filter((a) => a.status === 'AUTORIZADO' && !a.descs.length).length
    const emAnd = ags.reduce((n, a) => n + a.descs.filter((d) => descAberta(a, d) && d.chegada).length, 0)
    return { compras: pend, armazem: aguard + emAnd } as Partial<Record<Secao, number>>
  }, [ags])

  const grupos = GRUPOS_NAV.map(([g, itens]) => [g, itens.filter((s) => pode(s))] as const).filter(([, itens]) => itens.length)

  async function atualizar() {
    try {
      await carregarTudo()
      await refresh()
      avisar('Dados atualizados.')
    } catch (e) {
      avisar(errTxt(e), true)
    }
  }

  return (
    <div className="grid h-dvh grid-cols-[244px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1 max-lg:grid-rows-[auto_minmax(0,1fr)]">
      <aside className="scroll-thin relative z-30 flex flex-col overflow-auto border-r border-sidebar-border bg-sidebar px-3.5 pt-5 pb-4 text-sidebar-foreground max-lg:flex-row max-lg:items-center max-lg:gap-2 max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:border-r-0 max-lg:border-b max-lg:p-2">
        <button
          onClick={() => ir(null)}
          className="block cursor-pointer border-b border-sidebar-border px-1.5 pb-4 text-left max-lg:border-0 max-lg:p-0 max-lg:pr-2"
          aria-label="Voltar ao início"
        >
          <LogoCocapec className="w-[148px] max-lg:w-[96px]" />
          <span className="mt-2.5 block text-[11px] font-semibold tracking-[0.14em] text-primary uppercase max-lg:hidden">
            Recebimento Inteligente
          </span>
        </button>

        <nav className="mt-2 flex flex-col gap-0.5 max-lg:mt-0 max-lg:flex-row" aria-label="Seções">
          {grupos.map(([g, itens]) => (
            <div key={g} className="contents">
              <div className="mx-2 mt-4 mb-1 text-[10.5px] font-bold tracking-[0.12em] text-muted-foreground uppercase max-lg:hidden">{g}</div>
              {itens.map((s) => {
                const Icone = ICONES[s]
                const ativo = secao === s
                const n = contagem[s]
                return (
                  <button
                    key={s}
                    onClick={() => ir(ativo ? null : s)}
                    aria-current={ativo ? 'page' : undefined}
                    className={cn(
                      'group relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] text-sidebar-foreground/75 transition-colors hover:text-sidebar-foreground max-lg:w-auto max-lg:whitespace-nowrap',
                      ativo ? 'font-semibold text-primary hover:text-primary' : 'hover:bg-sidebar-accent/60',
                    )}
                  >
                    {ativo && (
                      <motion.span
                        layoutId="nav-ativo"
                        className="absolute inset-0 rounded-lg bg-sidebar-accent"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icone className="relative size-[17px] shrink-0 max-lg:hidden" />
                    <span className="relative">{SECAO_ROTULO[s]}</span>
                    {!!n && (
                      <span className="relative ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-bold text-accent-foreground">{n}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto grid gap-1 border-t border-sidebar-border pt-3 max-lg:mt-0 max-lg:ml-auto max-lg:flex max-lg:gap-1.5 max-lg:border-0 max-lg:p-0">
          {eu && (
            <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-secondary/70 px-2.5 py-2 max-lg:hidden">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                {iniciais(eu.nome)}
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold">{eu.nome.split(' ')[0]}</div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {PAPEL_ROTULO[eu.papel]}
                  {!eu.autenticacaoAtiva && ' · login desativado'}
                </div>
              </div>
            </div>
          )}
          <BotaoLateral onClick={() => void atualizar()} icone={<RefreshCw className="size-3.5" />}>Atualizar</BotaoLateral>
          <BotaoLateral onClick={alternar} icone={tema === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}>
            {tema === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </BotaoLateral>
          <a
            href="/docs"
            target="_blank"
            rel="noopener"
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground max-lg:hidden"
          >
            <BookOpen className="size-3.5" /> API
          </a>
          {eu?.autenticacaoAtiva && (
            <BotaoLateral onClick={() => void sair()} icone={<LogOut className="size-3.5" />}>
              Sair
            </BotaoLateral>
          )}
          {eu?.autenticacaoAtiva && (
            <BotaoLateral onClick={abrirSenha} icone={<KeyRound className="size-3.5" />}>Senha</BotaoLateral>
          )}
        </div>
      </aside>

      <main className="relative min-w-0 overflow-hidden bg-background">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={secao ?? 'inicio'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="scroll-thin absolute inset-0 overflow-auto px-[clamp(18px,3.4vw,52px)] pt-8 pb-14"
          >
            <div className="mx-auto max-w-[1220px]">{children}</div>
          </motion.div>
        </AnimatePresence>
      </main>
      <Toaster />
    </div>
  )
}

function BotaoLateral({
  children, onClick, icone, className,
}: { children: ReactNode; onClick: () => void; icone: ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground max-lg:whitespace-nowrap',
        className,
      )}
    >
      {icone}
      {children}
    </button>
  )
}
