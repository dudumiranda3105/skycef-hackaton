import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Loader2, ScanLine, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field } from '@/components/ui/label'
import { Input, Select } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AcondBadge, CabecalhoPagina, Erros, OrigemBadge, SecTitulo, Vazio } from '@/components/comum'
import { ACOND, TOLERANCIA_MIN } from '@/lib/constants'
import { POST, dStatus, descAberta, errTxt, porDataHora } from '@/lib/api'
import { addMin, fmtDM, fmtDur, fmtTS, minDiff, nowLocal, toOffset } from '@/lib/format'
import { avisar, useDados } from '@/lib/store'
import { useJanelas } from '@/lib/janelas'
import type { Agendamento, Descarga } from '@/lib/types'
import { cn } from '@/lib/utils'
import { nfsTxt } from '@/features/agenda/agenda'

function validarTempos(ag: Agendamento, t: { chegada: string | null; entrada: string | null; saida: string | null }) {
  const e: string[] = []
  const agora = nowLocal()
  if (t.entrada && !t.chegada) e.push('Registre a chegada antes da entrada.')
  if (t.saida && !t.entrada) e.push('Registre a entrada antes da saída.')
  if (t.chegada && t.entrada && t.entrada < t.chegada) e.push('A entrada não pode ser anterior à chegada.')
  if (t.entrada && t.saida && t.saida < t.entrada) e.push('A saída não pode ser anterior à entrada.')
  if ((t.entrada || t.saida) && !['AUTORIZADO', 'EM_DESCARGA'].includes(ag.status)) e.push('Sem agendamento autorizado, a descarga não pode começar.')
  for (const k of ['chegada', 'entrada', 'saida'] as const) if (t[k] && t[k]! > addMin(agora, 5)) e.push(`O horário de ${k} está no futuro.`)
  return e
}

function CartaoDestinos({ a }: { a: Agendamento }) {
  const { armazens, fornById, refresh } = useDados()
  const [sel, setSel] = useState<number[]>([])
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const f = fornById(a.fornecedorId)
  async function criar() {
    if (!sel.length) return setErro('Escolha ao menos um armazém de destino.')
    setOcupado(true)
    try {
      await POST(`/api/agendamentos/${a.id}/destinos`, { armazemIds: sel })
      await refresh()
      avisar(`${sel.length} descarga(s) criada(s).`)
    } catch (e) {
      setErro(errTxt(e))
      setOcupado(false)
    }
  }
  async function chegou() {
    try {
      await POST(`/api/agendamentos/${a.id}/chegada`, {})
      await refresh()
      avisar('Chegada do caminhão registrada.')
    } catch (e) {
      setErro(errTxt(e))
    }
  }
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid min-w-0 gap-3.5 rounded-[14px] border border-l-[5px] bg-card p-[18px]" style={{ borderLeftColor: ACOND[a.acond].cor }}>
      <div className="flex flex-wrap items-start justify-between gap-x-3.5 gap-y-1.5">
        <div>
          <h3 className="text-[17px]">{f.nome}</h3>
          <div className="mt-0.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13.5px] text-muted-foreground">
            <span>Entrega <b className="num text-foreground">{fmtDM(a.data)} · {a.horario}</b></span>
            <span>Pedido <b className="text-foreground">{a.compras?.pedido || '—'}</b></span>
            <span>Notas <b className="text-foreground">{nfsTxt(a)}</b></span>
          </div>
        </div>
        <div className="flex items-center gap-2"><AcondBadge acond={a.acond} />{a.chegadaEm && <Badge tom="info">Chegou {a.chegadaEm.slice(11, 16)}</Badge>}<OrigemBadge origem={a.origem} /></div>
      </div>
      <div>
        <SecTitulo className="mb-1.5">Armazéns de destino <span className="font-sans text-[13px] font-normal text-muted-foreground">(cada destino vira uma descarga com tempos e recursos próprios)</span></SecTitulo>
        <div className="flex flex-wrap gap-1.5">
          {armazens.map((r) => (
            <label key={r.id} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-[13px]', sel.includes(r.id) && 'border-primary bg-info-soft')}>
              <input type="checkbox" className="accent-[var(--primary)]" checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} />
              {r.nome}
            </label>
          ))}
        </div>
      </div>
      <Erros>{erro}</Erros>
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={() => void criar()}>{ocupado && <Loader2 className="animate-spin" />}Criar descargas</Button>
        {!a.chegadaEm && <Button variant="outline" onClick={() => void chegou()}><Truck /> Caminhão chegou agora</Button>}
      </div>
    </motion.div>
  )
}

