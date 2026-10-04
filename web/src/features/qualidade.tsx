import { useEffect, useMemo, useState } from 'react'
import { HelpCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CabecalhoPagina, Callout, Lista, Painel, SecTitulo } from '@/components/comum'
import { GET, errTxt } from '@/lib/api'
import { fmtBR, mLabel, monthsBetween, nf0, nf1 } from '@/lib/format'
import { useDados } from '@/lib/store'
import type { Historico } from '@/lib/painelDados'

export const INCONSISTENCIAS_HIST: [string, string, string][] = [
  ['Linhas 100% duplicadas na movimentação', '540', 'Descartadas (41.779 → 41.239 linhas)'],
  ['Uma linha por item, não por caminhão', '41.239 linhas → 18.821 recebimentos', 'A carga é o recebimento (data, nº, armazém); contar linhas inflaria a demanda'],
  ['Recebimentos por dia × caminhões informados', 'mediana de 15 por dia, contra 5 a 6 no Dossiê', 'Recebimento usado só como índice relativo de demanda; a confirmar com a Cocapec'],
  ['Recebimentos em sábados', '21 linhas em 5 dias', 'Preservados e contados; a análise de equipe usa só segunda a sexta'],
  ['Data de recebimento anterior à data do documento', '308', 'Preservadas e contadas (provável lançamento retroativo)'],
  ['Coluna de peso inutilizável', 'mediana do Adubo ≈ 573 toneladas por recebimento', 'Peso não é usado em nenhum cálculo'],
  ['Chave de acesso ausente', '224', 'Guardada como nula'],
  ['Chave de acesso malformada (≠ 44 dígitos)', '111', 'Guardada como nula'],
  ['Depósitos fora do Dossiê', '11 linhas', 'Ficam fora da quebra por armazém; contados'],
  ['Folha sem ago e dez de 2025; jan de 2025 com 5 dias', '2 meses + 1 parcial', 'Meses com menos de 10 dias de folha ficam fora do saldo'],
  ['Folha de sábado', '72 dias', 'Fora do saldo: sábado é organização de estoque'],
  ['Código do item do XML é do fornecedor', '837 de 838 itens não casam', 'Amarração pelo pedido de compra validado por Compras, não pelo código do XML'],
  ['NF-e sem peso bruto na amostra de XML', '29 de 460', 'Usa-se o peso líquido quando existe'],
  ['Peso e quantidade repetidos em recebimentos parciais', '1.281 pares pedido-item (levantamento anterior, não reverificado)', 'Não se somam peso nem quantidade como carga'],
]

const pct = (a: number, b: number) => (b ? `${nf1.format((a / b) * 100)}%` : '—')
const intervalo = (ds: (string | null | undefined)[]) => {
  const limpo = ds.filter((d): d is string => Boolean(d)).sort()
  return limpo.length ? `${fmtBR(limpo[0])} a ${fmtBR(limpo[limpo.length - 1])}` : 'sem registros'
}
const contaPor = <T,>(arr: T[], k: keyof T) => {
  const c: Record<string, number> = {}
  arr.forEach((x) => {
    const v = String(x[k] ?? '')
    c[v] = (c[v] || 0) + 1
  })
  return c
}
const txtOrig = (c: Record<string, number>) =>
  Object.entries(c)
    .map(([k, v]) => `${nf0.format(v)} ${k.toLowerCase()}`)
    .join(' · ') || '—'

