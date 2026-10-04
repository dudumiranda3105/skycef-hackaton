import { useCallback, useEffect, useState } from 'react'

const CHAVE = 'ri-tema'
const lerSalvo = (): 'light' | 'dark' | null => {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** Tema claro/escuro: segue o sistema até a pessoa escolher; a escolha fica só neste navegador. */
export function useTema() {
  const [tema, setTema] = useState<'light' | 'dark'>(
    () => lerSalvo() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )
  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark')
  }, [tema])
  const alternar = useCallback(() => {
    setTema((t) => {
      const novo = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(CHAVE, novo)
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
      return novo
    })
  }, [])
  return { tema, alternar }
}
