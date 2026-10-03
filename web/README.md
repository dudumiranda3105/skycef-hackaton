# Front-end

React + Vite + TypeScript. Consome a API via HTTP/JSON; o contrato é o OpenAPI gerado pelo
backend em `http://localhost:8000/openapi.json` (Swagger em `/docs`). O JSON usa camelCase.

Defina a URL da API em `.env`: `VITE_API_URL=http://localhost:8000`.

A origem do front (`http://localhost:5173` por padrão) é liberada no CORS pela variável
`CORS_ORIGINS` da API.
