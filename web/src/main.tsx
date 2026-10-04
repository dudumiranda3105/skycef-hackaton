/*
 * Entry point da interface React.
 * Renderiza o componente App dentro de <div id="root">.
 * O estilo global (Tailwind + tokens de tema) vem de index.css.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
