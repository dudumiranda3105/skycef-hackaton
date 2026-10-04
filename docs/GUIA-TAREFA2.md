# Guia da Tarefa 2 — Boletim Diário de Serviços dos Ensacadores

Referência de implementação. Peso na nota: **25%**, avaliado pela **correção do cálculo** (piso e complemento),
qualidade de engenharia e domínio na apresentação. O custo apurado aqui alimenta o painel da Tarefa 3
(`total_a_pagar` do boletim = custo da operação). Fontes: dossiê (seção 8), regulamento (Tarefa 2), `Contexto.md` (seção 5).

## 1. O que já está pronto

| Item | Onde | Estado |
|---|---|---|
| Regra do piso e do complemento (BigDecimal, 4 casas) | `api/src/main/java/com/skycef/recebimento/boletim/BoletimCalculator.java` | pronto e testado contra o exemplo oficial |
| Produção a partir das linhas × preços; limite de 20 chapas | `BoletimService.java` | pronto |
| Situação `INCONSISTENTE` (sem equipe: não divide) | `BoletimCalculator.java` | pronto |
| Tabelas do boletim, preços (14 tipos) e piso | migrations V1, V2 e V5 | no banco, validadas |
| Persistência JDBC | `BoletimService.java` | pronta, usando PostgreSQL |
| Cadastro de **51 chapas** (`CHAPA_nn`) | migration V7 + `dados/CargaDadosService.java` | seed e carga pelo ZIP |
| Testes | `api/src/test/java/com/skycef/recebimento/boletim/` | cálculo e integração PostgreSQL |

## 2. API e tela

Implementado em `api/src/main/java/com/skycef/recebimento/boletim/`: cálculo, serviço JDBC e controller HTTP.
A tela é `/app/boletim.html`. O contrato completo está em [`API-TAREFA2.md`](API-TAREFA2.md).

### Endpoints (implementados; detalhes em `API-TAREFA2.md`)

| Rota | Função |
|---|---|
| `GET /api/boletim/tipos-item` | os 14 tipos e preços (para montar o formulário; o sistema não infere o tipo) |
| `GET /api/chapas` | cadastro para o seletor por matrícula |
| `POST /api/boletins` | lança o boletim: `armazemId, data, linhas[{tipoItem, descarga, remocao, transferencia}], equipe[{matricula, tipoDiaria}]` |
| `GET /api/boletins?armazemId=&de=&ate=` · `GET /api/boletins/{id}` | consulta (alimenta o painel) |
| `POST /api/boletins/calculo` | prévia do cálculo antes de gravar (sem gravar) |

Resposta: linhas com `quantidadeTotal` e `valor`, `producaoTotal`, `diariasEquivalentes`, `valorPorDiaria`, `totalAPagar`,
`complemento`, `situacao`. Os valores vão com 4 casas; **arredonde para 2 casas só na exibição** (`arredondar_exibicao`).

## 3. Regras (e armadilhas)

- **Um lançamento por dia, com os 4 armazéns de uma vez**: a interface lança o dia inteiro (uma seção por armazém) e chama a API uma vez por armazém. A API segue com **um boletim por armazém por dia** (`UNIQUE(armazem_id, data)`): o segundo do mesmo armazém e dia deve dar **409**. O boletim se refere ao **dia anterior**.
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
  0,3387 (o `Contexto.md` marcava dúvida). As fórmulas dela são exatamente as do dossiê (`J64`, `J65`, `J66`).
- O boletim de exemplo usa **matrículas numéricas** (158, 137...) e a folha só tem `CHAPA_nn`. Só 12 pares têm
  correspondência conhecida (tabela na própria planilha). Por isso o identificador na plataforma é o `CHAPA_nn`.
- **4 dos 15 chapas da tabela do boletim não aparecem na folha** de 2025/2026 (entre eles `CHAPA_48` e `CHAPA_49`, que
  fazem parte da equipe do exemplo); o ETL os cadastra a partir da planilha do boletim. O total cadastrado é 51.
- A folha tem 47 chapas distintos (41 em 2025, 17 em 2026) e não há registro de agosto e dezembro de 2025.

## 5. Testes obrigatórios (`Contexto.md`, seção 5)

| Caso | Esperado | Já coberto? |
|---|---|---|
| Exemplo oficial (Adubo, 17/11/2025): 2.378+400 Fertilizantes, 30 Agroquímico, 40 Serviços diversos; 11 completas | produção 918,1952 (R$ 918,20); valor/diária 83,47; total 991,9041 (R$ 991,90); complemento 73,7089 (R$ 73,71) | sim (domínio e com preços do banco) |
| Variação: 10 completas e 1 meia | valor/diária 87,45; total 946,8176 (R$ 946,82); complemento 28,6224 (R$ 28,62) | sim |
| Acima do piso | total = produção; complemento = 0 | sim |
| Zero diárias | `INCONSISTENTE`, sem divisão | sim (domínio, serviço e HTTP) |
| 21º chapa | bloqueado | sim (serviço: 422; HTTP: 422) |
| Boletim duplicado (mesmo armazém e dia) | bloqueado (409) | sim (serviço e HTTP: 409) |
| Mesma matrícula em 2 armazéns no mesmo dia | permitido | sim (serviço e HTTP) |

As 11 chapas do exemplo, por `CHAPA_nn`: `08, 09, 15, 48, 30, 49, 37, 38, 41, 42, 43`.

## 6. Como trabalhar (padrão do projeto)

- Preserve JSON camelCase. O cliente envia somente produção e equipe; situação, origem e totais são calculados no servidor.
- Valide no serviço e use `BoletimCalculator`; não recalcule à mão.
- Execute `cd api && mvn clean test`. Testes de integração usam `TEST_DB_URL` para PostgreSQL real em schema temporário.
- Para mudar o banco, adicione uma migration **V8 ou posterior** em `api/migrations/`; nunca edite versões já aplicadas.

## 7. Em aberto

- Rateio de custo quando a mesma matrícula está em dois boletins no mesmo dia (cada boletim paga as suas diárias; decidir
  como o painel evita contar a mesma pessoa duas vezes).
- Prazo para lançar o boletim (preenchido no dia seguinte; a Cocapec não definiu limite).
