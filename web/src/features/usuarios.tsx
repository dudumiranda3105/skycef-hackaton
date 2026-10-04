import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, RefreshCw, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Input, Select } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge, CabecalhoPagina, Callout, Erros, Painel, SecTitulo } from '@/components/comum'
import { GET, POST, errTxt } from '@/lib/api'
import { PAPEL_ROTULO } from '@/lib/constants'
import { fmtTS, loc } from '@/lib/format'
import { avisar, useAuth } from '@/lib/store'
import type { Papel, Usuario } from '@/lib/types'

const PAPEIS: Papel[] = ['ADMIN', 'DIRETORIA', 'COMPRAS', 'ARMAZEM', 'ENCARREGADO', 'FORNECEDOR', 'INSUMO', 'PORTEIRO']

export function Usuarios() {
  const { eu } = useAuth()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Novo usuário
  const [login, setLogin] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState<Papel>('ARMAZEM')
  const [senha, setSenha] = useState('')
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Redefinir senha dialog
  const [redefinirPara, setRedefinirPara] = useState<Usuario | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const u = await GET<Usuario[]>('/api/usuarios')
      setUsuarios(u)
    } catch (e) {
      setErro(errTxt(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setErroForm(null)
    const l = login.trim().toLowerCase()
    const n = nome.trim()
    if (!l || !n || !senha) {
      setErroForm('Preencha usuário, nome e senha inicial.')
      return
    }
    if (senha.length < 8) {
      setErroForm('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    setSalvando(true)
    try {
      await POST('/api/usuarios', { login: l, nome: n, papel, senha })
      setLogin('')
      setNome('')
      setSenha('')
      avisar('Usuário criado.')
      await carregar()
    } catch (err) {
      setErroForm(errTxt(err))
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(u: Usuario) {
    try {
      await POST(`/api/usuarios/${u.id}/ativo`, { ativo: !u.ativo })
      avisar(u.ativo ? 'Usuário desativado e sessões encerradas.' : 'Usuário reativado.')
      await carregar()
    } catch (err) {
      avisar(errTxt(err), true)
    }
  }

  async function salvarNovaSenha(e: React.FormEvent) {
    e.preventDefault()
    if (!redefinirPara) return
    setErroSenha(null)
    if (!novaSenha || novaSenha.length < 8) {
      setErroSenha('A nova senha deve ter de 8 a 100 caracteres.')
      return
    }
    setSalvandoSenha(true)
    try {
      await POST(`/api/usuarios/${redefinirPara.id}/senha`, { nova: novaSenha })
      avisar(`Senha de ${redefinirPara.login} redefinida com sucesso.`)
      setRedefinirPara(null)
      setNovaSenha('')
    } catch (err) {
      setErroSenha(errTxt(err))
    } finally {
      setSalvandoSenha(false)
    }
  }

  return (
    <div className="grid gap-6">
      <CabecalhoPagina
        titulo="Usuários"
        quem="Quem usa: administrador"
        sub="Quem pode entrar e com qual perfil. Cada perfil só faz o que o processo prevê: Compras valida, o armazém recebe, o encarregado fecha o boletim, a diretoria consulta."
        acoes={
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={carregando ? 'animate-spin' : ''} /> {carregando ? 'Atualizando…' : 'Atualizar'}
          </Button>
        }
      />

      {erro && (
        <Callout tom="ruim">
          Não foi possível carregar os usuários: {erro}.{' '}
          <Button size="sm" variant="outline" className="ml-2" onClick={() => void carregar()}>Tentar de novo</Button>
        </Callout>
      )}

      <Painel>
        <SecTitulo className="text-[17px]">Novo usuário</SecTitulo>
        <form onSubmit={criarUsuario} className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Usuário" hint="login">
              <Input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="ex.: maria.silva"
                autoCapitalize="none"
                autoComplete="off"
              />
            </Field>
            <Field label="Nome completo">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da pessoa"
                autoComplete="off"
              />
            </Field>
            <Field label="Perfil de acesso">
              <Select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {PAPEL_ROTULO[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Senha inicial" hint="mínimo 8 caracteres">
              <Input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
          </div>
          <Erros>{erroForm}</Erros>
          <div>
            <Button type="submit" disabled={salvando}>
              <Plus /> {salvando ? 'Criando…' : 'Criar usuário'}
            </Button>
          </div>
        </form>
      </Painel>

      <Painel>
        <SecTitulo className="text-[17px]">Usuários cadastrados</SecTitulo>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => {
                const souEu = eu?.id === u.id
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold">{u.login}</TableCell>
                    <TableCell>{u.nome}</TableCell>
                    <TableCell>{PAPEL_ROTULO[u.papel]}</TableCell>
                    <TableCell>
                      {u.ativo ? (
                        <Badge tom="ok">Ativo</Badge>
                      ) : (
                        <Badge tom="ruim">Desativado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="num text-xs text-muted-foreground whitespace-nowrap">
                      {u.ultimoAcessoEm ? fmtTS(loc(u.ultimoAcessoEm)) : 'nunca'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRedefinirPara(u)
                            setNovaSenha('')
                            setErroSenha(null)
                          }}
                        >
                          <KeyRound className="size-3.5" /> Redefinir senha
                        </Button>
                        {!souEu && (
                          <Button
                            size="sm"
                            variant={u.ativo ? 'danger' : 'outline'}
                            onClick={() => void alternarAtivo(u)}
                          >
                            {u.ativo ? <><UserX className="size-3.5" /> Desativar</> : <><UserCheck className="size-3.5" /> Reativar</>}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Painel>

      <Painel>
        <SecTitulo className="text-[17px]">O que cada perfil faz</SecTitulo>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Perfil</TableHead>
                <TableHead>Vê</TableHead>
                <TableHead>Grava</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-bold">Administrador</TableCell>
                <TableCell>Tudo e usuários</TableCell>
                <TableCell>Tudo</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-bold">Diretoria</TableCell>
                <TableCell>Agenda, boletim, painel, D-1 e perguntas</TableCell>
                <TableCell className="text-muted-foreground">Nada (só consulta)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-bold">Compras</TableCell>
                <TableCell>Agenda e validação de Compras</TableCell>
                <TableCell>Autorizar ou recusar a entrega</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-bold">Responsável pelo armazém</TableCell>
                <TableCell>Agenda, armazém, boletim, painel, D-1 e perguntas</TableCell>
                <TableCell>Destinos, descargas, vagas, não recebimentos, boletim; agenda</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-bold">Encarregado dos chapas</TableCell>
                <TableCell>Agenda e boletim</TableCell>
                <TableCell>Boletim do dia</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-bold">Fornecedor</TableCell>
                <TableCell>Agenda</TableCell>
                <TableCell>Novo agendamento, anexar a nota, reagendar e solicitar cancelamento</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          O perfil Fornecedor ainda enxerga a agenda inteira (a capacidade é única da cooperativa). Separar por fornecedor exigiria vincular o usuário a um cadastro de fornecedor.
        </p>
      </Painel>

      {redefinirPara && (
        <Dialog open onOpenChange={(o) => !o && setRedefinirPara(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redefinir senha de {redefinirPara.login}</DialogTitle>
            </DialogHeader>
            <form onSubmit={salvarNovaSenha}>
              <DialogBody className="grid gap-3">
                <Field label="Nova senha" hint="de 8 a 100 caracteres">
                  <Input
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                    autoComplete="new-password"
                  />
                </Field>
                <Erros>{erroSenha}</Erros>
                <p className="text-xs text-muted-foreground">
                  As sessões abertas dessa pessoa serão imediatamente encerradas.
                </p>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRedefinirPara(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvandoSenha}>
                  {salvandoSenha ? 'Redefinindo…' : 'Redefinir senha'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
