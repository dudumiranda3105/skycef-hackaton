# Documentação

Use este índice para ir direto ao documento certo. Para instalar e executar o projeto, comece pelo [README principal](../README.md).

## Para entender e usar a plataforma

- [Diferenciais e funcionalidades](DIFERENCIAIS.md) — recursos da interface, limites e regras de segurança.
- [Login e perfis](API-LOGIN.md) — usuários iniciais, permissões e endpoints de autenticação.

## Contratos da API e regras de negócio

- [Tarefa 1 — Agendamento e recebimento](API-TAREFA1.md) — fluxo, status, regras e endpoints.
- [Tarefa 2 — Boletim dos chapas](API-TAREFA2.md) — cálculo, validações, endpoints e formatos.
- [Tarefa 3 — Painel gerencial](API-TAREFA3.md) — indicadores, filtros e dimensionamento em R$.
- [Guia da Tarefa 2](GUIA-TAREFA2.md) — implementação, casos de teste, achados e decisões em aberto.

## Análise gerencial e artefatos do projeto

Os quatro itens abaixo são os entregáveis obrigatórios do hackathon:

- [Relatório gerencial](relatorio-gerencial.md) — resposta à pergunta sobre sobra/falta, método, fontes e limitações.
- [Caso de uso UML](caso-de-uso.md) — responsabilidades dos atores e casos de uso ([diagrama SVG](caso-de-uso.svg)).
- [BPMN](bpmn.md) — processo proposto ([diagrama SVG](bpmn.svg)).
- [DER](der.md) — modelo do banco ([diagrama SVG](der.svg)).

Os três diagramas são exibidos abaixo. Para regenerá-los, execute `node docs/render-diagramas.cjs`.

![Casos de uso UML](caso-de-uso.svg)

![BPMN do processo proposto](bpmn.svg)

![DER PostgreSQL](der.svg)
