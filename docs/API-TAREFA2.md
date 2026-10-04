# API da Tarefa 2 — Boletim Diário de Serviços dos Ensacadores

Base: `http://localhost:8000` · Swagger interativo em `/docs` · JSON em **camelCase** · datas `AAAA-MM-DD`.
Valores em R$ vão com **4 casas, como string decimal** (`"991.9041"`, nunca float); o bloco `exibicao` traz os mesmos
valores arredondados para **2 casas** (`"991.90"`), que é o que se mostra na tela.

O cliente envia só **as linhas de produção e a equipe**. Situação, origem, preços e todos os totais são calculados
pelo servidor: qualquer campo extra no corpo é recusado com 400.

## O fluxo

```
GET  /api/boletim/tipos-item   ─► monta as linhas do formulário (14 tipos + preço; o operador escolhe o tipo)
GET  /api/chapas               ─► monta o seletor da equipe (por matrícula)
POST /api/boletins/calculo     ─► prévia: produção, piso e complemento, sem gravar
POST /api/boletins/dia         ─► grava os quatro armazéns atomicamente; ou grava todos, ou nenhum
GET  /api/boletins[?...]       ─► consulta (alimenta o painel da Tarefa 3)
GET  /api/boletins/{id}
```

## A regra (dossiê, seção 8)

```
quantidadeTotal  = descarga + remocao + transferencia          (por linha)
valor            = quantidadeTotal × precoUnitario              (por linha)
producaoTotal    = Σ valor
diariasEquivalentes = completas + 0,5 × meias
valorPorDiaria   = producaoTotal ÷ diariasEquivalentes
se valorPorDiaria < piso (R$ 90,1731):  totalAPagar = piso × diariasEquivalentes ; complemento = totalAPagar − producaoTotal
senão:                                  totalAPagar = producaoTotal              ; complemento = 0     (sem teto)
diariasEquivalentes = 0  ─►  situacao = INCONSISTENTE: NÃO divide; valorPorDiaria, totalAPagar e complemento = null
```

O custo da operação é o **`totalAPagar` do boletim**: não é R$ 180,00 (custo com encargos) nem R$ 99–113 (diária base
da folha). A meia diária (R$ 45,0786) é só referência: o cálculo usa 0,5 × piso.

## Endpoints

| Método e rota | Função |
|---|---|
| `GET /api/boletim/tipos-item` | os 14 tipos e o preço unitário vigente |
| `GET /api/chapas` | cadastro de chapas (`matricula`, `nome`) |
| `POST /api/boletins/calculo` | prévia (200); mesmas validações do lançamento, **menos** a de boletim duplicado |
| `POST /api/boletins/dia` | lança um fechamento (201) com exatamente quatro armazéns e uma única data; duplicidade retorna 409 |
| `GET /api/boletins?armazemId=&de=&ate=` | boletins, mais recentes primeiro; filtros opcionais; `de` e `ate` inclusivos |
| `GET /api/boletins/{id}` | detalhe (404 se não existe) |

### Corpo de `POST /api/boletins/calculo`

```json
{
  "armazemId": 2,
  "data": "2025-11-17",
  "linhas": [
    { "tipoItem": "FERTILIZANTES",     "descarga": 2378, "remocao": 400 },
    { "tipoItem": "AGROQUIMICO",       "descarga": 30 },
    { "tipoItem": "SERVICOS_DIVERSOS", "remocao": 40 }
  ],
  "equipe": [
    { "matricula": "CHAPA_08", "tipoDiaria": "COMPLETA" },
    { "matricula": "CHAPA_09", "tipoDiaria": "MEIA" }
  ]
}
```

### Corpo de `POST /api/boletins/dia`

`boletins` deve conter uma entrada para cada armazém cadastrado (IDs 1 a 4), todos com a mesma data. Uma aba sem
produção/equipe é enviada com `linhas: []` e `equipe: []`: ela fica registrada como produção zero e situação inconsistente,
sem inventar pessoas ou volumes. O fechamento inteiro é transacional; erro ou conflito em qualquer armazém não deixa
parte do dia gravada.

```json
{
  "boletins": [
    { "armazemId": 1, "data": "2026-10-02", "linhas": [], "equipe": [] },
    { "armazemId": 2, "data": "2026-10-02", "linhas": [], "equipe": [] },
    { "armazemId": 3, "data": "2026-10-02", "linhas": [], "equipe": [] },
    { "armazemId": 4, "data": "2026-10-02", "linhas": [], "equipe": [] }
  ]
}
```

