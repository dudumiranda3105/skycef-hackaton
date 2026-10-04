import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { GET, POST, ApiError, errTxt, mapAg, mapBoletim, mapFornecedor, qs } from './api'
import { GRUPOS, ORDEM_TIPOS, PAPEL_SECOES, PISO_PADRAO, type Grupo, type Secao } from './constants'
import { addDays, dow, mondayOf, semanaAtual } from './format'
import { limparCachePainel } from './painelDados'
import type {
  Agendamento, Armazem, Boletim, Chapa, Equipamento, Eu, Fornecedor, NaoRecebimento, TipoItem, Vaga,
} from './types'

/* ====================== Sessão (login) ====================== */
type EstadoSessao = 'carregando' | 'login' | 'ok' | 'erro'

interface AuthCtx {
  estado: EstadoSessao
  eu: Eu | null
  erro: string | null
  aviso: string
  entrar: (login: string, senha: string) => Promise<void>
  sair: () => Promise<void>
  tentarDeNovo: () => void
  pode: (s: Secao) => boolean
  pf: (g: Grupo) => boolean
}
const Auth = createContext<AuthCtx | null>(null)
export const useAuth = () => {
  const c = useContext(Auth)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSessao>('carregando')
  const [eu, setEu] = useState<Eu | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const quemSou = useCallback(async () => {
    setEstado('carregando')
    try {
      setEu(await GET<Eu>('/api/auth/me'))
      setEstado('ok')
    } catch (e) {
      setEu(null)
      if (e instanceof ApiError && e.status === 401) setEstado('login')
      else {
        setErro(errTxt(e))
        setEstado('erro')
      }
    }
  }, [])

  useEffect(() => {
    void quemSou()
  }, [quemSou])

  useEffect(() => {
    const h = () => {
      limparCachePainel()
      setEu(null)
      setAviso('Sua sessão expirou. Entre novamente.')
      setEstado('login')
    }
    window.addEventListener('sessao-expirada', h)
    return () => window.removeEventListener('sessao-expirada', h)
  }, [])

  const entrar = useCallback(async (login: string, senha: string) => {
    const pessoa = await POST<Eu>('/api/auth/login', { login, senha })
    setAviso('')
    setEu(pessoa)
    setEstado('ok')
  }, [])

  const sair = useCallback(async () => {
    try {
      await POST('/api/auth/logout')
    } catch {
      /* sem sessão: tudo bem */
    }
    limparCachePainel()
    setAviso('')
    setEu(null)
    setEstado('login')
  }, [])

  const valor = useMemo<AuthCtx>(
    () => ({
      estado, eu, erro, aviso, entrar, sair, tentarDeNovo: () => void quemSou(),
      pode: (s) => !!eu && PAPEL_SECOES[eu.papel].includes(s),
      pf: (g) => !!eu && GRUPOS[g].includes(eu.papel),
    }),
    [estado, eu, erro, aviso, entrar, sair, quemSou],
  )
  return <Auth.Provider value={valor}>{children}</Auth.Provider>
}

/* ====================== Dados do negócio ====================== */
interface DadosCtx {
  carregado: boolean
  erro: string | null
  forn: Fornecedor[]
  armazens: Armazem[]
  equip: Equipamento[]
  tipos: TipoItem[]
  chapas: Chapa[]
  ags: Agendamento[]
  vagas: Vaga[]
  nr: NaoRecebimento[]
  boletins: Boletim[]
  piso: string
  setPiso: (p: string) => void
  setForn: (f: Fornecedor[]) => void
  fornById: (id: number) => Fornecedor
  armNome: (id: number) => string
  armId: (nome: string) => number | undefined
  agById: (id: number) => Agendamento | undefined
  carregarTudo: () => Promise<void>
  refresh: () => Promise<void>
  semanaCarregada: string
  carregarDias: (dias: string[]) => Promise<void>
  motivoDiaBloqueado: (iso: string) => string | null
}
const Dados = createContext<DadosCtx | null>(null)
export const useDados = () => {
  const c = useContext(Dados)
  if (!c) throw new Error('useDados fora do DadosProvider')
  return c
}

