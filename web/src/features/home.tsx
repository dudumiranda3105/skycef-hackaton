import { useMemo, type PointerEvent } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OrigemBadge } from '@/components/comum'
import { Logo3D } from '@/components/charts/cena3d'
import { ICONES } from '@/components/shell'
import { LIBERAM_VAGA, PAPEL_ROTULO, SECAO_ROTULO, type Secao } from '@/lib/constants'
import { addDays, brl0, brl4, dow, fmtDM, hojeISO, mLabel, nf0, nf1, semanaAtual } from '@/lib/format'
import { descAberta } from '@/lib/api'
import { useAuth, useDados } from '@/lib/store'
import { useRota } from '@/lib/rota'
import { respostaDirecao, useHistoricoCompleto } from '@/lib/painelDados'
import { INCONSISTENCIAS_HIST } from '@/features/qualidade'

function Cartao({
  secao, cor, grande, sub, origem,
}: { secao: Secao; cor: string; grande: string; sub: string; origem: string }) {
  const { ir } = useRota()
  const Icone = ICONES[secao]
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [9, -9]), { stiffness: 220, damping: 20 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-11, 11]), { stiffness: 220, damping: 20 })
  const mover = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }
  return (
    <motion.button
      onClick={() => ir(secao)}
      onPointerMove={mover}
      onPointerLeave={() => {
        mx.set(0)
        my.set(0)
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, borderTopColor: cor }}
      whileHover={{ y: -3 }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid cursor-pointer content-start gap-1.5 rounded-2xl border border-t-4 bg-card p-[18px] text-left shadow-xs hover:shadow-xl"
    >
      <span className="grid size-[38px] place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${cor} 14%, var(--card))`, color: cor }}>
        <Icone className="size-5" />
      </span>
      <span className="mt-1 font-display text-[17px] font-bold">{SECAO_ROTULO[secao]}</span>
      <span className="num font-display text-[26px] leading-tight font-bold whitespace-nowrap">{grande}</span>
      <span className="min-h-14 text-[13px] leading-snug text-muted-foreground">{sub}</span>
      <OrigemBadge origem={origem} />
    </motion.button>
  )
}

