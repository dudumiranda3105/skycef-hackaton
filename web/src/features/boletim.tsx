import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Badge, CabecalhoPagina, Callout, Erros, OrigemBadge, Painel, SecTitulo,
} from '@/components/comum'
import { POST, errTxt } from '@/lib/api'
import { MAX_CHAPAS_BOLETIM } from '@/lib/constants'
import { addDays, brl2, brl4, dow, fmtBR, fmtDM, hojeISO, nf0, nf1 } from '@/lib/format'
import { avisar, useAuth, useDados } from '@/lib/store'
import type { Boletim as TipoBoletim, MembroEquipe, ResumoBoletim } from '@/lib/types'

const cent4 = (s: string | number | null | undefined): bigint => {
  const [i, f = ''] = String(s ?? 0).split('.')
  return BigInt((i || '0') + f.padEnd(4, '0').slice(0, 4))
}
const big4 = (v: bigint): string => {
  const s = v.toString().padStart(5, '0')
  return s.slice(0, -4) + '.' + s.slice(-4)
}

function ultimoDiaUtil(): string {
  let d = addDays(hojeISO(), -1)
  while (dow(d) === 0) d = addDays(d, -1) // sábado também tem boletim
  return d
}

interface LinhaEntrada {
  d: number
  r: number
  t: number
}

interface SecaoArmazem {
  itens: Record<string, LinhaEntrada>
  equipe: MembroEquipe[]
  salvo: TipoBoletim | null
}

