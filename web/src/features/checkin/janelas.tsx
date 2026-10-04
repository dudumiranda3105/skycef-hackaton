import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPlus, Copy, Loader2, QrCode as QrIcon, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AcondBadge, Callout, Erros, OrigemBadge, SecTitulo, StatusBadge } from '@/components/comum'
import { GET, POST, dStatus, errTxt } from '@/lib/api'
import { fmtBR, fmtDur, fmtHM, fmtNF, minDiff } from '@/lib/format'
import { qrSvg } from '@/lib/qr'
import { avisar, useAuth, useDados } from '@/lib/store'
import { useJanelas } from '@/lib/janelas'
import { codigoAg, baixarIcs, idDoCodigo, linkCheckin } from './util'
import { cn } from '@/lib/utils'

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
  const { agById, fornById, equip, refresh } = useDados()
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [chapas, setChapas] = useState<Record<number, string>>({})
  const [eqSel, setEqSel] = useState<Record<number, number[]>>({})
  const [erros, setErros] = useState<Record<number, string>>({})

  useEffect(() => {
    if (checkin == null) return
    setCarregando(true)
    refresh().finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkin])

  if (checkin == null) return null
  const a = agById(checkin)
  const fecha = () => fechar('checkin')

  async function passo(descId: number | null, rota: string, corpo: unknown, msg: string) {
    setOcupado(true)
    try {
      await POST(rota, corpo)
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
          {!fim && !a.descs.length && (
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
                {!fim && !d.chegada && (
                  <div><Button disabled={ocupado} onClick={() => void passo(d.id, `/api/descargas/${d.id}/chegada`, {}, 'Chegada registrada.')}>Registrar chegada</Button></div>
                )}
                {!fim && d.chegada && !d.entrada && (
                  <div><Button disabled={ocupado || !['AUTORIZADO', 'EM_DESCARGA'].includes(a.status)} onClick={() => void passo(d.id, `/api/descargas/${d.id}/entrada`, {}, 'Descarga iniciada.')}>Iniciar descarga</Button></div>
                )}
                {!fim && d.entrada && !d.saida && (
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
  const [cod, setCod] = useState('')
  const [msg, setMsg] = useState('')
  const [camera, setCamera] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const fluxo = useRef<MediaStream | null>(null)
  const temCamera = typeof (window as any).BarcodeDetector !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const parar = () => {
    fluxo.current?.getTracks().forEach((t) => t.stop())
    fluxo.current = null
    setCamera(false)
  }
  useEffect(() => () => parar(), [])
  useEffect(() => {
    if (!leitor) parar()
  }, [leitor])

  if (!leitor) return null
  const ir = (id: number) => {
    parar()
    abrirCheckin(id)
  }
  async function ligar() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      fluxo.current = s
      setCamera(true)
      await new Promise((r) => setTimeout(r, 50))
      const v = video.current!
      v.srcObject = s
      await v.play()
      const det = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
      const laco = async () => {
        if (!fluxo.current) return
        try {
          const r = await det.detect(v)
          if (r.length) {
            const id = idDoCodigo(r[0].rawValue)
            if (id) return ir(id)
          }
        } catch {
          /* tenta no próximo quadro */
        }
        setTimeout(laco, 350)
      }
      void laco()
    } catch (e) {
      parar()
      setMsg(`Não foi possível usar a câmera (${errTxt(e)}). Digite o código da entrega.`)
    }
  }
  function localizar() {
    const id = idDoCodigo(cod)
    if (!id) return setMsg('Informe o código no formato AG-0012 ou cole o link do QR.')
    ir(id)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && fechar('leitor')}>
      <DialogContent>
        <DialogHeader><DialogTitle>Check-in por QR Code</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">Aponte a câmera do celular para o QR da entrega (ele abre direto o check-in) ou digite o código impresso abaixo do QR.</p>
          <Field label="Código da entrega ou link do QR">
            <Input value={cod} autoFocus placeholder="Ex.: AG-0012" onChange={(e) => setCod(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && localizar()} />
          </Field>
          {temCamera && !camera && <div><Button variant="outline" onClick={() => void ligar()}><ScanLine /> Ler com a câmera deste computador</Button></div>}
          {camera && <video ref={video} playsInline muted className="w-full max-w-[420px] rounded-xl" />}
          <Erros>{msg}</Erros>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => fechar('leitor')}>Fechar</Button>
          <Button onClick={localizar}>Localizar entrega</Button>
        </DialogFooter>
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

/* ---------- Conferência do cálculo oficial contra a API ---------- */
function VerificarDialog() {
  const { verificar, fechar } = useJanelas()
  const { armId } = useDados()
  const [res, setRes] = useState<{ ok: boolean; nome: string; det: string }[] | null>(null)
  useEffect(() => {
    if (!verificar) {
      setRes(null)
      return
    }
    let vivo = true
    ;(async () => {
      const ids = ['CHAPA_08', 'CHAPA_09', 'CHAPA_15', 'CHAPA_48', 'CHAPA_37', 'CHAPA_38', 'CHAPA_41', 'CHAPA_42', 'CHAPA_43', 'CHAPA_49', 'CHAPA_30']
      const adubo = armId('Adubo') ?? 2
      const linhas = [{ tipoItem: 'FERTILIZANTES', descarga: 2778 }, { tipoItem: 'AGROQUIMICO', descarga: 30 }, { tipoItem: 'SERVICOS_DIVERSOS', descarga: 40 }]
      const eq = (n: number, m: number) => ids.slice(0, n + m).map((c, i) => ({ matricula: c, tipoDiaria: i < n ? 'COMPLETA' : 'MEIA' }))
      const casos: [string, ReturnType<typeof eq>, Record<string, string>][] = [
        ['Exemplo oficial (Adubo, 17/11/2025, 11 completas)', eq(11, 0), { producaoTotal: '918.20', valorPorDiaria: '83.47', totalAPagar: '991.90', complemento: '73.71' }],
        ['Variação (10 completas + 1 meia)', eq(10, 1), { producaoTotal: '918.20', valorPorDiaria: '87.45', totalAPagar: '946.82', complemento: '28.62' }],
      ]
      const out: { ok: boolean; nome: string; det: string }[] = []
      try {
        const h = await GET<{ status: string }>('/health')
        out.push({ ok: h?.status === 'ok', nome: 'API no ar (/health)', det: JSON.stringify(h) })
      } catch (e) {
        out.push({ ok: false, nome: 'API no ar (/health)', det: errTxt(e) })
      }
      for (const [nome, equipe, esp] of casos) {
        try {
          const r = await POST('/api/boletins/calculo', { armazemId: adubo, data: '2025-11-17', linhas, equipe })
          const got = r.exibicao || {}
          const falhas = Object.entries(esp).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k}: esperado ${v}, veio ${got[k]}`)
          out.push({ ok: !falhas.length, nome: `${nome} → R$ ${esp.producaoTotal.replace('.', ',')} · ${esp.totalAPagar.replace('.', ',')} · complemento ${esp.complemento.replace('.', ',')}`, det: falhas.join('; ') })
        } catch (e) {
          out.push({ ok: false, nome, det: errTxt(e) })
        }
      }
      if (vivo) setRes(out)
    })()
    return () => {
      vivo = false
    }
  }, [verificar, armId])
  if (!verificar) return null
  const ok = res?.filter((t) => t.ok).length ?? 0
  return (
    <Dialog open onOpenChange={(o) => !o && fechar('verificar')}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Conferência do cálculo oficial</DialogTitle></DialogHeader>
        <DialogBody>
          {!res ? <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Conferindo com a API…</p> : (
            <>
              <Callout tom={ok === res.length ? 'ok' : 'ruim'}>
                <b>{ok} de {res.length} conferências passaram.</b> Estes números vêm da API em tempo real: o exemplo do Dossiê (R$ 918,20 / 991,90 / 73,71) e a variação com uma meia diária (R$ 946,82 / 28,62). Nada é gravado.
              </Callout>
              <ul className="grid gap-2 text-sm">
                {res.map((t) => (
                  <li key={t.nome} className="flex gap-2.5">
                    <span className={cn('h-fit rounded-full px-2.5 py-0.5 text-[12.5px] font-medium', t.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive')}>{t.ok ? 'ok' : 'falhou'}</span>
                    <span>{t.nome}{!t.ok && <><br /><small className="text-destructive">{t.det}</small></>}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => fechar('verificar')}>Fechar</Button></DialogFooter>
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
      <VerificarDialog />
    </>
  )
}
