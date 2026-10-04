import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, HelpCircle, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Input, Select } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Badge, Barras, CabecalhoPagina, Callout, OrigemBadge, Painel as PainelContainer, SecTitulo, Tile, Tiles, Vazio,
} from '@/components/comum'
import { Colunas3D, type ItemColuna } from '@/components/charts/cena3d'
import { GET, errTxt, qs } from '@/lib/api'
import { MOTIVOS_NR } from '@/lib/constants'
import {
  brl0, brl2, brl4, fmtBR, fmtDM, fmtDur, hojeISO, lastDayOfMonth, mLabel, monthsBetween, nf0, nf1, nf2, sgn1,
} from '@/lib/format'
import { useDados } from '@/lib/store'
import type { Historico } from '@/lib/painelDados'

const ARM_COR: Record<string, string> = {
  Loja: '#0b4f9e',
  Adubo: '#2e9b4b',
  Insumos: '#d49a00',
  'Pátio de Máquinas': '#2b6fc0',
}

interface CalculoOrigem {
  titulo: string
  origem: string
  fontes: string[]
  passos: string[]
  notas: string[]
}

export function Painel() {
  const { armazens, armNome, piso } = useDados()

  const [from, setFrom] = useState('2022-06')
  const [to, setTo] = useState(() => hojeISO().slice(0, 7))
  const [armFiltro, setArmFiltro] = useState<string>('Todos')
  const [incluirTeste, setIncluirTeste] = useState(true)
  const [tab, setTab] = useState<'hist' | 'plat'>('plat')

  const [hist, setHist] = useState<Historico | null>(null)
  const [indic, setIndic] = useState<any>(null)
  const [op, setOp] = useState<any>(null)
  const [plat, setPlat] = useState<any>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Dialog Ver Cálculo
  const [detalheCalculo, setDetalheCalculo] = useState<CalculoOrigem | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const q = { de: `${from}-01`, ate: lastDayOfMonth(to) }
    const qp = {
      ...q,
      armazemId: armFiltro === 'Todos' ? null : Number(armFiltro),
      origem: incluirTeste ? null : 'PLATAFORMA',
    }

    try {
      const [h, i, o, p] = await Promise.all([
        GET<Historico>('/api/painel/dimensionamento/historico' + qs(q)),
        GET<any>('/api/painel/historico/indicadores'),
        GET<any>('/api/painel/operacao' + qs(qp)),
        GET<any>('/api/painel/dimensionamento/plataforma' + qs({ ...qp, agrupar: 'mes' })),
      ])
      setHist(h)
      setIndic(i)
      setOp(o)
      setPlat(p)
    } catch (e) {
      setErro(errTxt(e))
    } finally {
      setCarregando(false)
    }
  }, [from, to, armFiltro, incluirTeste])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const perTxt = `${mLabel(from)} a ${mLabel(to)}`
  const meses = hist?.meses ?? []
  const tot = hist?.totais ?? { sobraDiarias: 0, faltaDiarias: 0, sobraReais: '0', faltaReais: '0', saldoReais: '0' }
  const est = hist?.estacoes ?? []
  const safra = est.find((e) => e.estacao === 'SAFRA')
  const ent = est.find((e) => e.estacao === 'ENTRESSAFRA')

  const sobraD = Number(tot.sobraDiarias)
  const faltaD = Number(tot.faltaDiarias)
  const descompasso = sobraD > 0 && faltaD > 0 && safra && ent && safra.saldoDiarias * ent.saldoDiarias < 0
  const menor = Math.min(sobraD, faltaD) === sobraD ? { d: tot.sobraDiarias, r: tot.sobraReais } : { d: tot.faltaDiarias, r: tot.faltaReais }
  const diasTot = meses.reduce((s, m) => s + m.diasUteis, 0)
  const evTot = meses.reduce((s, m) => s + m.recebimentosPorDia * m.diasUteis, 0)
  const chapTot = meses.reduce((s, m) => s + m.chapasPorDia * m.diasUteis, 0)

  // 3D Colunas dos armazéns
  const colunasArmazens: ItemColuna[] = useMemo(() => {
    const list = hist?.armazens ?? []
    return list.map((a) => ({
      rotulo: a.armazem,
      valor: a.recebimentos,
      texto: `${nf0.format(a.recebimentos)} rec.`,
      sub: `${nf1.format(a.participacaoNaNecessidade * 100)}%`,
      cor: ARM_COR[a.armazem] ?? '#0b4f9e',
      esmaecida: armFiltro !== 'Todos' && armFiltro !== String(a.armazemId),
    }))
  }, [hist, armFiltro])

  // Dados para gráficos de barras
  const fornVolume: [string, number][] = useMemo(
    () => (indic?.fornecedoresMaiorVolume ?? []).slice(0, 8).map((x: any) => [x.fornecedor, x.recebimentos]),
    [indic],
  )
  const nrMap = useMemo(() => Object.fromEntries((op?.naoRecebimentos ?? []).map((x: any) => [x.motivo, x.quantidade])), [op])
  const nrBarras: [string, number][] = useMemo(
    () => Object.keys(MOTIVOS_NR).map((k) => [MOTIVOS_NR[k], nrMap[k] || 0]),
    [nrMap],
  )
  const cargasPorDiaArm = (op?.cargasRecebidas?.porDiaEArmazem ?? []).slice(-14).reverse()
  const usoPorArmazem = op?.porArmazem ?? []
  const fornecedoresOperacao: [string, number][] = (op?.fornecedoresMaiorVolume ?? [])
    .slice(0, 10)
    .map((r: { fornecedor: string; recebimentos: number }) => [r.fornecedor, r.recebimentos])
  const picosHora: [string, number][] = (op?.movimento?.porHoraDeEntrada ?? [])
    .map((r: { hora: number; cargas: number }) => [`${String(r.hora).padStart(2, '0')}:00`, r.cargas])
  const diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
  const picosDia: [string, number][] = (op?.movimento?.porDiaDaSemana ?? [])
    .map((r: { diaSemana: number; cargas: number }) => [diasSemana[r.diaSemana - 1] ?? 'Outro', r.cargas])

  const T_plat = plat?.total ?? { boletins: 0 }
  const origensPlataforma = Object.keys(plat?.origens ?? {})
  const origensExibidas = origensPlataforma.length
    ? origensPlataforma
    : incluirTeste ? ['PLATAFORMA', 'TESTE'] : ['PLATAFORMA']
  const complementoPago = Number(T_plat.sobraReais ?? 0)
  const totalPago = Number(T_plat.totalAPagar ?? 0)
  const parcelaComplemento = totalPago > 0 ? (complementoPago / totalPago) * 100 : null

  return (
    <div className="grid gap-6">
      <CabecalhoPagina
        titulo="Painel gerencial"
        quem="Quem usa: direção e gestores"
        sub="Acompanhe o complemento pago e compare-o com produção, equipe registrada e demanda operacional para revisar escala e alocação. Os indicadores não prescrevem uma quantidade ideal de chapas."
        acoes={
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={carregando ? 'animate-spin' : ''} /> {carregando ? 'Atualizando…' : 'Atualizar'}
          </Button>
        }
      />

      {erro && (
        <Callout tom="ruim">
          Não foi possível carregar os dados: {erro}.{' '}
          <Button size="sm" variant="outline" className="ml-2" onClick={() => void carregar()}>Tentar de novo</Button>
        </Callout>
      )}

      {/* Filtros */}
      <PainelContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
        <Field label="Período de (mês/ano)">
          <Input
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Até (mês/ano)">
          <Input
            type="month"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="Armazém">
          <Select value={armFiltro} onChange={(e) => setArmFiltro(e.target.value)}>
            <option value="Todos">Todos os armazéns</option>
            {armazens.map((a) => (
              <option key={a.id} value={String(a.id)}>{a.nome}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-2 pb-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirTeste}
              onChange={(e) => setIncluirTeste(e.target.checked)}
              className="size-4 rounded"
            />
            Incluir dados de teste
          </label>
        </div>
      </PainelContainer>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setTab('hist')}
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'hist' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-secondary'
          }`}
        >
          Histórico da Cocapec <OrigemBadge origem="HISTORICO" />
        </button>
        <button
          onClick={() => setTab('plat')}
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'plat' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-secondary'
          }`}
        >
          Nova plataforma {origensExibidas.map((origem) => <OrigemBadge key={origem} origem={origem} />)}
        </button>
      </div>

      {tab === 'hist' ? (
        /* ================= ABA HISTÓRICO ================= */
        <div className="grid gap-6">
          {meses.length > 0 ? (
            <>
              {/* Bloco central da direção */}
              <PainelContainer className="grid gap-4 border-l-4 border-primary">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <OrigemBadge origem="HISTORICO" />
                      <span className="text-xs text-muted-foreground">baseline</span>
                    </div>
                    <h2 className="mt-1 font-display text-2xl font-bold">
                      {descompasso
                        ? 'A equipe presente não acompanha a variação da demanda ao longo do ano'
                        : Number(tot.saldoReais) > 0
                          ? 'Folga relativa no período'
                          : Number(tot.saldoReais) < 0
                            ? 'Pressão relativa (falta) no período'
                            : 'Equipe equilibrada no período'}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground max-w-[65ch]">
                      {descompasso
                        ? `A estimativa histórica indica folga relativa na ${safra && safra.saldoDiarias > 0 ? 'safra (out a mar)' : 'entressafra (abr a set)'} (${sgn1(Math.max(safra?.saldoDiarias ?? 0, ent?.saldoDiarias ?? 0))} diárias) e pressão na ${safra && safra.saldoDiarias > 0 ? 'entressafra (abr a set)' : 'safra (out a mar)'} (${sgn1(Math.min(safra?.saldoDiarias ?? 0, ent?.saldoDiarias ?? 0))}). É um sinal de desencontro temporal, não uma medição de ociosidade nem uma recomendação de corte.`
                        : 'O saldo é uma estimativa relativa ao histórico: compara equipe e demanda, não mede o tamanho absoluto ideal nem identifica o motivo de eventual ociosidade.'}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="num font-display text-4xl font-bold text-accent">
                      {nf1.format(Number(menor.d))} <span className="text-base text-muted-foreground font-normal">diárias</span>
                    </div>
                    <div className="num font-display text-lg font-semibold text-foreground">
                      {brl0(menor.r)} de saldo estimado
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDetalheCalculo({
                          titulo: 'Saldo histórico estimado',
                          origem: 'HISTORICO',
                          fontes: ['pedido_recebimento_notafiscal.xlsx', 'chapas_por_dia.csv'],
                          passos: [
                            `Recebimentos-destino únicos em ${perTxt}: ${nf0.format(evTot)}`,
                            `Equilíbrio do histórico: ${nf1.format(hist?.equilibrio?.pessoaMinutosPorChapaDia ?? 0)} pessoa-minutos por chapa-dia`,
                            `Folga: ${nf1.format(sobraD)} diárias (${brl2(tot.sobraReais)})`,
                            `Pressão: ${nf1.format(faltaD)} diárias (${brl2(tot.faltaReais)})`,
                          ],
                          notas: hist?.limitacoes ?? [],
                        })
                      }
                      className="mt-1 text-xs text-info hover:underline"
                    >
                      <HelpCircle className="size-3.5 mr-1" /> Ver cálculo detalhado
                    </Button>
                  </div>
                </div>

                <Tiles className="mt-2">
                  <Tile rotulo="Dias úteis analisados" valor={nf0.format(diasTot)} sub={perTxt} />
                  <Tile rotulo="Recebimentos por dia" valor={diasTot ? nf1.format(evTot / diasTot) : '—'} sub="por dia útil" />
                  <Tile rotulo="Chapas por dia" valor={diasTot ? nf1.format(chapTot / diasTot) : '—'} sub="média presentes" />
                  <Tile
                    rotulo="Equipe × Demanda"
                    valor={hist?.robustez?.correlacaoEquipeEDemanda != null ? nf2.format(hist.robustez.correlacaoEquipeEDemanda) : '—'}
                    sub="correlação diária"
                  />
                </Tiles>
              </PainelContainer>

              {/* 3D Colunas dos Armazéns */}
              <PainelContainer>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SecTitulo className="text-[17px]">Volume por armazém (Visualização 3D)</SecTitulo>
                  <span className="text-xs text-muted-foreground">Altura proporcional aos recebimentos</span>
                </div>
                <div className="mt-4 rounded-xl border bg-secondary/15 p-2">
                  <Colunas3D itens={colunasArmazens} altura={280} />
                </div>

                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Armazém</TableHead>
                        <TableHead className="text-right">Recebimentos</TableHead>
                        <TableHead className="text-right">Parte da necessidade</TableHead>
                        <TableHead className="text-right">Parcela da folga</TableHead>
                        <TableHead className="text-right">Parcela da pressão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(hist?.armazens ?? []).map((a) => (
                        <TableRow key={a.armazemId}>
                          <TableCell className="font-semibold">
                            <span className="inline-block size-2.5 rounded-full mr-2" style={{ background: ARM_COR[a.armazem] }} />
                            {a.armazem}
                          </TableCell>
                          <TableCell className="text-right num">{nf0.format(a.recebimentos)}</TableCell>
                          <TableCell className="text-right num">{nf1.format(a.participacaoNaNecessidade * 100)}%</TableCell>
                          <TableCell className="text-right num">{brl0(a.parcelaDaSobraReais)}</TableCell>
                          <TableCell className="text-right num">{brl0(a.parcelaDaFaltaReais)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PainelContainer>

              {/* Números de cada estação */}
              <PainelContainer>
                <SecTitulo className="text-[17px]">Os números de cada estação</SecTitulo>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estação</TableHead>
                        <TableHead className="text-right">Dias úteis</TableHead>
                        <TableHead className="text-right">Recebimentos/dia</TableHead>
                        <TableHead className="text-right">Chapas/dia</TableHead>
                        <TableHead className="text-right">Saldo (diárias)</TableHead>
                        <TableHead className="text-right">Saldo em R$</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {est.map((e) => (
                        <TableRow key={e.estacao}>
                          <TableCell className="font-semibold">{e.rotulo}</TableCell>
                          <TableCell className="text-right num">{nf0.format(e.diasUteis)}</TableCell>
                          <TableCell className="text-right num">{nf1.format(e.recebimentosPorDia)}</TableCell>
                          <TableCell className="text-right num">{nf1.format(e.chapasPorDia)}</TableCell>
                          <TableCell className="text-right num font-bold">
                            <span className={e.saldoDiarias >= 0 ? 'text-success' : 'text-destructive'}>
                              {sgn1(e.saldoDiarias)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right num">{brl0(e.saldoReais)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PainelContainer>

              {/* Números mês a mês */}
              <PainelContainer>
                <SecTitulo className="text-[17px]">Os números de cada mês</SecTitulo>
                <div className="mt-3 overflow-x-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead className="text-right">Dias úteis</TableHead>
                        <TableHead className="text-right">Recebimentos/dia</TableHead>
                        <TableHead className="text-right">Chapas/dia</TableHead>
                        <TableHead className="text-right">Necessárias/dia</TableHead>
                        <TableHead className="text-right">Saldo (diárias)</TableHead>
                        <TableHead className="text-right">Saldo em R$</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meses.map((m) => (
                        <TableRow key={m.mes}>
                          <TableCell className="font-semibold">{mLabel(m.mes)}</TableCell>
                          <TableCell className="text-right num">{m.diasUteis}</TableCell>
                          <TableCell className="text-right num">{nf1.format(m.recebimentosPorDia)}</TableCell>
                          <TableCell className="text-right num">{nf1.format(m.chapasPorDia)}</TableCell>
                          <TableCell className="text-right num">{nf1.format(m.chapasNecessariasPorDia)}</TableCell>
                          <TableCell className="text-right num font-bold">
                            <span className={m.saldoDiarias >= 0 ? 'text-success' : 'text-destructive'}>
                              {sgn1(m.saldoDiarias)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right num">{brl0(m.saldoReais)}</TableCell>
                          <TableCell>
                            <Badge tom={m.situacao === 'SOBRA' ? 'ok' : m.situacao === 'FALTA' ? 'ruim' : 'neutro'}>
                              {m.situacao}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PainelContainer>

              {/* Sensibilidade / Cenários alternativos */}
              {hist?.cenarios && hist.cenarios.length > 0 && (
                <PainelContainer>
                  <SecTitulo className="text-[17px]">Sensibilidade: e se o ponto de equilíbrio fosse outro?</SecTitulo>
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cenário</TableHead>
                          <TableHead className="text-right">Pessoa-min por chapa-dia</TableHead>
                          <TableHead className="text-right">Folga</TableHead>
                          <TableHead className="text-right">Pressão</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hist.cenarios.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-semibold">{c.nome}</TableCell>
                            <TableCell className="text-right num">{nf1.format(c.pessoaMinutosPorChapaDia)}</TableCell>
                            <TableCell className="text-right num">{brl0(c.sobraReais)}</TableCell>
                            <TableCell className="text-right num">{brl0(c.faltaReais)}</TableCell>
                            <TableCell className="text-right num font-bold">{brl0(c.saldoReais)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </PainelContainer>
              )}
            </>
          ) : (
            <Vazio>
              Sem dados históricos no período selecionado. Ajuste o filtro de datas.
            </Vazio>
          )}
        </div>
      ) : (
        /* ================= ABA PLATAFORMA ================= */
        <div className="grid gap-6">
          {T_plat.boletins > 0 ? (
            <>
              <Callout tom={complementoPago > 0 ? 'aviso' : 'ok'}>
                <b>{complementoPago > 0 ? 'Revisar custo de complemento e escala' : 'Sem complemento registrado no período'}.</b>{' '}
                {complementoPago > 0
                  ? `Foram pagos ${brl2(T_plat.sobraReais)} em complemento${parcelaComplemento == null ? '' : ` (${nf1.format(parcelaComplemento)}% do total a pagar)`} em ${nf0.format(T_plat.diasComComplemento)} dia(s) com boletim. Compare o valor com a produção, as descargas concluídas e a equipe registrada para investigar oportunidades de ajustar a escala ou a alocação.`
                  : 'Nos boletins consistentes deste filtro, a produção alcançou o piso garantido pelas diárias.'}{' '}
                O complemento é um custo efetivamente pago e um alerta para análise; isoladamente, não comprova excesso de chapas
                ou ociosidade e não determina quantas pessoas devem ser escaladas. As descargas contam apenas operações concluídas
                pela data de saída; os boletins são agrupados pela data do boletim, então os totais são referências do período,
                não um vínculo entre cada descarga e cada pagamento.
              </Callout>

              <PainelContainer className="grid gap-4 border-l-4 border-brand-green">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {origensExibidas.map((origem) => <OrigemBadge key={origem} origem={origem} />)}
                      <span className="text-xs text-muted-foreground">boletins salvos</span>
                    </div>
                    <h2 className="mt-1 font-display text-2xl font-bold">
                      {complementoPago > 0
                        ? 'Complemento de diária pago no período'
                        : T_plat.situacao === 'FALTA'
                          ? 'Produção acima do valor garantido pelo piso'
                          : 'Produção próxima do valor garantido pelo piso'}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground max-w-[65ch]">
                      O complemento cobre a diferença até o piso de {brl4(piso)} por diária equivalente. A produção acima do piso indica valor produzido além do mínimo garantido; nenhum dos dois, sozinho, mede ociosidade.
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="num font-display text-4xl font-bold">
                      {brl2(T_plat.sobraReais)}
                    </div>
                    <div className="text-xs text-muted-foreground">complemento pago</div>
                  </div>
                </div>

                <Tiles className="mt-2">
                  <Tile rotulo="Boletins considerados" valor={nf0.format(T_plat.boletins)} />
                  <Tile rotulo="Diárias equivalentes" valor={nf1.format(Number(T_plat.diariasEquivalentes))} />
                  <Tile rotulo="Total a pagar" valor={brl2(T_plat.totalAPagar)} sub="custo da operação" />
                  <Tile rotulo="Dias com complemento" valor={nf0.format(T_plat.diasComComplemento)} />
                  <Tile rotulo="Descargas concluídas" valor={nf0.format(op?.cargasRecebidas?.total ?? 0)} sub="volume operacional no período" />
                  <Tile
                    rotulo="Chapas por descarga"
                    valor={op?.chapasPorRecebimento?.media != null ? nf1.format(op.chapasPorRecebimento.media) : '—'}
                    sub="intensidade registrada; não é efetivo diário"
                  />
                  <Tile
                    rotulo="Aproveitamento"
                    valor={T_plat.aproveitamento != null ? nf2.format(Number(T_plat.aproveitamento)) : '—'}
                    sub="produção ÷ valor garantido"
                  />
                </Tiles>
              </PainelContainer>

              {/* Quebra por armazém */}
              <PainelContainer>
                <SecTitulo className="text-[17px]">Boletins por armazém</SecTitulo>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Armazém</TableHead>
                        <TableHead className="text-right">Boletins</TableHead>
                        <TableHead className="text-right">Diárias</TableHead>
                        <TableHead className="text-right">Produção</TableHead>
                        <TableHead className="text-right">Total a pagar</TableHead>
                        <TableHead className="text-right">Complemento pago</TableHead>
                        <TableHead className="text-right">Produção acima do piso</TableHead>
                        <TableHead>Ritmo em relação ao piso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(plat?.porArmazem ?? []).map((r: any) => (
                        <TableRow key={r.armazem}>
                          <TableCell className="font-semibold">{r.armazem}</TableCell>
                          <TableCell className="text-right num">{r.boletins}</TableCell>
                          <TableCell className="text-right num">{nf1.format(Number(r.diariasEquivalentes))}</TableCell>
                          <TableCell className="text-right num">{brl2(r.producao)}</TableCell>
                          <TableCell className="text-right num font-bold">{brl2(r.totalAPagar)}</TableCell>
                          <TableCell className="text-right num">{brl2(r.sobraReais)}</TableCell>
                          <TableCell className="text-right num">{brl2(r.faltaReais)}</TableCell>
                          <TableCell>
                            {(() => {
                              const comComplemento = Number(r.sobraReais) > 0
                              const acimaPiso = Number(r.faltaReais) > 0
                              const rotulo = r.situacao === 'SEM_DADOS'
                                ? 'Sem diárias'
                                : comComplemento
                                  ? 'Com complemento'
                                  : acimaPiso
                                    ? 'Acima do piso'
                                    : 'No piso'
                              return <Badge tom={comComplemento ? 'aviso' : acimaPiso ? 'ok' : 'neutro'}>{rotulo}</Badge>
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PainelContainer>
            </>
          ) : (
            <Vazio>
              Nenhum boletim encontrado no filtro da plataforma. Lance boletins ou marque “Incluir dados de teste”.
            </Vazio>
          )}
        </div>
      )}

      {/* Indicadores Operacionais */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PainelContainer>
          <div className="flex flex-wrap items-center gap-2">
            <SecTitulo className="text-[17px]">Indicadores da plataforma</SecTitulo>
            <OrigemBadge origem="PLATAFORMA" />
            {incluirTeste && <OrigemBadge origem="TESTE" />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Descargas concluídas no período, agrupadas pela data de saída. Médias consideram apenas os registros que têm os marcos necessários.
          </p>
          <div className="mt-4 grid gap-3">
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Tempo médio de espera ({nf0.format(op?.tempoMedioEsperaMin?.amostra ?? 0)} amostras)</span>
              <span className="num font-bold text-base">
                {op?.tempoMedioEsperaMin?.media != null ? fmtDur(op.tempoMedioEsperaMin.media) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Tempo médio de descarga ({nf0.format(op?.tempoMedioDescargaMin?.amostra ?? 0)} amostras)</span>
              <span className="num font-bold text-base">
                {op?.tempoMedioDescargaMin?.media != null ? fmtDur(op.tempoMedioDescargaMin.media) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Chapas por descarga ({nf0.format(op?.chapasPorRecebimento?.amostra ?? 0)} amostras)</span>
              <span className="num font-bold text-base">
                {op?.chapasPorRecebimento?.media != null ? nf1.format(op.chapasPorRecebimento.media) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Custo da operação ({nf0.format(op?.custoDaOperacao?.boletins ?? 0)} boletins consistentes)</span>
              <span className="num font-bold text-base">
                {op?.custoDaOperacao?.totalAPagar != null ? brl2(op.custoDaOperacao.totalAPagar) : '—'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Custo = produção ou piso mais complemento; não inclui encargos nem equipamentos. Chapas por descarga mede a intensidade daquela descarga, não o efetivo diário.
            </p>
          </div>
        </PainelContainer>

        <PainelContainer>
          <SecTitulo className="text-[17px]">Não recebimentos por motivo</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Ocorrências no período e na origem selecionados. Não há armazém associado em todos os casos; por isso este indicador não é filtrado pelo armazém.
          </p>
          <Barras itens={nrBarras} cor="verde" />
        </PainelContainer>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PainelContainer>
          <SecTitulo className="text-[17px]">Descargas por dia e armazém</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Cada linha representa um destino descarregado; um caminhão com dois destinos aparece duas vezes. Últimas 14 combinações no filtro.
          </p>
          {cargasPorDiaArm.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Data de saída</TableHead><TableHead>Armazém</TableHead><TableHead className="text-right">Descargas</TableHead></TableRow></TableHeader>
                <TableBody>
                  {cargasPorDiaArm.map((r: { data: string; armazem: string; cargas: number }) => (
                    <TableRow key={`${r.data}-${r.armazem}`}>
                      <TableCell className="num">{fmtBR(r.data)}</TableCell>
                      <TableCell>{r.armazem}</TableCell>
                      <TableCell className="text-right num">{nf0.format(r.cargas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : <Vazio>Sem descargas concluídas no filtro.</Vazio>}
        </PainelContainer>

        <PainelContainer>
          <SecTitulo className="text-[17px]">Utilização observada por armazém</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Descargas e horas entre entrada e saída. A Cocapec não definiu fórmula para um percentual de utilização.
          </p>
          {usoPorArmazem.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Armazém</TableHead><TableHead className="text-right">Descargas</TableHead><TableHead className="text-right">Dias com movimento</TableHead><TableHead className="text-right">Horas ocupadas</TableHead></TableRow></TableHeader>
                <TableBody>
                  {usoPorArmazem.map((r: { armazem: string; cargas: number; diasComMovimento: number; horasOcupadas: number }) => (
                    <TableRow key={r.armazem}>
                      <TableCell className="font-semibold">{r.armazem}</TableCell>
                      <TableCell className="text-right num">{nf0.format(r.cargas)}</TableCell>
                      <TableCell className="text-right num">{nf0.format(r.diasComMovimento)}</TableCell>
                      <TableCell className="text-right num">{nf1.format(r.horasOcupadas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : <Vazio>Sem descargas concluídas no filtro.</Vazio>}
        </PainelContainer>

        <PainelContainer>
          <SecTitulo className="text-[17px]">Horários de maior movimento</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Descargas concluídas por hora de entrada.</p>
          {picosHora.length ? <Barras itens={picosHora} /> : <Vazio>Sem entradas registradas no filtro.</Vazio>}
        </PainelContainer>

        <PainelContainer>
          <SecTitulo className="text-[17px]">Dias de maior movimento</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Descargas concluídas por dia da semana da saída.</p>
          {picosDia.length ? <Barras itens={picosDia} /> : <Vazio>Sem descargas concluídas no filtro.</Vazio>}
        </PainelContainer>

        <PainelContainer>
          <SecTitulo className="text-[17px]">Fornecedores com maior volume (plataforma)</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Descargas concluídas por fornecedor no período, armazém e origem selecionados.</p>
          {fornecedoresOperacao.length ? <Barras itens={fornecedoresOperacao} /> : <Vazio>Sem descargas concluídas no filtro.</Vazio>}
        </PainelContainer>

        {fornVolume.length > 0 && (
          <PainelContainer>
            <SecTitulo className="text-[17px]">Fornecedores com maior volume (histórico)</SecTitulo>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Recebimentos distintos em toda a base histórica, sem filtros de período ou armazém.</p>
            <Barras itens={fornVolume} />
          </PainelContainer>
        )}
      </div>

      {/* Dialog Ver Cálculo */}
      {detalheCalculo && (
        <Dialog open onOpenChange={(o) => !o && setDetalheCalculo(null)}>
          <DialogContent wide>
            <DialogHeader>
              <DialogTitle>{detalheCalculo.titulo}</DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-4 text-sm">
              <div className="flex items-center gap-2">
                <OrigemBadge origem={detalheCalculo.origem} />
                <span className="text-muted-foreground">{perTxt}</span>
              </div>

              <div>
                <SecTitulo className="text-sm">Fontes de dados</SecTitulo>
                <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                  {detalheCalculo.fontes.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              <div>
                <SecTitulo className="text-sm">Passos do cálculo</SecTitulo>
                <ol className="mt-2 list-decimal pl-5 grid gap-1">
                  {detalheCalculo.passos.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </div>

              <div>
                <SecTitulo className="text-sm">Limitações e considerações</SecTitulo>
                <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                  {detalheCalculo.notas.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetalheCalculo(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
