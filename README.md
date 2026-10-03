# Skycef — Recebimento Inteligente (Cocapec)

X Hackathon Uni-FACEF · 3 e 4 de outubro de 2026

Plataforma de agendamento de recebimento de mercadorias, boletim diário dos chapas e painel
gerencial para a Cocapec. Responde à pergunta da direção: **a quantidade de chapas está
sobrando ou faltando?**

## Estrutura

```
api/        Backend (Python + FastAPI + SQLAlchemy + PostgreSQL)
web/        Notas sobre a interface web
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
(`PLATAFORMA`, `TESTE`, `HISTORICO`), porque o regulamento exige declarar a origem de
cada dado do painel.

## Como rodar

Pré-requisitos: [uv](https://docs.astral.sh/uv/) e um PostgreSQL (local ou via Docker).

```bash
cp .env.example .env            # ajuste DB_URL se o seu banco for diferente
cd api
uv sync                         # cria o .venv e instala as dependências
uv run uvicorn app.main:app --reload
```

- Interface da Tarefa 1: http://localhost:8000/app/
- Interface da Tarefa 2: http://localhost:8000/app/boletim.html
- Painel da Tarefa 3: http://localhost:8000/painel
- API: http://localhost:8000 (contratos: [`Tarefa 1`](docs/API-TAREFA1.md), [`Tarefa 2`](docs/API-TAREFA2.md) e [`Tarefa 3`](docs/API-TAREFA3.md))
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

Com Docker: `docker compose up --build` sobe o PostgreSQL e a API.

O projeto usa somente PostgreSQL. A API rejeita `DB_URL` de SQLite. Para carregar o
histórico local no painel, execute `uv run python -m app.etl.historico --dados <caminho-do-zip>`
em `api/`. Para gerar dados de demonstração em um banco sem agendamentos, execute
`uv run python -m app.seed.demo`. O modo `--recriar` limpa registros operacionais existentes;
use apenas em um banco descartável de demonstração.

### Fluxo funcional da Tarefa 1

A Tarefa 1 está disponível em uma interface web leve servida pela própria API, sem precisar
iniciar um segundo processo. O fluxo implementado é:

1. cadastrar ou selecionar o fornecedor;
2. escolher data, horário e acondicionamento (`BATIDO`, `PALETIZADO` ou `BIG_BAG`);
3. anexar uma ou mais notas fiscais em XML/PDF, gravadas no PostgreSQL;
4. Compras autorizar ou recusar após a conferência com o pedido;
5. o responsável definir um ou mais armazéns, gerando uma descarga independente por destino;
6. registrar chegada, entrada e saída de cada descarga;
7. informar, na saída, quantos chapas e quais equipamentos individuais foram utilizados.

Também estão implementados o cancelamento em duas etapas, a decisão do responsável sobre a
vaga liberada, o reagendamento com histórico, a exceção de capacidade por caso fortuito e o
registro de não recebimentos — inclusive para caminhão sem agendamento e sem vaga.

Regras de ocupação aplicadas globalmente à cooperativa:

- carga batida ocupa sozinha o horário;
- sem carga batida, cabem até dois caminhões paletizados ou big bag;
- horários disponíveis: 08h00, 10h00, 13h00 e 15h00;
- recebimentos somente em dias úteis e fora dos feriados cadastrados;
- a reserva é protegida contra concorrência no PostgreSQL.

O contrato completo está documentado no Swagger (`/docs`) e em
[`docs/API-TAREFA1.md`](docs/API-TAREFA1.md). Os cenários de aceite estão cobertos em
`api/tests/test_fluxos.py`, `api/tests/test_marcos.py`, `api/tests/test_nfe_arquivos.py` e
`api/tests/test_tarefa1_contrato.py`.

Esses registros pertencem exclusivamente à Tarefa 1. A quantidade de chapas de uma descarga
mede a intensidade daquela carga e não altera nem substitui a equipe do boletim diário da
Tarefa 2. Nenhum cálculo de boletim ou indicador da Tarefa 3 é alterado pela operação da
Tarefa 1.

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

- [x] [Relatório gerencial](docs/relatorio-gerencial.md)
- [x] [Diagrama de Caso de Uso (UML)](docs/caso-de-uso.md)
- [x] [Diagrama BPMN](docs/bpmn.md)
- [x] [DER](docs/der.md)

## Prazos do evento

- Link do repositório à comissão até 1h após a abertura (acesso para dfpires@gmail.com)
- Commits a cada 2h a partir das 18h de sábado
- Congelamento do repositório: 07h de domingo
