# API da Tarefa 3 — Painel gerencial

Base: `http://localhost:8000` · **Página do painel em `/painel`** (HTML único, sem CDN: funciona offline) · Swagger em
`/docs` · JSON em camelCase · **dinheiro como string decimal** (`"58369.5338"`, nunca float) · datas `AAAA-MM-DD`.

Cada resposta declara a **origem** do dado (`PLATAFORMA`, `TESTE` ou `HISTORICO`).

## Rotas

| Rota | O que responde | Fonte |
|---|---|---|
| `GET /api/painel/operacao` | Indicadores operacionais: cargas por dia e armazém, espera, descarga, chapas por recebimento, utilização, fornecedores, horários e dias de maior movimento, não recebimentos por motivo, custo da operação | Plataforma (T1 e T2) |
| `GET /api/painel/dimensionamento/plataforma` | **Sobra/falta de chapas em R$**, por armazém e por período, a partir dos boletins | Boletins (T2) |
| `GET /api/painel/dimensionamento/historico` | **Sobra/falta de chapas em R$** mês a mês no histórico, com cenários e limitações | `HISTORICO` |
| `GET /api/painel/historico/indicadores` | Recebimentos por ano e armazém, dia da semana e fornecedores (por recebimento) | `HISTORICO` |
| `GET /painel` | A página do painel | – |

### Filtros

| Parâmetro | Vale em | Observação |
|---|---|---|
| `de`, `ate` | todas | Inclusivos. No histórico recortam por **mês** e **não** mudam o ponto de equilíbrio |
| `armazemId` | `operacao`, `dimensionamento/plataforma` | 1 Insumos · 2 Adubo · 3 Pátio de Máquinas · 4 Loja |
| `origem` | `operacao`, `dimensionamento/plataforma` | `PLATAFORMA` ou `TESTE`; omitido = todas |
| `agrupar` | `dimensionamento/plataforma` | `dia`, `semana` ou `mes` (padrão) |

Parâmetro inválido devolve 400 `REQUISICAO_INVALIDA`.

## Sobra e falta pelo boletim (`/dimensionamento/plataforma`)

```
sobra (R$)  = Σ complemento                    (diária garantida sem produção que a justifique)
falta (R$)  = Σ (produção − piso × diárias)    dos dias em que a produção passou do piso (equipe curta)
aproveitamento = produção ÷ (piso × diárias)   < 0,90 SOBRA · > 1,10 FALTA · senão EQUILIBRADO
```

Resposta (resumo): `total`, `porArmazem[]` e `porPeriodo[]` trazem `boletins`, `diariasEquivalentes`, `producao`,
`totalAPagar`, `sobraReais`, `sobraDiarias`, `faltaReais`, `faltaDiarias`, `diasComComplemento`, `diasAcimaDoPiso`,
`aproveitamento` e `situacao`. Boletins `INCONSISTENTE` (sem equipe) são contados, mas ficam fora dos valores.
`efetivoDistintoPorDia` conta cada pessoa uma vez por dia, e `alertas.matriculasEmMaisDeUmBoletimNoMesmoDia` avisa
quando a mesma matrícula está em dois boletins (cada boletim paga as suas diárias).

## Sobra e falta no histórico (`/dimensionamento/historico`)

Método e premissas em [`relatorio-gerencial.md`](relatorio-gerencial.md), seção 5. A resposta traz `equilibrio`,
`meses[]` (recebimentos por dia, chapas por dia, chapas necessárias, saldo em diárias e R$, situação), `estacoes[]`
(safra × entressafra), `totais`, `armazens[]` (saldo repartido pela necessidade), `cenarios[]` (sensibilidade),
`robustez` (correlações), `demandaPorMesEArmazem[]` e **`limitacoes[]`**, que acompanham sempre o resultado.

## Dados de demonstração

```bash
cd api
java -jar target/recebimento-1.0.0.jar --dados=<DADOS_HACKATHON_2026.zip>  # histórico real (HISTORICO)
java -jar target/recebimento-1.0.0.jar --demo-seed                         # 3 semanas de teste (TESTE)
```

O seed é explícito, idempotente e preserva registros existentes. Ele marca os registros criados como `TESTE`; o painel filtra por origem.
