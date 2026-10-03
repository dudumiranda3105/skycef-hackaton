# Front-end

A interface completa (agenda, Compras, armazém, boletim diário e painel gerencial) é servida pela própria API em
`http://localhost:8000/ui/` (a raiz `/` redireciona para ela). Os arquivos ficam em `api/src/main/resources/static/ui`
(HTML, CSS e JavaScript puros, sem build): `core.js` (formatação), `api.js` (cliente da API e estado),
`recebimento.js` (Tarefa 1), `boletim.js` (Tarefa 2), `painel.js` (Tarefa 3) e `main.js` (estrutura e eventos).
Nada é gravado no navegador: todas as regras de vaga, boletim e painel vêm da API.
As telas simples anteriores continuam em `/app/` e `/painel`.

O contrato completo permanece disponível em `http://localhost:8000/openapi.json` e no
Swagger em `http://localhost:8000/docs`. O JSON usa camelCase.
