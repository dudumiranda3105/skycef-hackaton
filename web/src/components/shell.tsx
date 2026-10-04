import { useMemo, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3, CalendarClock, ClipboardList, FileCheck2, KeyRound, LogOut, MessageCircleQuestionMark, Moon, RefreshCw,
  ShieldCheck, ShieldQuestionMark, Sun, Users, Warehouse, BookOpen, CalendarDays,
} from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
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
  const { abrirSenha, abrirVerificar } = useJanelas()

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
    <div className="grid h-dvh grid-cols-[220px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1 max-lg:grid-rows-[auto_minmax(0,1fr)]">
      <aside className="scroll-thin relative z-30 flex flex-col overflow-auto bg-sidebar px-4 pt-5 pb-4 text-sidebar-foreground border-r border-sidebar-border max-lg:flex-row max-lg:items-center max-lg:gap-2 max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:p-2">
        <button
          onClick={() => ir(null)}
          className="flex cursor-pointer items-center gap-2.5 border-b border-sidebar-border px-1 pb-4 text-left max-lg:border-0 max-lg:p-0 max-lg:pr-2"
          aria-label="Voltar ao início"
        >
          <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden className="shrink-0">
            <defs>
              <linearGradient id="ls1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d4a017" /><stop offset="100%" stopColor="#e8b830" />
              </linearGradient>
              <linearGradient id="ls2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6b3c" /><stop offset="100%" stopColor="#2e7d32" />
              </linearGradient>
              <linearGradient id="ls3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6b3c" /><stop offset="100%" stopColor="#3a8a40" />
              </linearGradient>
            </defs>
            <rect x="4" y="6" width="32" height="8" rx="3" fill="url(#ls1)" />
            <rect x="4" y="16" width="32" height="8" rx="3" fill="url(#ls2)" />
            <rect x="4" y="26" width="32" height="8" rx="3" fill="url(#ls3)" />
          </svg>
          <div className="leading-snug">
            <b className="font-sans text-sm font-bold max-lg:text-xs">Recebimento Inteligente</b>
            <span className="hidden text-[12px] opacity-60 max-lg:hidden">Cocapec</span>
          </div>
        </button>

        <nav className="mt-3 flex flex-col gap-1 max-lg:mt-0 max-lg:flex-row" aria-label="Seções">
          {grupos.map(([g, itens]) => (
            <div key={g} className="contents">
              <div className="mx-1 mt-3 mb-1 text-[11.5px] font-semibold opacity-50 tracking-wider max-lg:hidden">{g}</div>
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
                      'relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[14px] transition-colors hover:bg-sidebar-accent max-lg:w-auto max-lg:whitespace-nowrap',
                      ativo && 'bg-sidebar-accent font-semibold text-primary',
                    )}
                  >
                    <Icone className="size-[16px] shrink-0 opacity-80 max-lg:hidden" />
                    {SECAO_ROTULO[s]}
                    {!!n && (
                      <span className="ml-auto min-w-5 rounded-full bg-accent/15 px-1.5 text-center text-xs font-semibold text-accent-foreground">{n}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto grid gap-1 pt-3 border-t border-sidebar-border max-lg:mt-0 max-lg:ml-auto max-lg:flex max-lg:gap-1.5 max-lg:p-0">
          {eu && (
            <div className="mb-2 rounded-lg border border-sidebar-border/60 px-3 py-2 max-lg:hidden">
              <div className="leading-tight text-sm font-semibold">{eu.nome.split(' ')[0]}</div>
              <div className="text-[12px] opacity-60">
                {PAPEL_ROTULO[eu.papel]}
                {!eu.autenticacaoAtiva && ' · login desativado'}
              </div>
            </div>
          )}
          <BotaoLateral onClick={abrirVerificar} icone={<ShieldQuestionMark className="size-3.5" />}>Conferir cálculo</BotaoLateral>
          <BotaoLateral onClick={() => void atualizar()} icone={<RefreshCw className="size-3.5" />}>Atualizar</BotaoLateral>
          <BotaoLateral onClick={alternar} icone={tema === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}>
            {tema === 'dark' ? 'Claro' : 'Escuro'}
          </BotaoLateral>
          <a
            href="/docs"
            target="_blank"
            rel="noopener"
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-sidebar-accent max-lg:hidden"
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
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-sidebar-accent max-lg:whitespace-nowrap',
        className,
      )}
    >
      {icone}
      {children}
    </button>
  )
}