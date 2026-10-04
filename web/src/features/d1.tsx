import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Input, Select } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Badge, Barras, CabecalhoPagina, Callout, Painel, SecTitulo, Tile, Tiles, Vazio,
} from '@/components/comum'
import { ACOND, DOW_LONGO, SLOTS, STATUS } from '@/lib/constants'
import {
  D1_LIM, D1_PERIODOS, NIVEL_TOM, NIVEL_TXT, calcularD1, nivelPressao, proximoDiaUtilSimples,
  type CelulaSlot, type LinhaD1, type Nivel,
} from '@/lib/d1'
import { addDays, dow, fmtBR, hojeISO, nf0, nf2 } from '@/lib/format'
import { useDados } from '@/lib/store'
import { codigoAg } from '@/features/checkin/util'

export function D1() {
  const { ags, armazens, boletins, fornById } = useDados()

  const [data, setData] = useState(() => proximoDiaUtilSimples(hojeISO()))
  const [simArmId, setSimArmId] = useState<number>(() => armazens[0]?.id ?? 1)
  const [simEquipe, setSimEquipe] = useState<number | null>(null)

  // Dialog explicativo ("Por quê?")
  const [explicar, setExplicar] = useState<{ linha: LinhaD1; h: string; cel: CelulaSlot } | null>(null)

  const fmtKg = (n: number) => nf0.format(n)

  // Cálculo D-1 sem simulação
  const planoBase = useMemo(
    () => calcularD1(data, ags, armazens, boletins, fmtKg, null),
    [data, ags, armazens, boletins],
  )

  // Armazém e equipe atual para o simulador
  const armIdValido = armazens.some((a) => a.id === simArmId) ? simArmId : (armazens[0]?.id ?? 1)
  const linhaSimBase = planoBase.linhas.find((x) => x.id === armIdValido)
  const picoSim = linhaSimBase?.pico ?? 0
  const refSim = linhaSimBase?.ref?.n ?? null
  const equipeAtualSim = simEquipe ?? refSim ?? Math.max(picoSim, 4)

  // Cálculo com a equipe simulada para o armazém selecionado
  const planoComSim = useMemo(
    () => calcularD1(data, ags, armazens, boletins, fmtKg, { [armIdValido]: equipeAtualSim }),
    [data, ags, armazens, boletins, armIdValido, equipeAtualSim],
  )

  const aut = planoBase.ags.filter((a) => ['AUTORIZADO', 'EM_DESCARGA', 'CONCLUIDO'].includes(a.status)).length
  const pend = planoBase.ags.filter((a) => a.status === 'PENDENTE_COMPRAS').length
  const semDest = planoBase.ags.filter((a) => !a.descs.length).length

  // Alertas
  const alertas = useMemo(() => {
    const list: { linha: LinhaD1; h: string; cel: CelulaSlot }[] = []
    planoComSim.linhas.forEach((L) => {
      SLOTS.forEach((h) => {
        const c = L.slots[h]
        if (['ALTA', 'MODERADA'].includes(c.nivel.k)) {
          list.push({ linha: L, h, cel: c })
        }
      })
    })
    return list.sort((a, b) => (b.cel.nivel.k === 'ALTA' ? 1 : 0) - (a.cel.nivel.k === 'ALTA' ? 1 : 0) || a.h.localeCompare(b.h))
  }, [planoComSim])

  // Gráficos por horário, acondicionamento e armazém
  const porHora: [string, number][] = SLOTS.map((h) => [h, planoBase.ags.filter((a) => a.horario === h).length])
  const porAc: [string, number][] = Object.entries(ACOND).map(([k, v]) => [v.nome, planoBase.ags.filter((a) => a.acond === k).length])
  const porArm: [string, number][] = planoBase.linhas
    .filter((L) => L.id != null && L.entregas > 0)
    .map((L) => [L.nome, L.entregas])

  const nomeDia = `${DOW_LONGO[dow(data)]}, ${fmtBR(data)}`

  // Navegação de dias
  function navegarDia(delta: number) {
    let d = addDays(data, delta)
    while (dow(d) === 0 || dow(d) === 6) d = addDays(d, delta)
    setData(d)
  }

  // Cenários do simulador
  const cenarios = useMemo(() => {
    if (!linhaSimBase) return []
    const ini = Math.max(1, (refSim || Math.max(picoSim, 4)) - 2)
    const list: number[] = []
    for (let t = ini; t < ini + 7; t++) list.push(t)

    const ordem: Record<string, number> = { ALTA: 4, MODERADA: 3, BAIXA: 2, SEM: 0, ND: 1 }
    return list.map((t) => {
      const sl = SLOTS.map((h) => nivelPressao(linhaSimBase.slots[h].need, t))
      const pior = sl.slice().sort((a, b) => ordem[b.k] - ordem[a.k])[0]
      return {
        t,
        pior,
        altas: sl.filter((x) => x.k === 'ALTA').length,
        mods: sl.filter((x) => x.k === 'MODERADA').length,
      }
    })
  }, [linhaSimBase, refSim, picoSim])

  const linhaSimAtual = planoComSim.linhas.find((x) => x.id === armIdValido)
  const cenarioAtual = useMemo(() => {
    if (!linhaSimBase) return null
    const sl = SLOTS.map((h) => nivelPressao(linhaSimBase.slots[h].need, equipeAtualSim))
    const ordem: Record<string, number> = { ALTA: 4, MODERADA: 3, BAIXA: 2, SEM: 0, ND: 1 }
    const pior = sl.slice().sort((a, b) => ordem[b.k] - ordem[a.k])[0]
    return {
      t: equipeAtualSim,
      pior,
      altas: sl.filter((x) => x.k === 'ALTA').length,
      mods: sl.filter((x) => x.k === 'MODERADA').length,
    }
  }, [linhaSimBase, equipeAtualSim])

  const txtCenario = (pior: Nivel) =>
    pior.k === 'SEM'
      ? 'Sem carga prevista'
      : pior.k === 'ALTA'
        ? 'Pressão alta'
        : pior.k === 'MODERADA'
          ? 'Pressão moderada'
          : pior.realoc
            ? 'Capacidade potencialmente disponível para realocação'
            : 'Cenário compatível'

  return (
    <div className="grid gap-6">
      <CabecalhoPagina
        titulo="Planejamento D-1"
        quem="Quem usa: direção e responsável pelo armazém"
        sub="Organiza o que está previsto para o próximo dia operacional a partir dos agendamentos já cadastrados e mostra onde existe maior pressão. Não grava nada: é só leitura e planejamento."
        acoes={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => navegarDia(-1)} aria-label="Dia anterior">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setData(proximoDiaUtilSimples(hojeISO()))}>
              Próximo dia operacional
            </Button>
            <Button variant="outline" size="sm" onClick={() => navegarDia(1)} aria-label="Próximo dia">
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <Callout tom="info">
        <b>{nomeDia}</b>. O módulo trabalha com <b>níveis</b> (baixa, moderada e alta pressão), não com um número exato de chapas, porque as regras de negócio ainda não permitem calcular um número exato. Cada alerta tem o botão “Por quê?”.
      </Callout>

      <Tiles>
        <Tile rotulo="Entregas agendadas" valor={nf0.format(planoBase.ags.length)} sub="no dia (cancelados não contam)" />
        <Tile rotulo="Autorizadas por Compras" valor={nf0.format(aut)} sub={`${pend} aguardando Compras`} />
        <Tile rotulo="Destino a definir" valor={nf0.format(semDest)} sub="sem armazém definido" />
        <Tile rotulo="Alertas de pressão" valor={nf0.format(alertas.length)} sub={`${alertas.filter((a) => a.cel.nivel.k === 'ALTA').length} de pressão alta`} />
      </Tiles>

      {!planoBase.ags.length && <Vazio>Nenhuma entrega agendada para este dia.</Vazio>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel>
          <SecTitulo className="text-[17px]">Por horário</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Entregas agendadas por horário da grade.</p>
          <Barras itens={porHora} />
        </Painel>

        <Painel>
          <SecTitulo className="text-[17px]">Por acondicionamento</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Batido, paletizado e big bag.</p>
          <Barras itens={porAc} cor="verde" />

          <SecTitulo className="mt-6 text-[17px]">Por armazém</SecTitulo>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Entregas com destino já atribuído.</p>
          {porArm.length ? <Barras itens={porArm} /> : <p className="text-sm text-muted-foreground">Sem destinos definidos.</p>}
        </Painel>
      </div>

      <Painel>
        <SecTitulo className="text-[17px]">Pressão estimada por horário e armazém</SecTitulo>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Chapas simultâneas exigidas pela norma do Dossiê (batido 5, paletizado e big bag 2) comparadas com a equipe de referência do armazém (média dos últimos boletins) ou a simulada abaixo.
        </p>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Armazém</TableHead>
                {SLOTS.map((h) => (
                  <TableHead key={h} className="text-right">{h}</TableHead>
                ))}
                <TableHead className="text-right">Nível do dia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planoComSim.linhas.filter((L) => L.id != null || L.entregas > 0).map((L) => (
                <TableRow key={String(L.id)}>
                  <TableCell>
                    <div className="font-bold">{L.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {L.team != null
                        ? `equipe ${L.team} chapa(s) · ${L.tipo}`
                        : L.id == null
                          ? 'sem equipe: destino a definir'
                          : 'sem equipe de referência'}
                    </div>
                  </TableCell>
                  {SLOTS.map((h) => {
                    const c = L.slots[h]
                    if (!c.need) {
                      return <TableCell key={h} className="text-right text-muted-foreground">—</TableCell>
                    }
                    return (
                      <TableCell key={h} className="text-right">
                        <div className="font-semibold num">{c.need} chapa(s)</div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setExplicar({ linha: L, h, cel: c })}
                        >
                          <Badge tom={NIVEL_TOM[c.nivel.k]}>
                            {c.nivel.k === 'ND' ? 'sem ref' : c.nivel.k.toLowerCase()}
                          </Badge>
                          <HelpCircle className="ml-0.5 size-3" />
                        </Button>
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-right whitespace-nowrap">
                    <Badge tom={NIVEL_TOM[L.nivel.k]}>{NIVEL_TXT[L.nivel.k]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Limiares: alta acima de {nf2.format(D1_LIM.alta)}, moderada acima de {nf2.format(D1_LIM.moderada)} (necessidade ÷ equipe). São parâmetros do projeto, não regra da Cocapec. Paletizado e big bag abaixo de 500 kg seguem em aberto (DQ-016): usamos 2 chapas e sinalizamos.
        </p>
      </Painel>

      {/* Alertas explicáveis */}
      <Painel>
        <SecTitulo className="text-[17px]">Alertas explicáveis</SecTitulo>
        {alertas.length ? (
          <ul className="mt-3 grid gap-2">
            {alertas.map(({ linha: L, h, cel: c }, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tom={NIVEL_TOM[c.nivel.k]}>
                    {c.nivel.k === 'ALTA' ? 'alta' : 'moderada'}
                  </Badge>
                  <span>
                    <b>{L.nome}</b> às <b>{h}</b>: {c.need} chapa(s) simultâneas para {L.team ?? '—'} na equipe ({c.itens.length} entrega(s)).
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExplicar({ linha: L, h, cel: c })}
                >
                  Por quê?
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum horário com pressão moderada ou alta para este dia, com a equipe considerada.
          </p>
        )}
      </Painel>

      {/* Simulador de equipe */}
      <Painel id="d1-sim">
        <SecTitulo className="text-[17px]">Simulador de equipe</SecTitulo>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Altere só o cenário de equipe e veja como a pressão estimada mudaria, usando o mesmo motor do Planejamento D-1 para {fmtBR(data)}. <b>Nada é gravado</b>: não muda boletins, agendamentos nem a equipe real.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Armazém">
            <Select value={armIdValido} onChange={(e) => {
              setSimArmId(Number(e.target.value))
              setSimEquipe(null)
            }}>
              {armazens.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Chapas disponíveis no cenário">
            <Input
              type="number"
              min={1}
              max={30}
              value={equipeAtualSim}
              onChange={(e) => setSimEquipe(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            />
          </Field>
          <Tile rotulo="Necessidade pico" valor={`${picoSim} chapa(s)`} />
          <Tile rotulo="Equipe de referência" valor={refSim != null ? `${refSim} chapa(s)` : '—'} />
        </div>

        {cenarioAtual && linhaSimAtual && (
          <div className="mt-6 rounded-xl border bg-secondary/30 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tom={NIVEL_TOM[cenarioAtual.pior.k]}>
                  {txtCenario(cenarioAtual.pior)}
                </Badge>
                <h3 className="mt-1 font-display text-xl font-bold">
                  {equipeAtualSim} chapa(s): {txtCenario(cenarioAtual.pior).toLowerCase()}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {cenarioAtual.altas > 0 && `${cenarioAtual.altas} horário(s) com pressão alta. `}
                  {cenarioAtual.mods > 0 && `${cenarioAtual.mods} com pressão moderada. `}
                  {cenarioAtual.pior.realoc && (
                    <>
                      Neste cenário haveria <b>capacidade disponível para realocação</b> (outras atividades, como o carregamento de cooperados), sem recomendar redução permanente de equipe.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {SLOTS.map((h) => (
                      <TableHead key={h} className="text-right">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    {SLOTS.map((h) => {
                      const c = linhaSimAtual.slots[h]
                      return (
                        <TableCell key={h} className="text-right">
                          {c.need > 0 ? (
                            <>
                              <div className="font-bold num">{c.need} chapa(s)</div>
                              <Badge tom={NIVEL_TOM[c.nivel.k]}>
                                {c.nivel.k === 'ALTA' ? 'alta' : c.nivel.k === 'MODERADA' ? 'moderada' : 'baixa'}
                              </Badge>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="mt-6">
          <SecTitulo className="text-sm">Comparar cenários de equipe</SecTitulo>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipe</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead className="text-right">Horários em pressão alta</TableHead>
                  <TableHead className="text-right">Em pressão moderada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cenarios.map((x) => {
                  const ehAtual = x.t === equipeAtualSim
                  return (
                    <TableRow key={x.t} className={ehAtual ? 'bg-secondary/60 font-semibold' : ''}>
                      <TableCell className="num">
                        {x.t} chapa(s)
                        {refSim != null && x.t === refSim && (
                          <span className="ml-1 text-xs text-muted-foreground">(referência)</span>
                        )}
                        {ehAtual && (
                          <span className="ml-1 text-xs text-info">(cenário atual)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge tom={NIVEL_TOM[x.pior.k]}>{txtCenario(x.pior)}</Badge>
                      </TableCell>
                      <TableCell className="text-right num">{x.altas}</TableCell>
                      <TableCell className="text-right num">{x.mods}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <Callout tom="aviso" className="mt-5">
          <b>O que o simulador não faz:</b> não grava uma nova equipe; não altera boletins ou agendamentos; não recomenda contratação ou demissão permanente; não inventa impacto financeiro quando os dados não sustentam o cálculo. Prefira dizer “capacidade disponível para realocação”, não “funcionários sobrando”.
        </Callout>
      </Painel>

      {/* Dialog Por Quê */}
      {explicar && (
        <Dialog open onOpenChange={(o) => !o && setExplicar(null)}>
          <DialogContent wide>
            <DialogHeader>
              <DialogTitle>
                Por que {NIVEL_TXT[explicar.cel.nivel.k].toLowerCase()}? · {explicar.linha.nome} às {explicar.h}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge tom={NIVEL_TOM[explicar.cel.nivel.k]}>{NIVEL_TXT[explicar.cel.nivel.k]}</Badge>
                <span className="text-muted-foreground">{fmtBR(data)}</span>
              </div>

              <div>
                <SecTitulo className="text-sm">Quem contribui</SecTitulo>
                {explicar.cel.itens.length ? (
                  <ul className="mt-2 grid gap-1.5 list-disc pl-5">
                    {explicar.cel.itens.map((it, idx) => (
                      <li key={idx}>
                        <b>{codigoAg(it.ag.id)}</b> · {fornById(it.ag.fornecedorId).curto} · {ACOND[it.ag.acond].nome} · {STATUS[it.ag.status]} → <b>{it.chapas} chapa(s)</b> pela norma
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">Nenhuma entrega prevista neste horário.</p>
                )}
              </div>

              <div>
                <SecTitulo className="text-sm">Como o nível foi decidido</SecTitulo>
                <ol className="mt-2 grid gap-1.5 list-decimal pl-5">
                  <li>Chapas simultâneas exigidas pela norma do Dossiê (§7): batido 5, paletizado ou big bag 2. Neste horário: <b>{explicar.cel.need}</b>.</li>
                  <li>Equipe considerada: {explicar.linha.tipo === 'simulada' ? `equipe simulada de ${explicar.linha.team} chapa(s)` : explicar.linha.ref ? `equipe de referência de ${explicar.linha.team} chapa(s) (média dos ${explicar.linha.ref.amostra} boletins mais recentes)` : 'sem equipe de referência para este armazém'}.</li>
                  {explicar.cel.nivel.r != null && (
                    <li>Razão = {explicar.cel.need} ÷ {explicar.linha.team} = <b>{nf2.format(explicar.cel.nivel.r)}</b>.</li>
                  )}
                  <li>Limiares (parâmetros do projeto, não da Cocapec): acima de {nf2.format(D1_LIM.alta)} é pressão alta; acima de {nf2.format(D1_LIM.moderada)} até {nf2.format(D1_LIM.alta)} é moderada; até {nf2.format(D1_LIM.moderada)} é compatível{explicar.cel.nivel.realoc ? ' (e até 0,40 indica capacidade potencialmente disponível para realocação)' : ''}.</li>
                </ol>
              </div>

              <div>
                <SecTitulo className="text-sm">Para ler com cuidado</SecTitulo>
                <ul className="mt-2 grid gap-1 list-disc pl-5 text-muted-foreground">
                  <li>É um nível, não uma previsão exata de chapas: a Cocapec ainda não definiu uma fórmula de dimensionamento.</li>
                  <li>A chegada real pode atrasar e as descargas de horários vizinhos podem se sobrepor; o D-1 não prevê isso.</li>
                  {[...new Set(explicar.cel.itens.map((i) => i.nota).filter(Boolean))].map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExplicar(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
