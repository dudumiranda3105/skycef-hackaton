import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AcondBadge, Callout, CabecalhoPagina, OrigemBadge, StatusBadge, Vazio } from '@/components/comum'
import { ACOND, DOW, MAX_UNITIZADOS, STATUS } from '@/lib/constants'
import { addDays, dow, fmtDM, fmtNF, hojeISO, semanaAtual, fromISO } from '@/lib/format'
import { ocupantes, porDataHora } from '@/lib/api'
import { useAuth, useDados } from '@/lib/store'
import type { Agendamento, Vaga } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NovoAgendamento } from './novo'
import { DetalheAgendamento, DecidirVaga } from './detalhe'

export const nfsTxt = (a: Agendamento) => a.nfs.map((n) => (/\d/.test(n.numero || '') ? fmtNF(n.numero) : n.arquivo || 'sem NF')).join(', ')

function Faixa({ a, cheia, onAbrir }: { a: Agendamento; cheia?: boolean; onAbrir: () => void }) {
  const { fornById } = useDados()
  const cor = ACOND[a.acond].cor
  return (
    <button
      onClick={onAbrir}
      className={cn(
        'grid min-h-11 cursor-pointer gap-px rounded-lg border bg-card px-2 py-1 text-left transition hover:-translate-y-px hover:shadow-md',
        cheia && 'min-h-[93px] content-center',
      )}
      style={{
        borderLeft: `5px solid ${cor}`,
        ...(cheia ? { background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${cor} 15%, var(--card)) 0 10px, var(--card) 10px 20px)` } : {}),
      }}
    >
      <span className="truncate text-[13.5px] leading-tight font-semibold">{fornById(a.fornecedorId).curto}</span>
      <span className="text-[12.5px] text-muted-foreground">
        {ACOND[a.acond].nome} · {STATUS[a.status]}
      </span>
    </button>
  )
}

function FaixaVaga({ v, cheia, onAbrir }: { v: Vaga; cheia?: boolean; onAbrir: () => void }) {
  const cor = ACOND[v.acondicionamento].cor
  return (
    <button
      onClick={onAbrir}
      className={cn('grid min-h-11 cursor-pointer gap-px rounded-lg border border-dashed bg-card px-2 py-1 text-left transition hover:-translate-y-px', cheia && 'min-h-[93px] content-center')}
      style={{ borderLeft: `5px dashed ${cor}`, background: 'repeating-linear-gradient(135deg, transparent 0 8px, var(--secondary) 8px 9px)' }}
    >
      <span className="text-[13.5px] leading-tight font-semibold">Vaga liberada</span>
      <span className="text-[12.5px] text-muted-foreground">{ACOND[v.acondicionamento].nome} · aguardando decisão</span>
    </button>
  )
}

export function Agenda() {
  const { pf, eu } = useAuth()
  const { ags, vagas, motivoDiaBloqueado, carregarDias, fornById } = useDados()
  const [semana, setSemana] = useState(semanaAtual())
  const [todas, setTodas] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [novo, setNovo] = useState<{ data?: string; hora?: string; walkin?: boolean } | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const [vagaId, setVagaId] = useState<number | null>(null)
  const dias = useMemo(() => [0, 1, 2, 3, 4].map((i) => addDays(semana, i)), [semana])
  const hoje = hojeISO()

  useEffect(() => {
    void carregarDias(dias)
  }, [dias, carregarDias])

  const vagasAbertas = vagas.filter((v) => v.status === 'ABERTA').length
  const lista = useMemo(
    () => ags.filter((a) => todas || (a.data >= dias[0] && a.data <= dias[4])).filter((a) => !filtro || a.status === filtro).sort(porDataHora),
    [ags, todas, filtro, dias],
  )
  const slots = ['08:00', '10:00', '13:00', '15:00']

  function celula(d: string, hora: string) {
    if (motivoDiaBloqueado(d)) {
      return (
        <div className="grid min-h-[124px] place-items-center border-b border-l bg-[repeating-linear-gradient(135deg,transparent_0_9px,var(--secondary)_9px_10px)] text-center text-[13px] text-muted-foreground">
          Sem recebimento
        </div>
      )
    }
    const o = ocupantes(ags, vagas, d, hora)
    const itens = [
      ...o.ags.map((a) => ({ t: a.acond, k: 'a' + a.id, el: (cheia: boolean) => <Faixa a={a} cheia={cheia} onAbrir={() => setAberto(a.id)} /> })),
      ...o.vagas.map((v) => ({ t: v.acondicionamento, k: 'v' + v.id, el: (cheia: boolean) => <FaixaVaga v={v} cheia={cheia} onAbrir={() => setVagaId(v.id)} /> })),
    ]
    const bat = o.tipos.includes('BATIDO')
    const passado = d < hoje
    const n = o.tipos.length
    const podeAgendar = pf('agendar')
    let corpo
    if (bat) {
      const i = itens.findIndex((x) => x.t === 'BATIDO')
      corpo = (
        <>
          {itens[i].el(true)}
          {itens.filter((_, j) => j !== i).map((x) => <div key={x.k}>{x.el(false)}</div>)}
        </>
      )
    } else {
      corpo = Array.from({ length: Math.max(MAX_UNITIZADOS, itens.length) }, (_, i) =>
        itens[i] ? (
          <div key={itens[i].k}>{itens[i].el(false)}</div>
        ) : (
          <button
            key={'l' + i}
            disabled={passado || !podeAgendar}
            onClick={() => setNovo({ data: d, hora })}
            className={cn(
              'grid min-h-11 cursor-pointer content-center justify-items-start rounded-lg border border-dashed bg-transparent px-2 text-[13px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-45',
              !passado && podeAgendar && 'text-success hover:bg-secondary',
            )}
          >
            Livre
          </button>
        ),
      )
    }
    const foot = bat ? 'Exclusivo · carga batida' : n > MAX_UNITIZADOS ? 'Acima do limite · caso fortuito' : n === MAX_UNITIZADOS ? 'Lotado · 2 de 2' : MAX_UNITIZADOS - n === 1 ? '1 vaga livre' : '2 vagas livres'
    return (
      <div className="grid min-h-[124px] content-start gap-1.5 border-b border-l p-2">
        {corpo}
        <div className="px-0.5 text-[12.5px] text-muted-foreground">{foot}</div>
      </div>
    )
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Agenda de recebimento"
        quem="Quem usa: fornecedor (agenda) · Responsável pelo armazém (acompanha)"
        sub="Todos os caminhões precisam de horário. A capacidade é única para a cooperativa inteira: ou uma carga batida sozinha, ou até dois caminhões paletizados ou big bag."
        acoes={
          <>
            {(pf('armazem') || eu?.papel === 'PORTEIRO') && (
              <Button variant="outline" onClick={() => setNovo({ walkin: true })}>
                <Truck /> Chegou sem agendamento
              </Button>
            )}
            {pf('agendar') && (
              <Button variant="accent" onClick={() => setNovo({})}>
                <Plus /> Novo agendamento
              </Button>
            )}
          </>
        }
      />
      {vagasAbertas > 0 && (
        <Callout tom="aviso" className="mb-3.5">
          <b>{vagasAbertas} vaga(s) liberada(s) por cancelamento</b> aguardando decisão do armazém: clique na vaga tracejada da grade para escolher quem ocupa ou liberar ao público.
        </Callout>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Button size="sm" variant="outline" aria-label="Semana anterior" onClick={() => setSemana(addDays(semana, -7))}><ChevronLeft /></Button>
        <h2 className="num mx-1.5 text-lg">{fmtDM(dias[0])} a {fmtDM(dias[4])}/{fromISO(dias[4]).getFullYear()}</h2>
        <Button size="sm" variant="outline" aria-label="Próxima semana" onClick={() => setSemana(addDays(semana, 7))}><ChevronRight /></Button>
        <Button size="sm" variant="outline" onClick={() => setSemana(semanaAtual())}>Semana atual</Button>
      </div>

      <div className="scroll-thin overflow-x-auto rounded-xl border bg-card shadow-sm" role="region" aria-label="Grade de horários da semana" tabIndex={0}>
        <div className="grid min-w-[960px] grid-cols-[64px_repeat(5,minmax(168px,1fr))]">
          <div className="border-b bg-secondary" />
          {dias.map((d) => {
            const blk = motivoDiaBloqueado(d)
            return (
              <div key={d} className={cn('border-b border-l px-3 py-2.5 text-sm', blk ? 'bg-danger-soft' : 'bg-secondary')}>
                <b className="font-display text-base">{DOW[dow(d)]}</b> {fmtDM(d)}
                {blk && <small className="block text-[12.5px] leading-tight text-destructive">{blk}</small>}
              </div>
            )
          })}
          {slots.map((h) => (
            <div key={h} className="contents">
              <div className="border-b bg-secondary px-2 py-3 text-center font-display text-[15px] font-bold">{h}</div>
              {dias.map((d) => (
                <div key={d + h} className="contents">{celula(d, h)}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="my-3 flex flex-wrap gap-x-[18px] gap-y-1.5 px-0.5 text-[13px] text-muted-foreground">
        {(Object.keys(ACOND) as (keyof typeof ACOND)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3.5 rounded" style={{ background: ACOND[k].cor }} />
            {ACOND[k].nome}{k === 'BATIDO' ? ' (exclusivo)' : ''}
          </span>
        ))}
        <span>Tracejado: horário ocupado por carga batida, vaga liberada ou data sem recebimento</span>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl">Agendamentos {todas ? '(todas as datas)' : 'da semana'}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Mostrar todas as datas
            </label>
            <Select className="w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por situação">
              <option value="">Todas as situações</option>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
        </div>
        {lista.length ? (
          <div className="rounded-2xl border bg-card px-2 py-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data e hora</TableHead><TableHead>Fornecedor</TableHead><TableHead>Notas fiscais</TableHead>
                  <TableHead>Acondicionamento</TableHead><TableHead>Situação</TableHead><TableHead>Destinos</TableHead><TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((a) => (
                  <TableRow key={a.id} onClick={() => setAberto(a.id)}>
                    <TableCell className="num">{fmtDM(a.data)} {a.horario}</TableCell>
                    <TableCell>{fornById(a.fornecedorId).nome}</TableCell>
                    <TableCell>{nfsTxt(a)}</TableCell>
                    <TableCell><AcondBadge acond={a.acond} /></TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell>{a.descs.length ? a.descs.map((x) => x.armazem).join(', ') : <span className="text-muted-foreground">a definir</span>}</TableCell>
                    <TableCell><OrigemBadge origem={a.origem} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Vazio>Nenhum agendamento neste filtro. Clique em uma vaga livre na grade para começar.</Vazio>
        )}
      </section>

      {novo && <NovoAgendamento inicial={novo} onFechar={() => setNovo(null)} onCriado={(data) => setSemana(addDays(data, -((dow(data) + 6) % 7)))} />}
      <DetalheAgendamento id={aberto} onFechar={() => setAberto(null)} onDecidirVaga={(id) => { setAberto(null); setVagaId(id) }} />
      <DecidirVaga id={vagaId} onFechar={() => setVagaId(null)} />
    </div>
  )
}
