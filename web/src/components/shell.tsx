/*
 * Layout principal do sistema.
 * Sidebar à esquerda (navegação, perfil do usuário, ações) e
 * conteúdo principal à direita com transição de tela suave.
 * Responsivo: em telas pequenas a sidebar vira barra horizontal.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3, BookOpen, CalendarClock, CalendarDays, Check, ClipboardList, ExternalLink, FileCheck2, Files, KeyRound,
  LogOut, MessageCircleQuestionMark, Moon, PackageSearch, RefreshCw, Settings2, ShieldQuestionMark, Sun,
  Truck, Users, Warehouse,
} from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  portaria: Truck,
  compras: FileCheck2,
  armazem: Warehouse,
  insumo: PackageSearch,
  fiscal: Files,
  boletim: ClipboardList,
  painel: BarChart3,
  d1: CalendarClock,
  perguntar: MessageCircleQuestionMark,
  usuarios: Users,
}

const GRUPOS_NAV: [string, Secao[]][] = [
  ['Portaria', ['portaria']],
  ['Recebimento', ['agenda', 'compras', 'armazem', 'insumo', 'fiscal']],
  ['Equipe', ['boletim']],
  ['Gestão', ['painel', 'd1', 'perguntar']],
  ['Administração', ['usuarios']],
]

export function Shell({ children }: { children: ReactNode }) {
  const { eu, pode, sair } = useAuth()
  const { ags, carregado, erro, carregarTudo, refresh } = useDados()
  const { secao, ir } = useRota()
  const { tema, alternar } = useTema()
  const { abrirSenha } = useJanelas()
  const [configuracoesAbertas, setConfiguracoesAbertas] = useState(false)

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
    <div className="shell-layout grid h-dvh grid-cols-[244px_minmax(0,1fr)] overflow-hidden">
      <aside className="shell-sidebar scroll-thin relative z-30 flex flex-col overflow-auto border-r border-sidebar-border bg-sidebar px-3.5 pt-5 pb-4 text-sidebar-foreground">
        <button
          onClick={() => ir(null)}
          className="shell-brand block shrink-0 cursor-pointer border-b border-sidebar-border px-1.5 pb-4 text-left"
          aria-label="Voltar ao início"
        >
          <LogoCocapec className="w-[148px]" />
          <span className="shell-tagline mt-2.5 block text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
            Recebimento Inteligente
          </span>
        </button>

        {eu && (
          <div className="shell-mobile-user" aria-label={`Conta de ${eu.nome}, ${PAPEL_ROTULO[eu.papel]}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
              {iniciais(eu.nome)}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{eu.nome.split(' ')[0]}</div>
              <div className="truncate text-[12px] text-muted-foreground">{PAPEL_ROTULO[eu.papel]}</div>
            </div>
          </div>
        )}

        <nav className="shell-navigation scroll-thin mt-2 flex flex-col gap-0.5" aria-label="Seções">
          {grupos.map(([g, itens]) => (
            <div key={g} className="contents">
              <div className="shell-navigation-heading mx-2 mt-4 mb-1 text-[10.5px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{g}</div>
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
                      'shell-nav-item group relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] text-sidebar-foreground/75 transition-colors hover:text-sidebar-foreground',
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
                    <Icone className="shell-nav-icon relative size-[17px] shrink-0" />
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

        <div className="shell-sidebar-actions mt-auto grid gap-1 border-t border-sidebar-border pt-3">
          {eu && (
            <div className="shell-sidebar-user mb-2 flex items-center gap-2.5 rounded-xl bg-secondary/70 px-2.5 py-2">
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
          <BotaoLateral
            onClick={() => setConfiguracoesAbertas(true)}
            icone={<Settings2 className="size-4" />}
            aria-label="Abrir configurações"
            title="Configurações"
            className="shell-settings-button mt-1 border border-sidebar-border bg-sidebar-accent/35 font-medium text-sidebar-foreground hover:bg-sidebar-accent"
          >
            Configurações
          </BotaoLateral>
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
      <Dialog open={configuracoesAbertas} onOpenChange={setConfiguracoesAbertas}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Configurações</DialogTitle>
            <DialogDescription>Preferências e ações da sua conta.</DialogDescription>
          </DialogHeader>
          <DialogBody className="gap-2 pt-3">
            <AcaoConfiguracao
              icone={<RefreshCw />}
              titulo="Atualizar dados"
              detalhe="Buscar as informações mais recentes do sistema"
              onClick={() => void atualizar()}
            />
            <AcaoConfiguracao
              icone={tema === 'dark' ? <Sun /> : <Moon />}
              titulo={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              detalhe={`Tema atual: ${tema === 'dark' ? 'escuro' : 'claro'}`}
              onClick={alternar}
              marcador={tema === 'dark' ? <Check /> : undefined}
            />
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setConfiguracoesAbertas(false)}
              className="flex items-center gap-3 rounded-xl border border-border/70 p-3 text-left transition-colors hover:border-primary/25 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Documentação da API</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Rotas e contratos disponíveis</span>
              </span>
              <ExternalLink className="size-4 text-muted-foreground" />
            </a>
            {eu?.autenticacaoAtiva && (
              <AcaoConfiguracao
                icone={<KeyRound />}
                titulo="Alterar senha"
                detalhe="Atualize a senha da sua conta"
                onClick={() => { setConfiguracoesAbertas(false); abrirSenha() }}
              />
            )}
            {eu?.autenticacaoAtiva && (
              <AcaoConfiguracao
                icone={<LogOut />}
                titulo="Sair da conta"
                detalhe="Encerrar sua sessão neste dispositivo"
                onClick={() => void sair()}
                destrutiva
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BotaoLateral({
  children, onClick, icone, className, ...props
}: { children: ReactNode; onClick: () => void; icone: ReactNode; className?: string; 'aria-label'?: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      {...props}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
        className,
      )}
    >
      {icone}
      <span className="shell-settings-label">{children}</span>
    </button>
  )
}

function AcaoConfiguracao({
  icone, titulo, detalhe, onClick, marcador, destrutiva = false,
}: {
  icone: ReactNode
  titulo: string
  detalhe: string
  onClick: () => void
  marcador?: ReactNode
  destrutiva?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-border/70 p-3 text-left transition-colors hover:border-primary/25 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        destrutiva && 'hover:border-destructive/30 hover:bg-danger-soft',
      )}
    >
      <span className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-[18px]',
        destrutiva && 'bg-destructive/10 text-destructive',
      )}>{icone}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-semibold', destrutiva && 'text-destructive')}>{titulo}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detalhe}</span>
      </span>
      {marcador && <span className="text-primary">{marcador}</span>}
    </button>
  )
}
