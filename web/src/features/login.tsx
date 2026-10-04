import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { CalendarCheck2, LineChart, Loader2, LogIn, PackageCheck } from 'lucide-react'
import { LogoCocapec } from '@/components/marca'
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
    <div className="fixed inset-0 z-[100] grid overflow-auto bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <aside className="faixa-cocapec relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-[420px] rounded-full border-[56px] border-white/[0.06]" />
        <div className="pointer-events-none absolute -right-4 -bottom-4 size-[260px] rounded-full border-[36px] border-white/[0.06]" />
        <LogoCocapec pastilha className="w-[210px]" />
        <div className="relative max-w-[30rem]">
          <p className="text-[13px] font-semibold tracking-[0.16em] text-white/70 uppercase">Recebimento Inteligente</p>
          <h2 className="mt-3 text-[clamp(28px,3vw,40px)] leading-[1.15] font-bold italic">
            Cooperativa que impulsiona o café e o cooperado.
          </h2>
          <ul className="mt-8 grid gap-3 text-[15px] text-white/85">
            {[
              [CalendarCheck2, 'Agende a entrega e acompanhe cada caminhão'],
              [PackageCheck, 'Confira a nota fiscal e receba no armazém sem fila'],
              [LineChart, 'Veja o que cada boletim significa em reais'],
            ].map(([Icone, texto]) => {
              const I = Icone as typeof LineChart
              return (
                <li key={texto as string} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/12 ring-1 ring-white/20"><I className="size-4" /></span>
                  {texto as string}
                </li>
              )
            })}
          </ul>
        </div>
        <p className="relative text-[12.5px] text-white/60">Cocapec · Franca, SP</p>
      </aside>

      <div className="relative grid place-items-center p-5">
        <motion.form
          onSubmit={enviar}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid w-full max-w-[400px] gap-5 rounded-2xl border bg-card p-8 text-card-foreground shadow-card"
        >
          <LogoCocapec className="w-[170px] lg:hidden" />
          <div>
            <h1 className="text-[26px] font-bold">Entrar</h1>
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
    </div>
  )
}
