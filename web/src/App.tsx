import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/shell'
import { LogoCocapec } from '@/components/marca'
import { JanelasGlobais } from '@/features/checkin/janelas'
import { Home } from '@/features/home'
import { Login } from '@/features/login'
import { Agenda } from '@/features/agenda/agenda'
import { Compras } from '@/features/compras'
import { Armazem } from '@/features/armazem'
import { Boletim } from '@/features/boletim'
import { Painel } from '@/features/painel'
import { D1 } from '@/features/d1'
import { Perguntar } from '@/features/perguntar'
import { Qualidade } from '@/features/qualidade'
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
    case 'compras':
      return <Compras />
    case 'armazem':
      return <Armazem />
    case 'boletim':
      return <Boletim />
    case 'painel':
      return <Painel />
    case 'd1':
      return <D1 />
    case 'perguntar':
      return <Perguntar />
    case 'qualidade':
      return <Qualidade />
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
          <LogoCocapec className="w-[190px] animate-pulse" />
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
