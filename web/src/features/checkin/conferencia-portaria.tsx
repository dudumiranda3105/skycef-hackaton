import { useState } from 'react'
import { Camera, CheckCircle2, FileText, Loader2, Send, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Callout, Erros } from '@/components/comum'
import { POST, errTxt, mapAg, upload } from '@/lib/api'
import { fmtBR, fmtHM, fmtNF, hojeISO } from '@/lib/format'
import { avisar, useDados } from '@/lib/store'
import type { Agendamento } from '@/lib/types'

export const SITUACAO_PORTARIA = {
  AGUARDANDO_DOCUMENTOS: 'Chegada conferida · anexar documentos',
  PENDENTE_INSUMOS: 'Aguardando validação de Insumos',
  DIRECIONADO: 'Destino aprovado por Insumos',
  RECUSADO: 'Recebimento recusado por Insumos',
} as const

export function ConferenciaPortaria({ a, onAtualizado }: { a: Agendamento; onAtualizado: (a: Agendamento) => void }) {
  const { armNome, refresh } = useDados()
  const [placa, setPlaca] = useState('')
  const [destinatario, setDestinatario] = useState(false)
  const [notas, setNotas] = useState<number[]>([])
  const [arquivos, setArquivos] = useState<Record<number, File>>({})
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const p = a.portaria
  const ativas = a.nfs.filter((n) => n.ativa)
  const atraso = Math.max(0, Math.floor((Date.now() - new Date(`${a.data}T${a.horario}:00-03:00`).getTime()) / 60000))

  async function atualizar(resposta: unknown) {
    onAtualizado(mapAg(resposta, armNome))
    try { await refresh() } catch (e) { avisar(`Registro salvo. A atualização da lista falhou: ${errTxt(e)}`, true) }
  }

  async function conferir() {
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return setErro('Informe a placa que você conferiu no caminhão (ABC1234 ou ABC1D23).')
    if (a.placaVeiculo && a.placaVeiculo !== placa) return setErro('A placa do caminhão não corresponde à placa prevista neste agendamento. Confira os documentos antes de continuar.')
    if (!destinatario || notas.length !== ativas.length || !ativas.length) return setErro('Confira o destinatário e todas as notas fiscais desta entrega.')
    setErro(''); setOcupado(true)
    try {
      const resposta = await POST(`/api/agendamentos/${a.id}/portaria/conferencia`, {
        placa, destinatarioConfirmado: destinatario, notasConferidas: notas,
      })
      await atualizar(resposta)
      if (resposta.status === 'NAO_RECEBIDO') avisar('O prazo de 30 minutos terminou. A agenda foi perdida; consulte uma nova vaga como não agendado.', true)
      else avisar('Conferência e chegada registradas. Anexe os documentos para enviar a Insumos.')
    } catch (e) { setErro(errTxt(e)) } finally { setOcupado(false) }
  }

  async function enviar() {
    if (ativas.some((n) => !n.arquivo && !arquivos[n.id])) return setErro('Anexe uma foto ou documento de cada nota fiscal antes de enviar.')
    setErro(''); setOcupado(true)
    try {
      for (const n of ativas) {
        const file = arquivos[n.id]
        if (!file) continue
        const form = new FormData()
        form.append('arquivo', file)
        const resposta = await upload(`/api/agendamentos/${a.id}/notas/${n.id}/arquivo`, form)
        onAtualizado(mapAg(resposta, armNome))
        setArquivos((atuais) => { const novos = { ...atuais }; delete novos[n.id]; return novos })
      }
      await atualizar(await POST(`/api/agendamentos/${a.id}/portaria/enviar`, {}))
      avisar('Documentos enviados. A entrega já está na fila do setor de Insumos.')
    } catch (e) { setErro(errTxt(e)) } finally { setOcupado(false) }
  }

  function selecionar(nota: number, file?: File) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) return setErro('Cada documento deve ter até 10 MB.')
    if (!/\.(xml|pdf|jpe?g|png|webp)$/i.test(file.name)) return setErro('Use XML, PDF, JPG, PNG ou WebP. Se a câmera gerou HEIC, salve a foto como JPG.')
    setErro('')
    setArquivos((atuais) => ({ ...atuais, [nota]: file }))
  }

  if (p && p.situacao !== 'AGUARDANDO_DOCUMENTOS') return (
    <div className="grid gap-3 rounded-xl border bg-secondary/30 p-4">
      <Callout tom={p.situacao === 'RECUSADO' ? 'ruim' : p.situacao === 'DIRECIONADO' ? 'ok' : 'aviso'}>
        <b>{SITUACAO_PORTARIA[p.situacao]}</b>
        <p className="mt-1">Placa {p.placa} · chegada {a.chegadaEm ? fmtHM(a.chegadaEm) : 'registrada'}</p>
        {p.situacao === 'PENDENTE_INSUMOS' && <p className="mt-1">Aguarde a decisão. Esta tela atualiza o retorno automaticamente.</p>}
        {p.observacao && <p className="mt-1">{p.observacao}</p>}
      </Callout>
      {p.situacao === 'DIRECIONADO' && <div className="flex flex-wrap gap-2">{a.descs.map((d) => <span key={d.id} className="inline-flex items-center gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm font-semibold text-info"><Warehouse className="size-4" />{d.armazem}</span>)}</div>}
      {p.decididoEm && <p className="text-xs text-muted-foreground">Decisão registrada às {fmtHM(p.decididoEm)}{p.decididoPorNome ? ` por ${p.decididoPorNome}` : ''}.</p>}
    </div>
  )

  if (!['AUTORIZADO'].includes(a.status)) return <Callout tom="aviso">Esta entrega está {a.status === 'PENDENTE_COMPRAS' ? 'aguardando autorização de Compras' : 'fora da etapa de conferência'}. A Portaria só encaminha entregas autorizadas.</Callout>
  if (a.descs.length && !p) return <Callout>Esta entrega já tem destino definido. Consulte os armazéns na agenda.</Callout>
  if (a.data !== hojeISO()) return <Callout tom="ruim">O QR identifica uma entrega de {fmtBR(a.data)}, às {a.horario}. A conferência de chegada só é permitida no dia da entrega.</Callout>

  return (
    <div className="grid gap-4">
      {!p ? <>
        <Callout>A entrega está autorizada para hoje, às <b>{a.horario}</b>. Confira o caminhão e a documentação antes de registrar a chegada.</Callout>
        {!a.chegadaEm && atraso > 0 && <Callout tom={atraso >= 30 ? 'ruim' : 'aviso'}>
          {atraso <= 15 ? `Atraso de ${atraso} min, dentro da tolerância de 15 minutos.` : atraso < 30 ? `Atraso de ${atraso} min, fora da tolerância. A partir de 30 minutos a agenda é perdida.` : 'O limite de 30 minutos já passou. O servidor verificará a situação; esta entrega precisa ser tratada como não agendada.'}
        </Callout>}
        <Field label="Placa conferida no caminhão" hint={a.placaVeiculo ? `Placa prevista: ${a.placaVeiculo}. As duas precisam corresponder.` : 'A agenda ainda não informa uma placa. Confira pessoalmente o veículo e os documentos do motorista.'}>
          <Input value={placa} maxLength={8} placeholder="ABC1D23" disabled={ocupado} onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} />
        </Field>
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={destinatario} disabled={ocupado} onChange={(e) => setDestinatario(e.target.checked)} /><span>Conferi no documento que o destinatário é a nossa empresa, incluindo razão social e CNPJ, e que a entrega corresponde ao fornecedor deste agendamento.</span></label>
        {ativas.map((n) => <label key={n.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" disabled={ocupado} checked={notas.includes(n.id)} onChange={(e) => setNotas((atuais) => e.target.checked ? [...atuais, n.id] : atuais.filter((id) => id !== n.id))} /><span>Conferi a NF <b>{n.numero ? fmtNF(n.numero) : 'sem número'}</b>{n.chave && <span className="mt-1 block break-all text-xs text-muted-foreground">Chave {n.chave}</span>}</span></label>)}
        <Button disabled={ocupado || !placa || !destinatario || !ativas.length || notas.length !== ativas.length} onClick={() => void conferir()}>{ocupado ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Confirmar caminhão e registrar chegada</Button>
      </> : <>
        <Callout tom="ok">Chegada conferida às <b>{a.chegadaEm ? fmtHM(a.chegadaEm) : fmtHM(p.conferidoEm)}</b>, placa <b>{p.placa}</b>. O horário já está registrado; agora envie os documentos para Insumos.</Callout>
        {ativas.map((n) => <div key={n.id} className="grid gap-3 rounded-xl border p-4">
          <h4 className="font-semibold">NF {n.numero ? fmtNF(n.numero) : 'sem número'}</h4>
          {n.arquivo && <p className="text-sm"><a className="text-primary underline" href={`/api/agendamentos/${a.id}/notas/${n.id}/arquivo`}><FileText className="mr-1 inline size-4" />{n.arquivo}</a><span className="block text-xs text-muted-foreground">Este documento será enviado, ou você pode substituí-lo pela foto conferida.</span></p>}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Camera className="size-4" />Tirar foto<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={ocupado} onChange={(e) => selecionar(n.id, e.target.files?.[0])} /></label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><FileText className="size-4" />Escolher arquivo<input type="file" accept=".xml,.pdf,.jpg,.jpeg,.png,.webp" className="sr-only" disabled={ocupado} onChange={(e) => selecionar(n.id, e.target.files?.[0])} /></label>
          </div>
          {arquivos[n.id] && <p className="text-sm text-success">Selecionado: {arquivos[n.id].name}</p>}
        </div>)}
        <Button disabled={ocupado || ativas.some((n) => !n.arquivo && !arquivos[n.id])} onClick={() => void enviar()}>{ocupado ? <Loader2 className="animate-spin" /> : <Send />}Enviar documentos para Insumos</Button>
      </>}
      <Erros>{erro}</Erros>
    </div>
  )
}
