import { useMemo } from 'react'
import { motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OrigemBadge } from '@/components/comum'
import { Logo3D } from '@/components/charts/cena3d'
import { ICONES } from '@/components/shell'
import { LIBERAM_VAGA, PAPEL_ROTULO, SECAO_ROTULO, type Secao } from '@/lib/constants'
import { addDays, big4, brl0, brl4, cent4, dow, fmtDM, hojeISO, mLabel, nf0, nf1, semanaAtual } from '@/lib/format'
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
  return (
    <motion.button
      onClick={() => ir(secao)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="grid cursor-pointer content-start gap-2 rounded-xl border bg-card p-5 text-left shadow-sm hover:shadow-lg active:scale-[0.98]"
      style={{ borderLeft: `4px solid ${cor}` }}
    >
      <span className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${cor} 14%, var(--card))`, color: cor }}>
          <Icone className="size-[18px]" />
        </span>
        <span className="text-sm font-semibold text-muted-foreground">{SECAO_ROTULO[secao]}</span>
      </span>
      <span className="num text-[clamp(24px,4vw,36px)] leading-tight font-bold tracking-tight">{grande}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{sub}</span>
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
  const boletinsPlataforma = boletins.filter(
    (b) => (b.origem === 'PLATAFORMA' || b.origem === 'TESTE') && b.situacao === 'CONSISTENTE',
  )
  const complementoPlataforma = big4(
    boletinsPlataforma.reduce((total, b) => total + cent4(b.complemento ?? '0'), 0n),
  )
  const origPlat = ags.some((a) => a.origem === 'TESTE') ? 'TESTE' : 'PLATAFORMA'

  if (erro && !carregado) {
    return (
      <div className="grid gap-4">
        <h1 className="text-[clamp(26px,3.6vw,38px)]">Recebimento Inteligente</h1>
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
      <section className="mb-6 grid items-center gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,400px)]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo3D tamanho={80} className="!w-10" />
            <div>
              <span className="text-[11.5px] text-muted-foreground font-semibold tracking-wider">COCAPEC</span>
              <h1 className="text-[clamp(24px,3.6vw,38px)] font-bold">Recebimento Inteligente</h1>
            </div>
          </div>
          <p className="mt-2.5 max-w-[52ch] text-muted-foreground">
            Agende o caminhão, receba no armazém, feche o boletim da equipe e veja o que isso significa em reais.
          </p>
        </div>
        {pode('painel') ? (
          <div className="grid gap-2 rounded-xl bg-primary/8 p-5 border-l-4 border-primary">
            <small className="text-[12.5px] opacity-70">A pergunta da direção</small>
            <b className="text-[17px] leading-tight font-semibold">Quanto foi pago em complemento de diária?</b>
            {boletinsPlataforma.length ? (
              <>
                <span className="num text-[clamp(28px,3.6vw,40px)] leading-none font-bold" style={{ color: 'var(--accent)' }}>{brl0(complementoPlataforma)}</span>
                <span className="num text-[13px]">{nf0.format(boletinsPlataforma.length)} boletins consistentes · PLATAFORMA e TESTE</span>
              </>
            ) : (
              <span className="text-[17px] font-semibold">Nenhum boletim da plataforma registrado</span>
            )}
            <small className="text-[12.5px] opacity-70">
              {R
                ? `Histórico ${mLabel(R.de)}–${mLabel(R.ate)}: folga ${brl0(R.totais.sobraReais)} e pressão ${brl0(R.totais.faltaReais)} são estimativas relativas, não complemento efetivamente pago nem recomendação de escala.`
                : 'O painel separa o complemento efetivamente registrado da estimativa histórica de equipe e demanda.'}
            </small>
            <Button variant="outline" className="mt-1 justify-self-start" onClick={() => ir('painel')}>
              Ver os números e as fontes <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 rounded-xl bg-card/80 p-5 border border-border/60">
            <small className="text-[12.5px] opacity-70">Bem-vindo</small>
            <b className="text-[17px] leading-tight font-semibold">{eu?.nome}</b>
            <span className="text-[15px] font-semibold">{eu && PAPEL_ROTULO[eu.papel]}</span>
            <small className="text-[12.5px] opacity-70">{dica}</small>
          </div>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        {pode('agenda') && (
          <Cartao secao="agenda" cor="var(--brand-blue)" grande={nf0.format(num.semana)} sub={`entregas na semana · ${num.pend} aguardando Compras`} origem={origPlat} />
        )}
        {pode('compras') && (
          <Cartao secao="compras" cor="var(--brand-green)" grande={nf0.format(num.pend)} sub={num.pend === 1 ? 'entrega aguardando validação' : 'entregas aguardando validação'} origem={origPlat} />
        )}
        {pode('armazem') && (
          <Cartao secao="armazem" cor="#b8860b" grande={nf0.format(num.semDest + num.fila + num.emDesc)} sub={`${num.semDest} sem destino · ${num.fila} na fila · ${num.emDesc} em descarga`} origem={origPlat} />
        )}
        {pode('boletim') && (
          <Cartao
            secao="boletim"
            cor="var(--brand-green)"
            grande={ult ? brl4(ult.total || ult.producao) : '—'}
            sub={ult ? `último: ${ult.armazem}, ${fmtDM(ult.data)} · ${nf0.format(bols.length)} boletins` : 'nenhum boletim salvo'}
            origem={ult ? ult.origem : origPlat}
          />
        )}
        {pode('painel') && (
          <Cartao secao="painel" cor="var(--brand-blue)" grande={R ? `${nf1.format(Number(R.menor.d))} dia.` : '—'} sub="diárias de saldo histórico estimado" origem="HISTORICO" />
        )}
        {pode('d1') && (
          <Cartao secao="d1" cor="var(--brand-green)" grande={nf0.format(num.d1)} sub="entregas previstas para o próximo dia operacional" origem={origPlat} />
        )}
        {pode('perguntar') && (
          <Cartao secao="perguntar" cor="#b8860b" grande="?" sub="faça perguntas em linguagem natural" origem="PLATAFORMA" />
        )}
        {pode('qualidade') && (
          <Cartao secao="qualidade" cor="var(--brand-blue)" grande={nf0.format(INCONSISTENCIAS_HIST.length)} sub="tratamentos documentados nos dados" origem="HISTORICO" />
        )}
        {pode('usuarios') && <Cartao secao="usuarios" cor="var(--brand-blue)" grande="Acesso" sub="quem pode entrar e com qual perfil" origem="PLATAFORMA" />}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        <span>Origem dos números:</span>
        <OrigemBadge origem="HISTORICO" /> pacote de dados da Cocapec
        <OrigemBadge origem="PLATAFORMA" /> registrado no sistema
        <OrigemBadge origem="TESTE" /> dados de demonstração
      </div>
    </div>
  )
}