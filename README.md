# Skycef — Recebimento Inteligente (Cocapec)

Sistema de gestão de recebimento para a **Cocapec** (Franca/SP), desenvolvido para o **X Hackathon Uni-FACEF 2026**.

Organiza o recebimento de mercadorias nos 4 armazéns da cooperativa — agenda caminhões, controla descargas, calcula o boletim diário dos ensacadores e responde à pergunta: *"A quantidade de chapas está sobrando ou faltando? Qual o impacto em R$?"*

## Equipe

| Membro | GitHub |
|---|---|
| Eduardo de Miranda | [dudumiranda3105](https://github.com/dudumiranda3105) |
| Eduarda Roberta Borges da Silva | [Eduarda Roberta Borges](https://github.com/EduardaRoberta) |
| Rebeca Lucio Souza Chagas | [rebecaSLChagas](https://github.com/rebecaSLChagas) |
| Glauber | [GlauberCAP](https://github.com/GlauberCAP) |

## Tecnologias

| Camada | Tecnologia |
|---|---|
| **Backend** | Java 21 + Spring Boot 3.5 + Spring JDBC |
| **Banco** | PostgreSQL 16 (Flyway migrations) |
| **Frontend** | React 19 + TypeScript 7 + Vite 6.2 |
| **Estilização** | Tailwind CSS v4 + shadcn/ui |
| **Componentes** | Lucide (ícones), Motion (animações) |
| **Importação ETL** | Apache POI (Excel/XML) |
| **Diferenciais** | Leitura de NF-e (XML e DANFE com texto) e Pergunte aos Dados (Gemini para interpretar; cálculos determinísticos) |

## Estrutura do projeto

```
skycef-hackaton/
├── api/                     # Backend Java + Spring Boot
│   ├── src/
│   │   ├── main/java/.../   # Controllers, Services, Models
│   │   ├── main/resources/  # Config, migrations, static files
│   │   └── test/            # Testes unitários e integração
│   ├── migrations/          # Flyway SQL (V1 a V16)
│   └── Dockerfile           # Build multi-stage
├── web/                     # Frontend React
│   ├── src/                 # TSX components + features
│   │   ├── components/      # UI reutilizável (shell, charts, shadcn/ui)
│   │   ├── features/        # Telas (agenda, portaria, painel, boletim…)
│   │   └── lib/             # Utilitários (API, auth, format, store)
│   ├── dev-mock/            # Mock da API para desenvolvimento standalone
│   └── vite.config.ts
├── docs/                    # Documentação do hackathon
│   ├── relatorio-gerencial.md
│   ├── API-TAREFA*.md       # Contratos da API
│   ├── caso-de-uso.md + .svg
│   ├── bpmn.md + .svg
│   ├── der.md + .svg
│   └── DIFERENCIAIS.md
├── data/                    # Dados originais da Cocapec (.gitignore)
└── docker-compose.yml       # PostgreSQL + API
```

## Executar com Docker (recomendado)

```bash
docker compose up --build
```

Acesse `http://localhost:8000/ui/`. As migrations são aplicadas automaticamente.

Para habilitar a IA em **Pergunte aos Dados**, configure `GEMINI_API_KEY` no arquivo `.env` da raiz antes de subir o Compose.
Sem essa variável, a tela continua funcionando com as regras locais. A chave é usada somente pela API e não deve ser
colocada no frontend ou versionada. O texto da pergunta é enviado ao Google Gemini; os dados operacionais não são.

## Publicar o frontend na Vercel

O frontend pode ser hospedado na Vercel, mas a Vercel não executa este backend Spring Boot nem o PostgreSQL do Compose.
Hospede a API e o PostgreSQL em um serviço que aceite Docker e PostgreSQL gerenciado (por exemplo, Render ou Railway),
configure a API com `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`,
`AUTH_ATIVA=true`, `SENHA_INICIAL` forte e `GEMINI_API_KEY`, e mantenha `/health` público para o health check.

Na Vercel, importe este repositório e defina **Root Directory** como `web`. O arquivo `web/vercel.json` configura
instalação, build, saída e proxy. Depois de publicar a API, adicione a variável `BACKEND_URL` nas configurações da Vercel
com a URL HTTPS base da API (sem `/api` e sem barra final) e faça um novo deploy. O roteamento passa `/api/*` pela
Vercel para manter a sessão por cookie no mesmo host.
Não cadastre `GEMINI_API_KEY` na Vercel: ela pertence somente ao ambiente privado do backend. Não coloque segredos no
Git nem em variáveis `VITE_*`.

## Portaria e Insumos

Na Portaria, o QR localiza a entrega e o porteiro confere caminhão, destinatário e notas. Depois de registrar a chegada e anexar os documentos, **Enviar documentos para Insumos** coloca a entrega na fila do setor. Insumos valida e escolhe os destinos ou registra a recusa. A decisão retorna à Portaria, com consulta automática a cada 15 segundos.

Veja [o fluxo e os endpoints](docs/FLUXO-PORTARIA-INSUMOS.md).

## Executar sem Docker

1. Inicie um PostgreSQL e configure as variáveis (exemplo em `.env.example`)
2. Compile o frontend:

```bash
cd web
npm ci
npm run build
```

3. Execute o backend:

```bash
cd api
mvn clean test
mvn spring-boot:run
```

## Desenvolvimento do frontend com API real

Em um terminal, suba PostgreSQL e API com `docker compose up -d --build`. Em outro:

```bash
cd web
npm ci
npm run dev
```

Acesse `http://localhost:5173/ui/`. O frontend usa a API local e o banco PostgreSQL do Compose.

## Usuários iniciais

Todos com a senha definida em `SENHA_INICIAL` (padrão demo: `cocapec2026`):

| Usuário | Perfil | Acesso |
|---|---|---|
| `admin` | Administrador | Tudo |
| `diretoria` | Diretoria | Painel, boletins, indicadores |
| `compras` | Compras | Validar agendamentos |
| `armazem` | Resp. armazém | Recebimento, descargas |
| `encarregado` | Encarregado | Boletim diário |
| `fornecedor` | Fornecedor | Agendar entregas |
| `insumo` | Setor de Insumo | Acompanhar recebimento |
| `porteiro` | Portaria | Check-in, registrar chegada |

## Funcionalidades

| Tarefa | O que faz |
|---|---|
| **T1 — Agendamento/Recebimento** | Fornecedor agenda, Compras valida, Armazém define destinos, Porteiro registra chegada |
| **T2 — Boletim Diário** | Cálculo de produção, piso (R$ 90,1731) e complemento dos ensacadores |
| **T3 — Painel Gerencial** | Sobra/falta de chapas em R$, indicadores operacionais, séries históricas |
| **D-1 (Planejamento)** | Simulador de equipe com matriz de pressão |
| **Pergunte aos Dados** | Gemini interpreta a intenção em uma métrica permitida; o sistema calcula a resposta usando o catálogo seguro. Usa regras locais como fallback (veja [DIFERENCIAIS.md](docs/DIFERENCIAIS.md#6-pergunte-aos-dados)) |
| **QR Code** | Check-in por QR ou código de barras na portaria |
| **Leitura assistida da NF-e** | Lê o XML e o DANFE em PDF com texto. Não faz OCR: PDF escaneado é preenchido à mão |

## Documentação

Consulte o [índice da documentação](docs/README.md) para guias de uso, contratos da API e artefatos do hackathon.

## Importar dados históricos

Com Docker e PostgreSQL ativos, para carregar a pasta extraída no Windows:

```powershell
docker compose run --rm -v "C:/Users/Duda/Downloads/DADOS_HACKATHON_2026:/tmp/dados:ro" --entrypoint java api -jar /app/app.jar --spring.main.web-application-type=none --dados=/tmp/dados
```

O diretório é montado somente para leitura. A carga substitui os históricos importados pela fonte oficial; não cria agendamentos nem altera os registros lançados pela plataforma. Para arquivos históricos, o sistema preserva o XML original, DANFEs e digitalização manual. O registro manual está digitalizado, sem transcrição automática. A planilha de boletim contém um único lançamento preenchido em 17/11/2025; não são inventados boletins para os outros armazéns ou datas.

Também é possível apontar o executável para o ZIP original ou para qualquer pasta extraída compatível:

```bash
java -jar target/recebimento-1.0.0.jar --dados=C:/caminho/DADOS_HACKATHON_2026.zip
```

Os dados da Cocapec não entram no Git (veja `.gitignore`).