function CartaoDescarga({ ag, d }: { ag: Agendamento; d: Descarga }) {
  const { equip, fornById, refresh } = useDados()
  const [t, setT] = useState({ chegada: d.chegada ?? '', entrada: d.entrada ?? '', saida: d.saida ?? '' })
  const [chapas, setChapas] = useState(d.chapas == null ? '' : String(d.chapas))
  const [sel, setSel] = useState<number[]>(d.equip)
  const [erros, setErros] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)
  const st = dStatus(d)
  const esp = d.chegada && d.entrada ? minDiff(d.chegada, d.entrada) : null
  const dur = d.entrada && d.saida ? minDiff(d.entrada, d.saida) : null
  const atraso = d.chegada ? minDiff(ag.data + 'T' + ag.horario, d.chegada) : null
  const meus = equip.filter((e) => e.armazemId === d.armazemId)
  const outros = equip.filter((e) => e.armazemId !== d.armazemId)
  const eqBtn = (id: number, ident: string, tipo: string) => (
    <button
      key={id} type="button" title={tipo} aria-pressed={sel.includes(id)}
      onClick={() => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
      className={cn('cursor-pointer rounded-lg border bg-card px-2.5 py-0.5 text-[13px]', sel.includes(id) && 'border-primary bg-primary text-primary-foreground')}
    >
      {ident}
    </button>
  )
  const campo = (k: 'chegada' | 'entrada' | 'saida', rot: string) => {
    const salvo = !!d[k]
    return (
      <div className="grid gap-1.5">
        <label className="text-[13.5px] font-medium" htmlFor={`d-${d.id}-${k}`}>{rot} {salvo && <span className="text-[12.5px] font-normal text-muted-foreground">registrada</span>}</label>
        <div className="flex flex-wrap gap-2">
          <Input id={`d-${d.id}-${k}`} type="datetime-local" className="min-w-0 flex-[1_1_190px]" value={t[k]} disabled={salvo} onChange={(e) => setT((x) => ({ ...x, [k]: e.target.value }))} />
          {!salvo && <Button size="sm" variant="outline" onClick={() => setT((x) => ({ ...x, [k]: nowLocal() }))}>Agora</Button>}
        </div>
      </div>
    )
  }

  async function salvar() {
    const tempos = { chegada: t.chegada || d.chegada, entrada: t.entrada || d.entrada, saida: t.saida || d.saida }
    const ch = chapas === '' ? null : Number(chapas)
    const e = validarTempos(ag, tempos)
    if (ch != null && (!Number.isInteger(ch) || ch < 0 || ch > 100)) e.push('A quantidade de chapas precisa ser um número inteiro entre 0 e 100.')
    if (tempos.saida && !d.saida && ch == null) e.push('Informe a quantidade de chapas (zero se a carga não exigiu) para registrar a saída.')
    setErros(e)
    if (e.length) return
    setOcupado(true)
    let feito = 0
    try {
      if (tempos.chegada && !d.chegada) { await POST(`/api/descargas/${d.id}/chegada`, { ocorridoEm: toOffset(tempos.chegada) }); feito++ }
      if (tempos.entrada && !d.entrada) { await POST(`/api/descargas/${d.id}/entrada`, { ocorridoEm: toOffset(tempos.entrada) }); feito++ }
      if (tempos.saida && !d.saida) { await POST(`/api/descargas/${d.id}/saida`, { quantidadeChapas: ch, equipamentoIds: sel, ocorridoEm: toOffset(tempos.saida) }); feito++ }
      avisar(!feito ? 'Nada novo para registrar.' : tempos.saida ? 'Descarga concluída e registrada.' : 'Registro salvo.')
    } catch (err) {
      setErros([errTxt(err)])
      avisar(errTxt(err), true)
    } finally {
      await refresh()
      setOcupado(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-3.5 rounded-[14px] border border-l-[5px] bg-card p-[18px]" style={{ borderLeftColor: ACOND[ag.acond].cor }}>
      <div className="flex flex-wrap items-start justify-between gap-x-3.5 gap-y-1.5">
        <div>
          <h3 className="text-[17px]">{fornById(ag.fornecedorId).curto} → {d.armazem}</h3>
          <div className="mt-0.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13.5px] text-muted-foreground">
            <span>Agendado <b className="num text-foreground">{fmtDM(ag.data)} · {ag.horario}</b></span>
            <span>Notas <b className="text-foreground">{nfsTxt(ag)}</b></span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AcondBadge acond={ag.acond} />
          <Badge tom={st === 'AGUARDANDO' ? 'neutro' : 'info'}>{{ AGUARDANDO: 'Aguardando chegada', NA_FILA: 'Na fila', EM_DESCARGA: 'Em descarga', CONCLUIDA: 'Concluída' }[st]}</Badge>
          {atraso != null && atraso > TOLERANCIA_MIN && <Badge tom="aviso">Atrasado {atraso} min</Badge>}
          {d.chegada && d.chegada.slice(0, 10) !== ag.data && <Badge tom="aviso">Fora da data agendada</Badge>}
          <OrigemBadge origem={d.origem} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {campo('chegada', 'Chegada')}{campo('entrada', 'Entrada (início)')}{campo('saida', 'Saída (fim)')}
      </div>
      {(esp != null || dur != null) && (
        <div className="flex gap-2 text-[12.5px]">
          {esp != null && <Badge>Espera {fmtDur(esp)}</Badge>}
          {dur != null && <Badge>Descarga {fmtDur(dur)}</Badge>}
        </div>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Chapas nesta descarga" hint={`Referência do Dossiê: ${ACOND[ag.acond].chapas} (${ag.acond === 'BATIDO' ? 'batido acima de 500 kg' : 'paletizado/big bag'}). Serve de alerta, não bloqueia. Gravado junto com a saída.`}>
          <Input type="number" min={0} max={100} step={1} value={chapas} disabled={!!d.saida} onChange={(e) => setChapas(e.target.value)} />
        </Field>
      </div>
      <div>
        <SecTitulo className="mb-1.5">Equipamentos usados <span className="font-sans text-[13px] font-normal text-muted-foreground">(cada unidade é individual; gravados junto com a saída)</span></SecTitulo>
        <div className="flex flex-wrap gap-1.5">{meus.map((e) => eqBtn(e.id, e.identificacao, e.tipo))}</div>
        <details className="mt-1.5 text-sm">
          <summary className="cursor-pointer text-[13.5px] text-muted-foreground">Equipamentos de outros locais</summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{outros.map((e) => eqBtn(e.id, e.identificacao, e.tipo))}</div>
        </details>
      </div>
      <Erros>{erros.map((x) => <div key={x}>{x}</div>)}</Erros>
      <div><Button disabled={ocupado} onClick={() => void salvar()}>{ocupado && <Loader2 className="animate-spin" />}Salvar registro</Button></div>
    </div>
  )
}

export function Armazem() {
  const { ags, armazens, fornById } = useDados()
  const { abrirLeitor } = useJanelas()
  const [filtro, setFiltro] = useState('Todos')
  const aguard = useMemo(() => ags.filter((a) => a.status === 'AUTORIZADO' && !a.descs.length).sort(porDataHora), [ags])
  const todas = useMemo(() => ags.flatMap((a) => a.descs.map((d) => ({ a, d }))), [ags])
  const doFiltro = (d: Descarga) => filtro === 'Todos' || String(d.armazemId) === filtro
  const abertas = todas.filter(({ a, d }) => descAberta(a, d) && doFiltro(d)).sort((x, y) => porDataHora(x.a, y.a))
  const recentes = todas.filter(({ d }) => d.saida && doFiltro(d)).sort((x, y) => y.d.saida!.localeCompare(x.d.saida!)).slice(0, 8)
  const fila = abertas.filter(({ d }) => d.chegada && !d.entrada).length
  const emDesc = abertas.filter(({ d }) => d.entrada).length
  const kpi = (r: string, v: number) => (
    <div className="grid gap-0.5 rounded-[14px] border bg-card px-[18px] py-4"><span className="text-[13.5px] text-muted-foreground">{r}</span><span className="num font-display text-[28px] leading-tight font-bold">{v}</span></div>
  )
  return (
    <div>
      <CabecalhoPagina
        titulo="Recebimento no armazém" quem="Quem usa: responsável pelo armazém"
        sub="Defina para onde cada caminhão vai e registre, em cada descarga, chegada, entrada, saída, chapas e equipamentos."
        acoes={
          <>
            <Button variant="accent" onClick={abrirLeitor}><ScanLine /> Check-in por QR</Button>
            <Select className="w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por armazém">
              <option value="Todos">Todos os armazéns</option>
              {armazens.map((a) => <option key={a.id} value={String(a.id)}>{a.nome}</option>)}
            </Select>
          </>
        }
      />
      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5">
        {kpi('Aguardando destino', aguard.length)}{kpi('Na fila', fila)}{kpi('Em descarga', emDesc)}{kpi('Concluídas (recentes)', recentes.length)}
      </div>
      <h2 className="mb-2.5 text-[21px]">Definir destinos</h2>
      {aguard.length ? <div className="grid gap-3.5">{aguard.map((a) => <CartaoDestinos key={a.id} a={a} />)}</div> : <Vazio>Nenhuma entrega autorizada aguardando destino.</Vazio>}
      <h2 className="mt-6 mb-2.5 text-[21px]">Descargas em andamento ou previstas</h2>
      {abertas.length ? <div className="grid gap-3.5">{abertas.map(({ a, d }) => <CartaoDescarga key={d.id} ag={a} d={d} />)}</div> : <Vazio>Sem descargas abertas neste filtro.</Vazio>}
      <section className="mt-6">
        <h2 className="mb-2.5 text-[21px]">Concluídas recentemente</h2>
        {recentes.length ? (
          <div className="rounded-2xl border bg-card px-2 py-1">
            <Table>
              <TableHeader><TableRow><TableHead>Saída</TableHead><TableHead>Fornecedor</TableHead><TableHead>Armazém</TableHead><TableHead className="text-right">Espera</TableHead><TableHead className="text-right">Descarga</TableHead><TableHead className="text-right">Chapas</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
              <TableBody>
                {recentes.map(({ a, d }) => (
                  <TableRow key={d.id}>
                    <TableCell className="num">{fmtTS(d.saida)}</TableCell><TableCell>{fornById(a.fornecedorId).curto}</TableCell><TableCell>{d.armazem}</TableCell>
                    <TableCell className="num text-right">{fmtDur(d.chegada && d.entrada ? minDiff(d.chegada, d.entrada) : null)}</TableCell>
                    <TableCell className="num text-right">{fmtDur(minDiff(d.entrada!, d.saida!))}</TableCell>
                    <TableCell className="num text-right">{d.chapas == null ? '—' : d.chapas}</TableCell><TableCell><OrigemBadge origem={d.origem} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <Vazio>Ainda sem descargas concluídas.</Vazio>}
      </section>
    </div>
  )
}
