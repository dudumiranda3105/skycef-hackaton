# Alinhamento Codex + Claude — backend da Tarefa 1

Data da revisão: 03/10/2026.

## Estado verificado

- `claude/tarefa-1` local: `496cfb9` (`V5: alinha o modelo de dados ao CLAUDE.md`).
- `origin/claude/tarefa-1`: `2984b3b`. Os três commits mais recentes do Claude ainda precisam ser publicados.
- `codex/tarefa1-fastapi`: backend funcional independente, com fluxo HTTP completo e smoke test em PostgreSQL.
- `origin/main`: `f4f6532`, contendo apenas a etapa anterior da implementação; não deve receber outro merge antes da integração.

Validação executada na branch do Claude:

- `pytest`: **133 testes aprovados**;
- `ruff check app tests`: **sem ocorrências**.

## Decisão de arquitetura

A implementação do Claude deve ser a base canônica do backend, porque o modelo V5 está mais aderente ao `CLAUDE.md`:

- uma ou mais notas fiscais por agendamento;
- uma descarga por armazém de destino;
- quantidade de chapas e equipamentos por descarga;
- histórico próprio de reagendamento;
- solicitação e efetivação de cancelamento;
- equipamentos individualizados;
- origem `HISTORICO`, `PLATAFORMA` ou `TESTE`;
- contratos em português e JSON em `camelCase`;
- migrations SQL V1–V5 e gerenciamento de dependências com `uv`.

Não combinar o esquema SQL/Alembic da branch Codex com as migrations V1–V5. Deve existir uma única linha de migrations e um único modelo de dados.

## Bloqueios antes da `main`

Apesar do modelo robusto, a API do Claude expõe atualmente apenas:

- agenda e criação/listagem/detalhe de agendamentos;
- eventos;
- decisão de Compras;
- definição dos destinos.

Ainda faltam operações eliminatórias da Tarefa 1:

1. upload multipart de **uma ou mais** NFs e download seguro dos anexos;
2. chegada, entrada e saída **por descarga**, com `chegada <= entrada <= saída`;
3. quantidade de chapas e equipamentos individuais usados em cada descarga;
4. conclusão automática do agendamento somente quando todas as descargas terminarem;
5. solicitação e efetivação do cancelamento;
6. decisão sobre a vaga liberada, sem escolha automática do próximo caminhão;
7. reagendamento por caso fortuito, preservando data/horário anterior e permitindo exceder a capacidade;
8. registro e consulta de não recebimentos;
9. cadastro/consulta de equipamentos e dias não operacionais necessários à demonstração;
10. testes HTTP de ponta a ponta cobrindo o roteiro completo da demo.

As tabelas para a maior parte dessas operações já existem na V5, mas os métodos de serviço e as rotas ainda não foram implementados.

## Divisão de trabalho proposta

### Claude

- publicar os commits `8b28378`, `1f22726` e `496cfb9` em `origin/claude/tarefa-1`;
- manter como fonte canônica: domínio, modelos, migrations V1–V5, formato de erros e contratos em português/camelCase;
- não iniciar uma segunda implementação paralela das rotas faltantes sem atualizar este documento.

### Codex

- criar a integração a partir do commit `496cfb9`, sem copiar o esquema concorrente da branch `codex/tarefa1-fastapi`;
- portar somente as capacidades já validadas no protótipo Codex para os modelos V5;
- implementar serviços, schemas, rotas e testes dos dez itens pendentes;
- validar migrations e fluxo completo em PostgreSQL real;
- entregar uma branch de integração para revisão antes da `main`.

## Contrato de integração

- Base técnica: FastAPI + SQLAlchemy + PostgreSQL + `uv`.
- Banco: migrations SQL V1–V5; novas alterações entram em V6 ou posterior.
- API e mensagens: português; JSON em `camelCase`.
- Datas/horas: timezone obrigatório, `America/Sao_Paulo` na execução.
- Dinheiro: `Decimal`; nunca `float`.
- Arquivos da Cocapec: nunca versionar.
- Nenhum merge na `main` até os testes do fluxo eliminatório passarem em PostgreSQL.

## Critério de pronto para merge

1. branch remota do Claude sincronizada;
2. uma única branch de integração baseada em `496cfb9` ou sucessor;
3. suíte atual de 133 testes preservada;
4. novos testes HTTP para todas as operações pendentes;
5. smoke test PostgreSQL: múltiplas NFs, dois destinos/descargas, Compras, marcos temporais, chapas, equipamentos e conclusão;
6. cancelamento, reagendamento e não recebimento demonstráveis pelo Swagger;
7. `ruff` e `git diff --check` limpos;
8. somente então abrir o PR para `main`.