export function Qualidade() {
  const { ags, boletins, forn } = useDados()
  const [hist, setHist] = useState<Historico | null>(null)
  const [op, setOp] = useState<any>(null)
  const [plat, setPlat] = useState<any>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<[string, string, string, string, string] | null>(null)

  const carregar = async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [h, o, p] = await Promise.all([
        GET<Historico>('/api/painel/dimensionamento/historico'),
        GET<any>('/api/painel/operacao'),
        GET<any>('/api/painel/dimensionamento/plataforma'),
      ])
      setHist(h)
      setOp(o)
      setPlat(p)
    } catch (e) {
      setErro(errTxt(e))
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const ds = useMemo(() => ags.flatMap((a) => a.descs), [ags])
  const concl = useMemo(() => ds.filter((d) => d.saida), [ds])
  const semNum = ags.filter((a) => a.nfs.every((n) => !n.numero)).length
  const semArq = ags.filter((a) => a.nfs.some((n) => !n.arquivo)).length
  const incons = boletins.filter((b) => b.situacao !== 'CONSISTENTE').length
  const semCnpj = forn.filter((f) => !f.cnpj).length
  const descSem = {
    chegada: ds.filter((d) => d.entrada && !d.chegada).length,
    chapas: concl.filter((d) => d.chapas == null).length,
  }

  const meses = useMemo(() => (hist?.meses || []).map((m) => m.mes), [hist])
  const primeiro = meses[0]
  const ultimo = meses[meses.length - 1]
  const lacunas = useMemo(() => {
    if (!meses.length || !primeiro || !ultimo) return []
    return monthsBetween(primeiro, ultimo).filter((m) => !meses.includes(m))
  }, [meses, primeiro, ultimo])

  const sobre: [string, string, string, string, string][] = useMemo(
    () => [
      ['Cargas recebidas por dia', 'recebimentos-destino únicos ÷ dias úteis com folha', 'Histórico Cocapec', hist?.meses ? `${nf0.format(hist.meses.reduce((s, x) => s + x.diasUteis, 0))} dias úteis em ${meses.length} mês(es)` : '—', 'Um recebimento não é um caminhão; unidade documental.'],
      ['Sobra ou falta (histórico)', 'chapas presentes − esforço do mês ÷ equilíbrio do histórico', 'Histórico Cocapec', `${nf0.format(hist?.equilibrio?.diasUteisAnalisados ?? 0)} dias úteis analisados`, 'Relativo ao próprio histórico; ordem de grandeza, não economia comprovada.'],
      ['Sobra ou falta (plataforma)', 'sobra = Σ complemento; falta = Σ (produção − piso × diárias) quando positivo', 'Boletins da plataforma', `${nf0.format(plat?.total?.boletins ?? 0)} boletim(ns)`, 'Só dias com boletim; inconsistentes ficam fora dos valores.'],
      ['Tempo médio de espera', 'entrada − chegada', 'Nova plataforma', `${nf0.format(op?.tempoMedioEsperaMin?.amostra ?? 0)} descarga(s)`, 'O histórico não registra chegada.'],
      ['Tempo médio de descarga', 'saída − entrada', 'Nova plataforma', `${nf0.format(op?.tempoMedioDescargaMin?.amostra ?? 0)} descarga(s)`, 'Registros incompletos ficam de fora; estimativas do Dossiê não entram.'],
      ['Chapas por descarga', 'média de quantidade_chapas por descarga', 'Nova plataforma', `${nf0.format(op?.chapasPorRecebimento?.amostra ?? 0)} descarga(s)`, 'Não é o efetivo do dia.'],
      ['Custo da operação', 'Σ total a pagar dos boletins consistentes', 'Boletins da plataforma', `${nf0.format(op?.custoDaOperacao?.boletins ?? 0)} boletim(ns)`, 'Sem encargos nem equipamentos (nunca R$ 180 por pessoa).'],
      ['Utilização dos locais', 'horas ocupadas (saída − entrada) por armazém', 'Nova plataforma', `${nf0.format(concl.length)} descarga(s) concluída(s)`, 'Sem percentual oficial: a Cocapec não definiu a fórmula.'],
      ['Fornecedores com maior volume', 'recebimentos distintos por fornecedor', 'Histórico Cocapec', 'todo o histórico', 'A unidade é recebimento, nunca kg.'],
      ['Pressão do Planejamento D-1', 'chapas simultâneas pela norma ÷ equipe de referência', 'Agendamentos + boletins', 'agendamentos do dia', 'Nível, não número exato; limiares são parâmetros do projeto. Máquinas/implementos exigem operador e ao menos 1 chapa, mas o tipo de item não é identificado no agendamento.'],
    ],
    [hist, plat, op, concl, meses],
  )

  return (
    <div className="grid gap-6">
      <CabecalhoPagina
        titulo="Qualidade dos dados"
        quem="Quem usa: direção, gestores e avaliadores"
        sub="De onde vêm os números, quais tratamentos foram aplicados e quais conclusões não podem ser sustentadas com segurança. A solução não mostra só um número: ela explica como chegou nele."
        acoes={
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={carregando ? 'animate-spin' : ''} /> {carregando ? 'Atualizando…' : 'Atualizar'}
          </Button>
        }
      />

      {erro && (
        <Callout tom="ruim">
          Não foi possível carregar alguns dados: {erro}.{' '}
          <Button size="sm" variant="outline" className="ml-2" onClick={() => void carregar()}>Tentar de novo</Button>
        </Callout>
      )}

      <Callout tom="info">
        <b>Como ler:</b> cada indicador tem um cálculo detalhado e informa sua fonte, registros usados e limitações.
      </Callout>

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel>
          <SecTitulo className="text-[17px]">Histórico Cocapec</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Pacote de dados do evento, carregado uma vez e marcado como HISTÓRICO.</p>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Movimentação</TableCell>
                <TableCell className="text-right num">jun/2022 a set/2026 · 41.779 linhas</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Linhas válidas após limpeza</TableCell>
                <TableCell className="text-right num">41.239 · {pct(41239, 41779)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Folha com saldo calculado</TableCell>
                <TableCell className="text-right num">
                  {meses.length && primeiro && ultimo ? `${mLabel(primeiro)} a ${mLabel(ultimo)} · ${meses.length} mês(es)` : 'sem histórico carregado'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Dias úteis analisados</TableCell>
                <TableCell className="text-right num">{nf0.format(hist?.equilibrio?.diasUteisAnalisados ?? 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-4">
            <SecTitulo className="text-sm">Períodos com cobertura incompleta</SecTitulo>
            {lacunas.length || meses.length ? (
              <Lista
                className="mt-2 text-muted-foreground"
                itens={[
                  ...(lacunas.length ? [`Meses sem folha dentro do intervalo: ${lacunas.map(mLabel).join(', ')}.`] : []),
                  'Fora do saldo por regra: meses com menos de 10 dias de folha (jan/2025 parcial; ago e dez/2025 sem folha). O recebimento desses meses aparece na demanda, mas não no saldo.',
                ]}
              />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Sem histórico carregado.</p>
            )}
          </div>
        </Painel>

        <Painel>
          <SecTitulo className="text-[17px]">Nova plataforma</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Registros reais da plataforma, contados agora.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registro</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Completos</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Critério</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Agendamentos</TableCell>
                  <TableCell className="text-right num">{nf0.format(ags.length)}</TableCell>
                  <TableCell className="text-right num">{nf0.format(ags.length - semNum)}</TableCell>
                  <TableCell className="text-right num">{pct(ags.length - semNum, ags.length)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">com ao menos um número de NF</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Descargas</TableCell>
                  <TableCell className="text-right num">{nf0.format(ds.length)}</TableCell>
                  <TableCell className="text-right num">{nf0.format(concl.length)}</TableCell>
                  <TableCell className="text-right num">{pct(concl.length, ds.length)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">com saída registrada</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Descargas concluídas</TableCell>
                  <TableCell className="text-right num">{nf0.format(concl.length)}</TableCell>
                  <TableCell className="text-right num">{nf0.format(concl.length - descSem.chapas)}</TableCell>
                  <TableCell className="text-right num">{pct(concl.length - descSem.chapas, concl.length)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">com chapas informadas</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Boletins</TableCell>
                  <TableCell className="text-right num">{nf0.format(boletins.length)}</TableCell>
                  <TableCell className="text-right num">{nf0.format(boletins.length - incons)}</TableCell>
                  <TableCell className="text-right num">{pct(boletins.length - incons, boletins.length)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">consistentes (com equipe)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Fornecedores</TableCell>
                  <TableCell className="text-right num">{nf0.format(forn.length)}</TableCell>
                  <TableCell className="text-right num">{nf0.format(forn.length - semCnpj)}</TableCell>
                  <TableCell className="text-right num">{pct(forn.length - semCnpj, forn.length)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">com CNPJ</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <Lista
            className="mt-4 text-muted-foreground"
            itens={[
              `Origem dos agendamentos: ${txtOrig(contaPor(ags, 'origem'))}. Boletins: ${txtOrig(contaPor(boletins, 'origem'))}.`,
              `Período coberto: agendamentos ${intervalo(ags.map((a) => a.data))}; boletins ${intervalo(boletins.map((b) => b.data))}.`,
              `Campos ausentes relevantes: ${semArq} agendamento(s) com nota sem arquivo anexado; ${descSem.chapas} descarga(s) concluída(s) sem chapas informadas; ${incons} boletim(ns) inconsistente(s).`,
            ]}
          />
        </Painel>
      </div>

      <Painel>
        <SecTitulo className="text-[17px]">Duplicidades e problemas encontrados no pacote, e o tratamento</SecTitulo>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Contagens da carga documentada em <code>docs/relatorio-gerencial.md</code> (seção 7). Cada uma foi tratada e documentada em vez de escondida.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Problema</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Tratamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INCONSISTENCIAS_HIST.map(([prob, qtd, trat], i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{prob}</TableCell>
                  <TableCell className="text-right num whitespace-nowrap">{qtd}</TableCell>
                  <TableCell className="text-muted-foreground">{trat}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Painel>

      <Painel>
        <SecTitulo className="text-[17px]">Sobre este dado</SecTitulo>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Cada indicador, a fórmula, de onde vem, quantos registros entram e o que limita a leitura.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead>Fórmula</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Registros</TableHead>
                <TableHead>Limitação</TableHead>
                <TableHead>Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sobre.map((item, i) => {
                const [indicador, formula, fonte, registros, limitacao] = item
                return (
                <TableRow key={i}>
                  <TableCell className="font-semibold whitespace-nowrap">{indicador}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formula}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fonte}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{registros}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{limitacao}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => setDetalhe(item)}><HelpCircle className="size-3.5" /> Ver cálculo</Button></TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div>
      </Painel>

      <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detalhe?.[0]} — cálculo e origem</DialogTitle></DialogHeader>
          {detalhe && <DialogBody className="grid gap-3 text-sm">
            <p><b>Fórmula:</b> {detalhe[1]}</p>
            <p><b>Fonte:</b> {detalhe[2]}</p>
            <p><b>Registros considerados:</b> {detalhe[3]}</p>
            <p><b>Limitação:</b> {detalhe[4]}</p>
            <Callout tom="info">Os valores são recalculados com os registros carregados agora. Atualize a página para buscar os dados mais recentes.</Callout>
          </DialogBody>}
        </DialogContent>
      </Dialog>

      <Painel>
        <SecTitulo className="text-[17px]">Limitações conhecidas</SecTitulo>
        <Lista
          className="mt-3 text-muted-foreground"
          itens={[
            ...(hist?.limitacoes ?? []),
            'O histórico nunca registrou chegada, entrada, saída, chapas ou equipamentos por recebimento: esses indicadores só existem na plataforma.',
            'Quando Compras não autoriza uma entrega, a plataforma registra o não recebimento por divergência entre NF e pedido (assunção da equipe, a confirmar com a Cocapec).',
            'As quantidades e preços do boletim seguem o Dossiê; o custo da operação é sempre o total a pagar do boletim.',
          ]}
        />
      </Painel>
    </div>
  )
}
