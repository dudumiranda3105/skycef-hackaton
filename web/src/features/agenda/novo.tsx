import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Callout, Erros, SecTitulo } from '@/components/comum'
import { ACOND, MAX_UNITIZADOS, SLOTS } from '@/lib/constants'
import { GET, POST, errTxt, mapFornecedor, qs, upload } from '@/lib/api'
import { cnpjValido, fmtCnpj, fmtNF, hojeISO, nfValida, nowLocal, fmtDM } from '@/lib/format'
import { chaveValida, lerNota, type NotaLida } from '@/lib/nf'
import { avisar, useDados } from '@/lib/store'
import { useJanelas } from '@/lib/janelas'
import type { Acond, Fornecedor } from '@/lib/types'
import { cn } from '@/lib/utils'

interface LinhaNf {
  uid: number
  numero: string
  arquivo: File | null
  lendo: boolean
  falha: string
  lido: NotaLida | null
  edNumero: string
  edChave: string
  edPeso: string
  confirmado: boolean
  nota: string
}
const novaLinha = (uid: number): LinhaNf => ({ uid, numero: '', arquivo: null, lendo: false, falha: '', lido: null, edNumero: '', edChave: '', edPeso: '', confirmado: false, nota: '' })

const opcaoForn = (f: Fornecedor) => f.nome + (f.cnpj ? ' · ' + fmtCnpj(f.cnpj) : '')

