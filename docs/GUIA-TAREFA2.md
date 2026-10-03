# Guia da Tarefa 2 — Boletim Diário de Serviços dos Ensacadores

Para quem for implementar. Peso na nota: **25%**, avaliado pela **correção do cálculo** (piso e complemento),
qualidade de engenharia e domínio na apresentação. O custo apurado aqui alimenta o painel da Tarefa 3
(`total_a_pagar` do boletim = custo da operação). Fontes: dossiê (seção 8), regulamento (Tarefa 2), `CLAUDE.md` (seção 5).

## 1. O que já está pronto

| Item | Onde | Estado |
|---|---|---|
| Regra do piso e do complemento (Decimal, 4 casas) | `api/app/boletim/domain.py` | pronto e testado contra o exemplo oficial |
| Produção a partir das linhas × preços; limite de 20 chapas | `domain.py` (`calcular_boletim`, `validar_equipe`) | pronto |
| Situação `INCONSISTENTE` (sem equipe: não divide) | `domain.py` | pronto |
| Tabelas do boletim, preços (14 tipos) e piso | migrations V1, V2 e V5 | no banco, validadas |
| Modelos SQLAlchemy | `api/app/boletim/models.py` | prontos, testados contra o banco |
| Cadastro de **51 chapas** (`CHAPA_nn`) | `api/app/etl/chapas.py` | carregado; `python -m app.etl.chapas --dados <zip>` |
| Testes | `tests/test_boletim_piso.py`, `test_boletim_modelo.py`, `test_etl_chapas.py` | 60+ casos |

## 2. O que falta (o trabalho da Tarefa 2)

1. **Serviço** `api/app/boletim/service.py`: lançar o boletim (linhas + equipe), calcular, gravar e consultar.
2. **Rotas e contratos** `router.py` / `schemas.py` (JSON em camelCase, `extra="forbid"`), registrar em `app/main.py`.
3. **Testes de serviço e HTTP** (casos da seção 5).
4. Tela do boletim (o front é à parte).

### Endpoints sugeridos

| Rota | Função |
|---|---|
| `GET /api/boletim/tipos-item` | os 14 tipos e preços (para montar o formulário; o sistema não infere o tipo) |
| `GET /api/chapas` | cadastro para o seletor por matrícula |
| `POST /api/boletins` | lança o boletim: `armazemId, data, linhas[{tipoItem, descarga, remocao, transferencia}], equipe[{matricula, tipoDiaria}]` |
| `GET /api/boletins?armazemId=&de=&ate=` · `GET /api/boletins/{id}` | consulta (alimenta o painel) |
| `GET /api/boletins/calculo` (ou prévia no `POST`) | prévia do cálculo antes de gravar |

Resposta: linhas com `quantidadeTotal` e `valor`, `producaoTotal`, `diariasEquivalentes`, `valorPorDiaria`, `totalAPagar`,
`complemento`, `situacao`. Os valores vão com 4 casas; **arredonde para 2 casas só na exibição** (`arredondar_exibicao`).

## 3. Regras (e armadilhas)

- **Um boletim por armazém por dia** (`UNIQUE(armazem_id, data)`): o segundo deve dar **409**. O boletim se refere ao **dia anterior**.
- **Linhas:** `qtd = descarga + remoção + transferência`; `valor = qtd × preço`. As colunas da planilha original são
  C = Descarga, D = Remoção e F = Transferência. O boletim registra **toda** a movimentação (descarregar caminhão,
  carregar cooperado, mover entre armazéns), não só o recebimento de fornecedor.
- **Preço:** vem de `tipo_item` (editável). **Grave o preço vigente na linha** (`boletim_producao.preco_unitario`), para um
  reajuste futuro não alterar boletins passados.
- **Equipe:** até **20** chapas por boletim, por matrícula, cada um `COMPLETA` ou `MEIA` (conta 0,5). A mesma matrícula **pode**
  estar em boletins de outros armazéns no mesmo dia; repetir dentro do mesmo boletim, não (`validar_equipe`).
- **Piso:** `valor por diária < 90,1731` → paga `90,1731 × diárias equivalentes` e a diferença é o **complemento**. Sem teto.
- **Zero diárias equivalentes:** **não divide**. Grave `situacao = INCONSISTENTE` com `valorPorDiaria`, `totalAPagar` e
  `complemento` nulos (o banco exige isso). É um resultado válido, não um erro 500.
