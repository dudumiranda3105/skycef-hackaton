/* Cliente da API. Nada é gravado no navegador: tudo vai para o PostgreSQL pela API. */
import { LIBERAM_VAGA, MAX_UNITIZADOS } from './constants'
import { loc } from './format'
import type {
  Acond, Agendamento, Boletim, Descarga, Fornecedor, Vaga,
} from './types'

export class ApiError extends Error {
  status: number
  codigo?: string
  constructor(msg: string, status: number, codigo?: string) {
    super(msg)
    this.status = status
    this.codigo = codigo
  }
}

const API_BASE = ''

async function http<T>(method: string, url: string, body?: unknown, form?: FormData): Promise<T> {
  const init: RequestInit = { method, headers: { Accept: 'application/json' } }
  if (form) init.body = form
  else if (body !== undefined) {
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  let r: Response
  try {
    r = await fetch(API_BASE + url, init)
  } catch {
    throw new ApiError('Não foi possível falar com a API. Confira se o servidor está no ar.', 0, 'SEM_CONEXAO')
  }
  const txt = await r.text()
  let data: any = null
  if (txt) {
    try {
      data = JSON.parse(txt)
    } catch {
      data = null
    }
  }
  if (r.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('sessao-expirada'))
  if (!r.ok) {
    throw new ApiError((data && (data.detail || data.message)) || `Falha ${r.status} ao chamar ${url}`, r.status, data?.codigo)
  }
  return data as T
}

export const GET = <T = any>(u: string) => http<T>('GET', u)
export const POST = <T = any>(u: string, b?: unknown) => http<T>('POST', u, b === undefined ? {} : b)
export const upload = <T = any>(u: string, form: FormData) => http<T>('POST', u, undefined, form)
export const qs = (o: Record<string, string | number | null | undefined>) => {
  const p = Object.entries(o)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
  return p.length ? '?' + p.join('&') : ''
}
export const errTxt = (e: unknown) => (e instanceof Error ? e.message : String(e))

/* ---------- Tradução do que a API devolve ---------- */
const semSufixo = (n: string) => String(n || '').replace(/\s+(S\/?A\.?|S\.A\.?|LTDA\.?|EIRELI|ME|EPP)\s*$/i, '').trim()

export const mapFornecedor = (f: any): Fornecedor => ({
  id: f.id,
  nome: f.razaoSocial,
  curto: semSufixo(f.razaoSocial),
  cnpj: f.cnpj || '',
})

export function mapAg(a: any, armNome: (id: number) => string): Agendamento {
  const ag: Agendamento = {
    id: a.id,
    fornecedorId: a.fornecedorId,
    data: a.data,
    horario: String(a.horario).slice(0, 5),
    acond: a.acondicionamento,
    status: a.status,
    naHora: !!a.agendadoNaHora,
    limiteIgnorado: !!a.limiteIgnorado,
    origem: a.origem,
    criadoEm: a.criadoEm,
    chegadaEm: loc(a.chegadaEm),
    placaVeiculo: a.placaVeiculo ?? null,
    portariaObrigatoria: !!a.portariaObrigatoria,
    portaria: a.portaria ? {
      ...a.portaria,
      conferidoEm: loc(a.portaria.conferidoEm),
      enviadoEm: loc(a.portaria.enviadoEm),
      decididoEm: loc(a.portaria.decididoEm),
    } : null,
    nfs: (a.notas || []).map((n: any) => ({
      id: n.id,
      numero: n.nfNumero || '',
      chave: n.nfChave || '',
      arquivo: n.arquivoNome || '',
      peso: n.pesoTotalKg ?? null,
      ativa: n.ativa,
    })),
    compras: a.validacaoCompras
      ? { pedido: a.validacaoCompras.pedidoReferencia, decisao: a.validacaoCompras.decisao, obs: a.validacaoCompras.observacao }
      : null,
    canc: a.cancelamento ? { motivo: a.cancelamento.motivo, situacao: a.cancelamento.situacao } : null,
    descs: [],
  }
  ag.descs = (a.descargas || []).map(
    (d: any): Descarga => ({
      id: d.id,
      agId: a.id,
      armazemId: d.armazemId,
      armazem: armNome(d.armazemId),
      chegada: loc(d.chegadaEm),
      entrada: loc(d.entradaEm),
      saida: loc(d.saidaEm),
      chapas: d.quantidadeChapas == null ? null : d.quantidadeChapas,
      equip: d.equipamentoIds || [],
      origem: a.origem,
    }),
  )
  return ag
}

export function mapBoletim(b: any): Boletim {
  return {
    id: b.id,
    armazemId: b.armazemId,
    armazem: b.armazemNome,
    data: b.data,
    situacao: b.situacao,
    origem: b.origem,
    linhas: b.linhas || [],
    equipe: b.equipe || [],
    chapas: b.quantidadeChapas,
    completas: b.chapasDiariaCompleta,
    meias: b.chapasMeiaDiaria,
    diarias: b.diariasEquivalentes,
    producao: b.producaoTotal,
    vpd: b.valorPorDiaria ?? null,
    total: b.totalAPagar ?? null,
    complemento: b.complemento ?? null,
    abaixo: b.abaixoDoPiso ?? null,
  }
}

/* ---------- Vagas: mesma conta da API (cancelados não ocupam; vaga liberada aberta ainda ocupa) ---------- */
export interface Ocupacao {
  ags: Agendamento[]
  vagas: Vaga[]
  tipos: Acond[]
}
export function ocupantes(ags: Agendamento[], vagas: Vaga[], data: string, hora: string, excetoId?: number): Ocupacao {
  const a = ags.filter((x) => x.data === data && x.horario === hora && x.id !== excetoId && !LIBERAM_VAGA.includes(x.status))
  const v = vagas.filter((x) => x.data === data && String(x.horario).slice(0, 5) === hora && x.status === 'ABERTA')
  return { ags: a, vagas: v, tipos: [...a.map((x) => x.acond), ...v.map((x) => x.acondicionamento)] }
}
export const cabe = (tipos: Acond[], acond: Acond) =>
  !tipos.includes('BATIDO') && (acond === 'BATIDO' ? tipos.length === 0 : tipos.length < MAX_UNITIZADOS)

export const porDataHora = (a: { data: string; horario: string }, b: { data: string; horario: string }) =>
  (a.data + a.horario).localeCompare(b.data + b.horario)

export const dStatus = (d: Descarga) => (d.saida ? 'CONCLUIDA' : d.entrada ? 'EM_DESCARGA' : d.chegada ? 'NA_FILA' : 'AGUARDANDO')
export const descAberta = (ag: Agendamento | undefined, d: Descarga) =>
  !!ag && ['AUTORIZADO', 'EM_DESCARGA'].includes(ag.status) && !d.saida
