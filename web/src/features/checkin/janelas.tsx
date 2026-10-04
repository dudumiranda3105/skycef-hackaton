import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Copy, Loader2, QrCode as QrIcon, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AcondBadge, Callout, Erros, OrigemBadge, SecTitulo, StatusBadge } from '@/components/comum'
import { GET, POST, dStatus, errTxt, mapAg } from '@/lib/api'
import { fmtBR, fmtDur, fmtHM, fmtNF, minDiff } from '@/lib/format'
import { qrSvg } from '@/lib/qr'
import { avisar, useAuth, useDados } from '@/lib/store'
import { useJanelas } from '@/lib/janelas'
import { codigoAg, baixarIcs, linkCheckin } from './util'
import { cn } from '@/lib/utils'
import { LeitorQr } from './leitor-qr'
import { ConferenciaPortaria } from './conferencia-portaria'
import type { Agendamento } from '@/lib/types'

/* ---------- QR Code da entrega (e confirmação do agendamento) ---------- */
function QrDialog() {
  const { qr, fechar, abrirCheckin } = useJanelas()
  const { agById, fornById } = useDados()
  const { pf } = useAuth()
  const a = qr ? agById(qr.id) : undefined
  const svg = useMemo(() => (qr ? qrSvg(linkCheckin(qr.id)) : null), [qr])
  if (!qr || !a || !svg) return null
  const f = fornById(a.fornecedorId)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkCheckin(a!.id))
      avisar('Link do check-in copiado.')
    } catch {
      avisar('Não foi possível copiar. Link: ' + linkCheckin(a!.id), true)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && fechar('qr')}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>{qr.confirmacao ? 'Agendamento confirmado' : 'QR Code da entrega'}</DialogTitle></DialogHeader>
        <DialogBody>
          {qr.confirmacao && <Callout tom="ok">Entrega agendada para <b>{fmtBR(a.data)} às {a.horario}</b>. Agora ela segue para a validação de Compras.</Callout>}
          <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="justify-self-center rounded-xl border bg-white p-1.5 leading-[0]" aria-label="QR Code do agendamento">
              <svg viewBox={`0 0 ${svg.lado} ${svg.lado}`} className="size-[220px]" shapeRendering="crispEdges" role="img" aria-label={`QR Code do agendamento ${codigoAg(a.id)}`}>
                <rect width="100%" height="100%" fill="#fff" />
                <path d={svg.path} fill="#000" />
              </svg>
            </div>
            <div>
              <div className="num mb-1.5 font-display text-[30px] font-bold tracking-wide">{codigoAg(a.id)}</div>
              <div className="grid gap-0.5 text-[13.5px] text-muted-foreground">
                <span>Fornecedor <b className="text-foreground">{f.nome}</b></span>
                <span>Entrega <b className="num text-foreground">{fmtBR(a.data)} · {a.horario}</b></span>
                {a.placaVeiculo && <span>Placa prevista <b className="num text-foreground">{a.placaVeiculo}</b></span>}
                <span>Notas <b className="text-foreground">{a.nfs.map((n) => (n.numero ? fmtNF(n.numero) : 'sem número')).join(', ')}</b></span>
                <span className="mt-1"><AcondBadge acond={a.acond} /></span>
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                Na chegada, o responsável lê o QR e o sistema localiza a entrega. O QR só identifica o agendamento: ele não autoriza o recebimento nem pula nenhuma validação.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" onClick={() => baixarIcs(a, f.nome)}><CalendarPlus /> Adicionar ao calendário</Button>
            <Button variant="outline" onClick={() => void copiar()}><Copy /> Copiar link do check-in</Button>
            {pf('armazem') && <Button variant="outline" onClick={() => abrirCheckin(a.id)}><ScanLine /> Abrir o check-in</Button>}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            O calendário é só uma conveniência (arquivo .ics, aceito pelos calendários comuns): alterar o compromisso no celular não altera o agendamento. O sistema da Cocapec continua sendo a fonte oficial.
          </p>
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => fechar('qr')}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Check-in: o QR localiza a entrega; as regras continuam as da API ---------- */
function CheckinDialog() {
  const { checkin, fechar, abrirQr } = useJanelas()
  const { agById, fornById, equip, armNome, refresh } = useDados()
  const { eu, pf } = useAuth()
  const [direto, setDireto] = useState<Agendamento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [chapas, setChapas] = useState<Record<number, string>>({})
  const [eqSel, setEqSel] = useState<Record<number, number[]>>({})
  const [erros, setErros] = useState<Record<number, string>>({})

  useEffect(() => {
    if (checkin == null) return
    let ativo = true
    setCarregando(true)
    setDireto(null)
    void GET(`/api/agendamentos/${checkin}`).then((r) => { if (ativo) setDireto(mapAg(r, armNome)) }).catch((e) => { if (ativo) setErros({ 0: errTxt(e) }) }).finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [checkin, armNome])

  useEffect(() => {
    if (checkin == null || direto?.portaria?.situacao !== 'PENDENTE_INSUMOS') return
    let ativo = true
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void GET(`/api/agendamentos/${checkin}`).then((r) => { if (ativo) setDireto(mapAg(r, armNome)) }).catch((e) => { if (ativo) setErros({ 0: errTxt(e) }) })
    }, 15000)
    return () => { ativo = false; window.clearInterval(timer) }
  }, [checkin, direto?.portaria?.situacao, armNome])

  if (checkin == null) return null
  const a = direto?.id === checkin ? direto : agById(checkin)
  const fecha = () => fechar('checkin')

  async function passo(descId: number | null, rota: string, corpo: unknown, msg: string) {
    setOcupado(true)
    try {
      const resposta = await POST(rota, corpo)
      setDireto(mapAg(resposta, armNome))
      await refresh()
      avisar(msg)
    } catch (e) {
      setErros((x) => ({ ...x, [descId ?? 0]: errTxt(e) }))
    } finally {
      setOcupado(false)
    }
  }

  if (!a) {
    return (
      <Dialog open onOpenChange={(o) => !o && fecha()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Check-in</DialogTitle></DialogHeader>
          <DialogBody>
            {carregando ? <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Procurando a entrega…</p> : <Callout tom="ruim">Não encontrei a entrega {codigoAg(checkin)}. Confira o código ou o QR.</Callout>}
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={fecha}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  const f = fornById(a.fornecedorId)
  const fim = ['CONCLUIDO', 'CANCELADO', 'NAO_RECEBIDO', 'NAO_AUTORIZADO'].includes(a.status)
  const aviso = ({
    PENDENTE_COMPRAS: 'Aguardando a validação de Compras: a descarga só pode começar depois da autorização.',
    NAO_AUTORIZADO: 'Compras não autorizou esta entrega: ela não pode ser recebida.',
    CANCELADO: 'Entrega cancelada.',
    NAO_RECEBIDO: 'Esta entrega foi registrada como não recebida.',
    CONCLUIDO: 'Todas as descargas desta entrega já foram concluídas.',
  } as Record<string, string>)[a.status]

  return (
    <Dialog open onOpenChange={(o) => !o && fecha()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Check-in · {f.nome}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-[13.5px] text-muted-foreground">
            <span>Código <b className="num text-foreground">{codigoAg(a.id)}</b></span>
            <span>Agendado <b className="num text-foreground">{fmtBR(a.data)} · {a.horario}</b></span>
            <span>Notas <b className="text-foreground">{a.nfs.map((n) => (n.numero ? fmtNF(n.numero) : 'sem número')).join(', ')}</b></span>
            {a.chegadaEm && <span>Chegou <b className="num text-foreground">{fmtHM(a.chegadaEm)}</b></span>}
          </div>
          <div className="flex flex-wrap gap-2"><StatusBadge status={a.status} /><AcondBadge acond={a.acond} /><OrigemBadge origem={a.origem} /></div>
          {aviso && <Callout tom={a.status === 'PENDENTE_COMPRAS' ? 'aviso' : a.status === 'CONCLUIDO' ? 'ok' : 'ruim'}>{aviso}</Callout>}
          {['ADMIN', 'PORTEIRO'].includes(eu?.papel || '') && <ConferenciaPortaria key={a.id} a={a} onAtualizado={setDireto} />}
          {!fim && !a.descs.length && pf('armazem') && !a.portaria && !a.portariaObrigatoria && (
            <>
              {a.status === 'AUTORIZADO' && <Callout>Entrega autorizada. O armazém ainda não definiu o destino: a chegada já pode ser registrada.</Callout>}
              {!a.chegadaEm && (
                <div><Button disabled={ocupado} onClick={() => void passo(null, `/api/agendamentos/${a.id}/chegada`, {}, 'Chegada do caminhão registrada.')}>Registrar chegada do caminhão</Button></div>
              )}
              <Erros>{erros[0]}</Erros>
            </>
          )}
          {a.descs.map((d) => {
            const esp = d.chegada && d.entrada ? minDiff(d.chegada, d.entrada) : null
            const dur = d.entrada && d.saida ? minDiff(d.entrada, d.saida) : null
            const st = dStatus(d)
            const eqs = equip.filter((e) => e.armazemId === d.armazemId)
            const sel = eqSel[d.id] ?? []
            return (
              <div key={d.id} className="grid gap-3 rounded-[14px] border border-l-[5px] bg-card p-4" style={{ borderLeftColor: 'var(--primary)' }}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[17px]">{d.armazem}</h3>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[12.5px] font-medium', d.saida ? 'bg-success-soft text-success' : 'bg-info-soft text-info')}>
                    {{ AGUARDANDO: 'Aguardando chegada', NA_FILA: 'Na fila', EM_DESCARGA: 'Em descarga', CONCLUIDA: 'Concluída' }[st]}
                  </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {([['Chegada', d.chegada], ['Entrada', d.entrada], ['Saída', d.saida]] as const).map(([rot, val]) => (
                    <div key={rot} className={cn('grid gap-px rounded-[10px] border px-2.5 py-2 text-[13.5px]', val && 'border-brand-green bg-success-soft')}>
                      <b>{rot}</b>
                      <span className="num">{val ? fmtHM(val) + ' registrada' : '—'}</span>
                    </div>
                  ))}
                </div>
                {(esp != null || dur != null) && (
                  <div className="flex flex-wrap gap-2 text-[12.5px]">
                    {esp != null && <span className="rounded-full bg-secondary px-2.5 py-0.5">Espera {fmtDur(esp)}</span>}
                    {dur != null && <span className="rounded-full bg-secondary px-2.5 py-0.5">Descarga {fmtDur(dur)}</span>}
                    {d.chapas != null && <span className="rounded-full bg-secondary px-2.5 py-0.5">{d.chapas} chapas</span>}
                  </div>
                )}
                {!fim && !d.chegada && pf('armazem') && (
                  <div><Button disabled={ocupado} onClick={() => void passo(d.id, `/api/descargas/${d.id}/chegada`, {}, 'Chegada registrada.')}>Registrar chegada</Button></div>
                )}
                {!fim && d.chegada && !d.entrada && pf('armazem') && (
                  <div><Button disabled={ocupado || !['AUTORIZADO', 'EM_DESCARGA'].includes(a.status)} onClick={() => void passo(d.id, `/api/descargas/${d.id}/entrada`, {}, 'Descarga iniciada.')}>Iniciar descarga</Button></div>
                )}
                {!fim && d.entrada && !d.saida && pf('armazem') && (
                  <div className="grid gap-3">
                    <Field label="Chapas nesta descarga" className="max-w-[260px]">
                      <Input type="number" min={0} max={100} step={1} value={chapas[d.id] ?? ''} onChange={(e) => setChapas((x) => ({ ...x, [d.id]: e.target.value }))} />
                    </Field>
                    <div>
                      <SecTitulo className="mb-1.5">Equipamentos usados</SecTitulo>
                      <div className="flex flex-wrap gap-1.5">
                        {eqs.map((e) => (
                          <label key={e.id} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px]', sel.includes(e.id) && 'border-primary bg-primary text-primary-foreground')}>
                            <input type="checkbox" className="sr-only" checked={sel.includes(e.id)} onChange={() => setEqSel((x) => ({ ...x, [d.id]: sel.includes(e.id) ? sel.filter((i) => i !== e.id) : [...sel, e.id] }))} />
                            {e.identificacao}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Button
                        disabled={ocupado}
                        onClick={() => {
                          const ch = chapas[d.id]
                          if (ch == null || ch === '' || !Number.isInteger(Number(ch)) || Number(ch) < 0 || Number(ch) > 100) {
                            setErros((x) => ({ ...x, [d.id]: 'Informe a quantidade de chapas (zero se a carga não exigiu).' }))
                            return
                          }
                          void passo(d.id, `/api/descargas/${d.id}/saida`, { quantidadeChapas: Number(ch), equipamentoIds: sel }, 'Descarga finalizada e registrada.')
                        }}
                      >
                        Finalizar descarga
                      </Button>
                    </div>
                  </div>
                )}
                <Erros>{erros[d.id]}</Erros>
              </div>
            )
          })}
          <p className="text-[12.5px] text-muted-foreground">
            O QR Code identifica a entrega; ele não autoriza sozinho o recebimento nem ignora validações. Cada registro usa a hora do servidor e segue as regras do fluxo oficial (chegada ≤ entrada ≤ saída).
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={fecha}>Fechar</Button>
          <Button variant="outline" onClick={() => abrirQr(a.id)}><QrIcon /> Ver QR Code</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Leitor: código digitado, link colado ou câmera ---------- */
function LeitorDialog() {
  const { leitor, fechar, abrirCheckin } = useJanelas()
  if (!leitor) return null
  return (
    <Dialog open onOpenChange={(o) => !o && fechar('leitor')}>
      <DialogContent>
        <DialogHeader><DialogTitle>Conferir entrega por QR Code</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">Leia o QR para consultar o agendamento. A Portaria confere o caminhão e envia as notas ao setor de Insumos.</p>
          <LeitorQr onLocalizar={abrirCheckin} />
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => fechar('leitor')}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
/* ---------- Trocar a própria senha ---------- */
function SenhaDialog() {
  const { senha, fechar } = useJanelas()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [rep, setRep] = useState('')
  const [msg, setMsg] = useState('')
  if (!senha) return null
  async function ok() {
    if (!atual || !nova) return setMsg('Preencha a senha atual e a nova.')
    if (nova !== rep) return setMsg('A repetição não confere com a nova senha.')
    try {
      await POST('/api/auth/senha', { atual, nova })
    } catch (e) {
      return setMsg(errTxt(e))
    }
    fechar('senha')
    setAtual(''); setNova(''); setRep(''); setMsg('')
    avisar('Senha alterada. As outras sessões foram encerradas.')
  }
  return (
    <Dialog open onOpenChange={(o) => !o && fechar('senha')}>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar senha</DialogTitle></DialogHeader>
        <DialogBody>
          <Field label="Senha atual"><Input type="password" value={atual} autoComplete="current-password" onChange={(e) => setAtual(e.target.value)} /></Field>
          <Field label="Nova senha" hint="de 8 a 100 caracteres"><Input type="password" value={nova} autoComplete="new-password" onChange={(e) => setNova(e.target.value)} /></Field>
          <Field label="Repita a nova senha"><Input type="password" value={rep} autoComplete="new-password" onChange={(e) => setRep(e.target.value)} /></Field>
          <Erros>{msg}</Erros>
          <p className="text-[12.5px] text-muted-foreground">Ao trocar a senha, as suas outras sessões abertas são encerradas.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => fechar('senha')}>Cancelar</Button>
          <Button onClick={() => void ok()}>Alterar senha</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function JanelasGlobais() {
  return (
    <>
      <QrDialog />
      <CheckinDialog />
      <LeitorDialog />
      <SenhaDialog />
    </>
  )
}
