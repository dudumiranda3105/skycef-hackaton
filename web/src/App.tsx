/*
 * Componente raiz do Recebimento Inteligente.
 * Gerencia:
 * - Provedores globais (autenticação, dados, janelas)
 * - Roteamento por hash (#/agenda, #/painel, …)
 * - Tela de carregamento, login e erro de conexão
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/shell'
import { JanelasGlobais } from '@/features/checkin/janelas'
import { Home } from '@/features/home'
import { Login } from '@/features/login'
import { Agenda } from '@/features/agenda/agenda'
import { Portaria } from '@/features/portaria'
import { Compras } from '@/features/compras'
import { Armazem } from '@/features/armazem'
import { Insumos } from '@/features/insumos'
import { HistoricoFiscal } from '@/features/historico-fiscal'
import { Boletim } from '@/features/boletim'
import { Painel } from '@/features/painel'
import { D1 } from '@/features/d1'
import { Perguntar } from '@/features/perguntar'
import { Usuarios } from '@/features/usuarios'
import { AuthProvider, DadosProvider, useAuth } from '@/lib/store'
import { JanelasProvider, useJanelas } from '@/lib/janelas'
import { useRota } from '@/lib/rota'

function Conteudo() {
  const { pode } = useAuth()
  const { secao, checkin } = useRota()
  const { abrirCheckin } = useJanelas()

  useEffect(() => {
    if (checkin) {
      abrirCheckin(checkin)
    }
  }, [checkin, abrirCheckin])

  if (secao && !pode(secao)) {
    return <Home />
  }

  switch (secao) {
    case 'agenda':
      return <Agenda />
    case 'portaria':
      return <Portaria />
    case 'compras':
      return <Compras />
    case 'armazem':
      return <Armazem />
    case 'insumo':
      return <Insumos />
    case 'fiscal':
      return <HistoricoFiscal />
    case 'boletim':
      return <Boletim />
    case 'painel':
      return <Painel />
    case 'd1':
      return <D1 />
    case 'perguntar':
      return <Perguntar />
    case 'usuarios':
      return <Usuarios />
    default:
      return <Home />
  }
}

function TelaAutenticada() {
  const { estado, erro, tentarDeNovo } = useAuth()

  if (estado === 'carregando') {
    return (
      <div className="fixed inset-0 grid place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <svg width="48" height="48" viewBox="0 0 40 40" aria-hidden className="shrink-0 opacity-80">
            <defs>
              <linearGradient id="llg1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d4a017" /><stop offset="100%" stopColor="#e8b830" />
              </linearGradient>
              <linearGradient id="llg2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6b3c" /><stop offset="100%" stopColor="#2e7d32" />
              </linearGradient>
              <linearGradient id="llg3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6b3c" /><stop offset="100%" stopColor="#3a8a40" />
              </linearGradient>
            </defs>
            <rect x="4" y="6" width="32" height="8" rx="3" fill="url(#llg1)" />
            <rect x="4" y="16" width="32" height="8" rx="3" fill="url(#llg2)" />
            <rect x="4" y="26" width="32" height="8" rx="3" fill="url(#llg3)" />
          </svg>
          <p className="text-sm text-muted-foreground font-medium">Carregando…</p>
        </div>
      </div>
    )
  }

  if (estado === 'login') {
    return <Login />
  }

  if (estado === 'erro') {
    return (
      <div className="fixed inset-0 grid place-items-center bg-background p-6">
        <div className="max-w-md rounded-2xl border bg-card p-6 shadow-lg text-center">
          <h2 className="text-xl font-bold">Sem conexão com a API</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {erro || 'Não foi possível se comunicar com o backend. Verifique se o serviço está ativo.'}
          </p>
          <Button onClick={tentarDeNovo} className="mt-5">
            Tentar de novo
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Shell>
      <Conteudo />
      <JanelasGlobais />
    </Shell>
  )
}

export function App() {
  return (
    <AuthProvider>
      <DadosProvider>
        <JanelasProvider>
          <TelaAutenticada />
        </JanelasProvider>
      </DadosProvider>
    </AuthProvider>
  )
}

export default App
