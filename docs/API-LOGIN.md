# Login e perfis

A plataforma exige login. Sem entrar, toda chamada a `/api/**` (exceto `/api/auth/login` e `/api/auth/logout`) responde
**401**. As páginas estáticas (`/ui/`, `/app/`, `/painel`), o Swagger (`/docs`) e `/health` continuam abertos, mas não
mostram nenhum dado sem a sessão.

## Como funciona
- `POST /api/auth/login` confere usuário e senha e devolve a pessoa. A sessão vai em um cookie **`RI_SESSAO`**
  (`HttpOnly`, `SameSite=Lax`, `Secure` quando a conexão é HTTPS), válido por **12 horas**.
- No banco fica só o **SHA-256 do token** (tabela `sessao`); o token em si existe apenas no cookie.
- A senha é guardada como **PBKDF2-SHA256** com sal aleatório e 210 mil iterações (`pbkdf2$iterações$sal$hash`), usando só o JDK.
- Usuário ou senha errados dão a mesma mensagem (não revela quem existe). **5 falhas** do mesmo usuário e IP bloqueiam por **1 minuto** (429).
- Trocar a senha ou desativar/redefinir um usuário **encerra as sessões** dele.
- Permissão por perfil é conferida **em cada chamada da API** (`Permissoes.java`); a interface só esconde o que o perfil não pode fazer.

## Usuários iniciais
Na primeira subida (tabela vazia) são criados seis usuários, um por perfil: `admin`, `diretoria`, `compras`, `armazem`,
`encarregado` e `fornecedor`. A senha vem de **`SENHA_INICIAL`** (o `docker-compose.yml` e o `.env.example` trazem um valor de
**demonstração**). Se a variável for vazia, a API gera uma senha aleatória e a mostra **uma única vez** no log:

```bash
docker compose logs api | findstr "Senha inicial"
```

Troque a senha em **Alterar senha** (menu lateral) antes de qualquer uso fora da demonstração. O administrador cria, desativa
e redefine usuários na seção **Usuários**.

## Perfis
| Perfil | Vê | Grava |
|---|---|---|
| `ADMIN` | tudo, mais usuários | tudo |
| `DIRETORIA` | agenda, boletim, painel, D-1, perguntas, qualidade | nada (só consulta) |
| `COMPRAS` | agenda e validação de Compras | autorizar ou recusar a entrega |
| `ARMAZEM` | agenda, armazém, boletim, painel, D-1, perguntas, qualidade | destinos, chegada, descargas, vagas liberadas, efetivar cancelamento, não recebimentos, boletim; agenda |
| `ENCARREGADO` | agenda e boletim | boletim do dia |
| `FORNECEDOR` | agenda | novo agendamento, anexar a nota, reagendar, solicitar cancelamento, cadastrar fornecedor |

Limitação conhecida: o perfil `FORNECEDOR` enxerga a agenda inteira (a capacidade é única da cooperativa e os dados de
fornecedores aparecem nela). Separar por fornecedor exigiria vincular cada usuário a um cadastro de fornecedor.
Também não há trilha de "quem fez" nos eventos do agendamento.

## Endpoints
| Método e rota | Quem | Corpo | Resposta |
|---|---|---|---|
| `POST /api/auth/login` | público | `login`, `senha` | `{id, login, nome, papel, autenticacaoAtiva}` + cookie |
| `POST /api/auth/logout` | público | — | 204 e apaga o cookie |
| `GET /api/auth/me` | quem entrou | — | a pessoa; sem login ativo responde `autenticacaoAtiva: false` |
| `POST /api/auth/senha` | quem entrou | `atual`, `nova` (8 a 100 caracteres) | 204 |
| `GET /api/usuarios` | `ADMIN` | — | lista |
| `POST /api/usuarios` | `ADMIN` | `login` (3 a 40: a-z, 0-9, `.`, `-`, `_`), `nome`, `papel`, `senha` | 201 |
| `POST /api/usuarios/{id}/ativo` | `ADMIN` | `ativo` | 204 (não desativa a si mesmo nem o último admin) |
| `POST /api/usuarios/{id}/senha` | `ADMIN` | `nova` | 204 |

Erros em `application/problem+json` com `codigo`: `NAO_AUTENTICADO` (401), `SEM_PERMISSAO` (403), `CREDENCIAIS_INVALIDAS` (401),
`MUITAS_TENTATIVAS` (429), `SENHA_FRACA`, `SENHA_ATUAL_INCORRETA`, `LOGIN_INVALIDO`, `PAPEL_INVALIDO` (422), `USUARIO_EXISTENTE` (409).

## Desligar o login (só desenvolvimento e testes)
`AUTH_ATIVA=false` desliga a exigência: a API volta a responder sem sessão e `/api/auth/me` informa "acesso livre". Os testes
de integração usam isso (`src/test/resources/application.properties`). Em uso normal, deixe ligado.

## Cuidados
- As telas simples antigas (`/app/` e `/painel`) fazem as mesmas chamadas: funcionam depois que você entra em `/ui/` (o cookie vale
  para o site todo), e mostram erro de acesso se ninguém entrou.
- O cookie não é `Secure` em `http://localhost`. Para uso em rede, sirva a API atrás de HTTPS.
- Os arquivos novos são `V8__login.sql` e o pacote `com.skycef.recebimento.auth`, com testes de senha, token e permissões em `LoginUnitTest`.
