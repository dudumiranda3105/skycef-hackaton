import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AcondBadge, Badge, CabecalhoPagina, Erros, OrigemBadge, Vazio } from '@/components/comum'
import { ACOND } from '@/lib/constants'
import { POST, errTxt, porDataHora } from '@/lib/api'
import { fmtCnpj, fmtDM } from '@/lib/format'
import { avisar, useAuth, useDados } from '@/lib/store'
import type { Agendamento } from '@/lib/types'
import { nfsTxt } from '@/features/agenda/agenda'

function CartaoCompras({ a }: { a: Agendamento }) {
  const { fornById, refresh } = useDados()
  const { pf } = useAuth()
  const f = fornById(a.fornecedorId)
  const [pedido, setPedido] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function decidir(decisao: 'AUTORIZADO' | 'NAO_AUTORIZADO') {
    if (decisao === 'AUTORIZADO' && !pedido.trim()) return setErro('Informe o número do pedido para autorizar.')
    if (decisao === 'NAO_AUTORIZADO' && !obs.trim()) return setErro('Explique na observação por que não autorizou.')
    setOcupado(true)
    try {
      await POST(`/api/agendamentos/${a.id}/validacao-compras`, { decisao, pedidoReferencia: pedido.trim() || undefined, observacao: obs.trim() || undefined })
      await refresh()
      avisar(decisao === 'AUTORIZADO' ? 'Autorizado. Segue para o armazém definir destinos.' : 'Não autorizado. A decisão ficou registrada e a vaga foi liberada.')
    } catch (e) {
      setErro(errTxt(e))
      setOcupado(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-3.5 rounded-xl border border-l-[5px] bg-card p-5" style={{ borderLeftColor: ACOND[a.acond].cor }}>
      <div className="flex flex-wrap items-start justify-between gap-x-3.5 gap-y-1.5">
        <div>
          <h3 className="text-[17px]">{f.nome}</h3>
          <div className="mt-0.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13.5px] text-muted-foreground">
            <span>Entrega <b className="num text-foreground">{fmtDM(a.data)} · {a.horario}</b></span>
            <span>Notas <b className="text-foreground">{nfsTxt(a)}</b></span>
            {f.cnpj && <span>CNPJ <b className="num text-foreground">{fmtCnpj(f.cnpj)}</b></span>}
          </div>
        </div>
        <div className="flex items-center gap-2"><AcondBadge acond={a.acond} /><OrigemBadge origem={a.origem} /></div>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Pedido de compra"><Input value={pedido} maxLength={20} placeholder="Ex.: PC-25878" onChange={(e) => setPedido(e.target.value)} /></Field>
        <Field label="Observação" hint="obrigatória se não autorizar"><Input value={obs} maxLength={240} onChange={(e) => setObs(e.target.value)} /></Field>
      </div>
      <Erros>{erro}</Erros>
      {pf('compras') && (
        <div className="flex gap-2">
          <Button disabled={ocupado} onClick={() => void decidir('AUTORIZADO')}><Check /> Autorizar</Button>
          <Button variant="danger" disabled={ocupado} onClick={() => void decidir('NAO_AUTORIZADO')}><X /> Não autorizar</Button>
        </div>
      )}
    </div>
  )
}

export function Compras() {
  const { ags, fornById } = useDados()
  const pend = ags.filter((a) => a.status === 'PENDENTE_COMPRAS').sort(porDataHora)
  const feitos = ags.filter((a) => a.compras).sort((a, b) => porDataHora(b, a)).slice(0, 8)
  return (
    <div>
      <CabecalhoPagina
        titulo="Validação de Compras" quem="Quem usa: setor de Compras"
        sub="Confira se as notas fiscais batem com o pedido de compra e registre a decisão. Sem integração com o SAP: o número do pedido é digitado."
      />
      {pend.length ? (
        <div className="grid gap-3.5">{pend.map((a) => <CartaoCompras key={a.id} a={a} />)}</div>
      ) : (
        <Vazio>Nada aguardando validação. Os novos agendamentos aparecem aqui.</Vazio>
      )}
      <section className="mt-6">
        <h2 className="mb-2.5 text-[21px]">Últimas decisões</h2>
        {feitos.length ? (
          <div className="rounded-2xl border bg-card px-2 py-1">
            <Table>
              <TableHeader><TableRow><TableHead>Entrega</TableHead><TableHead>Fornecedor</TableHead><TableHead>Pedido</TableHead><TableHead>Decisão</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
              <TableBody>
                {feitos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="num">{fmtDM(a.data)} {a.horario}</TableCell>
                    <TableCell>{fornById(a.fornecedorId).curto}</TableCell>
                    <TableCell>{a.compras!.pedido || '—'}</TableCell>
                    <TableCell>{a.compras!.decisao === 'AUTORIZADO' ? <Badge tom="ok">Autorizado</Badge> : <Badge tom="ruim">Não autorizado</Badge>}</TableCell>
                    <TableCell><OrigemBadge origem={a.origem} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Vazio>Ainda sem decisões.</Vazio>
        )}
      </section>
    </div>
  )
}
