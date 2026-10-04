import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Erros } from '@/components/comum'
import { Logo3D } from '@/components/charts/cena3d'
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
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-sidebar p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_520px_at_15%_-5%,rgba(47,127,214,.38),transparent_62%)]" />
      <motion.form
        onSubmit={enviar}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="relative grid w-full max-w-[400px] gap-4 rounded-2xl bg-card p-7 text-card-foreground shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b pb-3">
          <Logo3D tamanho={72} className="!w-[72px] shrink-0" />
          <div className="leading-tight">
            <b className="font-display text-[17px]">Recebimento Inteligente</b>
            <span className="block text-[12.5px] text-muted-foreground">Cocapec · Franca</span>
          </div>
        </div>
        <div>
          <h1 className="text-[28px]">Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use o usuário e a senha do seu perfil.</p>
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
        <Button type="submit" size="lg" disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : <LogIn />}
          Entrar
        </Button>
      </motion.form>
    </div>
  )
}
