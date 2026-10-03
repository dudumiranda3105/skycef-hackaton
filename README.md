# Skycef — Recebimento Inteligente (Cocapec)

X Hackathon Uni-FACEF · 3 e 4 de outubro de 2026

Plataforma de agendamento de recebimento de mercadorias, boletim diário dos chapas e painel
gerencial para a Cocapec. Responde à pergunta da direção: **a quantidade de chapas está
sobrando ou faltando?**

## Estrutura

```
api/        Backend (Python + FastAPI + SQLAlchemy + Alembic)
web/        Front-end (a definir)
etl/        Scripts de carga: lêem os dados de ./data e populam o banco
docs/       Artefatos obrigatórios: relatório gerencial, caso de uso, BPMN, DER
data/       Pasta LOCAL dos dados da Cocapec (ignorada pelo Git, nunca commitar)
docker-compose.yml   PostgreSQL + API
```

### Backend da Tarefa 1 (`api/app`)

| Arquivo | Responsabilidade |
|---|---|
| `main.py` | Rotas HTTP, upload da nota fiscal e tratamento de erros |
| `service.py` | Vagas, validação de Compras, autorização, descarga, cancelamento, reagendamento e não recebimento |
| `models.py` | Modelo persistente SQLAlchemy |
| `schemas.py` | Contratos de entrada e saída Pydantic |
| `database.py` | Sessões e conexão com o PostgreSQL |

O backend separa contratos Pydantic, modelos SQLAlchemy, serviços de domínio e rotas FastAPI.
As regras críticas possuem testes automatizados:

- ocupação de horário (batido exclusivo, até 2 paletizados/big bag);
- dias úteis e horários fixos de recebimento;
- máquina de estados do agendamento e fluxo completo da descarga.

### Banco

PostgreSQL com migrations Alembic em `api/migrations`.

## Como rodar

Pré-requisitos: Python 3.12+ (ou apenas Docker).

```bash
# Banco + API
docker compose up --build

# Ou local: banco no Docker e API pelo Uvicorn
docker compose up -d db
cd api && uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

Testes: `cd api && pytest`

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
