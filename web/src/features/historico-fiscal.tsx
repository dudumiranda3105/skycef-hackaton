import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CabecalhoPagina, Callout, Painel, Vazio } from '@/components/comum'
import { GET, errTxt } from '@/lib/api'

type NotaFiscal = {
  id: number
  chaveAcesso: string | null
  numero: string | null
  dataEmissao: string | null
  emitenteCnpj: string | null
  emitenteNome: string | null
  destinatarioNome: string | null
  valorTotal: number | null
  pesoBrutoKg: number | null
  pesoLiquidoKg: number | null
  quantidadeItens: number
  danfeDisponivel: boolean
  arquivoOrigem: string
}
type Anexo = { id: number; arquivoOrigem: string; sha256: string }

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v: string | null) => v ? new Intl.DateTimeFormat('pt-BR').format(new Date(v)) : 'Não informado na nota'

export function HistoricoFiscal() {
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const [nf, pdfs] = await Promise.all([
        GET<NotaFiscal[]>('/api/historico/notas-fiscais'),
        GET<Anexo[]>('/api/historico/danfes-sem-vinculo'),
      ])
      setNotas(nf)
      setAnexos(pdfs)
    } catch (e) { setErro(errTxt(e)) }
    finally { setCarregando(false) }
  }
  useEffect(() => { void carregar() }, [])

  const exibidas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    if (!termo) return notas
    return notas.filter((n) => [n.numero, n.chaveAcesso, n.emitenteCnpj, n.emitenteNome, n.destinatarioNome]
      .some((v) => v?.toLocaleLowerCase('pt-BR').includes(termo)))
  }, [notas, busca])

  return <div>
    <CabecalhoPagina titulo="Notas fiscais históricas" quem="Documentos do pacote oficial" sub="Consulta dos XMLs fiscais e DANFEs fornecidos para o Hackathon 2026." acoes={<Button variant="outline" onClick={() => void carregar()} disabled={carregando}><RefreshCw className="mr-2 size-4" />Atualizar</Button>} />
    <Callout tom="aviso" className="mb-5"><b>Arquivo histórico:</b> estes documentos foram arquivados como fonte de referência. Eles não criam agendamentos, recebimentos ou registros operacionais atuais. O registro manual abaixo é uma digitalização e não foi transcrito automaticamente.</Callout>
    {erro && <Callout tom="ruim" className="mb-4">{erro}</Callout>}
    <Painel className="mb-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-md border px-3"><Search className="size-4 text-muted-foreground" /><input className="h-10 min-w-0 flex-1 bg-transparent outline-none" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, chave, CNPJ ou emitente" /></label>
        <span className="text-sm text-muted-foreground">{exibidas.length} de {notas.length} notas fiscais</span>
      </div>
      {carregando ? <Vazio>Carregando documentos fiscais…</Vazio> : exibidas.length === 0 ? <Vazio>Nenhuma nota fiscal encontrada.</Vazio> : <div className="max-h-[58vh] overflow-auto">
        <Table><TableHeader><TableRow><TableHead>Emissão</TableHead><TableHead>Nota</TableHead><TableHead>Emitente</TableHead><TableHead>Itens</TableHead><TableHead className="text-right">Total informado</TableHead><TableHead>Arquivos</TableHead></TableRow></TableHeader>
          <TableBody>{exibidas.map((n) => <TableRow key={n.id}>
            <TableCell className="whitespace-nowrap">{dataBR(n.dataEmissao)}</TableCell>
            <TableCell><div>{n.numero || 'Número ausente'}</div><div className="max-w-48 truncate font-mono text-[10px] text-muted-foreground" title={n.chaveAcesso || ''}>{n.chaveAcesso || 'Chave ausente'}</div></TableCell>
            <TableCell className="max-w-64"><div className="truncate" title={n.emitenteNome || ''}>{n.emitenteNome || 'Emitente não informado'}</div><div className="text-xs text-muted-foreground">{n.emitenteCnpj || 'CNPJ ausente'}</div></TableCell>
            <TableCell>{n.quantidadeItens}</TableCell><TableCell className="text-right num">{n.valorTotal == null ? 'Não informado' : dinheiro.format(n.valorTotal)}</TableCell>
            <TableCell><div className="flex gap-2 text-sm"><a className="text-primary underline" href={`/api/historico/notas-fiscais/${n.id}/xml`} target="_blank" rel="noreferrer">XML</a>{n.danfeDisponivel && <a className="text-primary underline" href={`/api/historico/notas-fiscais/${n.id}/pdf`} target="_blank" rel="noreferrer">DANFE</a>}</div></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>}
    </Painel>
    <Painel>
      <h2 className="mb-1 font-semibold">Anexos preservados sem vínculo automático</h2>
      <p className="mb-3 text-sm text-muted-foreground">O nome do arquivo não encontrou correspondência exata com um XML. Os PDFs permanecem disponíveis sem associação presumida.</p>
      {anexos.length === 0 && !carregando ? <p className="text-sm text-muted-foreground">Nenhum DANFE órfão.</p> : <ul className="grid gap-2 text-sm">{anexos.map((a) => <li key={a.id} className="flex items-center justify-between gap-3"><span className="truncate">{a.arquivoOrigem.split('/').at(-1)}</span><a className="flex shrink-0 items-center gap-1 text-primary underline" href={`/api/historico/anexos/${a.id}`} target="_blank" rel="noreferrer">Abrir PDF <ExternalLink className="size-3" /></a></li>)}</ul>}
      <a className="mt-4 inline-flex items-center gap-1 text-sm text-primary underline" href="/api/historico/registro-manual" target="_blank" rel="noreferrer">Abrir digitalização do registro manual <ExternalLink className="size-3" /></a>
    </Painel>
  </div>
}
