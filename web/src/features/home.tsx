import { useMemo, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AcondBadge, OrigemBadge, StatusBadge } from '@/components/comum'
import { Donut, GraficoArea, type PontoArea } from '@/components/graficos'
import { Sparkline } from '@/components/marca'
import { ICONES } from '@/components/shell'
import { DOW, LIBERAM_VAGA, PAPEL_ROTULO, SECAO_ROTULO, STATUS, type Secao } from '@/lib/constants'
import { addDays, big4, brl0, brl4, cent4, dow, fmtDM, hojeISO, mLabel, nf0, nf1, semanaAtual } from '@/lib/format'
import { descAberta } from '@/lib/api'
import { useAuth, useDados } from '@/lib/store'
import { useRota } from '@/lib/rota'
import { respostaDirecao, useHistoricoCompleto } from '@/lib/painelDados'
import { INCONSISTENCIAS_HIST } from '@/features/qualidade'
import { MapaPressao } from '@/components/mapa-pressao'
import type { Agendamento, StatusAg } from '@/lib/types'

/** Uma célula da faixa de indicadores: rótulo, número, contexto e (quando há série real) um minigráfico. */
function Metrica({
  secao, cor, grande, sub, origem, serie, i,
}: { secao: Secao; cor: string; grande: string; sub: string; origem: string; serie?: number[]; i: number }) {
  const { ir } = useRota()
  const Icone = ICONES[secao]
  return (
    <motion.button
      onClick={() => ir(secao)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: i * 0.035, ease: [0.22, 1, 0.36, 1] }}
      className="group relative grid cursor-pointer content-start gap-1 bg-card p-4 text-left sm:p-5 shadow-[0_0_0_0.5px_var(--border)] transition-colors hover:bg-secondary/50"
    >
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground">
        <span className="flex items-center gap-2">
          <Icone className="size-4" style={{ color: cor }} />
          {SECAO_ROTULO[secao]}
        </span>
        <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="num mt-1.5 text-[clamp(24px,2.6vw,30px)] leading-tight font-bold tracking-tight">{grande}</span>
      <span className="text-[12.5px] leading-snug text-muted-foreground">{sub}</span>
      {serie && serie.length > 1 && <Sparkline pontos={serie} cor={cor} className="mt-1.5" />}
      <span className="mt-1.5"><OrigemBadge origem={origem} /></span>
    </motion.button>
  )
}

const COR_STATUS: Record<StatusAg, string> = {
  PENDENTE_COMPRAS: 'var(--brand-yellow)',
  AUTORIZADO: 'var(--brand-blue)',
  EM_DESCARGA: 'var(--brand-green)',
  CONCLUIDO: 'var(--brand-green-deep)',
  NAO_AUTORIZADO: 'var(--destructive)',
  NAO_RECEBIDO: '#e5788f',
  CANCELADO: 'var(--muted-foreground)',
}