export function NovoAgendamento({
  inicial, onFechar, onCriado,
}: { inicial: { data?: string; hora?: string; walkin?: boolean }; onFechar: () => void; onCriado: (data: string) => void }) {
  const { forn, setForn, refresh } = useDados()
  const { abrirQr } = useJanelas()
  const walkin = !!inicial.walkin
  const hoje = hojeISO()
  const [fornTxt, setFornTxt] = useState('')
  const [razao, setRazao] = useState('')
  const [cnpjNovo, setCnpjNovo] = useState('')
  const [placa, setPlaca] = useState('')
  const [linhas, setLinhas] = useState<LinhaNf[]>([novaLinha(1)])
  const uid = useRef(2)
  const [acond, setAcond] = useState<Acond | ''>('')
  const [data, setData] = useState(() => {
    let d = inicial.data || hoje
    if (!inicial.data) {
      const x = new Date(d + 'T12:00:00')
      while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1)
      d = x.toISOString().slice(0, 10)
    }
    return d
  })
  const [hora, setHora] = useState(inicial.hora || '')
  const [agenda, setAgenda] = useState<any>(null)
  const [erroAgenda, setErroAgenda] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)

  const resolver = (txt: string): Fornecedor | null => {
    const t = txt.trim().toLowerCase()
    if (!t) return null
    const exato = forn.find((f) => opcaoForn(f).toLowerCase() === t)
    if (exato) return exato
    const dig = t.replace(/\D/g, '')
    if (dig.length === 14) {
      const c = forn.find((f) => f.cnpj === dig)
      if (c) return c
    }
    const cand = forn.filter((f) => f.nome.toLowerCase().includes(t))
    return cand.length === 1 ? cand[0] : null
  }

  /* horários livres vêm da API (a regra de vagas é dela) */
  useEffect(() => {
    let vivo = true
    setAgenda(null)
    setErroAgenda('')
    if (!data) return
    GET('/api/agenda' + qs({ data }))
      .then((a) => vivo && setAgenda(a))
      .catch((e) => vivo && setErroAgenda(errTxt(e)))
    return () => {
      vivo = false
    }
  }, [data])

  const agora = nowLocal().slice(11, 16)
  const estado = (h: string): { ok: boolean; sub: string } => {
    if (!acond || !data) return { ok: false, sub: 'Informe o tipo de carga' }
    if (!agenda) return { ok: false, sub: 'Indisponível' }
    if (!agenda.diaUtil) return { ok: false, sub: 'Sem recebimento' }
    const s = (agenda.slots || []).find((x: any) => x.horario === h)
    if (!s) return { ok: false, sub: 'Indisponível' }
    const cabeAqui = acond === 'BATIDO' ? s.aceitaBatido : s.aceitaPaletizadoOuBigBag
    if (cabeAqui && data === hoje && h < agora && !walkin) return { ok: false, sub: 'Horário já passou' }
    return cabeAqui ? { ok: true, sub: acond === 'BATIDO' ? 'Livre · exclusivo' : `${MAX_UNITIZADOS - s.ocupados} vaga(s)` } : { ok: false, sub: 'Indisponível' }
  }
  const livres = SLOTS.filter((h) => estado(h).ok).length
  useEffect(() => {
    if (hora && !estado(hora).ok) setHora('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, acond, data])
  const bloqueio = agenda && agenda.diaUtil === false ? String(agenda.motivoIndisponivel || 'Sem recebimento neste dia.') : ''
  const semHorario = !!(acond && data && agenda && !livres)
  const mostrarNr = walkin && !!acond && !!data && !!agenda && (!livres || !!bloqueio)

  const atualizar = (u: number, p: Partial<LinhaNf>) => setLinhas((L) => L.map((l) => (l.uid === u ? { ...l, ...p } : l)))

  async function aoEscolherArquivo(u: number, arquivo: File | null) {
    if (!arquivo) {
      atualizar(u, { arquivo: null, lido: null, falha: '', lendo: false, confirmado: false, nota: '' })
      return
    }
    atualizar(u, { arquivo, lendo: true, falha: '', lido: null, confirmado: false, nota: '' })
    try {
      const r = await lerNota(arquivo)
      const f = r.emitCnpj ? forn.find((x) => x.cnpj === r.emitCnpj) : undefined
      const sel = resolver(fornTxt)
      let nota = ''
      if (f && !fornTxt.trim()) {
        setFornTxt(opcaoForn(f))
        nota = `Fornecedor preenchido pelo CNPJ do emitente: ${f.nome}.`
      } else if (f && sel && f.id !== sel.id) nota = `Atenção: o emitente da nota (${f.nome}) é diferente do fornecedor escolhido.`
      else if (r.emitCnpj && !f) nota = `O CNPJ do emitente (${fmtCnpj(r.emitCnpj)}) não está no cadastro de fornecedores.`
      atualizar(u, { lendo: false, lido: r, edNumero: fmtNF(r.numero), edChave: r.chave, edPeso: r.peso, nota })
    } catch (e) {
      atualizar(u, { lendo: false, falha: errTxt(e) })
    }
  }

  function confirmar(l: LinhaNf) {
    const num = fmtNF(l.edNumero)
    const chave = l.edChave.replace(/\D/g, '')
    const peso = l.edPeso.trim().replace(',', '.')
    const m: string[] = []
    if (!num || !nfValida(num)) m.push('informe um número de NF válido')
    if (chave && chave.length !== 44) m.push('a chave de acesso precisa ter 44 dígitos (ou ficar em branco)')
    if (peso && !/^\d+(\.\d{1,3})?$/.test(peso)) m.push('o peso deve ser um número (kg)')
    if (m.length) {
      avisar('Corrija antes de confirmar: ' + m.join('; ') + '.', true)
      return
    }
    atualizar(l.uid, { confirmado: true, numero: num, edNumero: num })
  }

  async function cadastrarForn() {
    const cnpj = cnpjNovo.replace(/\D/g, '')
    if (!razao.trim()) return setErros(['Informe a razão social do fornecedor.'])
    if (!cnpjValido(cnpj)) return setErros(['Informe um CNPJ válido com 14 dígitos.'])
    try {
      const f = mapFornecedor(await POST('/api/fornecedores', { razaoSocial: razao.trim(), cnpj }))
      setForn([...forn, f].sort((a, b) => a.nome.localeCompare(b.nome)))
      setFornTxt(opcaoForn(f))
      setErros([])
      avisar('Fornecedor cadastrado.')
    } catch (e) {
      setErros([errTxt(e)])
    }
  }

  const efetivas = useMemo(
    () =>
      linhas
        .map((l) => ({
          numero: l.lido && l.confirmado ? fmtNF(l.edNumero) : fmtNF(l.numero),
          chave: l.lido && l.confirmado ? l.edChave.replace(/\D/g, '') : '',
          peso: l.lido && l.confirmado ? l.edPeso.trim().replace(',', '.') : '',
          arquivo: l.arquivo,
          pendente: !!l.lido && !l.confirmado,
        }))
        .filter((n) => n.numero || n.arquivo),
    [linhas],
  )

  async function salvar() {
    const f = resolver(fornTxt)
    const e: string[] = []
    if (!f) e.push('Selecione o fornecedor da lista (ou cadastre um novo).')
    if (placa && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) e.push('Informe uma placa válida (ABC1234 ou ABC1D23).')
    if (!efetivas.length) e.push('Informe ao menos uma nota fiscal (número ou arquivo).')
    const nums = efetivas.map((n) => n.numero).filter(Boolean)
    if (nums.some((n) => !nfValida(n))) e.push('O número da nota fiscal precisa ter de 1 a 9 dígitos e não pode ser só zeros (ex.: 0524).')
    if (new Set(nums).size !== nums.length) e.push('Há notas fiscais repetidas nesta entrega.')
    if (efetivas.some((n) => n.pendente)) e.push('Confirme (ou descarte) os dados lidos da nota fiscal antes de agendar.')
    if (efetivas.some((n) => n.chave && !chaveValida(n.chave))) e.push('A chave de acesso informada não é válida (44 dígitos com dígito verificador). Corrija ou deixe em branco.')
    if (efetivas.some((n) => n.arquivo && !/\.(xml|pdf|jpe?g|png|webp)$/i.test(n.arquivo.name))) e.push('Os anexos precisam ser XML, PDF, JPG, PNG ou WebP.')
    if (efetivas.some((n) => n.arquivo && n.arquivo.size > 10 * 1024 * 1024)) e.push('Cada anexo pode ter no máximo 10 MB.')
    if (!acond) e.push('Escolha o acondicionamento.')
    if (!data) e.push('Escolha a data.')
    else if (data < hoje) e.push('A data precisa ser hoje ou futura.')
    if (!hora) e.push('Escolha um horário.')
    setErros(e)
    if (e.length || !f || !acond) return
    setOcupado(true)
    let criado: any
    try {
      criado = await POST('/api/agendamentos', {
        fornecedorId: f.id, data, horario: hora, acondicionamento: acond, agendadoNaHora: walkin,
        placaVeiculo: placa || null,
        notas: efetivas.map((n) => {
          const o: Record<string, unknown> = {}
          if (n.numero) o.nfNumero = n.numero
          if (n.chave) o.nfChave = n.chave
          if (n.peso) o.pesoTotalKg = Number(n.peso)
          return o
        }),
      })
    } catch (err) {
      setErros([errTxt(err)])
      setOcupado(false)
      return
    }
    const falhas: string[] = []
    for (let i = 0; i < efetivas.length; i++) {
      const arq = efetivas[i].arquivo
      if (!arq) continue
      const fd = new FormData()
      fd.append('arquivo', arq)
      try {
        await upload(`/api/agendamentos/${criado.id}/notas/${criado.notas[i].id}/arquivo`, fd)
      } catch (err) {
        falhas.push(`${arq.name}: ${errTxt(err)}`)
      }
    }
    if (walkin) {
      try {
        await POST(`/api/agendamentos/${criado.id}/chegada`, {})
      } catch (err) {
        falhas.push('Chegada não registrada: ' + errTxt(err))
      }
    }
    await refresh()
    onCriado(data)
    onFechar()
    avisar(`Agendamento criado para ${fmtDM(data)} às ${hora}. Aguardando Compras.`)
    if (falhas.length) setTimeout(() => avisar('O agendamento foi criado, mas houve problema com o anexo. ' + falhas.join(' | '), true), 600)
    setTimeout(() => abrirQr(criado.id, true), 350)
  }

  async function naoRecebido() {
    const f = resolver(fornTxt)
    if (!f) return setErros(['Selecione o fornecedor para registrar o não recebimento.'])
    try {
      await POST('/api/nao-recebimentos', { motivo: 'SEM_AGENDAMENTO_SEM_VAGA', fornecedorId: f.id, data: data || hoje })
    } catch (err) {
      return setErros([errTxt(err)])
    }
    await refresh()
    onFechar()
    avisar('Não recebimento registrado: chegou sem agendamento e sem vaga.')
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{walkin ? 'Chegou sem agendamento' : 'Novo agendamento'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {walkin && (
            <Callout tom="aviso">
              Sem agendamento, o caminhão só descarrega se houver vaga. Se houver, o agendamento é feito agora, a chegada é registrada e ele segue para Compras. Se não houver, registre o não recebimento.
            </Callout>
          )}
          <Field label="Fornecedor">
            <Input list="forn-lista" value={fornTxt} onChange={(e) => setFornTxt(e.target.value)} autoComplete="off" placeholder="Digite o nome ou o CNPJ" />
            <datalist id="forn-lista">
              {forn.map((f) => (
                <option key={f.id} value={opcaoForn(f)} />
              ))}
            </datalist>
          </Field>
          <Field label="Placa prevista do caminhão" hint="Se já definida, será comparada com a placa conferida na Portaria.">
            <Input value={placa} maxLength={8} placeholder="ABC1D23" onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} />
          </Field>
          <details className="text-sm">
            <summary className="cursor-pointer text-[13.5px] text-muted-foreground">Fornecedor não está na lista? Cadastrar</summary>
            <div className="mt-2 grid gap-3.5 sm:grid-cols-2">
              <Field label="Razão social"><Input value={razao} maxLength={200} onChange={(e) => setRazao(e.target.value)} /></Field>
              <Field label="CNPJ *" hint="14 dígitos válidos"><Input required value={cnpjNovo} inputMode="numeric" maxLength={18} onChange={(e) => setCnpjNovo(e.target.value)} /></Field>
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void cadastrarForn()}>Cadastrar e selecionar</Button>
          </details>

          <div className="grid gap-2">
            <div>
              <SecTitulo>Notas fiscais da entrega</SecTitulo>
              <p className="text-[12.5px] text-muted-foreground">Número da NF no padrão de 4 dígitos: 524 vira 0524. XML e PDF sugerem os dados; uma foto fica anexada para o setor de Insumo conferir e distribuir ao armazém.</p>
            </div>
            {linhas.map((l) => (
              <div key={l.uid} className="grid gap-2">
                <div className="grid grid-cols-[150px_1fr_auto] items-center gap-2 max-sm:grid-cols-1">
                  <Input
                    className="num tracking-wide" inputMode="numeric" maxLength={9} placeholder="0000" aria-label="Número da NF, padrão de 4 dígitos"
                    value={l.lido && l.confirmado ? l.edNumero : l.numero}
                    onChange={(e) => atualizar(l.uid, { numero: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                    onBlur={(e) => atualizar(l.uid, { numero: fmtNF(e.target.value) })}
                    disabled={!!l.lido && l.confirmado}
                  />
                  <input
                    type="file" accept=".xml,.pdf,image/jpeg,image/png,image/webp" capture="environment" aria-label="Arquivo da NF (XML, PDF ou foto, até 10 MB)"
                    className="min-w-0 rounded-lg border border-input bg-card px-2 py-1.5 text-[13px] file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-[13px]"
                    onChange={(e) => void aoEscolherArquivo(l.uid, e.target.files?.[0] ?? null)}
                  />
                  <Button
                    size="icon" variant="ghost" aria-label="Remover NF"
                    onClick={() => setLinhas((L) => (L.length > 1 ? L.filter((x) => x.uid !== l.uid) : [novaLinha(l.uid)]))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {l.lendo && <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Lendo a nota…</p>}
                {l.falha && (
                  <Callout tom="aviso">
                    <b>Não foi possível ler a nota automaticamente.</b> {l.falha} O agendamento continua normal: informe o número da NF à mão. O arquivo ainda será anexado.
                  </Callout>
                )}
                {l.lido && (
                  <div className="grid gap-2.5 rounded-xl border-[1.5px] border-dashed border-info bg-info-soft p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="flex items-center gap-1.5"><FileText className="size-4" /> Dados lidos da nota ({l.lido.fonte})</b>
                      <Badge tom={l.confirmado ? 'ok' : 'aviso'}>{l.confirmado ? 'Confirmado' : 'Confirme ou corrija'}</Badge>
                    </div>
                    <p className="text-[12.5px] text-muted-foreground">A leitura só reduz digitação: ela não aprova a entrega e não substitui a validação da nota contra o pedido feita por Compras.</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Número da NF">
                        <Input value={l.edNumero} inputMode="numeric" maxLength={9} onChange={(e) => atualizar(l.uid, { edNumero: e.target.value.replace(/\D/g, ''), confirmado: false })} />
                      </Field>
                      <Field
                        className="sm:col-span-2"
                        label="Chave de acesso"
                        hint={l.edChave ? (chaveValida(l.edChave.replace(/\D/g, '')) ? 'dígito verificador confere' : 'dígito verificador não confere') : 'não encontrada'}
                      >
                        <Input value={l.edChave} inputMode="numeric" maxLength={44} onChange={(e) => atualizar(l.uid, { edChave: e.target.value, confirmado: false })} />
                      </Field>
                      <Field label="Peso" hint={l.lido.pesoTipo ? `${l.lido.pesoTipo} (kg)` : 'kg, opcional'}>
                        <Input value={l.edPeso} inputMode="decimal" onChange={(e) => atualizar(l.uid, { edPeso: e.target.value, confirmado: false })} />
                      </Field>
                      <div className="grid gap-1 text-[13.5px]"><span className="font-medium">Volumes</span><b className="num">{l.lido.volumes || '—'}</b></div>
                      <div className="grid gap-1 text-[13.5px]"><span className="font-medium">Emitente</span><b>{l.lido.emitNome || fmtCnpj(l.lido.emitCnpj) || '—'}</b></div>
                    </div>
                    {l.lido.itens.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer">{l.lido.itens.length} item(ns) lido(s)</summary>
                        <ul className="mt-1 grid list-disc gap-0.5 pl-[18px]">
                          {l.lido.itens.slice(0, 12).map((i, k) => <li key={k}>{i.desc} · {i.qtd} {i.un}</li>)}
                          {l.lido.itens.length > 12 && <li>… e mais {l.lido.itens.length - 12}</li>}
                        </ul>
                      </details>
                    )}
                    {(l.nota || l.lido.extras) && <p className="text-[12.5px]">{[l.nota, l.lido.extras].filter(Boolean).join(' · ')}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" disabled={l.confirmado} onClick={() => confirmar(l)}>Confirmar dados</Button>
                      <Button size="sm" variant="outline" onClick={() => atualizar(l.uid, { lido: null, arquivo: null, confirmado: false, nota: '' })}><X /> Descartar leitura</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div>
              <Button size="sm" variant="outline" onClick={() => setLinhas((L) => [...L, novaLinha(uid.current++)])}><Plus /> Adicionar outra nota fiscal</Button>
            </div>
          </div>

          <div>
            <SecTitulo className="mb-1.5">Acondicionamento (um por caminhão)</SecTitulo>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {(Object.keys(ACOND) as Acond[]).map((k) => (
                <label
                  key={k}
                  className={cn('relative grid cursor-pointer gap-px rounded-[10px] border-[1.5px] bg-card px-2.5 py-2', acond === k && 'shadow-[0_0_0_1px_var(--c)]')}
                  style={{ borderLeft: `5px solid ${ACOND[k].cor}`, ['--c' as string]: ACOND[k].cor, borderColor: acond === k ? ACOND[k].cor : undefined, background: acond === k ? `color-mix(in srgb, ${ACOND[k].cor} 10%, var(--card))` : undefined }}
                >
                  <input type="radio" name="na-ac" className="sr-only" checked={acond === k} onChange={() => setAcond(k)} />
                  <b className="text-sm">{ACOND[k].nome}</b>
                  <small className="text-[12.5px] leading-tight text-muted-foreground">{ACOND[k].desc}</small>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Data"><Input type="date" value={data} min={hoje} onChange={(e) => setData(e.target.value)} /></Field>
          </div>
          <div>
            <SecTitulo className="mb-1.5">Horário</SecTitulo>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SLOTS.map((h) => {
                const s = estado(h)
                return (
                  <button
                    key={h} type="button" disabled={!s.ok} onClick={() => setHora(h)}
                    className={cn(
                      'grid cursor-pointer gap-px rounded-[10px] border-[1.5px] bg-card p-2 text-left disabled:cursor-not-allowed disabled:bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--secondary)_6px_7px)] disabled:opacity-50',
                      hora === h && 'border-primary bg-info-soft shadow-[0_0_0_1px_var(--primary)]',
                    )}
                  >
                    <b className="font-display text-[17px]">{h}</b>
                    <small className="text-[12.5px] text-muted-foreground">{s.sub}</small>
                  </button>
                )
              })}
            </div>
          </div>
          <Erros>
            {erroAgenda || bloqueio || (semHorario ? `Sem horário disponível neste dia para ${ACOND[acond as Acond].nome.toLowerCase()}. Escolha outra data.` : '')}
            {erros.map((x) => <div key={x}>{x}</div>)}
          </Erros>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          {mostrarNr && <Button variant="danger" onClick={() => void naoRecebido()}>Registrar não recebimento</Button>}
          <Button disabled={ocupado} onClick={() => void salvar()}>{ocupado && <Loader2 className="animate-spin" />}{walkin ? 'Agendar agora' : 'Agendar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

