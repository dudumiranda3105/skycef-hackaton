import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Erros } from '@/components/comum'
import { errTxt } from '@/lib/api'
import { useAuth } from '@/lib/store'

export function Login() {
  const { entrar, aviso } = useAuth()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!login.trim() || !senha) {
      setErro('Informe o usuário e a senha.')
      return
    }
    setOcupado(true)
    setErro('')
    try {
      await entrar(login.trim(), senha)
    } catch (err) {
      setErro(errTxt(err))
      setSenha('')
      setOcupado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-auto p-5" style={{ background: 'var(--background)' }}>
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(ellipse 800px 400px at 50% -20%, var(--primary), transparent 70%), radial-gradient(ellipse 600px 300px at 80% 120%, var(--brand-yellow), transparent 70%)',
      }} />
      <motion.form
        onSubmit={enviar}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative grid w-full max-w-[380px] gap-5 rounded-xl border bg-card p-8 text-card-foreground shadow-lg"
      >
        <div className="flex items-center gap-3 border-b border-border/50 pb-3">
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="shrink-0">
            <defs>
              <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d4a017" /><stop offset="100%" stopColor="#e8b830" />
              </linearGradient>
              <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6b3c" /><stop offset="100%" stopColor="#2e7d32" />
              </linearGradient>
              <linearGradient id="lg3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6b3c" /><stop offset="100%" stopColor="#3a8a40" />
              </linearGradient>
            </defs>
            <rect x="4" y="6" width="32" height="8" rx="3" fill="url(#lg1)" />
            <rect x="4" y="16" width="32" height="8" rx="3" fill="url(#lg2)" />
            <rect x="4" y="26" width="32" height="8" rx="3" fill="url(#lg3)" />
          </svg>
          <div className="leading-snug">
            <b className="text-base font-bold">Recebimento Inteligente</b>
            <span className="block text-[12.5px] text-muted-foreground">Cocapec · Franca</span>
          </div>
        </div>
        <div>
          <h1 className="text-[24px] font-bold">Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use seu usuário e senha de acesso.</p>
        </div>
        {aviso && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{aviso}</p>}
        <Field label="Usuário">
          <Input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </Field>
        <Field label="Senha">
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Erros>{erro}</Erros>
        <Button type="submit" size="lg" disabled={ocupado} className="w-full">
          {ocupado ? <Loader2 className="animate-spin" /> : <LogIn />}
          Entrar
        </Button>
      </motion.form>
    </div>
  )
}