- **Três "diárias" que não se misturam:** R$ 90,1731 (piso do boletim, **é o custo**), R$ 99–113 (diária base da folha) e
  R$ 180,00 (custo carregado com encargos). Só a primeira entra aqui. A meia diária (R$ 45,0786) é só referência: o cálculo
  usa 0,5 × diária.
- **Não confunda** `descarga.quantidade_chapas` (Tarefa 1, intensidade de UMA descarga, nunca somável no dia) com o
  efetivo do dia, que **vem do boletim** (pessoas por matrícula).
- **Origem do dado:** grave `origem` (`PLATAFORMA`, `TESTE`, `HISTORICO`); o painel precisa declarar a origem de cada número.

## 4. Achados nos dados (já tratados, relevantes para o relatório)

- A planilha `boletim_diario_chapas.xlsx` **confirma a tabela de preços**, inclusive Sementes = 0,3224 e Alimentação animal =
  0,3387 (o `CLAUDE.md` marcava dúvida). As fórmulas dela são exatamente as do dossiê (`J64`, `J65`, `J66`).
- O boletim de exemplo usa **matrículas numéricas** (158, 137...) e a folha só tem `CHAPA_nn`. Só 12 pares têm
  correspondência conhecida (tabela na própria planilha). Por isso o identificador na plataforma é o `CHAPA_nn`.
- **4 dos 15 chapas da tabela do boletim não aparecem na folha** de 2025/2026 (entre eles `CHAPA_48` e `CHAPA_49`, que
  fazem parte da equipe do exemplo); o ETL os cadastra a partir da planilha do boletim. O total cadastrado é 51.
- A folha tem 47 chapas distintos (41 em 2025, 17 em 2026) e não há registro de agosto e dezembro de 2025.

## 5. Testes obrigatórios (`CLAUDE.md`, seção 5)

| Caso | Esperado | Já coberto? |
|---|---|---|
| Exemplo oficial (Adubo, 17/11/2025): 2.378+400 Fertilizantes, 30 Agroquímico, 40 Serviços diversos; 11 completas | produção 918,1952 (R$ 918,20); valor/diária 83,47; total 991,9041 (R$ 991,90); complemento 73,7089 (R$ 73,71) | sim (domínio e com preços do banco) |
| Variação: 10 completas e 1 meia | valor/diária 87,45; total 946,8176 (R$ 946,82); complemento 28,6224 (R$ 28,62) | sim |
| Acima do piso | total = produção; complemento = 0 | sim |
| Zero diárias | `INCONSISTENTE`, sem divisão | sim (domínio); falta o teste de **serviço** |
| 21º chapa | bloqueado | regra pronta (`validar_equipe`); falta o teste de **serviço/HTTP** |
| Boletim duplicado (mesmo armazém e dia) | bloqueado (409) | o banco recusa; falta o teste de **serviço/HTTP** |
| Mesma matrícula em 2 armazéns no mesmo dia | permitido | o banco permite; falta o teste de **serviço/HTTP** |

As 11 chapas do exemplo, por `CHAPA_nn`: `08, 09, 15, 48, 30, 49, 37, 38, 41, 42, 43`.

## 6. Como trabalhar (padrão do projeto)

- Copie o formato da Tarefa 1 (`api/app/agendamento/`): `service.py` com `transacao(session)` (commit/rollback), erros
  `RegraDeNegocioError` (422), `ConflitoError` (409) e `NaoEncontradoError` (404) de `app.core.errors`, JSON camelCase,
  `EsquemaEntrada` com `extra="forbid"` (o cliente não define `situacao`, `origem` nem totais: o servidor calcula).
- Valide no serviço e use o domínio (`calcular_boletim`, `validar_equipe`); não recalcule à mão.
- Testes contra o **PostgreSQL real** (`tests/conftest.py`: schema temporário). Não use SQLite.
- Rodar: `cd api && uv run pytest && uv run ruff check .`. Banco: `uv run python -m app.core.migrate`.
- Se precisar mudar o banco, crie a **migration V7** (`api/migrations/V7__...sql`); nunca edite V1–V6.

## 7. Em aberto

- Rateio de custo quando a mesma matrícula está em dois boletins no mesmo dia (cada boletim paga as suas diárias; decidir
  como o painel evita contar a mesma pessoa duas vezes).
- Prazo para lançar o boletim (preenchido no dia seguinte; a Cocapec não definiu limite).
