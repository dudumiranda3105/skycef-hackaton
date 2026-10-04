import { useMemo, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3, CalendarClock, CalendarDays, ClipboardList, FileCheck2, KeyRound, LogOut, MessageCircleQuestionMark, Moon, RefreshCw,
  ShieldCheck, ShieldQuestionMark, Sun, Users, Warehouse, BookOpen,
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
    <div className="grid h-dvh grid-cols-[248px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1 max-lg:grid-rows-[auto_minmax(0,1fr)]">
      <aside className="scroll-thin relative z-30 flex flex-col overflow-auto bg-sidebar px-3.5 pt-5 pb-4 text-sidebar-foreground max-lg:flex-row max-lg:items-center max-lg:gap-2 max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:p-2">
        <button
          onClick={() => ir(null)}
          className="flex cursor-pointer items-center gap-3 border-b border-sidebar-border px-1.5 pb-[18px] text-left max-lg:border-0 max-lg:p-0 max-lg:pr-2"
          aria-label="Voltar ao início"
        >
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="shrink-0">
            <rect x="3" y="5" width="28" height="7" rx="2" fill="#FFC81F" />
            <rect x="3" y="14" width="28" height="7" rx="2" fill="#2E9B4B" />
            <rect x="3" y="23" width="28" height="7" rx="2" fill="#FFFFFF" opacity=".92" />
          </svg>
          <div className="leading-tight">
            <b className="block font-display text-base max-lg:whitespace-nowrap max-lg:text-sm">Recebimento Inteligente</b>
            <span className="text-[12.5px] opacity-70 max-lg:hidden">Cocapec · Franca</span>
          </div>
        </button>

        <nav className="mt-2.5 flex flex-col gap-0.5 max-lg:mt-0 max-lg:flex-row" aria-label="Seções">
          {grupos.map(([g, itens]) => (
            <div key={g} className="contents">
              <div className="mx-2 mt-4 mb-1 text-[12.5px] opacity-60 max-lg:hidden">{g}</div>
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
                      'relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/7 max-lg:w-auto max-lg:whitespace-nowrap',
                      ativo && 'bg-sidebar-accent font-semibold',
                    )}
                  >
                    {ativo && (
                      <motion.span
                        layoutId="nav-barra"
                        className="absolute top-[7px] bottom-[7px] -left-3.5 w-1 rounded-r-[3px] bg-accent max-lg:inset-x-1.5 max-lg:top-auto max-lg:bottom-0 max-lg:left-1.5 max-lg:h-[3px] max-lg:w-auto max-lg:rounded-t-[3px] max-lg:rounded-b-none"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Icone className="size-[18px] shrink-0 opacity-90 max-lg:hidden" />
                    {SECAO_ROTULO[s]}
                    {!!n && (
                      <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-semibold text-accent-foreground">{n}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto grid gap-1.5 pt-4 max-lg:mt-0 max-lg:ml-auto max-lg:flex max-lg:gap-1.5 max-lg:p-0">
          {eu && (
            <div className="mb-1.5 rounded-[10px] border border-sidebar-border px-3 py-2.5 max-lg:hidden">
              <div className="leading-tight font-semibold">{eu.nome}</div>
              <div className="text-[12.5px] opacity-75">
                {PAPEL_ROTULO[eu.papel]}
                {!eu.autenticacaoAtiva && ' · login desativado'}
              </div>
              {eu.autenticacaoAtiva && (
                <div className="mt-2 flex gap-1.5">
                  <BotaoLateral onClick={abrirSenha} className="flex-1" icone={<KeyRound className="size-3.5" />}>Senha</BotaoLateral>
                  <BotaoLateral onClick={() => void sair()} className="flex-1" icone={<LogOut className="size-3.5" />}>Sair</BotaoLateral>
                </div>
              )}
            </div>
          )}
          <p className="px-1 pb-1 text-[12.5px] leading-snug opacity-70 max-lg:hidden">
            {erro ? 'Sem conexão com a API.' : carregado ? 'Ligado à API. Os dados ficam no PostgreSQL.' : 'Conectando à API…'}
          </p>
          <BotaoLateral onClick={abrirVerificar} icone={<ShieldQuestionMark className="size-3.5" />}>Conferir o cálculo oficial</BotaoLateral>
          <BotaoLateral onClick={() => void atualizar()} icone={<RefreshCw className="size-3.5" />}>Atualizar dados</BotaoLateral>
          <BotaoLateral onClick={alternar} icone={tema === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}>
            Tema {tema === 'dark' ? 'claro' : 'escuro'}
          </BotaoLateral>
          <a
            href="/docs"
            target="_blank"
            rel="noopener"
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-sidebar-border px-2.5 py-1.5 text-[13.5px] transition-colors hover:bg-white/9 max-lg:hidden"
          >
            <BookOpen className="size-3.5" /> Documentação da API
          </a>
          {eu?.autenticacaoAtiva && (
            <BotaoLateral onClick={() => void sair()} className="lg:hidden" icone={<LogOut className="size-3.5" />}>Sair</BotaoLateral>
          )}
        </div>
      </aside>

      <main className="relative min-w-0 overflow-hidden bg-background [perspective:1800px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={secao ?? 'inicio'}
            initial={{ opacity: 0, x: -36, rotateY: 7 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            exit={{ opacity: 0, x: 18 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: '0% 50%' }}
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
        'flex cursor-pointer items-center gap-2 rounded-lg border border-sidebar-border px-2.5 py-1.5 text-left text-[13.5px] transition-colors hover:bg-white/9 max-lg:whitespace-nowrap',
        className,
      )}
    >
      {icone}
      {children}
    </button>
  )
}
