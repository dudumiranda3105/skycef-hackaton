# Arquitetura do Sistema

## Visão geral

```
┌──────────────┐     ┌──────────────────┐     ┌────────────┐
│   React 19   │────▶│  Spring Boot 3.5 │────▶│ PostgreSQL │
│  (TS + Vite) │     │  (Java 21)       │     │    (16)    │
└──────────────┘     └──────────────────┘     └────────────┘
       │                      │
       │  npm run dev:mock    │
       ▼                      │
  ┌──────────┐               │
  │ Mock JS  │─── simula a   │
  │ (dev-mock)│   API sem DB │
  └──────────┘               │
```

O frontend React compila para `api/src/main/resources/static/ui/` e é servido pelo Spring Boot.
Em desenvolvimento, o Vite faz proxy das chamadas `/api` para o backend em `localhost:8000`.

## Frontend (web/src/)

```
src/
├── main.tsx              # Entry point (createRoot)
├── App.tsx               # Roteamento + provedores globais
├── index.css             # Tema Tailwind (cores Cocapec)
├── components/
│   ├── shell.tsx         # Sidebar + layout principal
│   ├── comum.tsx         # Componentes compartilhados
│   ├── charts/
│   │   └── cena3d.tsx    # Gráficos SVG (barras, logo)
│   └── ui/               # shadcn/ui adaptado (button, card, table…)
├── features/             # Telas do sistema (cada uma = uma seção)
│   ├── login.tsx
│   ├── home.tsx
│   ├── portaria.tsx      # Check-in do porteiro
│   ├── agenda/           # Agendamento (listagem, criação, detalhe)
│   ├── compras.tsx       # Validação de Compras
│   ├── armazem.tsx       # Descargas no armazém
│   ├── boletim.tsx       # Boletim diário
│   ├── painel.tsx        # Painel gerencial
│   ├── d1.tsx            # Planejamento D-1
│   ├── perguntar.tsx     # Pergunte aos dados (LLM)
│   ├── qualidade.tsx     # Qualidade dos dados
│   ├── usuarios.tsx      # Gestão de usuários
│   └── checkin/          # QR Code + leitor de código de barras
└── lib/                  # Utilitários
    ├── api.ts            # Cliente HTTP
    ├── auth.tsx          # Contexto de autenticação
    ├── store.tsx         # Estado global (dados, cache)
    ├── rota.ts           # Roteamento por hash (#/secao)
    ├── types.ts          # Interfaces TypeScript
    ├── format.ts         # Formatação (moeda, data, número)
    ├── tema.ts           # Tema claro/escuro
    └── constants.ts      # Constantes do negócio
```

## Backend (api/src/main/java/com/skycef/recebimento/)

```
recebimento/
├── RecebimentoApplication.java   # Entry point Spring Boot
├── agendamento/                  # Tarefa 1: agendamento e recebimento
│   ├── AgendamentoController.java
│   ├── AgendamentoService.java   # Regras de capacidade + vagas
│   ├── FluxoService.java         # Chegada, entrada, saída, reagendamento
│   └── NotaArquivoService.java   # Upload de XML/PDF
├── auth/                         # Autenticação e autorização
│   ├── AuthController.java       # Login, logout, senha
│   ├── AuthService.java          # Sessões, hash, seed de usuários
│   ├── AuthInterceptor.java      # Filtro de requisições
│   ├── Permissoes.java           # Matriz de permissões por perfil
│   └── Senhas.java               # PBKDF2 com SHA-256
├── boletim/                      # Tarefa 2: boletim diário
│   ├── BoletimCalculator.java    # Motor de cálculo (produção, piso, complemento)
│   ├── BoletimController.java
│   └── BoletimService.java
├── cadastros/                    # CRUD base (fornecedores, equipamentos, etc)
│   └── CadastrosController.java
├── dados/                        # Importação de dados históricos
│   ├── CargaDadosService.java    # Leitor de Excel/CSV do pacote Cocapec
│   └── CargaDadosRunner.java     # CLI: --dados=<arquivo.zip>
├── painel/                       # Tarefa 3: painel gerencial
│   ├── PainelController.java
│   ├── HistoricoPainelService.java   # Análise histórica (sobra/falta)
│   └── PlataformaPainelService.java  # Análise dos registros da plataforma
└── shared/                       # Infraestrutura
    ├── ApiExceptionHandler.java  # Tratamento global de erros
    ├── HealthController.java
    ├── LegacyMigrationBridge.java# Bridge Flyway para banco existente
    └── WebConfig.java            # CORS, interceptors, view controllers
```

## Banco de dados

12 migrations sequenciais em `api/migrations/V1__schema.sql` a `V12__historico_estoque_oficial.sql`.

### Tabelas principais

| Tabela | Propósito |
|---|---|
| `armazem` | 4 armazéns: Insumos, Adubo, Pátio de Máquinas, Loja |
| `agendamento` | Agenda de recebimento (fornecedor, data, horário, status) |
| `nota_fiscal` | Notas fiscais vinculadas ao agendamento |
| `descarga` | Descarga em um armazém (chegada, entrada, saída, chapas) |
| `descarga_equipamento` | Equipamentos usados na descarga |
| `vaga_liberada` | Vagas liberadas por cancelamento |
| `boletim` | Boletim diário por armazém |
| `boletim_producao` | Itens de produção do boletim |
| `usuario` / `sessao` | Autenticação |

### Fluxo de status do agendamento

```
PENDENTE_COMPRAS ──▶ AUTORIZADO ──▶ EM_DESCARGA ──▶ CONCLUIDO
       │                   │               │
       ▼                   ▼               ▼
NAO_AUTORIZADO        CANCELADO       NAO_RECEBIDO
```

## Regras de negócio

| Regra | Descrição |
|---|---|
| Capacidade | 1 batido sozinho OU 2 paletizados/big bag por horário |
| Validação | Compras precisa autorizar antes da descarga |
| Descarga | Chegada ≤ Entrada ≤ Saída (validado em DB e API) |
| Boletim | Produção = Σ(qtde × preço), Piso = R$ 90,1731/diária |
| Complemento | Se VPD < piso: total = piso × diárias, complemento = total − produção |
| Chapas | Máx 20 por boletim, diária completa ou meia |

## Perfis e permissões

| Perfil | Pode fazer |
|---|---|
| ADMIN | Tudo |
| DIRETORIA | Ler tudo, painel gerencial, boletins |
| COMPRAS | Validar agendamentos |
| ARMAZEM | Gerir descargas, definir destinos, boletins, painel |
| ENCARREGADO | Lançar boletim diário |
| FORNECEDOR | Agendar entregas |
| INSUMO | Acompanhar recebimento |
| PORTEIRO | Registrar chegada, anexar NF, definir destino |