O endpoint unitário de gravação não existe; o banco continua armazenando uma linha por armazém/data para consultas e
relatórios.

- `descarga`, `remocao` e `transferencia`: inteiros ≥ 0 (omitidos valem 0). Linha totalmente zerada não é gravada.
- `tipoDiaria` é **obrigatório**: `COMPLETA` ou `MEIA`.
- `data` é o dia a que o boletim se refere (normalmente o dia anterior). Não pode estar no futuro; sábados são
  aceitos (a equipe trabalha aos sábados e o boletim registra toda a movimentação).

### Resposta (`BoletimOut`; a prévia traz o mesmo, sem `id`, `armazemId`, `data`, `origem`, e com `piso`)

Exemplo oficial (Adubo, 17/11/2025, 11 chapas em diária completa):

```json
{
  "id": 1, "armazemId": 2, "armazemNome": "Adubo", "data": "2025-11-17",
  "situacao": "CONSISTENTE", "origem": "PLATAFORMA", "criadoEm": "2026-10-05T10:00:00-03:00",
  "linhas": [
    { "tipoItem": "FERTILIZANTES", "descricao": "Fertilizantes", "descarga": 2378, "remocao": 400,
      "transferencia": 0, "quantidadeTotal": 2778, "precoUnitario": "0.3224", "valor": "895.6272" }
  ],
  "equipe": [ { "matricula": "CHAPA_08", "nome": "CHAPA_08", "tipoDiaria": "COMPLETA" } ],
  "quantidadeChapas": 11, "chapasDiariaCompleta": 11, "chapasMeiaDiaria": 0,
  "diariasEquivalentes": "11.0",
  "producaoTotal": "918.1952", "valorPorDiaria": "83.4723",
  "totalAPagar": "991.9041", "complemento": "73.7089", "abaixoDoPiso": true,
  "exibicao": { "producaoTotal": "918.20", "valorPorDiaria": "83.47", "totalAPagar": "991.90", "complemento": "73.71" }
}
```

Com 10 completas e 1 meia: `diariasEquivalentes 10.5`, `exibicao` = 918,20 · 87,45 · **946,82** · **28,62**.
Sem equipe: `situacao = INCONSISTENTE` e `valorPorDiaria`, `totalAPagar`, `complemento`, `abaixoDoPiso` e os campos de
`exibicao` correspondentes vêm `null` (pendente de conferência; **não** é erro).

`linhas[].precoUnitario` é o preço **vigente no dia do lançamento**, gravado na linha: reajustar `tipo_item` depois não
altera boletins passados.

## Erros (formato RFC 7807, `codigo` estável)

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `REQUISICAO_INVALIDA` | JSON/tipo inválido, quantidade negativa, `tipoDiaria` ausente, campo que o servidor define (`situacao`, `origem`, `totalAPagar`, `preco`...) |
| 404 | `NAO_ENCONTRADO` | `GET /api/boletins/{id}` inexistente |
| 409 | `CONFLITO` | já existe boletim do **mesmo armazém no mesmo dia** (`UNIQUE(armazem_id, data)`) |
| 422 | `REGRA_DE_NEGOCIO` | 21º chapa · matrícula repetida no boletim · matrícula não cadastrada · tipo de item inválido ou repetido · armazém inválido · data futura · boletim vazio (sem produção e sem equipe) · `de` > `ate` |

A **mesma matrícula pode** aparecer em boletins de armazéns diferentes no mesmo dia; só não repete dentro do boletim.

## Para a Tarefa 3

- Efetivo do dia = pessoas distintas por matrícula nos boletins (**não** a soma de `descarga.quantidade_chapas` da
  Tarefa 1, que mede a intensidade de UMA descarga).
- Custo da operação = Σ `totalAPagar` dos boletins `CONSISTENTE`; os `INCONSISTENTE` devem ser sinalizados à parte.
- Se a mesma matrícula está em dois boletins no mesmo dia, cada boletim paga as suas diárias: o painel precisa
  decidir como não contar a mesma pessoa duas vezes no efetivo (ver "Em aberto" no `GUIA-TAREFA2.md`).
- Cada boletim traz `origem` (`PLATAFORMA` · `TESTE` · `HISTORICO`).

## Lançamento do dia com os 4 armazéns

A interface lança o boletim **por dia, com os 4 armazéns de uma vez** (`/ui/`). Não há endpoint novo: a tela valida cada
armazém com `POST /api/boletins/calculo` e depois grava um por armazém com `POST /api/boletins`. A regra
`UNIQUE(armazem_id, data)` continua valendo, e um armazém já gravado no dia não é gravado de novo.
