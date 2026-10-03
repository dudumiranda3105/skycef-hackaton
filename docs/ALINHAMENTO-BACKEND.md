# Alinhamento do backend — Claude × Codex

Elaborado em 03/10/2026 a partir da leitura (somente leitura) das branches
`claude/tarefa-1` (commit `496cfb9`) e `codex/tarefa1-fastapi` (commit `6defbfe`).
Fonte de verdade do negócio: `CLAUDE.md` (Regulamento > Dossiê > esclarecimentos > CLAUDE.md).

## 1. Onde cada um está

| Branch | Conteúdo |
|---|---|
| `origin/main` | Fase **Java** (PR #1 da branch do Claude). Nada de Python. |
| `claude/tarefa-1` | Python/FastAPI. Banco em SQL versionado (V1–V5) **alinhado ao CLAUDE.md**, regras puras, trava de vaga, 133 testes contra PostgreSQL. **Sem** upload, chegada/entrada/saída, cancelar, reagendar, não recebimento avulso. |
| `codex/tarefa1-fastapi` | Python/FastAPI. **Fluxo completo da T1** (upload da NF, Compras, destinos, chegada, entrada, saída, cancelar, reagendar, não recebimento). Modelo **não** segue o CLAUDE.md. 7 testes, só em SQLite. |

Merge no `main` hoje: a branch do Claude entra **sem conflito**; a do Codex tem **4 conflitos** (pom.xml,
2 arquivos Java, docker-compose.yml) e vários add/add com a do Claude (`api/app/*`, `pyproject.toml`, `Dockerfile`).

## 2. Divergências de modelo (Codex × CLAUDE.md)

| Tema | CLAUDE.md (seção 4 e 6) | Codex | Claude (V5) |
|---|---|---|---|
| Idioma dos nomes | Português | Inglês (`appointment`, `supplier`, `unload`) | Português |
| NFs por agendamento | 1 ou mais | 1 (`invoice_*` no agendamento) | N (`nota_fiscal`) |
| Decisão de Compras | `pedido_referencia` + `AUTORIZADO`/`NAO_AUTORIZADO` | `compliant` + `purchase_order` no agendamento | `validacao_compras` |
| Descarga | **uma por armazém de destino** | **uma por agendamento** (mistura os destinos) | uma por destino |
| Equipamentos | unidades individuais (`INS-EMPG-01`) | por tipo, com quantidade | individuais (19) |
| Status | `PENDENTE_COMPRAS`, `AUTORIZADO`, `NAO_AUTORIZADO`, `EM_DESCARGA`, `CONCLUIDO`, `CANCELADO`, `NAO_RECEBIDO` | `AGENDADO`, `VALIDADO_COMPRAS`, `AUTORIZADO`, `CHEGOU`... | os do CLAUDE.md |
| Cancelamento | solicitação → efetivação; responsável escolhe quem ocupa a vaga | só muda o status | tabelas `cancelamento` e `vaga_liberada` (falta o fluxo) |
| Reagendamento | histórico (data/horário anterior e novo + motivo) | só sobrescreve a data e grava texto no evento | tabela `reagendamento` (falta o fluxo) |
| Não recebimento | 1:N com o agendamento (DQ-017) | `UNIQUE(appointment_id)` | 1:N |
| Origem do dado | `HISTORICO`/`PLATAFORMA`/`TESTE` | não existe | existe |
| Dias sem operação | `DataNaoOperacional` | `holiday` | `data_nao_operacional` |

## 3. Riscos encontrados no código do Codex

Verificados rodando o código dele (testes dele passam; testei também a regra de vagas no PostgreSQL).

| # | Achado | Gravidade |
|---|---|---|
| 1 | **Banco sem proteções.** A migration `0001` só chama `create_all` e faz seed: aceita horário 09:00 e sábado se inserido direto; sem unicidade de NF ativa; `downgrade` apaga tudo. Mudar o modelo exige reescrever a migration. | Alta |
| 2 | **Testes só em SQLite em memória**: a trava de vaga nem existe lá. (A trava dele funciona no PostgreSQL: 10 threads × 5 rodadas deram sempre 2 vagas.) | Média |
| 3 | **Chegada só após `AUTORIZADO`.** Caminhão sem aviso que chega antes não registra a chegada; o tempo de espera do painel sai subestimado. "Agendar na hora" é só uma flag. | Alta |
| 4 | **Reagendamento** sem trava de vaga, sempre marca `limit_ignored=True` (mesmo sem exceder), não valida data passada, não permite a partir de "chegou" e não guarda o horário anterior. | Alta |
| 5 | **Cancelamento** não libera a vaga para decisão do armazém (regulamento) nem tem solicitação/efetivação. | Alta |
| 6 | **Uma descarga por agendamento**: com 2 destinos, chegada/entrada/saída/chapas ficam misturados. Quebra o painel por armazém. | Alta |
| 7 | Não valida data passada nem horário já vencido; sem relógio no fuso de São Paulo (`server_default now()`). | Média |
| 8 | Erros: `IntegrityError` vira 422 (deveria ser 409); transição inválida vira 422; sem código estável de erro nem handler 500. | Baixa |
| 9 | Marcos (`occurred_at`) vêm do cliente, sem limite no futuro. Aceitável para demo; documentar. | Baixa |

## 4. O que o Codex fez melhor (adotar)

- **Upload e download da NF** (multipart, limite de 10 MB, extensão `.pdf`/`.xml`, 413 acima do limite).
- Endpoints de **chegada, entrada, saída, cancelamento, reagendamento e não recebimento** já funcionando.
- `GET /api/agendamentos?data=&status=`, `GET /api/cadastros/equipamentos?armazem`, `GET/POST /api/nao-recebimentos`.
- Teste de fluxo ponta a ponta (`tests/test_task1_flow.py`): reaproveitar os 7 cenários.
- Código enxuto, fácil de ler.

## 5. Recomendação

**Base = `claude/tarefa-1`.** Motivo: o modelo de dados é a parte cara de refazer (DER, painel e boletim dependem dele)
e o do Codex diverge do CLAUDE.md em 6 pontos estruturais. Os fluxos que faltam são a parte barata de portar.

Sequência:
1. Enviar `claude/tarefa-1` ao GitHub e abrir PR → `main` (remove o Java, entra o Python; sem conflito).
2. O Codex cria uma branch nova **a partir de `claude/tarefa-1`** (não da dele) e porta os fluxos (seção 7).
3. A branch antiga `codex/tarefa1-fastapi` fica como referência; **não** fazer merge dela no `main`.

Decisões de alinhamento propostas:
- **Idioma/JSON:** nomes em português, JSON em camelCase (como o front espera).
- **Migrations:** SQL versionado em `api/migrations` + runner próprio (já pronto). Fica descartado o Alembic com `create_all`.
- **Testes:** pytest contra PostgreSQL real (schema temporário). SQLite não serve: não tem trava, nem `FOR UPDATE`, nem os CHECKs.
- **Erros:** 422 regra de negócio, 409 conflito/integridade, 404 não encontrado, `codigo` estável.
- **Tempo:** `Relogio` injetável no fuso `America/Sao_Paulo`; marcos usam o relógio do servidor (o cliente pode informar o instante, nunca no futuro).

## 6. Contrato da API proposto (unificado)

Já existem na branch do Claude: ✅. A fazer: 🔲 (portar do Codex adaptando ao modelo novo).

| Método e rota | Corpo | |
|---|---|---|
| `GET /api/agenda?data=` | — | ✅ |
| `POST /api/agendamentos` (multipart: `dados` JSON + arquivos `notas`, 1..n) | fornecedor, data, horário, acondicionamento, notas[{nfChave,nfNumero,pesoTotalKg}] | 🔲 upload (hoje só JSON) |
| `GET /api/agendamentos?data=&status=` · `GET /api/agendamentos/{id}` · `/eventos` | — | ✅ (falta `status`) |
| `GET /api/agendamentos/{id}/notas/{notaId}/arquivo` | — | 🔲 |
| `POST /api/agendamentos/{id}/validacao-compras` | `{decisao, pedidoReferencia, observacao}` | ✅ |
| `POST /api/agendamentos/{id}/destinos` | `{armazemIds, observacao}` → cria 1 descarga por armazém | ✅ |
| `POST /api/descargas/{id}/chegada` · `/entrada` · `/saida` | `{ocorridoEm?}`; saída: `{quantidadeChapas, equipamentoIds}` | 🔲 |
| `POST /api/agendamentos/{id}/cancelamento` (solicita) · `.../efetivacao` | `{motivo}` → gera `vaga_liberada` | 🔲 |
| `POST /api/vagas-liberadas/{id}/atribuicao` | `{agendamentoId}` ou `{liberarGeral:true}` (decisão do armazém) | 🔲 |
| `POST /api/agendamentos/{id}/reagendamento` | `{data, horario, motivo, casoFortuito}` → grava `reagendamento` | 🔲 |
| `POST /api/nao-recebimentos` · `GET /api/nao-recebimentos` | `{agendamentoId?, fornecedorId?, fornecedorNome?, data, motivo, descricao}` | 🔲 |
| `GET/POST /api/fornecedores` · `GET /api/armazens` · `GET /api/equipamentos?armazemId=` | — | ✅ (falta equipamentos) |

## 7. Regras a respeitar ao portar (CLAUDE.md, seção 4)

- Reutilizar `AgendamentoService._carregar_travado` (lock de linha) e `_mudar_status` (transição + evento + libera NF).
- **Entrada exige agendamento válido** (status `AUTORIZADO`); a primeira entrada leva o agendamento a `EM_DESCARGA`; quando **todas** as descargas têm saída, vai a `CONCLUIDO`.
- Integridade temporal: `chegada <= entrada <= saída` (o banco já tem os CHECKs). Saída exige `quantidadeChapas`.
- `quantidadeChapas` é **por descarga** e nunca é somada ao longo do dia.
- Equipamentos: unidades individuais, informadas na saída (`descarga_equipamento`).
- Reagendamento por caso fortuito **pode** exceder a capacidade (marcar `limite_excedido` só se de fato excedeu); sempre sob `travar_slot` e gravando data/horário anterior.
- Cancelamento libera a vaga **sem seleção automática**: cria `vaga_liberada` ABERTA (continua contando como ocupada) até o responsável decidir.
- Não recebimento: motivos `DIVERGENCIA_NF_PEDIDO`, `SEM_AGENDAMENTO_SEM_VAGA`, `CASO_FORTUITO`, `OUTRO` (descrição obrigatória). Pode existir sem agendamento.

### Divisão de arquivos (evita conflito)

- **Codex** cria módulos **novos** em `api/app/agendamento/`: `descargas.py`, `cancelamento.py`, `reagendamento.py`, `nao_recebimento.py`, `arquivos.py` (cada um com service + router) e os registra em `app/main.py`.
- **Claude** mantém `service.py`, `models.py`, `domain.py`, `schemas.py`, as migrations e o boletim/painel. Se o Codex precisar de uma mudança nesses arquivos, pede aqui.
- Mudança de banco = **nova migration** `V6__...sql` (nunca editar V1–V5, já publicadas).

## 8. Testes de aceite

Portar os 7 cenários de `codex/tarefa1-fastapi:api/tests/test_task1_flow.py` para o contrato novo e acrescentar:
dois destinos com marcos independentes; entrada sem autorização → 409; saída sem chapas → 422; cancelamento gera vaga aberta
que bloqueia novo agendamento até a decisão; reagendamento guarda o horário anterior; não recebimento sem agendamento;
duas ações simultâneas na mesma descarga → uma vence (teste com threads, como `tests/test_concorrencia.py`).

## 9. Em aberto (precisa de decisão da equipe/Cocapec)

- Chegada de caminhão **antes** da autorização (tempo de espera): onde registrar? (ver CLAUDE.md, seção "Decisões de implementação").
- `NAO_AUTORIZADO` por Compras também gera `NaoRecebimento`? (assumimos que sim.)
- Prazo mínimo para cancelar (não definido pela Cocapec).