/** Caminhões autorizados para hoje: quantos ainda não chegaram e quantos já estão no pátio ou descarregando. */
function portariaHoje(ags: Agendamento[]) {
  const hoje = hojeISO()
  const doDia = ags.filter((a) => a.data === hoje && (a.status === 'AUTORIZADO' || a.status === 'EM_DESCARGA'))
  const chegaram = doDia.filter((a) => a.chegadaEm).length
  return { portHoje: doDia.length, portAguardando: doDia.length - chegaram, portChegaram: chegaram }
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

function Bloco({
  titulo, sub, acao, children,
}: { titulo: string; sub?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{titulo}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  )
}

export function Home() {
  const { eu, pode } = useAuth()
  const { ags, boletins, forn, carregado, erro, carregarTudo } = useDados()
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
      ...portariaHoje(ags),
    }
  }, [ags])

  const { pontosDia, proximas, fatias, totalSemana } = useMemo(() => {
    const hoje = hojeISO()
    const wk = semanaAtual()
    const wkFim = addDays(wk, 4)
    const pontos: PontoArea[] = []
    for (let d = addDays(wk, -7); d <= wkFim; d = addDays(d, 1)) {
      if (dow(d) === 0 || dow(d) === 6) continue
      pontos.push({
        rotulo: `${DOW[dow(d)]} ${d.slice(8, 10)}`,
        valor: ags.filter((a) => a.data === d && !LIBERAM_VAGA.includes(a.status)).length,
        destaque: d === hoje,
      })
    }
    const prox = ags
      .filter((a) => a.data >= hoje && !LIBERAM_VAGA.includes(a.status) && a.status !== 'CONCLUIDO')
      .sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario))
      .slice(0, 6)
    const cont: Partial<Record<StatusAg, number>> = {}
    const daSemana = ags.filter((a) => a.data >= wk && a.data <= wkFim)
    daSemana.forEach((a) => {
      cont[a.status] = (cont[a.status] ?? 0) + 1
    })
    const fat = (Object.entries(cont) as [StatusAg, number][])
      .sort((x, y) => y[1] - x[1])
      .map(([st, n]) => ({ rotulo: STATUS[st], valor: n, cor: COR_STATUS[st] }))
    return { pontosDia: pontos, proximas: prox, fatias: fat, totalSemana: daSemana.length }
  }, [ags])

  const bols = useMemo(() => [...boletins].sort((a, b) => b.data.localeCompare(a.data)), [boletins])
  const ult = bols[0]
  const serieBoletim = useMemo(
    () => bols.slice(0, 14).reverse().map((b) => Number(b.total || b.producao || 0)).filter((n) => Number.isFinite(n)),
    [bols],
  )
  const seriePainel = useMemo(
    () => (hist?.meses ?? []).map((m) => Number(m.saldoDiarias)).filter((n) => Number.isFinite(n)),
    [hist],
  )
  const nomeForn = (id: number) => forn.find((f) => f.id === id)?.curto ?? '—'
  const hojeTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const boletinsPlataforma = boletins.filter(
    (b) => b.origem === 'PLATAFORMA' && b.situacao === 'CONSISTENTE',
  )
  const complementoPlataforma = big4(
    boletinsPlataforma.reduce((total, b) => total + cent4(b.complemento ?? '0'), 0n),
  )
  const origPlat = 'PLATAFORMA'

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

  const metricas = [
    pode('portaria') && (
      <Metrica key="portaria" i={0} secao="portaria" cor="var(--brand-blue)" grande={nf0.format(num.portHoje)} sub={`autorizados hoje · ${num.portAguardando} aguardando chegada · ${num.portChegaram} no pátio`} origem={origPlat} />
    ),
    pode('agenda') && (
      <Metrica key="agenda" i={0} secao="agenda" cor="var(--brand-blue)" grande={nf0.format(num.semana)} sub={`entregas na semana · ${num.pend} aguardando Compras`} origem={origPlat} />
    ),
    pode('compras') && (
      <Metrica key="compras" i={1} secao="compras" cor="var(--brand-green-deep)" grande={nf0.format(num.pend)} sub={num.pend === 1 ? 'entrega aguardando validação' : 'entregas aguardando validação'} origem={origPlat} />
    ),
    pode('armazem') && (
      <Metrica key="armazem" i={2} secao="armazem" cor="var(--brand-yellow)" grande={nf0.format(num.semDest + num.fila + num.emDesc)} sub={`${num.semDest} sem destino · ${num.fila} na fila · ${num.emDesc} em descarga`} origem={origPlat} />
    ),
    pode('boletim') && (
      <Metrica
        key="boletim"
        i={3}
        secao="boletim"
        cor="var(--brand-green-deep)"
        serie={serieBoletim}
        grande={ult ? brl4(ult.total || ult.producao) : '—'}
        sub={ult ? `último: ${ult.armazem}, ${fmtDM(ult.data)} · ${nf0.format(bols.length)} ${bols.length === 1 ? 'boletim' : 'boletins'}` : 'nenhum boletim salvo'}
        origem={ult ? ult.origem : origPlat}
      />
    ),
    pode('painel') && (
      <Metrica key="painel" i={4} secao="painel" cor="var(--brand-blue)" serie={seriePainel} grande={R ? `${nf1.format(Number(R.menor.d))} dia.` : '—'} sub="diárias de saldo histórico estimado" origem="HISTORICO" />
    ),
    pode('d1') && (
      <Metrica key="d1" i={5} secao="d1" cor="var(--brand-green-deep)" grande={nf0.format(num.d1)} sub="entregas previstas para o próximo dia operacional" origem={origPlat} />
    ),
    pode('perguntar') && (
      <Metrica key="perguntar" i={6} secao="perguntar" cor="var(--brand-yellow)" grande="?" sub="faça perguntas em linguagem natural" origem="PLATAFORMA" />
    ),
    pode('qualidade') && (
      <Metrica key="qualidade" i={7} secao="qualidade" cor="var(--brand-blue)" grande={nf0.format(INCONSISTENCIAS_HIST.length)} sub="tratamentos documentados nos dados" origem="HISTORICO" />
    ),
    pode('insumo') && (
      <Metrica key="insumo" i={9} secao="insumo" cor="var(--brand-green-deep)" grande={nf0.format(ags.filter((a) => a.portaria?.situacao === 'PENDENTE_INSUMOS').length)} sub="recebimentos aguardando validação · consulte a fila e o estoque" origem="PLATAFORMA" />
    ),
    pode('fiscal') && (
      <Metrica key="fiscal" i={10} secao="fiscal" cor="var(--brand-blue)" grande="XML e DANFE" sub="notas fiscais históricas para consulta" origem="HISTORICO" />
    ),
    pode('usuarios') && (
      <Metrica key="usuarios" i={8} secao="usuarios" cor="var(--brand-blue)" grande="Acesso" sub="quem pode entrar e com qual perfil" origem="PLATAFORMA" />
    ),
  ].filter(Boolean)

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-[13px] text-muted-foreground first-letter:uppercase">{hojeTxt}</p>
          <h1 className="mt-0.5 text-[clamp(24px,3vw,32px)] font-bold">
            {saudacao()}{eu ? `, ${eu.nome.split(' ')[0]}` : ''}
          </h1>
        </div>
        {pode('agenda') && (
          <Button onClick={() => ir('agenda')}>
            Abrir agenda <ArrowRight />
          </Button>
        )}
      </header>

      {pode('painel') ? (
        <section className="grid items-center gap-x-8 gap-y-4 rounded-xl border border-l-[3px] border-l-primary bg-card p-5 shadow-card md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-1.5">
            <small className="text-[11.5px] font-semibold tracking-[0.08em] text-primary uppercase">A pergunta da direção</small>
            <b className="text-[17px] leading-tight font-semibold">Quanto foi pago em complemento de diária?</b>
            <small className="max-w-[78ch] text-[12.5px] leading-snug text-muted-foreground">
              {R
                ? `Histórico ${mLabel(R.de)}–${mLabel(R.ate)}: folga ${brl0(R.totais.sobraReais)} e pressão ${brl0(R.totais.faltaReais)} são estimativas relativas, não complemento efetivamente pago nem recomendação de escala.`
                : 'O painel separa o complemento efetivamente registrado da estimativa histórica de equipe e demanda.'}
            </small>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 md:justify-end">
            <div className="grid">
              {boletinsPlataforma.length ? (
                <>
                  <span className="num text-[clamp(28px,3vw,36px)] leading-none font-bold text-success">{brl0(complementoPlataforma)}</span>
                  <span className="num mt-1 text-[12.5px] text-muted-foreground">{nf0.format(boletinsPlataforma.length)} {boletinsPlataforma.length === 1 ? 'boletim consistente registrado' : 'boletins consistentes registrados'} na plataforma</span>
                </>
              ) : (
                <span className="text-[15px] font-semibold">Nenhum boletim da plataforma registrado</span>
              )}
            </div>
            <Button variant="outline" onClick={() => ir('painel')}>
              Ver os números e as fontes <ArrowRight />
            </Button>
          </div>
        </section>
      ) : (
        <section className="flex items-start gap-3 rounded-xl border border-l-[3px] border-l-primary bg-card p-5 shadow-card">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <b className="text-[15px]">{eu && PAPEL_ROTULO[eu.papel]}</b>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">{dica}</p>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-card sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
        {metricas}
      </div>

      {pode('d1') && <MapaPressao />}

      {pode('agenda') && (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Bloco titulo="Entregas por dia" sub="Semana anterior e semana atual, só dias úteis. Passe o mouse para ver o número.">
              <GraficoArea pontos={pontosDia} />
            </Bloco>
            <Bloco titulo="Situação da semana" sub="Agendamentos de segunda a sexta, por situação.">
              {totalSemana ? (
                <Donut fatias={fatias} total={totalSemana} legendaTotal={totalSemana === 1 ? 'agendamento' : 'agendamentos'} />
              ) : (
                <p className="rounded-lg border-[1.5px] border-dashed p-6 text-center text-sm text-muted-foreground">Sem agendamentos nesta semana.</p>
              )}
            </Bloco>
          </div>

          <Bloco
            titulo="Próximas entregas"
            sub="As seis seguintes, em ordem de data e horário."
            acao={<Button size="sm" variant="ghost" onClick={() => ir('agenda')}>Ver todas <ArrowRight /></Button>}
          >
            {proximas.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Acondicionamento</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proximas.map((a) => (
                    <TableRow key={a.id} onClick={() => ir('agenda')}>
                      <TableCell className="num whitespace-nowrap font-medium">{DOW[dow(a.data)]}, {fmtDM(a.data)}</TableCell>
                      <TableCell className="num">{a.horario}</TableCell>
                      <TableCell className="font-semibold">{nomeForn(a.fornecedorId)}</TableCell>
                      <TableCell><AcondBadge acond={a.acond} /></TableCell>
                      <TableCell className="num text-right">{a.nfs.length}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="rounded-lg border-[1.5px] border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma entrega agendada daqui para frente.</p>
            )}
          </Bloco>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        <span>Origem dos números:</span>
        <OrigemBadge origem="HISTORICO" /> pacote de dados da Cocapec
        <OrigemBadge origem="PLATAFORMA" /> registrado no sistema
      </div>
    </div>
  )
}
