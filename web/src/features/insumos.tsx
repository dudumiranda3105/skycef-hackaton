import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileText, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CabecalhoPagina, Callout, Painel, Tile, Tiles, Vazio } from '@/components/comum'
import { GET, POST, errTxt, mapAg } from '@/lib/api'
import { fmtBR, fmtCnpj, fmtTS } from '@/lib/format'
import { avisar, useAuth, useDados } from '@/lib/store'
import type { Agendamento } from '@/lib/types'

type Estoque = {
  armazemId: number
  armazem: string
  codigo: string
  descricao: string
  quantidade: number
  arquivoOrigem: string
  linhaOrigem: number
}
type EquipamentoCatalogo = { tipo: string; utilizacao: string; arquivoOrigem: string }

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

function RecebimentoInsumos({ a, aoDecidir }: { a: Agendamento; aoDecidir: () => Promise<void> }) {
  const { eu } = useAuth()
  const { armazens, fornById, refresh } = useDados()
  const fornecedor = fornById(a.fornecedorId)
  const [destinos, setDestinos] = useState<number[]>([])
  const [documentosConferidos, setDocumentosConferidos] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [gravado, setGravado] = useState(false)
  const podeDecidir = eu?.papel === 'ADMIN' || eu?.papel === 'INSUMO'
  const pendente = a.portaria?.situacao === 'PENDENTE_INSUMOS'
  const documentosCompletos = a.nfs.some((n) => n.ativa) && a.nfs.filter((n) => n.ativa).every((n) => !!n.arquivo)

  async function decidir(decisao: 'APROVAR' | 'RECUSAR') {
    setErro('')
    if (decisao === 'APROVAR' && !destinos.length) return setErro('Selecione ao menos um armazém de destino.')
    if (decisao === 'APROVAR' && (!documentosConferidos || !documentosCompletos)) return setErro('Abra os documentos de todas as notas ativas e confirme a conferência antes de direcionar.')
    if (decisao === 'RECUSAR' && !observacao.trim()) return setErro('Informe a justificativa da recusa para a Portaria.')
    setOcupado(true)
    try {
      await POST(`/api/insumos/recebimentos/${a.id}/decisao`, { decisao, armazemIds: decisao === 'APROVAR' ? destinos : [], observacao: observacao.trim() || undefined })
      setGravado(true)
      avisar(decisao === 'APROVAR' ? 'Destino registrado. A Portaria já pode consultar a liberação.' : 'Recusa registrada. A justificativa já está disponível para a Portaria.')
      await refresh()
      await aoDecidir()
    } catch (e) {
      setErro(errTxt(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Painel>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{fornecedor.nome} · agendamento #{a.id}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{fmtBR(a.data)} às {a.horario} · placa <b className="font-mono text-foreground">{a.portaria?.placa || a.placaVeiculo || 'Não informada'}</b></p>
          {fornecedor.cnpj && <p className="text-sm text-muted-foreground">CNPJ {fmtCnpj(fornecedor.cnpj)}</p>}
          <p className="text-sm text-muted-foreground">Chegada {fmtTS(a.chegadaEm)} · conferência na Portaria {fmtTS(a.portaria?.conferidoEm)} · envio {fmtTS(a.portaria?.enviadoEm)}</p>
        </div>
        <span className="rounded-md bg-secondary px-3 py-1 text-sm">{a.portaria?.situacao === 'DIRECIONADO' ? 'Direcionado' : a.portaria?.situacao === 'RECUSADO' ? 'Recusado' : a.portaria?.situacao === 'AGUARDANDO_DOCUMENTOS' ? 'Aguardando documentos' : 'Aguardando Insumos'}</span>
      </div>
      <div className="mb-4 grid gap-2">
        <h4 className="text-sm font-semibold">Notas fiscais e documentos recebidos</h4>
        {a.nfs.length ? a.nfs.map((nota) => (
          <div key={nota.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <div><b>NF {nota.numero || 'sem número'}</b>{!nota.ativa && <span className="ml-2 text-muted-foreground">Inativa</span>}{nota.chave && <p className="break-all font-mono text-xs text-muted-foreground">{nota.chave}</p>}</div>
            {nota.arquivo ? <Button asChild size="sm" variant="outline"><a href={`/api/agendamentos/${a.id}/notas/${nota.id}/arquivo`} target="_blank" rel="noreferrer"><FileText />{nota.arquivo}</a></Button> : <span className="text-destructive">Documento não anexado</span>}
          </div>
        )) : <Vazio>Nenhuma nota vinculada a este recebimento.</Vazio>}
      </div>
      {pendente && podeDecidir && !gravado ? (
        <div className="grid gap-3">
          <fieldset disabled={ocupado} className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Armazéns de destino</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{armazens.map((arm) => <label key={arm.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={destinos.includes(arm.id)} onChange={(e) => setDestinos((atuais) => e.target.checked ? [...atuais, arm.id] : atuais.filter((id) => id !== arm.id))} />{arm.nome}</label>)}</div></fieldset>
          <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={documentosConferidos} disabled={ocupado || !documentosCompletos} onChange={(e) => setDocumentosConferidos(e.target.checked)} />Conferi os documentos de todas as notas ativas, a empresa e o recebimento.</label>
          {!documentosCompletos && <Callout tom="aviso">A Portaria precisa anexar os documentos de todas as notas ativas para permitir o direcionamento.</Callout>}
          <label className="grid gap-1 text-sm">Orientação à Portaria ou justificativa de recusa<textarea rows={3} className="rounded-md border bg-background px-3 py-2" maxLength={250} value={observacao} disabled={ocupado} onChange={(e) => setObservacao(e.target.value)} placeholder="Informe a orientação de entrada ou explique o motivo da recusa." /></label>
          {erro && <Callout tom="ruim">{erro}</Callout>}
          <div className="flex flex-wrap gap-2"><Button disabled={ocupado} onClick={() => void decidir('APROVAR')}><Check />Validar e direcionar</Button><Button variant="danger" disabled={ocupado} onClick={() => void decidir('RECUSAR')}><X />Recusar recebimento</Button></div>
        </div>
      ) : gravado && pendente ? <Callout tom="ok">A decisão foi gravada. {erro ? `Falha ao atualizar a consulta: ${erro}` : 'Atualizando o retorno registrado…'}</Callout> : (
        <Callout tom={a.portaria?.situacao === 'RECUSADO' ? 'aviso' : 'info'}>
          {pendente ? 'Aguardando a validação do setor de Insumos.' : a.portaria?.situacao === 'DIRECIONADO' ? `Destino informado à Portaria: ${a.descs.map((d) => d.armazem).join(', ') || 'Consulte o registro atualizado'}. Decisão em ${fmtTS(a.portaria?.decididoEm)}.` : a.portaria?.situacao === 'RECUSADO' ? `Recebimento recusado em ${fmtTS(a.portaria?.decididoEm)}.` : 'A Portaria ainda precisa completar os documentos e encaminhar o recebimento.'}
          {a.portaria?.observacao && <p className="mt-1 whitespace-pre-wrap">{a.portaria.observacao}</p>}
        </Callout>
      )}
    </Painel>
  )
}

export function Insumos() {
  const { armNome } = useDados()
  const [fila, setFila] = useState<Agendamento[]>([])
  const [carregandoFila, setCarregandoFila] = useState(true)
  const [atualizandoFila, setAtualizandoFila] = useState(false)
  const [erroFila, setErroFila] = useState('')
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const requisicaoFila = useRef(0)
  const [registros, setRegistros] = useState<Estoque[]>([])
  const [equipamentos, setEquipamentos] = useState<EquipamentoCatalogo[]>([])
  const [armazemId, setArmazemId] = useState('')
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregarFila = useCallback(async () => {
    const requisicao = ++requisicaoFila.current
    setAtualizandoFila(true)
    try {
      const recebimentos = await GET<any[]>('/api/insumos/recebimentos')
      if (requisicao !== requisicaoFila.current) return
      setFila(recebimentos.map((r) => mapAg(r, armNome)))
      setErroFila('')
      setAtualizadoEm(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
    } catch (e) {
      if (requisicao === requisicaoFila.current) setErroFila(errTxt(e))
    } finally {
      if (requisicao === requisicaoFila.current) {
        setCarregandoFila(false)
        setAtualizandoFila(false)
      }
    }
  }, [armNome])

  useEffect(() => {
    void carregarFila()
    const atualizarVisivel = () => { if (document.visibilityState === 'visible') void carregarFila() }
    const intervalo = window.setInterval(atualizarVisivel, 15000)
    document.addEventListener('visibilitychange', atualizarVisivel)
    return () => {
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizarVisivel)
      requisicaoFila.current++
    }
  }, [carregarFila])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const [estoques, catalogo] = await Promise.all([
        GET<Estoque[]>('/api/estoques'),
        GET<EquipamentoCatalogo[]>('/api/equipamentos/catalogo-oficial'),
      ])
      setRegistros(estoques)
      setEquipamentos(catalogo)
    } catch (e) {
      setErro(errTxt(e))
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { void carregar() }, [])

  const armazens = useMemo(() => [...new Map(registros.map((r) => [r.armazemId, r.armazem])).entries()], [registros])
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return registros.filter((r) => (!armazemId || String(r.armazemId) === armazemId)
      && (!termo || `${r.codigo} ${r.descricao} ${r.armazem}`.toLocaleLowerCase('pt-BR').includes(termo)))
  }, [registros, armazemId, busca])
  const pendentes = fila.filter((a) => a.portaria?.situacao === 'PENDENTE_INSUMOS')
  const decididos = fila.filter((a) => ['DIRECIONADO', 'RECUSADO'].includes(a.portaria?.situacao || ''))
    .sort((a, b) => (b.portaria?.decididoEm || '').localeCompare(a.portaria?.decididoEm || ''))
  const aguardandoDocumentos = fila.filter((a) => a.portaria?.situacao === 'AGUARDANDO_DOCUMENTOS')

  return (
    <div>
      <CabecalhoPagina titulo="Validação de recebimentos" quem="Setor de Insumos" sub="Confira os caminhões enviados pela Portaria, valide as notas fiscais e informe os armazéns de destino. O retorno aparece na Portaria assim que a decisão é gravada." acoes={<Button variant="outline" onClick={() => void carregarFila()} disabled={atualizandoFila}><RefreshCw className="mr-2 size-4" />Atualizar fila</Button>} />
      <div className="mb-4 flex flex-wrap justify-between gap-2 text-sm"><span><b>{pendentes.length}</b> recebimentos aguardando Insumos</span><span className="text-muted-foreground">{atualizadoEm ? `Última atualização às ${atualizadoEm} · consulta automática a cada 15 s` : 'Consultando os recebimentos…'}</span></div>
      {erroFila && <Callout tom="ruim" className="mb-4">Não foi possível atualizar a fila: {erroFila}{atualizadoEm && <p>Os registros exibidos são da última consulta bem-sucedida.</p>}</Callout>}
      {carregandoFila ? <Vazio>Carregando recebimentos encaminhados pela Portaria…</Vazio> : <div className="grid gap-4">{pendentes.length ? pendentes.map((a) => <RecebimentoInsumos key={a.id} a={a} aoDecidir={carregarFila} />) : !erroFila && <Vazio>Nenhum recebimento aguardando validação de Insumos.</Vazio>}</div>}
      {aguardandoDocumentos.length > 0 && <section className="mt-5"><h2 className="mb-3 text-xl font-semibold">Aguardando documentos na Portaria</h2><div className="grid gap-4">{aguardandoDocumentos.map((a) => <RecebimentoInsumos key={a.id} a={a} aoDecidir={carregarFila} />)}</div></section>}
      {decididos.length > 0 && <section className="mt-5"><h2 className="mb-3 text-xl font-semibold">Retornos registrados para a Portaria</h2><div className="grid gap-4">{decididos.map((a) => <RecebimentoInsumos key={a.id} a={a} aoDecidir={carregarFila} />)}</div></section>}
      <section className="mt-8 border-t pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Estoque de referência</h2><p className="text-sm text-muted-foreground">Inventários oficiais recebidos no pacote do Hackathon 2026.</p></div><Button variant="outline" onClick={() => void carregar()} disabled={carregando}><RefreshCw className="mr-2 size-4" />Atualizar estoque</Button></div>
      <Callout tom="aviso" className="mb-5"><b>Posição atual conforme a fonte:</b> o LEIA-ME descreve estas planilhas como posição de estoque atual, mas não informa a data de corte. Confirme os saldos com o armazém antes de usá-los em uma operação de hoje.</Callout>
      <Tiles className="mb-5">
        <Tile rotulo="Itens de estoque importados" valor={numero.format(registros.length)} sub="Registros das quatro planilhas oficiais" />
        <Tile rotulo="Armazéns com inventário" valor={numero.format(armazens.length)} sub="Conforme o mapeamento por tipo de depósito" />
      </Tiles>
      <Painel>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">Armazém<select className="h-10 min-w-48 rounded-md border bg-background px-3" value={armazemId} onChange={(e) => setArmazemId(e.target.value)}><option value="">Todos</option>{armazens.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
          <label className="grid min-w-64 flex-1 gap-1 text-sm">Buscar item<input className="h-10 rounded-md border bg-background px-3" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código ou descrição" /></label>
          <span className="text-sm text-muted-foreground">{numero.format(filtrados.length)} itens</span>
        </div>
        {erro ? <Callout tom="ruim">{erro}</Callout> : carregando ? <Vazio>Carregando inventários oficiais…</Vazio> : filtrados.length === 0 ? <Vazio>Nenhum item encontrado.</Vazio> : (
          <Table>
            <TableHeader><TableRow><TableHead>Armazém</TableHead><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Quantidade informada</TableHead><TableHead>Arquivo de origem</TableHead></TableRow></TableHeader>
            <TableBody>{filtrados.map((r) => <TableRow key={`${r.arquivoOrigem}:${r.linhaOrigem}`}><TableCell>{r.armazem}</TableCell><TableCell className="font-mono text-xs">{r.codigo}</TableCell><TableCell>{r.descricao}</TableCell><TableCell className="text-right num">{numero.format(r.quantidade)}</TableCell><TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={`${r.arquivoOrigem}, linha ${r.linhaOrigem}`}>{r.arquivoOrigem.split('/').at(-1)} · linha {r.linhaOrigem}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </Painel>
      <Painel className="mt-5">
        <h2 className="mb-1 font-semibold">Equipamentos listados na fonte oficial</h2>
        <p className="mb-4 text-sm text-muted-foreground">O arquivo informa tipos e utilização, mas não informa quantidade nem armazém de lotação. Esses campos não foram presumidos.</p>
        {equipamentos.length === 0 ? <Vazio>O arquivo oficial não contém tipos de equipamento.</Vazio> : (
          <Table><TableHeader><TableRow><TableHead>Equipamento</TableHead><TableHead>Utilização informada</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
            <TableBody>{equipamentos.map((e) => <TableRow key={e.tipo}><TableCell className="font-medium">{e.tipo}</TableCell><TableCell>{e.utilizacao}</TableCell><TableCell className="text-xs text-muted-foreground">{e.arquivoOrigem.split('/').at(-1)}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </Painel>
      </section>
    </div>
  )
}
