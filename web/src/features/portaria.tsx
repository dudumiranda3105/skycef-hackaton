import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Truck, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AcondBadge, CabecalhoPagina, Callout, Erros, StatusBadge, Tile, Tiles, Vazio } from '@/components/comum'
import { GET, errTxt, mapAg, porDataHora } from '@/lib/api'
import { fmtDM, fmtHM, hojeISO } from '@/lib/format'
import { useDados } from '@/lib/store'
import { useRota } from '@/lib/rota'
import { nfsTxt } from '@/features/agenda/agenda'
import { codigoAg } from '@/features/checkin/util'
import { LeitorQr } from '@/features/checkin/leitor-qr'
import { ConferenciaPortaria, SITUACAO_PORTARIA } from '@/features/checkin/conferencia-portaria'
import type { Agendamento } from '@/lib/types'

export function Portaria() {
  const { ags, fornById, armNome, refresh } = useDados()
  const { ir } = useRota()
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  const [modalId, setModalId] = useState<number | null>(null)
  const [registro, setRegistro] = useState<Agendamento | null>(null)
  const hoje = hojeISO()
  const deHoje = useMemo(() => ags.filter((a) => a.data === hoje && (a.portaria || ['AUTORIZADO', 'EM_DESCARGA', 'CONCLUIDO'].includes(a.status))).sort(porDataHora), [ags, hoje])

  async function atualizar() {
    setAtualizando(true); setErro('')
    try { await refresh() } catch (e) { setErro(errTxt(e)) } finally { setAtualizando(false) }
  }

  useEffect(() => {
    let ativo = true
    let emCurso = false
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || emCurso) return
      emCurso = true
      void refresh().then(() => { if (ativo) setErro('') }).catch((e) => { if (ativo) setErro(errTxt(e)) }).finally(() => { emCurso = false })
    }, 15000)
    return () => { ativo = false; window.clearInterval(timer) }
  }, [refresh])

  useEffect(() => {
    if (modalId == null) return
    let ativo = true
    setBuscando(true); setRegistro(null); setErro('')
    void GET(`/api/agendamentos/${modalId}`).then((r) => { if (ativo) setRegistro(mapAg(r, armNome)) }).catch((e) => { if (ativo) setErro(errTxt(e)) }).finally(() => { if (ativo) setBuscando(false) })
    return () => { ativo = false }
  }, [modalId, armNome])

  useEffect(() => {
    if (modalId == null || registro?.portaria?.situacao !== 'PENDENTE_INSUMOS') return
    let ativo = true
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void GET(`/api/agendamentos/${modalId}`).then((r) => { if (ativo) setRegistro(mapAg(r, armNome)) }).catch((e) => { if (ativo) setErro(errTxt(e)) })
    }, 15000)
    return () => { ativo = false; window.clearInterval(timer) }
  }, [modalId, registro?.portaria?.situacao, armNome])

  return (
    <div>
      <CabecalhoPagina titulo="Portaria" quem="Quem usa: porteiro" sub="Confira o caminhão pelo QR, registre a chegada e envie as notas para Insumos decidir o armazém." acoes={<div className="flex gap-2"><Button variant="outline" size="sm" disabled={atualizando} onClick={() => void atualizar()}><RefreshCw className={atualizando ? 'animate-spin' : ''} />Atualizar</Button><Button variant="outline" size="sm" onClick={() => ir('agenda')}>Ver agenda</Button></div>} />
      <div className="mb-5 rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-semibold">Conferir caminhão que chegou</h2>
        <LeitorQr onLocalizar={setModalId} ocupado={buscando} />
      </div>
      <Callout className="mb-5">Depois do envio, a documentação aparece automaticamente na fila de Insumos. A Portaria acompanha aqui a aprovação com os armazéns ou a recusa com a justificativa.</Callout>
      <Tiles className="mb-5">
        <Tile rotulo="Aguardando chegada" valor={deHoje.filter((a) => !a.chegadaEm && a.status === 'AUTORIZADO').length} />
        <Tile rotulo="Anexar documentos" valor={deHoje.filter((a) => a.portaria?.situacao === 'AGUARDANDO_DOCUMENTOS').length} />
        <Tile rotulo="Aguardando Insumos" valor={deHoje.filter((a) => a.portaria?.situacao === 'PENDENTE_INSUMOS').length} />
        <Tile rotulo="Destino aprovado" valor={deHoje.filter((a) => a.portaria?.situacao === 'DIRECIONADO').length} />
      </Tiles>
      <Erros>{erro}</Erros>
      {deHoje.length === 0 ? <Vazio>Nenhuma entrega autorizada ou conferida para hoje. Você pode localizar o QR acima para consultar a situação.</Vazio> : <div className="grid gap-4">
        {deHoje.map((a) => <div key={a.id} className="grid gap-3 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div><h3 className="flex items-center gap-2 text-lg font-bold"><Truck className="size-5 text-muted-foreground" />{fornById(a.fornecedorId).nome}</h3><p className="mt-1 text-sm text-muted-foreground">{codigoAg(a.id)} · {fmtDM(a.data)} às {a.horario} · Notas {nfsTxt(a)}{(a.portaria?.placa || a.placaVeiculo) && ` · Placa ${a.portaria?.placa || a.placaVeiculo}`}</p></div>
            <div className="flex items-start gap-2"><AcondBadge acond={a.acond} /><StatusBadge status={a.status} /></div>
          </div>
          {a.portaria && <Callout tom={a.portaria.situacao === 'RECUSADO' ? 'ruim' : a.portaria.situacao === 'DIRECIONADO' ? 'ok' : 'aviso'}><b>{SITUACAO_PORTARIA[a.portaria.situacao]}</b>{a.portaria.observacao && <p>{a.portaria.observacao}</p>}</Callout>}
          {a.chegadaEm && <p className="text-sm">Chegada registrada às <b>{fmtHM(a.chegadaEm)}</b></p>}
          {a.descs.length > 0 && <div className="flex flex-wrap gap-2">{a.descs.map((d) => <span key={d.id} className="inline-flex items-center gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm font-semibold text-info"><Warehouse className="size-4" />{d.armazem}</span>)}</div>}
          <div><Button variant={a.portaria ? 'outline' : 'accent'} onClick={() => setModalId(a.id)}>{a.portaria?.situacao === 'AGUARDANDO_DOCUMENTOS' ? 'Anexar e enviar documentos' : a.portaria ? 'Ver conferência e retorno' : 'Conferir caminhão'}</Button></div>
        </div>)}
      </div>}
      {modalId != null && <Dialog open onOpenChange={(aberto) => !aberto && setModalId(null)}>
        <DialogContent wide>
          <DialogHeader><DialogTitle>Conferência da Portaria · {codigoAg(modalId)}</DialogTitle></DialogHeader>
          <DialogBody>
            {buscando ? <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Consultando o agendamento…</p> : registro ? <>
              <p className="text-sm"><b>{fornById(registro.fornecedorId).nome}</b> · {fmtDM(registro.data)} às {registro.horario} · Notas {nfsTxt(registro)}</p>
              <ConferenciaPortaria key={registro.id} a={registro} onAtualizado={setRegistro} />
            </> : <Erros>{erro || 'Agendamento não encontrado.'}</Erros>}
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setModalId(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  )
}
