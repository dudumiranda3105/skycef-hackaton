import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Badge, Barras, CabecalhoPagina, Callout, Painel, SecTitulo, Tile, Tiles, Vazio,
} from '@/components/comum'
import { ACOND, DOW_LONGO, SLOTS, STATUS } from '@/lib/constants'
import {
  D1_LIM, D1_PERIODOS, NIVEL_TOM, NIVEL_TXT, calcularD1, proximoDiaUtilSimples,
  type CelulaSlot, type LinhaD1,
} from '@/lib/d1'
import { addDays, dow, fmtBR, hojeISO, nf0, nf2 } from '@/lib/format'
import { useDados } from '@/lib/store'
import { codigoAg } from '@/features/checkin/util'

export function D1() {
  const { ags, armazens, boletins, fornById } = useDados()

  const [data, setData] = useState(() => proximoDiaUtilSimples(hojeISO()))

  // Dialog explicativo ("Por quê?")
  const [explicar, setExplicar] = useState<{ linha: LinhaD1; h: string; cel: CelulaSlot } | null>(null)

  const fmtKg = (n: number) => nf0.format(n)

  // Cálculo D-1 sem simulação
  const planoBase = useMemo(
    () => calcularD1(data, ags, armazens, boletins, fmtKg),
    [data, ags, armazens, boletins],
  )

  const aut = planoBase.ags.filter((a) => ['AUTORIZADO', 'EM_DESCARGA', 'CONCLUIDO'].includes(a.status)).length
  const pend = planoBase.ags.filter((a) => a.status === 'PENDENTE_COMPRAS').length
  const semDest = planoBase.ags.filter((a) => !a.descs.length).length

  // Alertas
  const alertas = useMemo(() => {
    const list: { linha: LinhaD1; h: string; cel: CelulaSlot }[] = []
    planoBase.linhas.forEach((L) => {
      SLOTS.forEach((h) => {
        const c = L.slots[h]
        if (['ALTA', 'MODERADA'].includes(c.nivel.k)) {
          list.push({ linha: L, h, cel: c })
        }
      })
    })
    return list.sort((a, b) => (b.cel.nivel.k === 'ALTA' ? 1 : 0) - (a.cel.nivel.k === 'ALTA' ? 1 : 0) || a.h.localeCompare(b.h))
  }, [planoBase])

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
          Chapas simultâneas pela norma do Dossiê (abaixo de 500 kg: 0; batido acima de 500 kg: 5; paletizado ou big bag: 2 em qualquer peso), comparadas com a equipe de referência do armazém (média dos boletins reais registrados).
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          Cargas de máquinas e implementos também exigem operador de empilhadeira ou trator e ao menos 1 chapa. Como o agendamento ainda não identifica o tipo de item nem a disponibilidade de operador, confirme essa necessidade com o armazém; ela não é inferida neste cálculo.
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
              {planoBase.linhas.filter((L) => L.id != null || L.entregas > 0).map((L) => (
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
          A norma prevê 0 chapas abaixo de 500 kg, 5 para carga batida acima de 500 kg e 2 para paletizado ou big bag em qualquer peso. O Dossiê não define o caso exato de 500 kg: a estimativa usa 5 e sinaliza para confirmação. Se o peso estiver ausente, usa-se a referência do acondicionamento e sinaliza-se a falta do dado. Limiares: alta acima de {nf2.format(D1_LIM.alta)}, moderada acima de {nf2.format(D1_LIM.moderada)} (necessidade ÷ equipe); são parâmetros do projeto, não regra da Cocapec.
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
                  <li>Chapas simultâneas pela norma do Dossiê (§7): abaixo de 500 kg, 0; batido acima de 500 kg, 5; paletizado ou big bag, 2 em qualquer peso. Neste horário: <b>{explicar.cel.need}</b>.</li>
                  <li>Equipe considerada: {explicar.linha.ref ? `equipe de referência de ${explicar.linha.team} chapa(s) (média dos ${explicar.linha.ref.amostra} boletins reais mais recentes)` : 'sem equipe de referência para este armazém'}.</li>
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
