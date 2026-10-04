# Skycef — Recebimento Inteligente (Cocapec)

Projeto do X Hackathon Uni-FACEF 2026. Implementa agendamento e recebimento (Tarefa 1), boletim diário dos chapas (Tarefa 2) e painel gerencial (Tarefa 3).

## Tecnologia

- Backend: **Java 21 + Spring Boot 3.5**, Spring JDBC, Flyway e PostgreSQL.
- Frontend: **React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion + Three.js** em `web/`. É compilado via Docker multi-stage build e servido pelo Spring Boot em `/ui/`. Suporta execução autônoma com API mock (`npm run dev:mock`) e desenvolvimento integrado (`npm run dev`).
- Dados: migrations PostgreSQL em `api/migrations/V*.sql`; carga opcional do histórico com Apache POI.

## Executar

Com Docker: `docker compose up --build` inicia PostgreSQL e API. As migrations são aplicadas automaticamente. Acesse:

| Módulo | URL |
|---|---|
| **Interface completa** (agenda, Compras, armazém, boletim do dia, painel, D-1, Pergunte aos dados e Qualidade dos dados; ver [diferenciais](docs/DIFERENCIAIS.md)) | http://localhost:8000/ui/ |
| Agendamentos (interface simples) | http://localhost:8000/app/ |
| Boletim (interface simples) | http://localhost:8000/app/boletim.html |
| Painel (página única) | http://localhost:8000/painel |
| Swagger | http://localhost:8000/docs |
| Saúde | http://localhost:8000/health |

**Login.** A plataforma exige entrar. Na primeira subida são criados os usuários `admin`, `diretoria`, `compras`, `armazem`, `encarregado` e `fornecedor`, todos com a senha de `SENHA_INICIAL` (no `docker-compose.yml` e no `.env.example` há um valor de **demonstração**: troque em *Alterar senha*, ou defina `SENHA_INICIAL` antes da primeira subida; vazia, a API gera uma e mostra no log). Perfis, permissões e endpoints em [docs/API-LOGIN.md](docs/API-LOGIN.md).

Sem Docker, inicie um PostgreSQL e configure `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME` e `SPRING_DATASOURCE_PASSWORD` (exemplo em `.env.example`). Depois:

```bash
cd web
npm ci
npm run build
cd ../api
mvn clean test
mvn spring-boot:run
```

O Flyway usa as mesmas migrations do backend anterior. Em banco já criado por ele, a aplicação lê `schema_migrations`, registra a versão existente no Flyway e aplica somente as versões seguintes. Faça backup do banco antes da primeira troca de runtime.

## Carregar dados para a demonstração

Os arquivos originais da Cocapec **não entram no Git**. O importador lê o ZIP local, remove linhas exatamente duplicadas da movimentação e registra a origem `HISTORICO`:

```bash
cd api
java -jar target/recebimento-1.0.0.jar --dados=C:/caminho/DADOS_HACKATHON_2026.zip
```

Depois do resumo da carga, encerre o processo se estiver usando essa execução só para importar. O comando substitui as tabelas históricas em uma transação; não altera agendamentos ou boletins da plataforma. Para gerar três semanas de dados de demonstração marcados `TESTE`, use `--demo-seed`. O seed não apaga dados existentes e deve ser chamado explicitamente.

## Testes

`mvn clean test` executa os testes Java. Testes de integração com PostgreSQL usam `TEST_DB_URL` e um schema temporário. A interface frontend em `web/` pode ser verificada com `npm run typecheck` e compilada com `npm run build`.

O histórico não registra horários de descarga nem chapas por recebimento. O painel separa dados `HISTORICO`, `PLATAFORMA` e `TESTE`; a estimativa histórica de sobra/falta é uma faixa de sensibilidade, detalhada no [relatório gerencial](docs/relatorio-gerencial.md).

## Documentação

Consulte o [índice da documentação](docs/README.md) para encontrar os guias de uso, contratos da API, regras de negócio, análise gerencial e artefatos do hackathon.
