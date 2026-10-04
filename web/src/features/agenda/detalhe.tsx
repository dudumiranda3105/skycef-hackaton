import { useEffect, useState } from 'react'
import { CalendarClock, CheckCheck, FileText, Loader2, QrCode, ScanLine, Truck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Input, Select, Textarea } from '@/components/ui/input'
import { AcondBadge, Callout, Erros, OrigemBadge, SecTitulo, StatusBadge, Vazio } from '@/components/comum'
import { ACOND, MOTIVOS_NR, SLOTS } from '@/lib/constants'
import { GET, POST, cabe, dStatus, errTxt, mapAg, ocupantes, porDataHora } from '@/lib/api'
import { fmtBR, fmtCnpj, fmtDM, fmtHM, fmtNF, fmtTS, hojeISO, loc, nowLocal } from '@/lib/format'
import { avisar, useAuth, useDados } from '@/lib/store'
import { useJanelas } from '@/lib/janelas'
import type { Evento, StatusAg } from '@/lib/types'
import { cn } from '@/lib/utils'
import { codigoAg } from '@/features/checkin/util'

const ATIVOS: StatusAg[] = ['PENDENTE_COMPRAS', 'AUTORIZADO']

export function DetalheAgendamento({
  id, onFechar, onDecidirVaga,
}: { id: number | null; onFechar: () => void; onDecidirVaga: (vagaId: number) => void }) {
  const { agById, fornById, nr, vagas, refresh } = useDados()
  const { pf } = useAuth()
  const { abrirQr, abrirCheckin } = useJanelas()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [sub, setSub] = useState<'reag' | 'canc' | 'nr' | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const a = id != null ? agById(id) : undefined

  useEffect(() => {
    setEventos([])
    setSub(null)
    if (id == null) return
    let vivo = true
    GET<Evento[]>(`/api/agendamentos/${id}/eventos`).then((e) => vivo && setEventos(e)).catch(() => {})
    return () => {
      vivo = false
    }
  }, [id, a?.status, a?.data, a?.horario])

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setOcupado(true)
    try {
      await fn()
      await refresh()
      avisar(msg)
    } catch (e) {
      avisar(errTxt(e), true)
    } finally {
      setOcupado(false)
    }
  }

  if (id == null || !a) return null
  const f = fornById(a.fornecedorId)
  const ativo = ATIVOS.includes(a.status)
  const reag = eventos.filter((e) => e.tipo === 'REAGENDAMENTO' && e.detalhe?.de && e.detalhe?.para)
  const nrs = nr.filter((n) => n.agendamentoId === a.id)
  const vaga = vagas.find((v) => v.origemAgendamentoId === a.id && v.status === 'ABERTA')
  const estados = { AGUARDANDO: 'aguardando chegada', NA_FILA: 'na fila', EM_DESCARGA: 'em descarga', CONCLUIDA: 'concluída' }
  const terminal = ['CANCELADO', 'NAO_RECEBIDO', 'NAO_AUTORIZADO'].includes(a.status)

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onFechar()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{f.nome}</SheetTitle>
            <SheetDescription>Detalhes do agendamento {codigoAg(a.id)}</SheetDescription>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={a.status} /> <AcondBadge acond={a.acond} /> <OrigemBadge origem={a.origem} />
            </div>
          </SheetHeader>
          <SheetBody>
            <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-[13.5px] text-muted-foreground">
              <span>Código <b className="num text-foreground">{codigoAg(a.id)}</b></span>
              <span>Data <b className="num text-foreground">{fmtBR(a.data)}</b></span>
              <span>Horário <b className="num text-foreground">{a.horario}</b></span>
              {f.cnpj && <span>CNPJ <b className="num text-foreground">{fmtCnpj(f.cnpj)}</b></span>}
              {a.chegadaEm && <span>Chegou <b className="num text-foreground">{fmtTS(a.chegadaEm)}</b></span>}
            </div>
            {a.naHora && <Callout tom="aviso">Entrega que chegou sem agendamento prévio.</Callout>}
            {a.limiteIgnorado && <Callout tom="aviso">Este agendamento excede o limite normal do horário (reagendado por caso fortuito).</Callout>}
            <div>
              <SecTitulo className="mb-1.5">Notas fiscais</SecTitulo>
              <div className="grid gap-1.5 text-sm">
                {a.nfs.map((n) => (
                  <div key={n.id} className="num border-l-[3px] pl-3">
                    {n.numero ? fmtNF(n.numero) : '—'}
                    {n.chave && <span className="text-muted-foreground"> · chave {n.chave.slice(0, 6)}…{n.chave.slice(-4)}</span>}
                    {n.arquivo && (
                      <> · <a className="text-primary underline underline-offset-2" href={`/api/agendamentos/${a.id}/notas/${n.id}/arquivo`}><FileText className="mr-1 inline size-3.5" />{n.arquivo}</a></>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SecTitulo className="mb-1.5">Compras</SecTitulo>
              {a.compras ? (
                <div className="border-l-[3px] pl-3 text-sm">
                  Pedido <b>{a.compras.pedido || '—'}</b> ·{' '}
                  {a.compras.decisao === 'AUTORIZADO' ? <span className="text-success">Autorizado</span> : <span className="text-destructive">Não autorizado</span>}
                  {a.compras.obs && <><br /><span className="text-muted-foreground">{a.compras.obs}</span></>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aguardando validação de Compras.</p>
              )}
            </div>
            <div>
              <SecTitulo className="mb-1.5">Destinos e descargas</SecTitulo>
              {a.descs.length ? (
                <div className="grid gap-1.5 text-sm">
                  {a.descs.map((d) => (
                    <div key={d.id} className="border-l-[3px] pl-3">
                      <b>{d.armazem}</b> · {estados[dStatus(d)]}
                      <br />
                      <span className="num text-muted-foreground">
                        chegada {fmtHM(d.chegada)} · entrada {fmtHM(d.entrada)} · saída {fmtHM(d.saida)}{d.chapas != null ? ` · ${d.chapas} chapas` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Destinos ainda não definidos pelo armazém.</p>
              )}
            </div>
            {(reag.length > 0 || a.canc || nrs.length > 0) && (
              <div>
                <SecTitulo className="mb-1.5">Histórico</SecTitulo>
                <div className="grid gap-1.5 text-sm">
                  {reag.map((e) => (
                    <div key={e.id} className="border-l-[3px] pl-3">
                      Reagendado de {fmtDM(e.detalhe!.de!.data)} {String(e.detalhe!.de!.horario).slice(0, 5)} para {fmtDM(e.detalhe!.para!.data)} {String(e.detalhe!.para!.horario).slice(0, 5)} ·{' '}
                      {e.detalhe!.casoFortuito ? 'caso fortuito' : 'outro motivo'}
                      {e.detalhe!.limiteExcedido && ' · acima do limite'}
                      <br /><span className="text-muted-foreground">{e.observacao}</span>
                    </div>
                  ))}
                  {a.canc && <div className="border-l-[3px] pl-3">Cancelamento {a.canc.situacao === 'EFETIVADO' ? 'efetivado' : 'solicitado'} · {a.canc.motivo}</div>}
                  {nrs.map((n) => (
                    <div key={n.id} className="border-l-[3px] pl-3">Não recebido · {MOTIVOS_NR[n.motivo] || n.motivo}{n.descricao ? ' · ' + n.descricao : ''}</div>
                  ))}
                </div>
              </div>
            )}
            {eventos.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Trilha de auditoria ({eventos.length} eventos)</summary>
                <div className="mt-1.5 grid gap-1.5">
                  {eventos.map((e) => (
                    <div key={e.id} className="border-l-[3px] pl-3"><span className="num text-muted-foreground">{fmtTS(loc(e.ocorridoEm))}</span> · {e.observacao || e.tipo}</div>
                  ))}
                </div>
              </details>
            )}
          </SheetBody>
          <SheetFooter>
            {ativo && pf('agendar') && <Button variant="outline" onClick={() => setSub('reag')}><CalendarClock /> Reagendar</Button>}
            {ativo && pf('armazem') && !a.chegadaEm && !a.descs.length && (
              <Button variant="outline" disabled={ocupado} onClick={() => void acao(() => POST(`/api/agendamentos/${a.id}/chegada`, {}), 'Chegada do caminhão registrada.')}>
                <Truck /> Registrar chegada do caminhão
              </Button>
            )}
            {ativo && pf('agendar') && !a.canc && <Button variant="outline" onClick={() => setSub('canc')}><XCircle /> Solicitar cancelamento</Button>}
            {pf('armazem') && a.canc?.situacao === 'SOLICITADO' && a.status !== 'CANCELADO' && (
              <Button variant="danger" disabled={ocupado} onClick={() => void acao(() => POST(`/api/agendamentos/${a.id}/cancelamento/efetivacao`), 'Cancelamento efetivado. A vaga ficou aberta: o armazém decide quem ocupa.')}>
                <CheckCheck /> Efetivar cancelamento
              </Button>
            )}
            {!terminal && <Button variant="outline" onClick={() => abrirQr(a.id)}><QrCode /> QR Code e calendário</Button>}
            {!terminal && pf('armazem') && <Button variant="outline" onClick={() => { onFechar(); abrirCheckin(a.id) }}><ScanLine /> Check-in</Button>}
            {ativo && pf('armazem') && <Button variant="outline" onClick={() => setSub('nr')}>Registrar não recebimento</Button>}
            {vaga && pf('armazem') && <Button variant="accent" onClick={() => onDecidirVaga(vaga.id)}>Decidir quem ocupa a vaga</Button>}
            {!ativo && !a.canc && !terminal && <span className="text-sm text-muted-foreground">Sem ações disponíveis nesta situação.</span>}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {sub === 'reag' && <Reagendar id={a.id} onFechar={() => setSub(null)} />}
      {sub === 'canc' && <SolicitarCancelamento id={a.id} onFechar={() => setSub(null)} />}
      {sub === 'nr' && <NaoRecebimento id={a.id} onFechar={() => setSub(null)} />}
    </>
  )
}

function Reagendar({ id, onFechar }: { id: number; onFechar: () => void }) {
  const { agById, fornById, ags, vagas, carregarDias, motivoDiaBloqueado, refresh } = useDados()
  const a = agById(id)!
  const [motivo, setMotivo] = useState<'FORTUITO' | 'OUTRO'>('FORTUITO')
  const [data, setData] = useState(a.data)
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    void carregarDias([data])
  }, [data, carregarDias])
  const hoje = hojeISO()
  const agora = nowLocal().slice(11, 16)
  const fort = motivo === 'FORTUITO'
  const estado = (h: string) => {
    if (!data) return { ok: false, sub: 'Escolha a data' }
    if (motivoDiaBloqueado(data)) return { ok: false, sub: 'Sem recebimento' }
    if (data < hoje || (data === hoje && h < agora)) return { ok: false, sub: 'Horário já passou' }
    const c = cabe(ocupantes(ags, vagas, data, h, a.id).tipos, a.acond)
    return { ok: c || fort, sub: c ? 'Disponível' : fort ? 'Excede o limite' : 'Indisponível' }
  }
  async function salvar() {
    if (!data || !hora) return setMsg('Escolha a nova data e o horário.')
    if (!fort && !obs.trim()) return setMsg('Descreva o motivo do reagendamento.')
    if (data === a.data && hora === a.horario) return setMsg('A nova data e horário são iguais aos atuais.')
    const excede = !cabe(ocupantes(ags, vagas, data, hora, a.id).tipos, a.acond)
    setOcupado(true)
    try {
      await POST(`/api/agendamentos/${a.id}/reagendamento`, { data, horario: hora, motivo: obs.trim() || 'Caso fortuito', casoFortuito: fort })
    } catch (e) {
      setMsg(errTxt(e))
      setOcupado(false)
      return
    }
    await refresh()
    onFechar()
    avisar(excede ? 'Reagendado por caso fortuito, acima do limite normal do horário.' : 'Entrega reagendada.')
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reagendar entrega</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">{fornById(a.fornecedorId).curto} · hoje em {fmtDM(a.data)} às {a.horario} · {ACOND[a.acond].nome}</p>
          <Field label="Motivo">
            <Select value={motivo} onChange={(e) => { setMotivo(e.target.value as 'FORTUITO' | 'OUTRO'); setHora('') }}>
              <option value="FORTUITO">Caso fortuito (ex.: chuva): pode exceder a capacidade</option>
              <option value="OUTRO">Outro motivo: respeita a capacidade</option>
            </Select>
          </Field>
          <Field label="Nova data"><Input type="date" value={data} min={hoje} onChange={(e) => { setData(e.target.value); setHora('') }} /></Field>
          <div>
            <SecTitulo className="mb-1.5">Novo horário</SecTitulo>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SLOTS.map((h) => {
                const s = estado(h)
                return (
                  <button key={h} type="button" disabled={!s.ok} onClick={() => setHora(h)}
                    className={cn('grid cursor-pointer gap-px rounded-[10px] border-[1.5px] bg-card p-2 text-left disabled:cursor-not-allowed disabled:opacity-50', hora === h && 'border-primary bg-info-soft shadow-[0_0_0_1px_var(--primary)]')}>
                    <b className="font-display text-[17px]">{h}</b><small className="text-[12.5px] text-muted-foreground">{s.sub}</small>
                  </button>
                )
              })}
            </div>
          </div>
          <Field label="Detalhe do motivo" hint={fort ? 'opcional para caso fortuito' : 'obrigatório'}>
            <Input value={obs} maxLength={280} placeholder="Ex.: chuva forte no período da manhã" onChange={(e) => setObs(e.target.value)} />
          </Field>
          <Erros>{msg}</Erros>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={ocupado} onClick={() => void salvar()}>{ocupado && <Loader2 className="animate-spin" />}Reagendar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SolicitarCancelamento({ id, onFechar }: { id: number; onFechar: () => void }) {
  const { refresh } = useDados()
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState('')
  async function ok() {
    if (!motivo.trim()) return setMsg('Informe o motivo do cancelamento.')
    try {
      await POST(`/api/agendamentos/${id}/cancelamento`, { motivo: motivo.trim() })
    } catch (e) {
      return setMsg(errTxt(e))
    }
    await refresh()
    onFechar()
    avisar('Cancelamento solicitado. O horário segue ocupado até a efetivação.')
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Solicitar cancelamento</DialogTitle></DialogHeader>
        <DialogBody>
          <Field label="Motivo"><Input value={motivo} maxLength={280} placeholder="Ex.: fornecedor sem veículo disponível" onChange={(e) => setMotivo(e.target.value)} /></Field>
          <Erros>{msg}</Erros>
          <p className="text-sm text-muted-foreground">Enquanto o cancelamento não for efetivado, o horário continua ocupado.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button onClick={() => void ok()}>Solicitar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NaoRecebimento({ id, onFechar }: { id: number; onFechar: () => void }) {
  const { refresh } = useDados()
  const [motivo, setMotivo] = useState('DIVERGENCIA_NF_PEDIDO')
  const [desc, setDesc] = useState('')
  const [msg, setMsg] = useState('')
  async function ok() {
    if (motivo === 'OUTRO' && !desc.trim()) return setMsg('Descreva o motivo quando escolher “Outro”.')
    try {
      await POST('/api/nao-recebimentos', { motivo, agendamentoId: id, descricao: desc.trim() || undefined })
    } catch (e) {
      return setMsg(errTxt(e))
    }
    await refresh()
    onFechar()
    avisar('Não recebimento registrado.')
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar não recebimento</DialogTitle></DialogHeader>
        <DialogBody>
          <Field label="Motivo">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {Object.entries(MOTIVOS_NR).filter(([k]) => k !== 'SEM_AGENDAMENTO_SEM_VAGA').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {motivo === 'OUTRO' && <Field label="Descrição" hint="obrigatória para o motivo “Outro”"><Textarea value={desc} maxLength={280} onChange={(e) => setDesc(e.target.value)} /></Field>}
          <Erros>{msg}</Erros>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button variant="danger" onClick={() => void ok()}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** O armazém decide quem ocupa a vaga liberada por cancelamento: nunca é automático. */
export function DecidirVaga({ id, onFechar }: { id: number | null; onFechar: () => void }) {
  const { vagas, fornById, armNome, refresh } = useDados()
  const { pf } = useAuth()
  const [cands, setCands] = useState<ReturnType<typeof mapAg>[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const v = id != null ? vagas.find((x) => x.id === id) : undefined

  useEffect(() => {
    setCands(null)
    setMsg('')
    if (id == null) return
    let vivo = true
    GET<any[]>(`/api/vagas-liberadas/${id}/candidatos`)
      .then((l) => {
        if (!vivo) return
        const m = l.map((x) => mapAg(x, armNome)).sort(porDataHora)
        setCands(m)
        setSel(m[0]?.id ?? null)
      })
      .catch((e) => vivo && (setCands([]), setMsg(errTxt(e))))
    return () => {
      vivo = false
    }
  }, [id, armNome])

  if (id == null || !v) return null
  const decide = v.status === 'ABERTA' && pf('armazem')
  const hora = String(v.horario).slice(0, 5)
  async function ocupar() {
    if (sel == null) return
    try {
      await POST(`/api/vagas-liberadas/${id}/atribuicao`, { agendamentoId: sel })
    } catch (e) {
      return setMsg(errTxt(e))
    }
    await refresh()
    onFechar()
    avisar(`Vaga ocupada por ${fornById(cands!.find((c) => c.id === sel)!.fornecedorId).curto}.`)
  }
  async function liberar() {
    try {
      await POST(`/api/vagas-liberadas/${id}/liberacao-geral`)
    } catch (e) {
      return setMsg(errTxt(e))
    }
    await refresh()
    onFechar()
    avisar('Vaga liberada ao público: deixou de ocupar o horário.')
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Quem ocupa a vaga de {fmtDM(v.data)} às {hora}?</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Vaga de {ACOND[v.acondicionamento].nome.toLowerCase()} liberada por cancelamento. O sistema não escolhe sozinho: decida abaixo ou libere ao público. Estes agendamentos cabem na vaga conforme a regra de capacidade:
          </p>
          {cands == null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Buscando candidatos…</p>
          ) : cands.length ? (
            <div className="grid gap-1.5">
              {cands.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 has-[:checked]:border-primary has-[:checked]:bg-info-soft">
                  <input type="radio" name="fv" className="accent-[var(--primary)]" checked={sel === a.id} onChange={() => setSel(a.id)} disabled={!decide} />
                  <span><b>{fornById(a.fornecedorId).curto}</b> · {ACOND[a.acond].nome} · hoje em {fmtDM(a.data)} {a.horario}</span>
                </label>
              ))}
            </div>
          ) : (
            <Vazio>Nenhum agendamento candidato. Libere a vaga ao público ou deixe aberta.</Vazio>
          )}
          <Erros>{msg}</Erros>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>{decide ? 'Decidir depois' : 'Fechar'}</Button>
          {decide && <Button variant="outline" onClick={() => void liberar()}>Liberar ao público</Button>}
          {decide && !!cands?.length && <Button onClick={() => void ocupar()}>Ocupar a vaga</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
