/*
 * Timeline visual da jornada do caminhão.
 * Mostra cada etapa (agendamento → validação → portaria → descarga → saída)
 * com horários reais, duração entre etapas e alertas de gargalo.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, CalendarClock, Check, Clock, FileText, Loader2, Package, Ship, Truck, Warehouse, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AcondBadge, Badge, Callout, OrigemBadge, StatusBadge } from '@/components/comum'
import { GET } from '@/lib/api'
import { fmtDM, fmtHM, fmtTS, minDiff, fmtDur } from '@/lib/format'
import { useDados } from '@/lib/store'
import type { Agendamento, Descarga, Evento } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Etapa {
  icone: string
  rotulo: string
  horario: string | null
  descricao?: string
  cor: 'ok' | 'aviso' | 'ruim' | 'neutro'
  duracao?: number | null
  alerta?: string
}

const CORES: Record<string, string> = { ok: 'text-success', aviso: 'text-warning', ruim: 'text-destructive', neutro: 'text-muted-foreground' }
const BGCORES: Record<string, string> = { ok: 'bg-success', aviso: 'bg-warning', ruim: 'bg-destructive', neutro: 'bg-secondary' }
type CorTimeline = 'ok' | 'aviso' | 'ruim' | 'neutro'

export function TimelineDialog({ ag, onFechar }: { ag: Agendamento | null; onFechar: () => void }) {
  const { fornById } = useDados()
  if (!ag) return null
  const f = fornById(ag.fornecedorId)

  const [eventos, setEventos] = useState<Evento[]>([])
  useEffect(() => {
    GET<Evento[]>(`/api/agendamentos/${ag.id}/eventos`).then(setEventos).catch(() => {})
  }, [ag.id])

  const etapas: Etapa[] = []

  // 1. Agendamento criado
  etapas.push({
    icone: 'edit',
    rotulo: 'Agendamento criado',
    horario: ag.criadoEm,
    cor: 'neutro',
  })

  // 2. Autorizado (se compras decidiu)
  if (ag.compras) {
    const autorizado = ag.compras.decisao === 'AUTORIZADO'
    etapas.push({
      icone: autorizado ? 'check' : 'x',
      rotulo: autorizado ? 'Autorizado por Compras' : 'Não autorizado por Compras',
      horario: ag.compras.decisao === 'AUTORIZADO' ? null : null,
      descricao: ag.compras.pedido ? `Pedido: ${ag.compras.pedido}` : undefined,
      cor: autorizado ? 'ok' : 'ruim',
    })
  }

  // 3. Chegada na portaria
  const esperado = `${ag.data} ${ag.horario}`
  const chegou = ag.chegadaEm
  let atraso = null
  if (chegou) {
    const chegadoMin = minDiff(esperado.slice(0, 10) + 'T' + ag.horario + ':00', chegou.slice(0, 16))
    atraso = chegadoMin
    etapas.push({
      icone: 'truck',
      rotulo: 'Chegada na portaria',
      horario: chegadoMin !== null && chegadoMin > 0
        ? `${fmtTS(chegou)} (${chegadoMin} min após o previsto)`
        : fmtTS(chegou),
      cor: chegadoMin != null && chegadoMin > 15 ? 'ruim' : chegadoMin != null && chegadoMin > 5 ? 'aviso' : 'ok',
      alerta: chegadoMin != null && chegadoMin > 15 ? 'Caminhão chegou com atraso' : undefined,
    })
  } else {
    etapas.push({
      icone: 'truck',
      rotulo: 'Chegada na portaria',
      horario: null,
      cor: 'neutro',
    })
  }

  // 4. Para cada descarga
  ag.descs.forEach((d, i) => {
    const arm = d.armazem || `Armazém ${d.armazemId}`
    if (i > 0) {
      etapas.push({
        icone: 'split',
        rotulo: `─── ${arm} ───`,
        horario: null,
        cor: 'neutro',
      })
    }
    // Chegada na descarga
    etapas.push({
      icone: 'warehouse',
      rotulo: `Chegada no armazém`,
      horario: d.chegada ? fmtTS(d.chegada) : null,
      descricao: d.chegada ? arm : undefined,
      cor: d.chegada ? 'ok' : 'neutro',
    })
    // Espera entre chegada e entrada
    if (d.chegada && d.entrada) {
      const espera = minDiff(d.chegada, d.entrada)
      if (espera != null && espera > 0) {
        etapas.push({
          icone: 'clock',
          rotulo: `Espera de ${fmtDur(espera)}`,
          horario: null,
          cor: espera > 30 ? 'ruim' : espera > 15 ? 'aviso' : 'ok',
          alerta: espera > 30 ? 'Tempo de espera alto' : undefined,
        })
      }
    }
    // Entrada (início descarga)
    etapas.push({
      icone: 'play',
      rotulo: 'Início da descarga',
      horario: d.entrada ? fmtTS(d.entrada) : null,
      descricao: d.chapas != null ? `${d.chapas} chapas` : undefined,
      cor: d.entrada ? 'ok' : 'neutro',
    })
    // Saída (fim descarga)
    if (d.saida) {
      const duracao = d.entrada && d.saida ? minDiff(d.entrada, d.saida) : null
      const alerta = duracao != null && duracao > 120 ? 'Descarga demorou mais que o esperado' : undefined
      etapas.push({
        icone: 'check',
        rotulo: 'Fim da descarga',
        horario: fmtTS(d.saida),
        descricao: duracao != null ? `Duração: ${fmtDur(duracao)}` : undefined,
        cor: alerta ? 'aviso' : 'ok',
        alerta,
        duracao,
      })
    }
  })

  // 5. Eventos importantes (reagendamentos)
  eventos.filter((e) => e.tipo === 'REAGENDAMENTO').forEach((e) => {
    const de = e.detalhe?.de
    const para = e.detalhe?.para
    etapas.push({
      icone: 'calendar',
      rotulo: 'Reagendado',
      horario: e.ocorridoEm ? fmtTS(e.ocorridoEm) : null,
      descricao: de && para ? `De ${de.data} ${de.horario} → ${para.data} ${para.horario}` : undefined,
      cor: 'aviso',
      alerta: e.detalhe?.casoFortuito ? 'Caso fortuito: limite de capacidade ignorado' : undefined,
    })
  })

  // 6. Situação final
  const status = ag.status
  const statusCor: Record<string, 'ok' | 'neutro' | 'aviso' | 'ruim'> = {
    CONCLUIDO: 'ok',
    CANCELADO: 'ruim',
    NAO_RECEBIDO: 'ruim',
    NAO_AUTORIZADO: 'ruim',
    EM_DESCARGA: 'aviso',
  }
  etapas.push({
    icone: 'flag',
    rotulo: `Situação final: ${({
      PENDENTE_COMPRAS: 'Aguardando Compras',
      AUTORIZADO: 'Autorizado (aguardando chegada)',
      NAO_AUTORIZADO: 'Não autorizado',
      EM_DESCARGA: 'Em descarga',
      CONCLUIDO: 'Concluído',
      CANCELADO: 'Cancelado',
      NAO_RECEBIDO: 'Não recebido',
    }[status] ?? status)}`,
    horario: null,
    cor: statusCor[status] ?? 'neutro',
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Timeline da entrega</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Truck className="size-5 text-primary" />
            <h3 className="text-lg font-bold">{f?.nome}</h3>
            <AcondBadge acond={ag.acond} />
            <StatusBadge status={ag.status} />
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            Agendado para <b>{fmtDM(ag.data)} às {ag.horario}</b>. A linha do tempo mostra cada etapa do recebimento.
          </p>

          <div className="grid gap-2">
            {etapas.map((etapa, i) => {
              const ultima = i === etapas.length - 1
              return (
                <div key={i} className={cn(
                  'grid items-start gap-1.5 min-h-[32px]',
                  i > 0 && 'mt-1.5',
                )}>
                  <div className="flex items-start gap-3">
                    {/* Indicador visual */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className={cn(
                        'grid size-3 place-items-center rounded-full',
                        BGCORES[etapa.cor] ?? 'bg-secondary',
                      )}>
                        <div className="size-[9px] rounded-full" />
                      </div>
                      {!ultima && <div className="w-px h-3.5 bg-border/40" />}
                    </div>
                    {/* Conteúdo */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <IconeTL tipo={etapa.icone} cor={etapa.cor} />
                        <span className={cn('text-sm font-semibold', CORES[etapa.cor])}>{etapa.rotulo}</span>
                        {etapa.alerta && (
                          <Badge tom={etapa.cor === 'ruim' ? 'ruim' : 'aviso'}>{etapa.alerta}</Badge>
                        )}
                      </div>
                      {etapa.horario && (
                        <div className="text-xs text-muted-foreground mt-0.5">{etapa.horario}</div>
                      )}
                      {etapa.descricao && (
                        <div className="text-xs text-muted-foreground">{etapa.descricao}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IconeTL({ tipo, cor }: { tipo: string; cor: CorTimeline }) {
  const cls = cn('size-3.5 shrink-0', CORES[cor])
  const icones: Record<string, ReactNode> = {
    edit: <FileText className={cls} />,
    check: <Check className={cls} />,
    x: <XCircle className={cls} />,
    truck: <Truck className={cls} />,
    warehouse: <Warehouse className={cls} />,
    clock: <Clock className={cls} />,
    play: <ArrowRight className={cls} />,
    calendar: <CalendarClock className={cls} />,
    flag: <Ship className={cls} />,
    split: <Package className={cls} />,
  }
  return icones[tipo] ?? <div className={'size-2 rounded-full ' + (BGCORES[cor] ?? 'bg-secondary')} />
}
