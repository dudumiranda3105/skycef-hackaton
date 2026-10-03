# Skycef — Recebimento Inteligente (Cocapec)

X Hackathon Uni-FACEF · 3 e 4 de outubro de 2026

Plataforma de agendamento de recebimento de mercadorias, boletim diário dos chapas e painel
gerencial para a Cocapec. Responde à pergunta da direção: **a quantidade de chapas está
sobrando ou faltando?**

## Estrutura

```
api/        Backend (Java 21 + Spring Boot 3.5, monolito modular)
web/        Front-end (a definir)
etl/        Scripts de carga: lêem os dados de ./data e populam o banco
docs/       Artefatos obrigatórios: relatório gerencial, caso de uso, BPMN, DER
data/       Pasta LOCAL dos dados da Cocapec (ignorada pelo Git, nunca commitar)
docker-compose.yml   PostgreSQL + API
```

### Módulos do backend (`api/src/main/java/com/skycef/recebimento`)

| Módulo | Responsabilidade |
|---|---|
| `cadastros` | Fornecedores, produtos, armazéns, chapas, equipamentos |
| `agendamento` | Tarefa 1: vagas, validação de Compras, autorização do armazém, chegada/entrada/saída, cancelamento, reagendamento, não recebimento |
| `nfe` | Leitura do XML da nota fiscal (diferencial) |
| `boletim` | Tarefa 2: produção, equipe, regra do piso e complemento |
| `painel` | Tarefa 3: indicadores e dimensionamento sobra/falta de chapas |
| `consulta` | Pergunta em linguagem natural → SQL somente leitura (diferencial) |
| `shared` | Configuração e tratamento de erros |

Cada módulo segue `controller → service → domain → repository`. O pacote `domain` contém
só regra de negócio pura (sem Spring nem banco) e é onde ficam os testes mais importantes:

- `PisoCalculator` — regra do piso, validada contra o exemplo do dossiê (Adubo, 17/11/2025)
- `PoliticaDeVagas` — ocupação de horário (batido exclusivo, até 2 paletizados/big bag)
- `StatusAgendamento` — máquina de estados do agendamento

### Banco

PostgreSQL com migrations Flyway em `api/src/main/resources/db/migration`.
Toda tabela alimentada por carga ou simulação tem a coluna `origem`
(`PLATAFORMA`, `SIMULADO`, `HISTORICO`), porque o regulamento exige declarar a origem de
cada dado do painel.

## Como rodar

Pré-requisitos: JDK 21 e Maven 3.9+ (ou apenas Docker).

```bash
# Banco + API
docker compose up --build

# Ou local: só o banco no Docker, API pelo Maven
docker compose up -d db
cd api && mvn spring-boot:run
```

- API: http://localhost:8080
- Swagger: http://localhost:8080/swagger-ui.html
- Health: http://localhost:8080/actuator/health

Testes: `cd api && mvn test`

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
