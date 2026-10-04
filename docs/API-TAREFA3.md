# API da Tarefa 3 — Painel gerencial

Base: `http://localhost:8000` · **Página do painel em `/painel`** (HTML único, sem CDN: funciona offline) · Swagger em
`/docs` · JSON em camelCase · **dinheiro como string decimal** (`"58369.5338"`, nunca float) · datas `AAAA-MM-DD`.

Cada resposta declara a **origem** do dado (`PLATAFORMA` ou `HISTORICO`).

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
| `origem` | `operacao`, `dimensionamento/plataforma` | só `PLATAFORMA` (qualquer outro valor devolve 400); omitido = `PLATAFORMA` |
| `agrupar` | `dimensionamento/plataforma` | `dia`, `semana` ou `mes` (padrão) |

Parâmetro inválido devolve 400 `REQUISICAO_INVALIDA`.

## Sobra e falta pelo boletim (`/dimensionamento/plataforma`)

```
sobra (R$)  = Σ complemento                    (diferença paga para alcançar o piso)
falta (R$)  = Σ (produção − piso × diárias)    dos dias em que a produção passou do piso
aproveitamento = produção ÷ (piso × diárias)   < 0,90 COMPLEMENTO · > 1,10 PRODUÇÃO ACIMA DO PISO · senão EQUILIBRADO
```

Resposta (resumo): `total`, `porArmazem[]` e `porPeriodo[]` trazem `boletins`, `diariasEquivalentes`, `producao`,
`totalAPagar`, `sobraReais` (complemento pago), `sobraDiarias`, `faltaReais` (produção acima do piso), `faltaDiarias`,
`diasComComplemento`, `boletinsComComplemento`, `diasAcimaDoPiso`,
`aproveitamento` e `situacao`. Boletins `INCONSISTENTE` (sem equipe) são contados, mas ficam fora dos valores.
`efetivoDistintoPorDia` conta cada pessoa uma vez por dia, e `alertas.matriculasEmMaisDeUmBoletimNoMesmoDia` avisa
quando a mesma matrícula está em dois boletins (cada boletim paga as suas diárias).

**Interpretação gerencial:** o complemento é um custo efetivamente pago e um sinal para revisar a relação entre equipe,
produção e demanda. Ele não prova isoladamente excesso de chapas ou ociosidade, nem aponta sua causa; avalie junto com
volume de descargas concluídas, chapas registradas por descarga (intensidade, não efetivo diário), armazém, período e
condições da operação. O painel apresenta essas medidas em conjunto, mas não prescreve redução ou realocação de pessoas.
Descargas concluídas são agrupadas pela data de saída e boletins pela data do boletim; a comparação é do período, não um
vínculo individual entre descarga e pagamento. `diasComComplemento` conta datas distintas com complemento, e
`boletinsComComplemento` conta boletins que tiveram complemento. O contexto qualitativo do negócio está em
[`relatorio-gerencial.md`](relatorio-gerencial.md), seção 4.

## Sobra e falta no histórico (`/dimensionamento/historico`)

Método e premissas em [`relatorio-gerencial.md`](relatorio-gerencial.md), seção 5. A resposta traz `equilibrio`,
`meses[]` (recebimentos por dia, chapas por dia, chapas necessárias, saldo em diárias e R$, situação), `estacoes[]`
(safra × entressafra), `totais`, `armazens[]` (saldo repartido pela necessidade), `cenarios[]` (sensibilidade),
`robustez` (correlações), `demandaPorMesEArmazem[]` e **`limitacoes[]`**, que acompanham sempre o resultado.

## Dados do painel

```bash
cd api
java -jar target/recebimento-1.0.0.jar --dados=<DADOS_HACKATHON_2026.zip>  # histórico real (HISTORICO)
```

Não há gerador de dados fictícios. O histórico vem da carga acima, e os indicadores operacionais vêm dos lançamentos
feitos na própria plataforma (agendamentos, descargas, não recebimentos e boletins), sempre com origem `PLATAFORMA`.
O banco ainda aceita `TESTE` na coluna `origem`, mas nenhuma rotina atual grava esse valor e o filtro do painel o recusa.
