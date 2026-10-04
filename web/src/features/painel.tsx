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
  const [to, setTo] = useState('2026-09')
  const [armFiltro, setArmFiltro] = useState<string>('Todos')
  const [incluirTeste, setIncluirTeste] = useState(true)
  const [tab, setTab] = useState<'hist' | 'plat'>('hist')

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

  const T_plat = plat?.total ?? { boletins: 0 }

  return (
    <div className="grid gap-6">
      <CabecalhoPagina
        titulo="Painel gerencial"
        quem="Quem usa: direção e gestores"
        sub="A quantidade de chapas está sobrando ou faltando, e quanto isso vale em reais? Todos os números declaram a origem e abrem o cálculo em detalhes."
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
          Nova plataforma <OrigemBadge origem={incluirTeste ? 'TESTE' : 'PLATAFORMA'} />
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
                        ? 'Não há sobra nem falta permanente: a equipe está mal distribuída no tempo'
                        : Number(tot.saldoReais) > 0
                          ? 'Folga relativa no período'
                          : Number(tot.saldoReais) < 0
                            ? 'Pressão relativa (falta) no período'
                            : 'Equipe equilibrada no período'}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground max-w-[65ch]">
                      {descompasso
                        ? `Na ${safra && safra.saldoDiarias > 0 ? 'safra (out a mar)' : 'entressafra (abr a set)'} a equipe fica folgada (${sgn1(Math.max(safra?.saldoDiarias ?? 0, ent?.saldoDiarias ?? 0))} diárias) e na ${safra && safra.saldoDiarias > 0 ? 'entressafra (abr a set)' : 'safra (out a mar)'} fica apertada (${sgn1(Math.min(safra?.saldoDiarias ?? 0, ent?.saldoDiarias ?? 0))}). O que sobra em um período falta no outro.`
                        : 'O saldo é relativo ao próprio histórico: mostra se a equipe acompanhou a demanda, não o tamanho absoluto ideal.'}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="num font-display text-4xl font-bold text-accent">
                      {nf1.format(Number(menor.d))} <span className="text-base text-muted-foreground font-normal">diárias</span>
                    </div>
                    <div className="num font-display text-lg font-semibold text-foreground">
                      {brl0(menor.r)} a realocar
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDetalheCalculo({
                          titulo: 'Sobra ou falta de chapas (histórico)',
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
              <PainelContainer className="grid gap-4 border-l-4 border-brand-green">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <OrigemBadge origem={incluirTeste ? 'TESTE' : 'PLATAFORMA'} />
                      <span className="text-xs text-muted-foreground">boletins salvos</span>
                    </div>
                    <h2 className="mt-1 font-display text-2xl font-bold">
                      {T_plat.situacao === 'SOBRA'
                        ? 'Sobra de equipe: a produção ficou abaixo do piso'
                        : T_plat.situacao === 'FALTA'
                          ? 'Falta de equipe: a produção passou do piso'
                          : 'Equipe alinhada à produção'}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground max-w-[65ch]">
                      Sobra é o complemento pago para completar o piso de {brl4(piso)}; falta é a produção acima do piso, sinal de equipe curta para a demanda.
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="num font-display text-4xl font-bold">
                      {brl0(T_plat.situacao === 'FALTA' ? T_plat.faltaReais : T_plat.sobraReais)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {brl0(T_plat.situacao === 'FALTA' ? T_plat.sobraReais : T_plat.faltaReais)} no período oposto
                    </div>
                  </div>
                </div>

                <Tiles className="mt-2">
                  <Tile rotulo="Boletins considerados" valor={nf0.format(T_plat.boletins)} />
                  <Tile rotulo="Diárias equivalentes" valor={nf1.format(Number(T_plat.diariasEquivalentes))} />
                  <Tile rotulo="Total a pagar" valor={brl2(T_plat.totalAPagar)} sub="custo da operação" />
                  <Tile
                    rotulo="Aproveitamento"
                    valor={T_plat.aproveitamento != null ? nf2.format(Number(T_plat.aproveitamento)) : '—'}
                    sub="produção ÷ piso"
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
                        <TableHead className="text-right">Sobra (R$)</TableHead>
                        <TableHead className="text-right">Falta (R$)</TableHead>
                        <TableHead>Situação</TableHead>
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
                            <Badge tom={r.situacao === 'SOBRA' ? 'ok' : r.situacao === 'FALTA' ? 'ruim' : 'neutro'}>
                              {r.situacao}
                            </Badge>
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
          <SecTitulo className="text-[17px]">Operação ao vivo (Plataforma)</SecTitulo>
          <div className="mt-4 grid gap-3">
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Tempo médio de espera</span>
              <span className="num font-bold text-base">
                {op?.tempoMedioEsperaMin?.media != null ? fmtDur(op.tempoMedioEsperaMin.media) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Tempo médio de descarga</span>
              <span className="num font-bold text-base">
                {op?.tempoMedioDescargaMin?.media != null ? fmtDur(op.tempoMedioDescargaMin.media) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Chapas por descarga</span>
              <span className="num font-bold text-base">
                {op?.chapasPorRecebimento?.media != null ? nf1.format(op.chapasPorRecebimento.media) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-b pb-2">
              <span className="text-sm text-muted-foreground">Custo total da operação</span>
              <span className="num font-bold text-base">
                {op?.custoDaOperacao?.totalAPagar != null ? brl2(op.custoDaOperacao.totalAPagar) : '—'}
              </span>
            </div>
          </div>
        </PainelContainer>

        <PainelContainer>
          <SecTitulo className="text-[17px]">Não recebimentos por motivo</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Ocorrências registradas na cooperativa.</p>
          <Barras itens={nrBarras} cor="verde" />
        </PainelContainer>
      </div>

      {fornVolume.length > 0 && (
        <PainelContainer>
          <SecTitulo className="text-[17px]">Fornecedores com maior volume (Histórico)</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Total de recebimentos distintos em toda a base.</p>
          <Barras itens={fornVolume} />
        </PainelContainer>
      )}

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