export function Boletim() {
  const { armazens, tipos, chapas, boletins, piso, setPiso, refresh } = useDados()
  const { pf } = useAuth()
  const podeLancar = pf('boletim')

  const [data, setData] = useState(() => ultimoDiaUtil())
  const [aba, setAba] = useState<number>(() => armazens[0]?.id ?? 1)
  const [secoes, setSecoes] = useState<Record<number, SecaoArmazem>>({})
  const [calculos, setCalculos] = useState<Record<number, ResumoBoletim | { erro: string }>>({})

  // Nova pessoa na equipe
  const [matriculaNova, setMatriculaNova] = useState('')
  const [tipoDiariaNova, setTipoDiariaNova] = useState<'COMPLETA' | 'MEIA'>('COMPLETA')
  const [erroEquipe, setErroEquipe] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inicializa seções ao trocar de data ou carregar boletins
  useEffect(() => {
    const novas: Record<number, SecaoArmazem> = {}
    armazens.forEach((a) => {
      const ex = boletins.find((b) => b.armazemId === a.id && b.data === data)
      if (ex) {
        const itens: Record<string, LinhaEntrada> = {}
        ex.linhas.forEach((l) => {
          itens[l.tipoItem] = { d: l.descarga, r: l.remocao, t: l.transferencia }
        })
        novas[a.id] = {
          itens,
          equipe: ex.equipe.map((e) => ({ matricula: e.matricula, nome: e.nome, tipoDiaria: e.tipoDiaria })),
          salvo: ex,
        }
      } else {
        novas[a.id] = { itens: {}, equipe: [], salvo: null }
      }
    })
    setSecoes(novas)
    setCalculos({})
  }, [data, armazens, boletins])

  const armAtual = armazens.find((a) => a.id === aba) ?? armazens[0]
  const secAtual = secoes[aba] ?? { itens: {}, equipe: [], salvo: null }
  const ro = !podeLancar || !!secAtual.salvo

  const qItem = useCallback((sec: SecaoArmazem, cod: string) => {
    const it = sec.itens[cod]
    return (it?.d || 0) + (it?.r || 0) + (it?.t || 0)
  }, [])

  const secPreenchida = useCallback(
    (sec: SecaoArmazem) => tipos.some((t) => qItem(sec, t.codigo) > 0) || sec.equipe.length > 0,
    [tipos, qItem],
  )

  const estadoSec = useCallback(
    (armazemId: number) => {
      const s = secoes[armazemId]
      if (!s) return { k: 'vazio', t: 'vazio' }
      if (s.salvo) return { k: 'salvo', t: 'gravado' }
      if (!secPreenchida(s)) return { k: 'vazio', t: 'vazio' }
      return { k: 'rascunho', t: 'a salvar' }
    },
    [secoes, secPreenchida],
  )

  // Monta payload de cálculo / gravação
  const payloadSec = useCallback(
    (armazemId: number) => {
      const s = secoes[armazemId]
      if (!s) return { armazemId, data, linhas: [], equipe: [] }
      const linhas = tipos
        .filter((t) => qItem(s, t.codigo) > 0)
        .map((t) => {
          const it = s.itens[t.codigo] || { d: 0, r: 0, t: 0 }
          return { tipoItem: t.codigo, descarga: it.d, remocao: it.r, transferencia: it.t }
        })
      return {
        armazemId,
        data,
        linhas,
        equipe: s.equipe.map((e) => ({ matricula: e.matricula, tipoDiaria: e.tipoDiaria })),
      }
    },
    [secoes, data, tipos, qItem],
  )

  // Solicita prévia do cálculo à API
  const calcularArmazem = useCallback(
    async (armazemId: number) => {
      const pl = payloadSec(armazemId)
      if (!pl.linhas.length && !pl.equipe.length) {
        setCalculos((prev) => {
          const cp = { ...prev }
          delete cp[armazemId]
          return cp
        })
        return
      }
      try {
        const r = await POST<any>('/api/boletins/calculo', pl)
        if (r && r.piso) setPiso(r.piso)
        setCalculos((prev) => ({
          ...prev,
          [armazemId]: {
            producao: r.producaoTotal,
            diarias: r.diariasEquivalentes,
            vpd: r.valorPorDiaria,
            total: r.totalAPagar,
            complemento: r.complemento,
            abaixo: r.abaixoDoPiso,
            situacao: r.situacao,
            completas: r.chapasDiariaCompleta,
            meias: r.chapasMeiaDiaria,
            piso: r.piso,
          },
        }))
      } catch (e) {
        setCalculos((prev) => ({ ...prev, [armazemId]: { erro: errTxt(e) } }))
      }
    },
    [payloadSec, setPiso],
  )

  // Dispara recálculo com debounce
  const agendarCalculo = useCallback(
    (armazemId: number) => {
      if (calcTimer.current) clearTimeout(calcTimer.current)
      calcTimer.current = setTimeout(() => {
        void calcularArmazem(armazemId)
      }, 250)
    },
    [calcularArmazem],
  )

  function alterarQtd(cod: string, campo: 'd' | 'r' | 't', val: string) {
    const num = Math.max(0, parseInt(val.replace(/\D/g, '') || '0', 10))
    setSecoes((prev) => {
      const s = prev[aba] || { itens: {}, equipe: [], salvo: null }
      const it = s.itens[cod] || { d: 0, r: 0, t: 0 }
      const itensNovos = { ...s.itens, [cod]: { ...it, [campo]: num } }
      return { ...prev, [aba]: { ...s, itens: itensNovos } }
    })
    agendarCalculo(aba)
  }

  function adicionarChapa() {
    setErroEquipe(null)
    const m = matriculaNova.trim().toUpperCase()
    if (!m) {
      setErroEquipe('Informe a matrícula.')
      return
    }
    const ch = chapas.find((c) => c.matricula === m) || chapas.find((c) => c.matricula === `CHAPA_${m.padStart(2, '0')}`)
    if (!ch) {
      setErroEquipe(`Matrícula ${m} não encontrada no cadastro.`)
      return
    }
    if (secAtual.equipe.some((e) => e.matricula === ch.matricula)) {
      setErroEquipe(`${ch.nome} já está neste boletim.`)
      return
    }
    if (secAtual.equipe.length >= MAX_CHAPAS_BOLETIM) {
      setErroEquipe(`Limite de ${MAX_CHAPAS_BOLETIM} chapas por boletim atingido.`)
      return
    }

    setSecoes((prev) => {
      const s = prev[aba]
      return {
        ...prev,
        [aba]: {
          ...s,
          equipe: [...s.equipe, { matricula: ch.matricula, nome: ch.nome, tipoDiaria: tipoDiariaNova }],
        },
      }
    })
    setMatriculaNova('')
    agendarCalculo(aba)
  }

  function removerChapa(index: number) {
    setSecoes((prev) => {
      const s = prev[aba]
      const eq = [...s.equipe]
      eq.splice(index, 1)
      return { ...prev, [aba]: { ...s, equipe: eq } }
    })
    agendarCalculo(aba)
  }

  function alterarTipoDiaria(index: number, tipo: 'COMPLETA' | 'MEIA') {
    setSecoes((prev) => {
      const s = prev[aba]
      const eq = [...s.equipe]
      eq[index] = { ...eq[index], tipoDiaria: tipo }
      return { ...prev, [aba]: { ...s, equipe: eq } }
    })
    agendarCalculo(aba)
  }

  // Salvar boletins em rascunho
  async function salvarBoletim() {
    setErroGeral(null)
    const alvos = armazens.filter((a) => estadoSec(a.id).k === 'rascunho')
    if (!alvos.length) {
      setErroGeral('Lance a produção ou a equipe de ao menos um armazém.')
      return
    }

    setSalvando(true)
    try {
      // Valida todos antes
      for (const a of alvos) {
        await POST('/api/boletins/calculo', payloadSec(a.id))
      }
      // Grava um a um
      for (const a of alvos) {
        await POST('/api/boletins', payloadSec(a.id))
      }
      await refresh()
      avisar(`${alvos.length} boletim(ns) do dia gravado(s) com sucesso.`)
    } catch (e) {
      setErroGeral(errTxt(e))
    } finally {
      setSalvando(false)
    }
  }

  // Cálculo da produção local para tabela
  const { totalLinhasQtd, totalLinhasValor } = useMemo(() => {
    let qtot = 0
    let vtot = 0n
    tipos.forEach((t) => {
      const q = qItem(secAtual, t.codigo)
      qtot += q
      vtot += cent4(t.precoUnitario) * BigInt(q)
    })
    return { totalLinhasQtd: qtot, totalLinhasValor: big4(vtot) }
  }, [tipos, secAtual, qItem])

  // Resumo atual do armazém (do que foi salvo ou calculado)
  const resumoAtual = secAtual.salvo
    ? {
        producao: secAtual.salvo.producao,
        diarias: secAtual.salvo.diarias,
        vpd: secAtual.salvo.vpd,
        total: secAtual.salvo.total,
        complemento: secAtual.salvo.complemento,
        abaixo: secAtual.salvo.abaixo,
        situacao: secAtual.salvo.situacao,
        completas: secAtual.salvo.completas,
        meias: secAtual.salvo.meias,
        piso,
      }
    : calculos[aba] && !('erro' in calculos[aba])
      ? (calculos[aba] as ResumoBoletim)
      : null

  const erroCalc = calculos[aba] && 'erro' in calculos[aba] ? (calculos[aba] as { erro: string }).erro : null

  // Fechamento do dia (todos os armazéns)
  const fechamentoDia = useMemo(() => {
    let totDia = 0n
    let compDia = 0n
    let count = 0
    armazens.forEach((a) => {
      const s = secoes[a.id]
      const r = s?.salvo
        ? { total: s.salvo.total, complemento: s.salvo.complemento, situacao: s.salvo.situacao }
        : calculos[a.id] && !('erro' in calculos[a.id])
          ? (calculos[a.id] as ResumoBoletim)
          : null
      if (r && r.situacao === 'CONSISTENTE' && r.total != null) {
        totDia += cent4(r.total)
        compDia += cent4(r.complemento)
        count++
      }
    })
    return { totDia: big4(totDia), compDia: big4(compDia), count }
  }, [armazens, secoes, calculos])

  const nSalvos = armazens.filter((a) => secoes[a.id]?.salvo).length
  const nRasc = armazens.filter((a) => estadoSec(a.id).k === 'rascunho').length

  // Histórico de dias salvos
  const diasSalvos = useMemo(
    () => [...new Set(boletins.map((x) => x.data))].sort().reverse().slice(0, 10),
    [boletins],
  )

  return (
    <div className="grid gap-6">
      <CabecalhoPagina
        titulo="Boletim diário dos ensacadores"
        quem="Quem usa: encarregado dos chapas e responsável pelo armazém"
        sub="Um lançamento por dia, com os 4 armazéns de uma vez: escolha o dia, preencha a produção e a equipe de cada armazém e salve tudo junto. O sistema calcula produção, piso e complemento com 4 casas decimais."
      />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            Data de referência:
            <Input
              type="date"
              value={data}
              max={hojeISO()}
              onChange={(e) => setData(e.target.value)}
              className="w-auto h-9"
            />
          </label>
          <Badge tom={nSalvos === armazens.length ? 'info' : 'ok'}>
            {nSalvos} de {armazens.length} armazéns gravados neste dia
          </Badge>
          {nRasc > 0 && <Badge tom="aviso">{nRasc} a salvar</Badge>}
        </div>
      </div>

      {/* Tabs de armazéns */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {armazens.map((a) => {
          const e = estadoSec(a.id)
          const ativo = a.id === aba
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                ativo ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card text-muted-foreground hover:bg-secondary'
              }`}
            >
              {a.nome}
              <Badge tom={e.k === 'salvo' ? 'ok' : e.k === 'rascunho' ? 'aviso' : 'neutro'}>
                {e.t}
              </Badge>
            </button>
          )
        })}
      </div>

      {!podeLancar && (
        <Callout tom="info">
          O seu perfil só consulta os boletins: aqui você vê o que já foi gravado.
        </Callout>
      )}

      {secAtual.salvo && (
        <Callout tom="info">
          O boletim de <b>{armAtual?.nome}</b> neste dia já foi gravado (
          <OrigemBadge origem={secAtual.salvo.origem} />
          ). Há um boletim por armazém e por dia, e a gravação não é editável: confira os números abaixo.
        </Callout>
      )}

      {/* Grid principal: Produção e Equipe à esquerda, Fechamento à direita */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
          {/* Produção */}
          <Painel>
            <SecTitulo className="text-[17px]">Produção do dia · {armAtual?.nome}</SecTitulo>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Quantidade total = descarga + remoção + transferência. As quantidades são números inteiros; os preços são os da tabela vigente.
            </p>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo de item</TableHead>
                    <TableHead className="text-right">Preço unitário</TableHead>
                    <TableHead className="text-right w-24">Descarga</TableHead>
                    <TableHead className="text-right w-24">Remoção</TableHead>
                    <TableHead className="text-right w-24">Transferência</TableHead>
                    <TableHead className="text-right">Qtd. total</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tipos.map((t) => {
                    const it = secAtual.itens[t.codigo] || { d: 0, r: 0, t: 0 }
                    const q = (it.d || 0) + (it.r || 0) + (it.t || 0)
                    const v = cent4(t.precoUnitario) * BigInt(q)
                    return (
                      <TableRow key={t.codigo}>
                        <TableCell className="font-medium">{t.descricao}</TableCell>
                        <TableCell className="text-right num text-xs text-muted-foreground">{brl4(t.precoUnitario)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={it.d || ''}
                            disabled={ro}
                            onChange={(e) => alterarQtd(t.codigo, 'd', e.target.value)}
                            className="h-8 text-right font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={it.r || ''}
                            disabled={ro}
                            onChange={(e) => alterarQtd(t.codigo, 'r', e.target.value)}
                            className="h-8 text-right font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={it.t || ''}
                            disabled={ro}
                            onChange={(e) => alterarQtd(t.codigo, 't', e.target.value)}
                            className="h-8 text-right font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right num font-semibold">{nf0.format(q)}</TableCell>
                        <TableCell className="text-right num font-semibold">
                          {q > 0 ? brl4(big4(v)) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="bg-secondary/40 font-bold">
                    <TableCell colSpan={5}>Produção total</TableCell>
                    <TableCell className="text-right num">{nf0.format(totalLinhasQtd)}</TableCell>
                    <TableCell className="text-right num">{brl4(totalLinhasValor)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Painel>

          {/* Equipe */}
          <Painel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SecTitulo className="text-[17px]">Equipe do dia · {armAtual?.nome}</SecTitulo>
              <Badge tom={secAtual.equipe.length >= MAX_CHAPAS_BOLETIM ? 'aviso' : 'neutro'}>
                {secAtual.equipe.length} de {MAX_CHAPAS_BOLETIM} chapas
              </Badge>
            </div>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Digite a matrícula: o nome vem do cadastro. A mesma pessoa pode estar em mais de um armazém no mesmo dia.
            </p>

            {!ro && (
              <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                <Input
                  list="lista-chapas"
                  value={matriculaNova}
                  onChange={(e) => setMatriculaNova(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarChapa())}
                  placeholder="Ex.: CHAPA_08"
                />
                <datalist id="lista-chapas">
                  {chapas.map((c) => (
                    <option key={c.matricula} value={c.matricula}>
                      {c.nome}
                    </option>
                  ))}
                </datalist>

                <Select
                  value={tipoDiariaNova}
                  onChange={(e) => setTipoDiariaNova(e.target.value as 'COMPLETA' | 'MEIA')}
                >
                  <option value="COMPLETA">Completa</option>
                  <option value="MEIA">Meia</option>
                </Select>

                <Button onClick={adicionarChapa}>
                  <Plus /> Adicionar
                </Button>
              </div>
            )}
            <Erros>{erroEquipe}</Erros>

            {secAtual.equipe.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {secAtual.equipe.map((m, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-secondary/20 p-2.5 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="num font-mono font-bold text-xs">{m.matricula}</span>
                      <span className="font-medium">{m.nome}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ro ? (
                        <Badge>{m.tipoDiaria === 'COMPLETA' ? 'Completa' : 'Meia'}</Badge>
                      ) : (
                        <>
                          <Select
                            value={m.tipoDiaria}
                            onChange={(e) => alterarTipoDiaria(idx, e.target.value as 'COMPLETA' | 'MEIA')}
                            className="h-8 text-xs w-28"
                          >
                            <option value="COMPLETA">Completa</option>
                            <option value="MEIA">Meia</option>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removerChapa(idx)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum chapa lançado para este armazém.</p>
            )}
          </Painel>
        </div>

        {/* Fechamento do dia (painel lateral) */}
        <div className="grid gap-4 content-start">
          <Painel className="grid gap-3">
            <SecTitulo className="text-[17px]">Fechamento do dia</SecTitulo>
            <div className="grid gap-1.5 border-b pb-3 text-sm">
              {armazens.map((a) => {
                const s = secoes[a.id]
                const est = estadoSec(a.id)
                const r = s?.salvo
                  ? { total: s.salvo.total, situacao: s.salvo.situacao }
                  : calculos[a.id] && !('erro' in calculos[a.id])
                    ? (calculos[a.id] as ResumoBoletim)
                    : null
                return (
                  <div key={a.id} className="flex justify-between items-baseline">
                    <span className="text-muted-foreground">
                      {a.nome} <small className="text-xs">({est.t})</small>
                    </span>
                    <span className="num font-semibold">
                      {r && r.situacao === 'CONSISTENTE' && r.total != null ? brl2(r.total) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-between items-baseline pt-1">
              <div>
                <b className="block text-sm">Total a pagar do dia</b>
                <small className="text-xs text-muted-foreground">
                  {fechamentoDia.count} armazém(ns) calculados · complemento {brl2(fechamentoDia.compDia)}
                </small>
              </div>
              <span className="num font-display text-xl font-bold text-foreground">
                {brl2(fechamentoDia.totDia)}
              </span>
            </div>
          </Painel>

          {/* Resumo do Armazém Selecionado */}
          <Painel className="grid gap-3">
            <SecTitulo className="text-[17px]">{armAtual?.nome}</SecTitulo>

            {erroCalc && <Callout tom="ruim">{erroCalc}</Callout>}

            {!resumoAtual ? (
              <p className="text-sm text-muted-foreground">
                {secPreenchida(secAtual) ? 'Calculando…' : 'Lance a produção e a equipe para ver o cálculo.'}
              </p>
            ) : (
              <div className="grid gap-2.5 text-sm">
                {resumoAtual.situacao === 'INCONSISTENTE' && (
                  <Callout tom="ruim">
                    <b>Boletim inconsistente.</b> Há produção lançada, mas nenhuma diária informada. O pagamento não pode ser calculado sem equipe.
                  </Callout>
                )}

                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">Produção total</span>
                  <span className="num font-semibold">{brl4(resumoAtual.producao)}</span>
                </div>

                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">
                    Diárias equivalentes
                    <small className="block text-xs">
                      {resumoAtual.completas} completa(s) + {resumoAtual.meias} meia(s)
                    </small>
                  </span>
                  <span className="num font-semibold">{nf1.format(Number(resumoAtual.diarias))}</span>
                </div>

                {resumoAtual.situacao === 'CONSISTENTE' && (
                  <>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground">
                        Valor por diária
                        <small className="block text-xs">Piso: {brl4(piso)}</small>
                      </span>
                      <span className="num font-semibold">{brl4(resumoAtual.vpd)}</span>
                    </div>

                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground">
                        Complemento
                        <small className="block text-xs">
                          {resumoAtual.abaixo ? `Completa até ${brl4(piso)}/dia` : 'Acima do piso'}
                        </small>
                      </span>
                      <span className={`num font-semibold ${resumoAtual.abaixo ? 'text-warning font-bold' : ''}`}>
                        {brl4(resumoAtual.complemento)}
                      </span>
                    </div>

                    <div className="pt-2">
                      <span className="text-xs text-muted-foreground uppercase font-semibold">Total a pagar</span>
                      <div className="num font-display text-2xl font-bold text-foreground">
                        {brl4(resumoAtual.total)}
                      </div>
                      <small className="num text-xs text-muted-foreground">
                        {brl2(resumoAtual.total)} em reais e centavos
                      </small>
                    </div>
                  </>
                )}
              </div>
            )}

            {podeLancar && (
              <div className="mt-4 grid gap-2">
                <Button
                  onClick={salvarBoletim}
                  disabled={salvando || nRasc === 0}
                  className="w-full"
                >
                  {salvando ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  Salvar boletim do dia {nRasc > 0 ? `(${nRasc} armazéns)` : ''}
                </Button>
                <Erros>{erroGeral}</Erros>
              </div>
            )}
          </Painel>
        </div>
      </div>

      {/* Boletins salvos */}
      <Painel>
        <SecTitulo className="text-[17px]">Histórico de boletins salvos</SecTitulo>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Clique em um dia para carregar e conferir os detalhes na tela.
        </p>

        {diasSalvos.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Armazéns</TableHead>
                  <TableHead className="text-right">Produção</TableHead>
                  <TableHead className="text-right">Complemento</TableHead>
                  <TableHead className="text-right">Total a pagar</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diasSalvos.map((d) => {
                  const bolDoDia = boletins.filter((x) => x.data === d)
                  const consistentes = bolDoDia.filter((x) => x.situacao === 'CONSISTENTE')
                  const sm = (arr: TipoBoletim[], k: 'producao' | 'complemento' | 'total') =>
                    arr.reduce((tot, x) => tot + cent4(x[k]), 0n)
                  const origens = [...new Set(bolDoDia.map((x) => x.origem))]

                  return (
                    <TableRow
                      key={d}
                      onClick={() => setData(d)}
                      className="cursor-pointer hover:bg-secondary/40"
                    >
                      <TableCell className="font-semibold num">{fmtBR(d)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {bolDoDia.map((x) => (
                            <Badge key={x.id} tom={x.situacao === 'CONSISTENTE' ? 'ok' : 'ruim'}>
                              {x.armazem}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right num">{brl4(big4(sm(bolDoDia, 'producao')))}</TableCell>
                      <TableCell className="text-right num">{brl4(big4(sm(consistentes, 'complemento')))}</TableCell>
                      <TableCell className="text-right num font-semibold">
                        {brl4(big4(sm(consistentes, 'total')))}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {origens.map((orig) => (
                            <OrigemBadge key={orig} origem={orig} />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum boletim salvo ainda.</p>
        )}
      </Painel>
    </div>
  )
}
