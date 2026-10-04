# Front-end (web/)

Interface web moderna desenvolvida para o **Skycef — Recebimento Inteligente (Cocapec)** no Hackathon Uni-FACEF 2026.

Construída com **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **Motion**, **Three.js** e componentes de design system acessíveis.

---

## 🚀 Como executar

Dentro do diretório `web/`:

### 1. Desenvolvimento com Mock (Sem precisar de Docker ou Backend)
Sobe a interface com uma API simulada (`dev-mock/`) que intercepta as chamadas e permite demonstrar todas as funcionalidades, fluxos e telas de forma 100% autônoma:
```bash
npm run dev:mock
```
Acesse: [http://localhost:5173/ui/](http://localhost:5173/ui/)

### 2. Desenvolvimento integrado à API Spring Boot
Sobe o servidor Vite com proxy para a API rodando em `http://localhost:8000`:
```bash
npm run dev
```

### 3. Validação de tipos (Typecheck)
Verifica todos os tipos estáticos com o compilador TypeScript:
```bash
npm run typecheck
```

### 4. Build de produção
Compila e minifica a aplicação, gerando os artefatos diretamente na pasta de recursos estáticos da API (`api/src/main/resources/static/ui/`):
```bash
npm run build
```

---

## 🏗️ Estrutura do Projeto

```
web/
├── dev-mock/                 # Mocks da API e autenticação para desenvolvimento isolado
│   ├── mock.js               # Respostas e rotas simuladas da API
│   └── mock-auth.js          # Sessão e usuários mockados
├── src/
│   ├── components/           # Componentes visuais compartilhados
│   │   ├── ui/               # Botões, diálogos, tabelas, tabs, sheets, badges
│   │   ├── comum.tsx         # Componentes base da aplicação (Painel, Cartao, etc.)
│   │   ├── shell.tsx         # Layout principal com menu lateral, navegação e cabeçalho
│   │   └── graficos3d.tsx    # Gráficos e visualizações 3D em Three.js
│   ├── features/             # Módulos e telas por domínio
│   │   ├── agenda/           # Tarefa 1: Novo agendamento (leitura de NF), detalhes, reagendamento
│   │   ├── compras.tsx       # Tarefa 1: Validação, aprovação e recusa de agendamentos por Compras
│   │   ├── armazem.tsx       # Tarefa 1: Fluxo operacional do armazém (recebimento, descarga, liberação)
│   │   ├── checkin/          # Check-in por QR Code, leitura de código de barras e alteração de senha
│   │   ├── boletim.tsx       # Tarefa 2: Boletim diário unificado dos 4 armazéns com cálculo dinâmico
│   │   ├── painel.tsx        # Tarefa 3: Painel gerencial executivo com filtros, métricas e auditoria
│   │   ├── d1.tsx            # Diferencial: Planejamento D-1 com matriz de pressão e simulador de equipe
│   │   ├── perguntar.tsx     # Diferencial: Pergunte aos Dados (processamento em linguagem natural)
│   │   ├── qualidade.tsx     # Diferencial: Auditoria de qualidade dos dados e limites das fontes
│   │   └── usuarios.tsx      # Gestão de usuários, perfis e permissões
│   ├── lib/                  # Lógica de negócio, clientes e utilitários
│   │   ├── api.ts            # Cliente HTTP com interceptor de autenticação e tipagem de contratos
│   │   ├── auth.tsx          # Contexto e gerenciamento de estado de autenticação
│   │   ├── dados.tsx         # Cache reativo e sincronização de dados da plataforma
│   │   ├── d1.ts             # Motor de cálculo de pressão e simulação do Planejamento D-1
│   │   ├── pergunte.ts       # Motor de interpretação e cálculo do Pergunte aos Dados
│   │   ├── nf.ts             # Parser assistido de notas fiscais (XML NF-e e PDF/DANFE)
│   │   └── qr.ts             # Gerador de QR Code vetorial e integração com BarcodeDetector
│   ├── App.tsx               # Roteamento baseado em hash (#/) e hierarquia de provedores
│   ├── main.tsx              # Ponto de entrada React com StrictMode
│   └── index.css             # Estilos globais e tokens de tema Tailwind v4
└── vite.config.ts            # Configuração Vite, proxy, Tailwind e compilação integrada
```

---

## 📦 Integração com a API Spring Boot e Docker

- A interface é servida diretamente pelo Spring Boot sob o caminho `/ui/`.
- No Docker, o `api/Dockerfile` realiza uma compilação **multi-stage**:
  1. O Node 24 executa `npm ci` e `npm run build` dentro do container.
  2. O Maven empacota a aplicação Java incluindo os arquivos gerados em `target/classes/static/ui/`.
  3. A imagem final JRE 21 roda a aplicação de forma enxuta e segura, sem depender do Node em tempo de execução.