export function DadosProvider({ children }: { children: ReactNode }) {
  const { estado: estadoSessao, eu } = useAuth()
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [forn, setForn] = useState<Fornecedor[]>([])
  const [armazens, setArmazens] = useState<Armazem[]>([])
  const [equip, setEquip] = useState<Equipamento[]>([])
  const [tipos, setTipos] = useState<TipoItem[]>([])
  const [chapas, setChapas] = useState<Chapa[]>([])
  const [ags, setAgs] = useState<Agendamento[]>([])
  const [vagas, setVagas] = useState<Vaga[]>([])
  const [nr, setNr] = useState<NaoRecebimento[]>([])
  const [boletins, setBoletins] = useState<Boletim[]>([])
  const [piso, setPiso] = useState(PISO_PADRAO)
  const [dias, setDias] = useState<Record<string, any>>({})
  const diasRef = useRef<Record<string, any>>({})
  const armRef = useRef<Armazem[]>([])
  armRef.current = armazens

  const armNome = useCallback((id: number) => armRef.current.find((a) => a.id === id)?.nome ?? '—', [])

  const carregarCadastros = useCallback(async () => {
    if (!eu) return
    const papel = eu.papel
    const [f, a, e, t, c] = await Promise.all([
      ['ADMIN', 'DIRETORIA', 'COMPRAS', 'ARMAZEM', 'FORNECEDOR', 'INSUMO', 'PORTEIRO'].includes(papel)
        ? GET<any[]>('/api/fornecedores') : Promise.resolve([]),
      GET<Armazem[]>('/api/armazens'),
      ['ADMIN', 'ARMAZEM', 'INSUMO'].includes(papel) ? GET<Equipamento[]>('/api/equipamentos') : Promise.resolve([]),
      ['ADMIN', 'DIRETORIA', 'ARMAZEM', 'ENCARREGADO'].includes(papel)
        ? GET<TipoItem[]>('/api/boletim/tipos-item') : Promise.resolve([]),
      ['ADMIN', 'DIRETORIA', 'ARMAZEM', 'ENCARREGADO'].includes(papel)
        ? GET<Chapa[]>('/api/chapas') : Promise.resolve([]),
    ])
    armRef.current = a
    setArmazens(a)
    setEquip(e)
    setForn(f.map(mapFornecedor))
    setChapas(c)
    const ord = (cod: string) => {
      const i = ORDEM_TIPOS.indexOf(cod)
      return i < 0 ? 99 : i
    }
    setTipos(t.slice().sort((x, y) => ord(x.codigo) - ord(y.codigo) || x.codigo.localeCompare(y.codigo)))
  }, [eu])

  const carregarMovimento = useCallback(async () => {
    if (!eu) return
    const papel = eu.papel
    const agenda = ['ADMIN', 'DIRETORIA', 'COMPRAS', 'ARMAZEM', 'FORNECEDOR', 'INSUMO', 'PORTEIRO'].includes(papel)
    const acessoNr = ['ADMIN', 'DIRETORIA', 'COMPRAS', 'ARMAZEM', 'INSUMO', 'PORTEIRO'].includes(papel)
    const boletim = ['ADMIN', 'DIRETORIA', 'ARMAZEM', 'ENCARREGADO'].includes(papel)
    const [a, v, n, b] = await Promise.all([
      agenda ? GET<any[]>('/api/agendamentos') : Promise.resolve([]),
      agenda ? GET<Vaga[]>('/api/vagas-liberadas') : Promise.resolve([]),
      acessoNr ? GET<NaoRecebimento[]>('/api/nao-recebimentos') : Promise.resolve([]),
      boletim ? GET<any[]>('/api/boletins') : Promise.resolve([]),
    ])
    setAgs(a.map((x) => mapAg(x, armNome)))
    setVagas(v)
    setNr(n)
    setBoletins(b.map(mapBoletim))
  }, [eu, armNome])

  const carregarDias = useCallback(async (lista: string[]) => {
    const falta = lista.filter((d) => !diasRef.current[d])
    if (!falta.length) return
    const novos: Record<string, any> = {}
    await Promise.all(
      falta.map(async (d) => {
        try {
          novos[d] = await GET('/api/agenda' + qs({ data: d }))
        } catch {
          /* o dia fica sem informação; a grade só não marca o bloqueio */
        }
      }),
    )
    diasRef.current = { ...diasRef.current, ...novos }
    setDias(diasRef.current)
  }, [])

  const carregarTudo = useCallback(async () => {
    if (!eu) return
    setErro(null)
    try {
      await carregarCadastros()
      await carregarMovimento()
      const w = semanaAtual()
      await carregarDias([0, 1, 2, 3, 4].map((i) => addDays(w, i)))
      setCarregado(true)
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setErro(errTxt(e))
    }
  }, [eu, carregarCadastros, carregarMovimento, carregarDias])

  useEffect(() => {
    if (estadoSessao === 'ok' && eu) {
      void carregarTudo()
    } else if (estadoSessao === 'login') {
      setCarregado(false)
      setErro(null)
      setForn([]); setArmazens([]); setEquip([]); setTipos([]); setChapas([])
      setAgs([]); setVagas([]); setNr([]); setBoletins([])
      diasRef.current = {}; setDias({})
    }
  }, [estadoSessao, eu, carregarTudo])

  const motivoDiaBloqueado = useCallback(
    (iso: string) => {
      const w = dow(iso)
      if (w === 0) return 'Domingo: não há recebimento'
      if (w === 6) return 'Sábado: não há recebimento'
      const a = dias[iso]
      return a && a.diaUtil === false ? String(a.motivoIndisponivel || 'Sem recebimento').replace(/\.$/, '') : null
    },
    [dias],
  )

  const valor = useMemo<DadosCtx>(
    () => ({
      carregado, erro, forn, armazens, equip, tipos, chapas, ags, vagas, nr, boletins, piso, setPiso, setForn,
      fornById: (id) => forn.find((f) => f.id === id) ?? { id, nome: '—', curto: '—', cnpj: '' },
      armNome,
      armId: (nome) => armazens.find((a) => a.nome === nome)?.id,
      agById: (id) => ags.find((a) => a.id === id),
      carregarTudo,
      refresh: async () => {
        await carregarMovimento()
      },
      semanaCarregada: mondayOf(semanaAtual()),
      carregarDias,
      motivoDiaBloqueado,
    }),
    [carregado, erro, forn, armazens, equip, tipos, chapas, ags, vagas, nr, boletins, piso, armNome, carregarTudo, carregarMovimento, carregarDias, motivoDiaBloqueado],
  )
  return <Dados.Provider value={valor}>{children}</Dados.Provider>
}

/* ====================== Utilidades de interface ====================== */
export const avisar = (msg: string, ruim = false) => (ruim ? toast.error(msg, { duration: 6000 }) : toast.success(msg, { duration: 3600 }))

/** Executa uma ação assíncrona com estado de "ocupado" e mostra o erro da API em um aviso. */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false)
  const rodar = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setOcupado(true)
    try {
      return await fn()
    } catch (e) {
      avisar(errTxt(e), true)
      return undefined
    } finally {
      setOcupado(false)
    }
  }, [])
  return { ocupado, rodar }
}
