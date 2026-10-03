# Skycef — Recebimento Inteligente (Cocapec)

X Hackathon Uni-FACEF · 3 e 4 de outubro de 2026

Plataforma de agendamento de recebimento de mercadorias, boletim diário dos chapas e painel
gerencial para a Cocapec. Responde à pergunta da direção: **a quantidade de chapas está
sobrando ou faltando?**

## Estrutura

```
api/        Backend (Python + FastAPI + SQLAlchemy + PostgreSQL)
web/        Front-end (React + Vite + TypeScript)
etl/        Scripts de carga: lêem os dados de ./data e populam o banco
docs/       Artefatos obrigatórios: relatório gerencial, caso de uso, BPMN, DER
data/       Pasta LOCAL dos dados da Cocapec (ignorada pelo Git, nunca commitar)
docker-compose.yml   PostgreSQL + API
```

### Backend (`api/app`)

| Módulo | Responsabilidade |
|---|---|
| `cadastros` | Fornecedores, calendário (dias úteis e feriados) |
| `agendamento` | Tarefa 1: vagas, validação de Compras, autorização do armazém, chegada/entrada/saída, cancelamento, reagendamento, não recebimento |
| `nfe` | Leitura do XML da nota fiscal (diferencial) |
| `boletim` | Tarefa 2: produção, equipe, regra do piso e complemento |
| `painel` | Tarefa 3: indicadores e dimensionamento sobra/falta de chapas |
| `consulta` | Pergunta em linguagem natural → SQL somente leitura (diferencial) |
| `core` | Configuração, banco, relógio (fuso de São Paulo), erros, migrations |
| `shared` | Tipos e contratos comuns |

Em cada módulo: `domain.py` (regra pura, sem banco nem FastAPI), `models.py` (SQLAlchemy),
`service.py` (casos de uso e transações), `schemas.py` (contrato JSON, em camelCase) e
`router.py` (HTTP). Os testes mais importantes são os de `domain`:

- `boletim/domain.py` — regra do piso, validada contra o exemplo do dossiê (Adubo, 17/11/2025)
- `agendamento/domain.py` — ocupação de horário (batido exclusivo, até 2 paletizados/big bag)
  e máquina de estados do agendamento

A vaga do horário é reservada sob um `pg_advisory_xact_lock` por (data, horário), para dois
fornecedores não estourarem o limite ao mesmo tempo (`tests/test_concorrencia.py` prova isso).

### Banco

PostgreSQL. O modelo de dados está em `api/migrations/V*.sql` (fonte do DER), aplicado em
ordem e uma única vez por `python -m app.core.migrate` (também roda ao iniciar a API).
Toda tabela alimentada por carga ou simulação tem a coluna `origem`
(`PLATAFORMA`, `SIMULADO`, `HISTORICO`), porque o regulamento exige declarar a origem de
cada dado do painel.

## Como rodar

Pré-requisitos: [uv](https://docs.astral.sh/uv/) e um PostgreSQL (local ou via Docker).

```bash
cp .env.example .env            # ajuste DB_URL se o seu banco for diferente
cd api
uv sync                         # cria o .venv e instala as dependências
uv run uvicorn app.main:app --reload
```

- API: http://localhost:8000 (contratos: [`docs/API-TAREFA1.md`](docs/API-TAREFA1.md) e [`docs/API-TAREFA2.md`](docs/API-TAREFA2.md))
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

Com Docker: `docker compose up --build` sobe o PostgreSQL e a API.

### Testes

```bash
cd api
uv run pytest
```

Os testes de integração usam um **schema temporário** no PostgreSQL apontado por `DB_URL`
(ou `TEST_DB_DSN`) e o removem no final; as tabelas de desenvolvimento não são tocadas. Sem
PostgreSQL acessível eles são ignorados e os testes de domínio rodam normalmente.

## Dados

Os arquivos da Cocapec **não podem ir para o repositório** (regulamento, seção M). Extraia
o pacote em `./data` (já ignorado pelo `.gitignore`) e rode os scripts de `etl/`.
Ao final do evento, apague as cópias.

## Artefatos obrigatórios (`/docs`)

- [ ] Relatório gerencial
- [ ] Diagrama de Caso de Uso (UML)
- [ ] Diagrama BPMN
- [ ] DER

## Prazos do evento

- Link do repositório à comissão até 1h após a abertura (acesso para dfpires@gmail.com)
- Commits a cada 2h a partir das 18h de sábado
- Congelamento do repositório: 07h de domingo
