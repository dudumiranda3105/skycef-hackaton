import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bot, CornerDownLeft, Loader2, MessageCircleQuestion, RotateCcw, Send, Sparkles, UserRound, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  Badge, CabecalhoPagina, Callout, OrigemBadge,
} from '@/components/comum'
import { errTxt } from '@/lib/api'
import {
  METRICAS, PERGUNTAS_EXEMPLO, filtrosTxt, interpretar, interpretarComIA,
  type Interpretacao, type Resposta, type UsoTokens,
} from '@/lib/pergunte'
import { useDados } from '@/lib/store'
import { useRota } from '@/lib/rota'

interface ItemHistorico {
  id: number
  pergunta: string
  interp: Interpretacao
  resposta: Resposta
  viaIA: boolean
  uso: UsoTokens | null
}

const fmtTokens = (n: number) => new Intl.NumberFormat('pt-BR').format(n)

export function Perguntar() {
  const { ags, armazens, boletins, fornById } = useDados()
  const { ir } = useRota()

  const [pergunta, setPergunta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pendente, setPendente] = useState<string | null>(null)
  const [historico, setHistorico] = useState<ItemHistorico[]>([])
  const feedRef = useRef<HTMLDivElement>(null)
  const tokensSessao = historico.reduce((total, item) => total + (item.uso?.total ?? 0), 0)

  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' })
  }, [historico, pendente])

  async function enviar(texto?: string) {
    const q = (texto ?? pergunta).trim()
    if (!q || ocupado) return
    setOcupado(true)
    setPendente(q)
    setPergunta('')

    try {
      const { interpretacao: interp, viaIA, uso } = await interpretarComIA(q, armazens)
      let resposta: Resposta
      if (!interp.metrica || !METRICAS[interp.metrica]) {
        resposta = {
          naoEntendi: true,
          texto: 'Ainda não encontrei uma métrica adequada no catálogo. Tente uma das sugestões abaixo ou pergunte sobre custos, espera, descargas, não recebimentos ou planejamento D-1.',
        }
      } else {
        try {
          resposta = await METRICAS[interp.metrica].calc(interp, { ags, armazens, boletins, fornById })
        } catch (err) {
          resposta = { erro: errTxt(err) }
        }
      }

      setHistorico((prev) => [...prev, { id: Date.now(), pergunta: q, interp, resposta, viaIA, uso }])
    } catch (err) {
      setHistorico((prev) => [...prev, {
        id: Date.now(), pergunta: q, interp: interpretar(q, armazens),
        resposta: { erro: errTxt(err) }, viaIA: false, uso: null,
      }])
    } finally {
      setOcupado(false)
      setPendente(null)
    }
  }

  return (
    <div className="grid gap-5">
      <CabecalhoPagina
        titulo="Pergunte aos dados"
        quem="Quem usa: direção, compras e armazém"
        sub="Converse com seus dados operacionais. A IA entende a intenção e o sistema calcula respostas rastreáveis usando apenas métricas homologadas."
        acoes={historico.length > 0 ? (
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => setHistorico([])}>
            <RotateCcw /> Nova conversa
          </Button>
        ) : undefined}
      />

      <section className="flex min-h-[min(72vh,820px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="Chat Pergunte aos Dados">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-primary/10 via-background to-accent/10 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-bold">Assistente de dados Cocapec</h2>
              <p className="text-xs text-muted-foreground">Gemini para interpretar · cálculos oficiais e rastreáveis</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/80 px-3 py-2">
            <Zap className="size-4 text-accent" />
            <div>
              <div className="num text-sm font-bold">{fmtTokens(tokensSessao)} tokens</div>
              <div className="text-[10px] text-muted-foreground">nesta conversa</div>
            </div>
          </div>
        </div>

        <div ref={feedRef} className="max-h-[62vh] min-h-[380px] flex-1 overflow-y-auto scroll-smooth px-4 py-5 sm:px-6 sm:py-6" role="log" aria-live="polite" aria-relevant="additions text">
          {historico.length === 0 ? (
            <div className="mx-auto grid min-h-[340px] max-w-3xl content-center gap-6 py-5">
              <div className="mx-auto grid max-w-xl justify-items-center text-center">
                <div className="mb-4 grid size-16 place-items-center rounded-[22px] bg-primary/10 text-primary ring-8 ring-primary/5">
                  <Bot className="size-8" />
                </div>
                <h3 className="font-display text-2xl font-bold tracking-tight">Olá! O que você quer descobrir?</h3>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  Pergunte sobre custos, recebimentos, equipe ou planejamento. Eu encontro o indicador adequado e mostro a fonte e os filtros usados.
                </p>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-3.5 text-accent" /> Perguntas recomendadas
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PERGUNTAS_EXEMPLO.map((ex) => (
                    <button key={ex} type="button" onClick={() => void enviar(ex)} disabled={ocupado}
                      className="group flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm disabled:opacity-50">
                      <span>{ex}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto grid max-w-4xl gap-7">
              {historico.map((item) => {
                const { pergunta: p, interp, resposta: r, viaIA, uso } = item
                const metrica = interp.metrica ? METRICAS[interp.metrica] : null
                const origens = r.origens ? Object.keys(r.origens) : []

                return (
                  <article key={item.id} className="grid gap-3">
                    <div className="flex justify-end gap-2 pl-10 sm:pl-16">
                      <div className="max-w-[min(88%,680px)] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm">
                        <p className="whitespace-pre-wrap">{p}</p>
                      </div>
                      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground" aria-hidden="true">
                        <UserRound className="size-4" />
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 pr-2 sm:gap-3 sm:pr-8">
                      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                        <Bot className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-semibold">Assistente de dados</span>
                          <Badge tom={viaIA ? 'info' : 'neutro'}>{viaIA ? 'Gemini' : 'Motor local'}</Badge>
                        </div>
                        <div className="grid gap-3 rounded-2xl rounded-tl-sm border border-border bg-background p-4 shadow-xs sm:p-5">
                          {r.erro ? (
                            <Callout tom="ruim">Não foi possível calcular: {r.erro}</Callout>
                          ) : r.naoEntendi ? (
                            <Callout tom="aviso">{r.texto}</Callout>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2.5">
                                {r.valor && <span className="num font-display text-2xl font-bold tracking-tight sm:text-3xl">{r.valor}</span>}
                                {metrica && <Badge tom="info">{metrica.nome}</Badge>}
                                {origens.map((orig) => <OrigemBadge key={orig} origem={orig} />)}
                              </div>
                              {r.vazio ? (
                                <p className="text-sm leading-relaxed text-muted-foreground">{r.vazio}</p>
                              ) : (
                                <p className="text-sm leading-relaxed text-foreground">{r.texto || ''}</p>
                              )}

                              <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                                <span className="font-semibold">Filtros</span>
                                {filtrosTxt(interp).map(([k, v]) => <Badge key={k} tom="neutro">{k}: <b>{v}</b></Badge>)}
                                {r.registros && <span>· Amostra: {r.registros}</span>}
                              </div>

                              {r.linhas && r.linhas.length > 0 && (
                                <div className="overflow-hidden rounded-xl border bg-secondary/20 px-3 py-1">
                                  <Table>
                                    <TableBody>
                                      {r.linhas.map(([label, val], i) => (
                                        <TableRow key={i}>
                                          <TableCell className="text-sm font-medium">{label}</TableCell>
                                          <TableCell className="num text-right text-sm font-semibold">{val}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}

                              {r.abrir && <Button variant="outline" size="sm" className="w-fit" onClick={() => ir(r.abrir!.secao)}>{r.abrir.rotulo}<ArrowRight /></Button>}
                              {metrica && (
                                <details className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer font-semibold text-foreground">Sobre este indicador</summary>
                                  <p className="mt-2 leading-relaxed"><b>Definição:</b> {metrica.def} <b>Fonte:</b> {metrica.fonte}. {metrica.limite && <><b>Limitação:</b> {metrica.limite}</>}</p>
                                </details>
                              )}
                            </>
                          )}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                            {viaIA ? (
                              <>
                                <span className="inline-flex items-center gap-1 font-medium text-primary"><Zap className="size-3" />Uso Gemini</span>
                                {uso?.entrada != null && <span>entrada {fmtTokens(uso.entrada)}</span>}
                                {uso?.resposta != null && <span>resposta {fmtTokens(uso.resposta)}</span>}
                                <span className="font-semibold">total {uso?.total != null ? `${fmtTokens(uso.total)} tokens` : 'não informado'}</span>
                              </>
                            ) : <span>Interpretação local · sem uso Gemini registrado</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {pendente && (
            <div className="mx-auto mt-7 flex max-w-4xl items-start gap-2.5 pr-2 sm:gap-3 sm:pr-8">
              <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Bot className="size-4" /></div>
              <div className="rounded-2xl rounded-tl-sm border border-border bg-background px-4 py-3 text-sm text-muted-foreground shadow-xs">
                <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Analisando os dados com segurança…</span>
              </div>
            </div>
          )}
        </div>

        {historico.length > 0 && !ocupado && (
          <div className="border-t border-border/60 px-4 pt-3 sm:px-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="shrink-0 text-muted-foreground">Sugestões:</span>
              {PERGUNTAS_EXEMPLO.slice(0, 3).map((ex) => (
                <button key={ex} type="button" onClick={() => void enviar(ex)} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-muted-foreground transition hover:border-primary hover:text-foreground">{ex}</button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); void enviar() }} className="border-t border-border bg-background/80 p-3 sm:p-4">
          <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
            <MessageCircleQuestion className="mb-3 ml-2 size-5 shrink-0 text-muted-foreground" />
            <textarea
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
              placeholder="Pergunte sobre custos, entregas, equipe…"
              maxLength={500}
              rows={2}
              disabled={ocupado}
              aria-label="Escreva sua pergunta para o assistente"
              className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <Button type="submit" size="icon" aria-label="Enviar pergunta" title="Enviar pergunta" disabled={ocupado || !pergunta.trim()} className="mb-0.5 size-10 shrink-0 rounded-xl">
              {ocupado ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
          <div className="mx-auto mt-2 flex max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CornerDownLeft className="size-3" /> Enter envia · Shift+Enter quebra linha</span>
            <span>{pergunta.length}/500 · uso de tokens aparece quando o Gemini responde</span>
          </div>
        </form>
      </section>

      <p className="mx-auto max-w-4xl text-center text-[11px] leading-relaxed text-muted-foreground">
        O contador mostra o uso retornado pelo Gemini nesta conversa; não estima preço. Apenas a pergunta vai ao modelo: métricas e valores são calculados localmente a partir dos dados oficiais.
      </p>
    </div>
  )
}
