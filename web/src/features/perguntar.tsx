import { useState } from 'react'
import { ArrowRight, CornerDownLeft, Loader2, MessageCircleQuestion, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  Badge, CabecalhoPagina, Callout, OrigemBadge, Painel, SecTitulo,
} from '@/components/comum'
import { errTxt } from '@/lib/api'
import {
  METRICAS, PERGUNTAS_EXEMPLO, filtrosTxt, interpretar,
  type Interpretacao, type Resposta,
} from '@/lib/pergunte'
import { useDados } from '@/lib/store'
import { useRota } from '@/lib/rota'

interface ItemHistorico {
  pergunta: string
  interp: Interpretacao
  resposta: Resposta
}

export function Perguntar() {
  const { ags, armazens, boletins, fornById } = useDados()
  const { ir } = useRota()

  const [pergunta, setPergunta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [historico, setHistorico] = useState<ItemHistorico[]>([])

  async function enviar(texto?: string) {
    const q = (texto ?? pergunta).trim()
    if (!q || ocupado) return
    setOcupado(true)
    const interp = interpretar(q, armazens)

    let resposta: Resposta
    if (!interp.metrica || !METRICAS[interp.metrica]) {
      resposta = {
        naoEntendi: true,
        texto: 'Não encontrei uma métrica do catálogo para esta pergunta. Tente perguntar sobre complemento, tempo de espera, descargas, chapas por descarga, custos, não recebimentos ou planejamento D-1.',
      }
    } else {
      try {
        resposta = await METRICAS[interp.metrica].calc(interp, { ags, armazens, boletins, fornById })
      } catch (err) {
        resposta = { erro: errTxt(err) }
      }
    }

    setHistorico((prev) => [{ pergunta: q, interp, resposta }, ...prev])
    setPergunta('')
    setOcupado(false)
  }

  return (
    <div className="grid gap-6">
      <CabecalhoPagina
        titulo="Pergunte aos dados"
        quem="Quem usa: direção, compras e armazém"
        sub="Faça perguntas em linguagem natural. A arquitetura é segura: o sistema interpreta a pergunta, escolhe uma métrica permitida do catálogo e calcula. Nunca inventa números e não existe SQL livre."
      />

      <Painel className="grid gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void enviar()
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <MessageCircleQuestion className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              placeholder="Ex.: Quanto pagamos de complemento no Adubo em setembro?"
              className="h-12 pl-11 text-base shadow-sm"
              disabled={ocupado}
            />
          </div>
          <Button type="submit" size="lg" disabled={ocupado || !pergunta.trim()} className="h-12 px-5">
            {ocupado ? <Loader2 className="animate-spin" /> : <Send />} Perguntar
          </Button>
        </form>

        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Sparkles className="size-3.5 text-accent" /> Perguntas de exemplo:
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERGUNTAS_EXEMPLO.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setPergunta(ex)
                  void enviar(ex)
                }}
                disabled={ocupado}
                className="cursor-pointer rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </Painel>

      {/* Respostas do histórico */}
      {historico.map((item, idx) => {
        const { pergunta: p, interp, resposta: r } = item
        const metrica = interp.metrica ? METRICAS[interp.metrica] : null
        const origens = r.origens ? Object.keys(r.origens) : []

        return (
          <Painel key={idx} className="grid gap-4 border-l-4 border-primary">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Pergunta</span>
              <h2 className="mt-0.5 text-lg font-bold">{p}</h2>
            </div>

            {r.erro ? (
              <Callout tom="ruim">Não foi possível calcular: {r.erro}</Callout>
            ) : r.naoEntendi ? (
              <Callout tom="aviso">{r.texto}</Callout>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  {r.valor && (
                    <span className="num font-display text-[32px] font-bold text-foreground">
                      {r.valor}
                    </span>
                  )}
                  {metrica && <Badge tom="info">{metrica.nome}</Badge>}
                  {origens.map((orig) => (
                    <OrigemBadge key={orig} origem={orig} />
                  ))}
                </div>

                {r.vazio ? (
                  <p className="text-sm text-muted-foreground">{r.vazio}</p>
                ) : (
                  <p className="text-base leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: r.texto || '' }} />
                )}

                {/* Filtros interpretados */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Filtros aplicados:</span>
                  {filtrosTxt(interp).map(([k, v]) => (
                    <Badge key={k} tom="neutro">
                      {k}: <b>{v}</b>
                    </Badge>
                  ))}
                  {r.registros && (
                    <span className="text-xs text-muted-foreground">· Amostra: {r.registros}</span>
                  )}
                </div>

                {/* Linhas de quebra */}
                {r.linhas && r.linhas.length > 0 && (
                  <div className="mt-2 rounded-xl border bg-secondary/30 p-3">
                    <Table>
                      <TableBody>
                        {r.linhas.map(([label, val], i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium text-sm">{label}</TableCell>
                            <TableCell className="text-right num font-semibold text-sm">{val}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {r.abrir && (
                  <div>
                    <Button variant="outline" size="sm" onClick={() => ir(r.abrir!.secao)}>
                      {r.abrir.rotulo} <ArrowRight />
                    </Button>
                  </div>
                )}

                {metrica && (
                  <div className="mt-2 border-t pt-3 text-xs text-muted-foreground">
                    <b>Sobre este dado:</b> {metrica.def} Fonte: <i>{metrica.fonte}</i>.
                    {metrica.limite && <> <b>Limitação:</b> {metrica.limite}</>}
                  </div>
                )}
              </div>
            )}
          </Painel>
        )
      })}

      <Painel className="text-xs text-muted-foreground leading-relaxed">
        <SecTitulo className="text-sm text-foreground">Como o motor funciona</SecTitulo>
        <p className="mt-1">
          Nenhuma consulta livre é enviada ao banco de dados: a linguagem natural apenas extrai o período, o armazém e a métrica desejada, acionando o catálogo seguro de cálculos homologados da Cocapec. Cada resposta inclui os filtros interpretados, o tamanho da amostra e a rastreabilidade da origem dos dados.
        </p>
      </Painel>
    </div>
  )
}