export function Home() {
  const { eu, pode } = useAuth()
  const { ags, boletins, carregado, erro, carregarTudo } = useDados()
  const { ir } = useRota()
  const hist = useHistoricoCompleto(pode('painel'))
  const R = respostaDirecao(hist)

  const num = useMemo(() => {
    const wk = semanaAtual()
    const wkFim = addDays(wk, 4)
    const semana = ags.filter((a) => a.data >= wk && a.data <= wkFim && !LIBERAM_VAGA.includes(a.status)).length
    const pend = ags.filter((a) => a.status === 'PENDENTE_COMPRAS').length
    const semDest = ags.filter((a) => a.status === 'AUTORIZADO' && !a.descs.length).length
    const abertas = ags.flatMap((a) => a.descs.filter((d) => descAberta(a, d)))
    let d1 = addDays(hojeISO(), 1)
    while (dow(d1) === 0 || dow(d1) === 6) d1 = addDays(d1, 1)
    return {
      semana, pend, semDest,
      fila: abertas.filter((d) => d.chegada && !d.entrada).length,
      emDesc: abertas.filter((d) => d.entrada).length,
      d1: ags.filter((a) => a.data === d1 && !LIBERAM_VAGA.includes(a.status)).length,
    }
  }, [ags])
  const bols = useMemo(() => [...boletins].sort((a, b) => b.data.localeCompare(a.data)), [boletins])
  const ult = bols[0]
  const origPlat = ags.some((a) => a.origem === 'TESTE') ? 'TESTE' : 'PLATAFORMA'

  if (erro && !carregado) {
    return (
      <div className="grid gap-4">
        <h1 className="text-[clamp(30px,4vw,44px)]">Recebimento Inteligente</h1>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-l-4 border-destructive bg-danger-soft p-3.5 text-sm">
          {erro}
          <Button size="sm" variant="outline" onClick={() => void carregarTudo()}>Tentar de novo</Button>
        </div>
      </div>
    )
  }

  const dica =
    ({
      FORNECEDOR: 'Agende a entrega, anexe a nota fiscal e guarde o QR Code para o check-in.',
      COMPRAS: 'Confira cada nota fiscal contra o pedido e autorize ou recuse a entrega.',
      ENCARREGADO: 'Lance o boletim do dia, com os 4 armazéns de uma vez.',
    } as Record<string, string>)[eu?.papel ?? ''] ?? 'Use o menu ao lado para abrir uma seção.'

  return (
    <div>
      <section className="mb-8 grid items-center gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,440px)]">
        <div>
          <div className="flex items-center gap-2">
            <Logo3D tamanho={92} className="!w-[92px] shrink-0" />
            <h1 className="text-[clamp(30px,4vw,44px)]">Recebimento Inteligente</h1>
          </div>
          <p className="mt-2.5 max-w-[52ch] text-muted-foreground">
            Agende o caminhão, receba no armazém, feche o boletim da equipe e veja o que isso significa em reais.
            Escolha uma seção no menu ao lado.
          </p>
        </div>
        {pode('painel') ? (
          <div className="grid gap-2 rounded-[18px] bg-sidebar p-6 text-sidebar-foreground shadow-[0_26px_40px_-28px_rgba(8,47,99,.6)]">
            <small className="text-[13px] opacity-75">A pergunta da direção</small>
            <b className="font-display text-[19px] leading-tight">A quantidade de chapas está sobrando ou faltando?</b>
            {R ? (
              <>
                <span className="num font-display text-[38px] leading-none font-bold text-accent">{nf1.format(Number(R.menor.d))} diárias</span>
                <span className="num font-display text-[17px] font-semibold">{brl0(R.menor.r)} a realocar</span>
                <small className="text-[13px] opacity-75">
                  {R.descompasso && 'Folga na safra, pressão na entressafra: a equipe está mal distribuída no tempo. '}
                  Histórico, {mLabel(R.de)} a {mLabel(R.ate)}. Folga {brl0(R.totais.sobraReais)} · pressão {brl0(R.totais.faltaReais)}, ao piso.
                </small>
              </>
            ) : (
              <>
                <span className="font-display text-[17px] font-semibold">Histórico ainda não carregado</span>
                <small className="text-[13px] opacity-75">
                  Carregue o pacote da Cocapec (README, “Carregar dados”) para ver a folga e a pressão em reais. Os boletins da plataforma já alimentam o painel.
                </small>
              </>
            )}
            <Button variant="accent" className="mt-1 justify-self-start" onClick={() => ir('painel')}>
              Ver os números e as fontes <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 rounded-[18px] bg-sidebar p-6 text-sidebar-foreground">
            <small className="text-[13px] opacity-75">Bem-vindo</small>
            <b className="font-display text-[19px] leading-tight">{eu?.nome}</b>
            <span className="font-display text-[17px] font-semibold">{eu && PAPEL_ROTULO[eu.papel]}</span>
            <small className="text-[13px] opacity-75">{dica}</small>
          </div>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
        {pode('agenda') && (
          <Cartao secao="agenda" cor="var(--brand-blue)" grande={nf0.format(num.semana)} sub={`entregas na semana · ${num.pend} aguardando Compras`} origem={origPlat} />
        )}
        {pode('compras') && (
          <Cartao secao="compras" cor="var(--brand-green)" grande={nf0.format(num.pend)} sub={num.pend === 1 ? 'entrega aguardando validação' : 'entregas aguardando validação'} origem={origPlat} />
        )}
        {pode('armazem') && (
          <Cartao secao="armazem" cor="#c98f00" grande={nf0.format(num.semDest + num.fila + num.emDesc)} sub={`${num.semDest} sem destino · ${num.fila} na fila · ${num.emDesc} em descarga`} origem={origPlat} />
        )}
        {pode('boletim') && (
          <Cartao
            secao="boletim"
            cor="var(--brand-green)"
            grande={ult ? brl4(ult.total || ult.producao) : '—'}
            sub={ult ? `último: ${ult.armazem}, ${fmtDM(ult.data)} · ${nf0.format(bols.length)} boletins salvos` : 'nenhum boletim salvo ainda'}
            origem={ult ? ult.origem : origPlat}
          />
        )}
        {pode('painel') && (
          <Cartao secao="painel" cor="var(--brand-blue)" grande={R ? `${nf1.format(Number(R.menor.d))} dia.` : '—'} sub="diárias a realocar entre períodos, com a fonte de cada número" origem="HISTORICO" />
        )}
        {pode('d1') && (
          <Cartao secao="d1" cor="var(--brand-green)" grande={nf0.format(num.d1)} sub="entregas previstas para o próximo dia operacional, com nível de pressão e simulador de equipe" origem={origPlat} />
        )}
        {pode('perguntar') && (
          <Cartao secao="perguntar" cor="#c98f00" grande="?" sub="faça perguntas em linguagem natural; a resposta traz número, período, filtros e origem" origem="PLATAFORMA" />
        )}
        {pode('qualidade') && (
          <Cartao secao="qualidade" cor="var(--brand-blue)" grande={nf0.format(INCONSISTENCIAS_HIST.length)} sub="tratamentos documentados nos dados, com a fonte e as limitações de cada indicador" origem="HISTORICO" />
        )}
        {pode('usuarios') && <Cartao secao="usuarios" cor="var(--brand-blue)" grande="Acesso" sub="quem pode entrar e com qual perfil" origem="PLATAFORMA" />}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-muted-foreground">
        <span>Origem dos números:</span>
        <OrigemBadge origem="HISTORICO" /> pacote de dados da Cocapec
        <OrigemBadge origem="PLATAFORMA" /> registrado no sistema
        <OrigemBadge origem="TESTE" /> dados de demonstração
      </div>
    </div>
  )
}
