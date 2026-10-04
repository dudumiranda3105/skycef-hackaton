import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/* Janelas globais de QR, check-in, leitor e troca de senha. */
interface Estado {
  qr: { id: number; confirmacao: boolean } | null
  checkin: number | null
  leitor: boolean
  senha: boolean
}
interface JanelasCtx extends Estado {
  abrirQr: (id: number, confirmacao?: boolean) => void
  abrirCheckin: (id: number) => void
  abrirLeitor: () => void
  abrirSenha: () => void
  fechar: (qual: keyof Estado) => void
}
const Ctx = createContext<JanelasCtx | null>(null)
export const useJanelas = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useJanelas fora do JanelasProvider')
  return c
}

const vazio: Estado = { qr: null, checkin: null, leitor: false, senha: false }

export function JanelasProvider({ children }: { children: ReactNode }) {
  const [e, setE] = useState<Estado>(vazio)
  const valor = useMemo<JanelasCtx>(
    () => ({
      ...e,
      abrirQr: (id, confirmacao = false) => setE((x) => ({ ...x, qr: { id, confirmacao } })),
      abrirCheckin: (id) => setE((x) => ({ ...x, qr: null, leitor: false, checkin: id })),
      abrirLeitor: () => setE((x) => ({ ...x, leitor: true })),
      abrirSenha: () => setE((x) => ({ ...x, senha: true })),
      fechar: (qual) => setE((x) => ({ ...x, [qual]: vazio[qual] })),
    }),
    [e],
  )
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
