# Contexto.md — Recebimento Inteligente (COCAPEC · X Hackathon Uni-FACEF 2026)

> Notas de contexto e decisões do projeto. Para executar a versão atual, use o [README](README.md); para documentação atual organizada por assunto, consulte [`docs/`](docs/README.md).
> Precedência das fontes: **Regulamento > Dossiê > esclarecimentos da Cocapec > este arquivo > spec antiga (`recebimento_inteligente_cocapec.pdf`)**.
> Este arquivo preserva contexto do desenvolvimento e pode conter decisões históricas. Contratos e instruções de execução atuais estão nos documentos específicos em [`docs/`](docs/README.md).

## 1. O que estamos construindo

Sistema para **organizar e medir o recebimento de mercadorias de fornecedores** nos 4 armazéns da Cocapec (Franca/SP) e responder à pergunta central da direção:

> **A quantidade de chapas alocada está sobrando ou faltando? Qual o impacto em R$, por armazém e período?**

Três módulos encadeados:

| Tarefa | Peso | Observação |
|---|---|---|
| T1 — Agendamento/Recebimento | 15% | **ELIMINATÓRIA.** Precisa funcionar ponta a ponta com banco. Mockup não vale. |
| T2 — Boletim Diário dos chapas | 25% | Cálculo de piso/complemento é avaliado com rigor. |
| T3 — Painel gerencial | 30% | Centro do painel = sobra/falta de chapas em R$. |
| Avaliação Cocapec | 30% | Aderência, plausibilidade, utilidade. |

**Prazos:** repositório congela **domingo 04/10 às 07h00**. Commits a cada ~2h desde sábado 18h. Pitch 08h, 8 min, **demo ao vivo** na nossa máquina.

**Prioridade de execução:** T1 funcionando → T2 com cálculos corretos e testados → T3 com análise forte → docs → pitch → diferenciais (OCR de NF, consulta em linguagem natural) só se sobrar tempo.

**Não gastar tempo com:** design visual, responsividade, preocupações de produção, integração SAP/SEFAZ, microsserviços.

**Login (decisão posterior do grupo):** a plataforma tem login e perfis (ver `docs/API-LOGIN.md`). Não é critério do Regulamento, então continua sendo o mínimo seguro (hash PBKDF2, sessão por cookie HttpOnly, permissão por perfil na API), sem recuperação de senha por e-mail nem SSO.

## 2. Stack

**Atualizada na branch `codex/springboot-backend` (03/10/2026):**

- **Backend:** Java 21 · **Spring Boot 3.5** · Spring JDBC · Maven (`api/pom.xml`).
- **Banco:** **PostgreSQL**. Esquema em `api/migrations/V*.sql`, aplicado por Flyway ao iniciar a API. Bancos criados pelo backend anterior usam `schema_migrations` como baseline.
- **Front:** React + Vite + TypeScript (`web/`). JSON da API em camelCase.
- **Análise do histórico / ETL:** Java + Apache POI, ativado explicitamente por `--dados=<zip>`.
- **Testes:** JUnit/Maven; integrações usam PostgreSQL real em schema temporário quando `TEST_DB_URL` estiver definido.

Requisitos técnicos que valem para qualquer stack:

- Dinheiro em **tipo decimal com 4 casas** (nunca float). Arredondar só na exibição.
- Operação sem seed fictício: entradas operacionais devem vir do histórico oficial ou de lançamentos reais dos usuários.
- Um comando para subir tudo (`README` com passo a passo).
- Testes automatizados para o cálculo do Boletim (casos na seção 5).

## 3. Regras de dados e repositório

- **NUNCA commitar os arquivos originais da Cocapec** (xlsx, csv, xml, pdf de NF etc.). Colocar a pasta de dados em `.gitignore` (ex.: `data/raw/`). Scripts leem de pasta local.
- Dados vêm sujos de propósito: nulos, duplicidades, unidades misturadas, erros de digitação. **Tratar e documentar** é avaliado.
- Separar sempre a origem do dado: `HISTORICO` (pacote oficial) e `PLATAFORMA` (registros reais novos). Não misturar em silêncio.

## 4. Tarefa 1 — Agendamento e Recebimento

### Fluxo
1. Fornecedor cria agendamento: anexa **1 ou mais NFs**, informa **acondicionamento** (`BATIDO` | `PALETIZADO` | `BIG_BAG`, um único por caminhão), escolhe data e horário.
2. **Compras** valida NF × pedido → registra `pedido_referencia` + decisão (`AUTORIZADO` | `NAO_AUTORIZADO`).
3. **Responsável do armazém** verifica a autorização e define **1 ou mais armazéns de destino** → cria **uma `Descarga` por destino**.
4. Em cada descarga registra: **chegada**, **entrada** (início), **saída** (fim), **quantidade de chapas** e **equipamentos individuais** usados.

### Regras de agenda
- Horários válidos: **08:00, 10:00, 13:00, 15:00**. Somente segunda a sexta; bloquear sábados e `DataNaoOperacional` (feriados cadastrados manualmente).
- Capacidade **global da cooperativa** (não por armazém), por data+horário:
  - Se houver 1 `BATIDO` no slot → slot exclusivo dele.
  - Sem batido → no máximo **2** `PALETIZADO`/`BIG_BAG`.
  - Batido não entra em slot que já tem unitizado.
  - Cancelados não ocupam vaga.
  - Validar dentro de transação (evitar corrida).
- **Reagendamento por caso fortuito** (ex.: chuva): pode **exceder** a capacidade normal. Guardar histórico (data/horário anterior e novo + motivo).
- **Cancelamento**: solicitação → efetivação; libera a vaga; o responsável do armazém escolhe quem ocupa (sem seleção automática). Prazo não definido pela Cocapec (se precisar, parâmetro configurável).
- **Agendamento obrigatório**: não registrar entrada de descarga sem agendamento válido. Chegou sem agendamento e há vaga → agenda antes de entrar. Sem vaga → não recebimento.
- **Não recebimento** — motivos: `DIVERGENCIA_NF_PEDIDO`, `SEM_AGENDAMENTO_SEM_VAGA`, `CASO_FORTUITO`, `OUTRO` (descrição obrigatória).
- Integridade temporal: `chegada <= entrada <= saida`. Rejeitar ou sinalizar.
- Derivados (não persistir): `espera = entrada - chegada`; `descarga = saida - entrada`.
- `Descarga.quantidade_chapas` mede intensidade daquela descarga. **Nunca somar ao longo do dia como efetivo** (a mesma equipe atende várias descargas).

### Armazéns (seed)
`Insumos`, `Adubo`, `Pátio de Máquinas`, `Loja`. Pode haver mais de um caminhão no mesmo armazém.

### Equipamentos (seed, cada unidade individual)
| Local | Equipamento | Qtd |
|---|---|---|
| Insumos | Empilhadeira a gás | 1 |
| Insumos | Empilhadeira elétrica/retrátil | 1 |
| Insumos | Transpaleteira elétrica | 2 |
| Insumos | Paleteira elétrica (pode circular) | 2 |
| Insumos | Paleteira manual (circula) | 2 |
| Insumos | Carrinho de mão (circula) | 2 |
| Adubo | Empilhadeira a gás (pode ajudar Insumos) | 2 |
| Adubo | Paleteira manual | 1 |
| Pátio de Máquinas | Empilhadeira a gás | 1 |
| Pátio de Máquinas | Trator | 4 |
| Loja | Carrinho de mão | qtd não informada |

Gerar identificações tipo `INS-EMPG-01`. Não há número patrimonial oficial — não inventar.

### Referência normativa de chapas (Dossiê §7, para dimensionamento/alertas, não como bloqueio)
- < 500 kg: nenhum · Batido > 500 kg: 5 · Paletizado/big bag: 2 · Máquina/implemento: 1 operador + ≥1 chapa.
- A regra do Dossiê para paletizado/big bag é 2 chapas em qualquer peso; abaixo de 500 kg não se aplica a exceção de carga leve.

## 5. Tarefa 2 — Boletim Diário dos Ensacadores

- **Um lançamento por dia, com os 4 armazéns de uma vez** (decisão do grupo): a tela do boletim cobre Insumos, Adubo, Pátio de Máquinas e Loja no mesmo dia, cada um com sua produção e sua equipe, e salva tudo junto. Por baixo, a persistência continua **um boletim por armazém por dia** (`UNIQUE(armazem_id, data_referencia)`), porque o painel quebra custo e sobra/falta por armazém. Preenchido normalmente no dia seguinte.
- Linhas: para cada um dos **14 tipos**, quantidades de **descarga**, **remoção** e **transferência** (não negativas). O usuário escolhe o tipo; o sistema não infere.
- Equipe: até **20 chapas** por boletim, por **matrícula** (nome puxado do cadastro), cada um `COMPLETA` ou `MEIA`. A mesma matrícula **pode** aparecer em boletins de outros armazéns no mesmo dia (unicidade só dentro do boletim).

### Tabela de preços (seed, 4 casas)
| Tipo | Preço |
|---|---:|
| Sacaria malas c/ 25 | 0,1824 |
| Sacaria malas c/ 40 | 0,2635 |
| Sacaria malas c/ 50 | 0,3224 |
| Sacaria fardo c/ 250 | 1,1780 |
| Sacaria fardo c/ 500 | 2,3561 |
| Peças | 0,3387 |
| Máquinas / equipamentos | 0,3224 |
| Agroquímico | 0,3224 |
| Fertilizantes | 0,3224 |
| Sementes | 0,3224 ⚠️ |
| Medicamentos | 0,3387 |
| Alimentação animal | 0,3387 ⚠️ |
| Acessórios agropecuários | 0,3224 |
| Serviços diversos | 0,3224 |

✅ Conferido no `boletim_diario_chapas.xlsx` original: Sementes 0,3224 e Alimentação animal 0,3387 (valores acima). Os preços ficam editáveis (`tipo_item`).

### Cálculo (decimal, 4 casas)
```
qtd_linha        = descarga + remocao + transferencia
valor_linha      = qtd_linha * preco_unitario
producao_total   = soma(valor_linha)
diarias_equiv    = n_completas + 0.5 * n_meias
valor_por_diaria = producao_total / diarias_equiv
PISO = 90.1731
se valor_por_diaria < PISO:
    total_a_pagar = PISO * diarias_equiv
    complemento   = total_a_pagar - producao_total
senão:
    total_a_pagar = producao_total ; complemento = 0     # sem teto
se diarias_equiv == 0: NÃO dividir; marcar boletim como INCONSISTENTE (pendente de conferência)
```
Custo da operação para o painel = **`total_a_pagar` do boletim**. **Não usar R$ 180** (custo com encargos) nem R$ 99–113 (diária da folha). R$ 45,0786 (meia diária) é só referência; o cálculo usa 0,5 × piso.

### Testes obrigatórios
| Caso | Entrada | Esperado |
|---|---|---|
| Exemplo oficial (Adubo, 17/11/2025) | 2.778 Fertilizantes + 30 Agroquímico + 40 Serviços diversos (= 2.848 × 0,3224); 11 completas | produção 918,1952 (R$ 918,20); valor/diária ≈ 83,47; total 991,9041 (R$ 991,90); complemento 73,7089 (R$ 73,71) |
| Variação | mesmo + 10 completas e 1 meia (10,5) | valor/diária ≈ 87,45; total 946,8176 (R$ 946,82); complemento 28,6224 (R$ 28,62) |
| Acima do piso | produção/diária > 90,1731 | total = produção; complemento = 0 |
| Zero diárias | produção > 0, sem equipe | inconsistência, sem divisão |
| 21º chapa | — | bloqueado |
| Boletim duplicado | mesmo armazém/data | bloqueado (o lançamento do dia grava só os armazéns ainda sem boletim) |
| Mesma matrícula em 2 armazéns no mesmo dia | — | permitido |

## 6. Modelo de dados (17 entidades — ver `/docs/04-der.md`)

```
Fornecedor 1:N Agendamento(data, horario, acondicionamento, status)
Agendamento 1:N NotaFiscal(arquivo_referencia)
Agendamento 1:0..1 ValidacaoCompras(pedido_referencia, decisao)
Agendamento 1:N Descarga(armazem_id, chegada_em, entrada_em, saida_em, quantidade_chapas)
Descarga N:N Equipamento(identificacao UK, tipo)  via DescargaEquipamento
Agendamento 1:N NaoRecebimento(motivo, descricao_outro)
Agendamento 1:N Reagendamento(data/horario anterior, novo, motivo)
Agendamento 1:0..1 Cancelamento(motivo, situacao)
DataNaoOperacional(data PK, descricao)
Armazem 1:N BoletimDiario(data_referencia)  UNIQUE(armazem, data)
BoletimDiario 1:N ItemBoletim(tipo_item, qtd_descarga, qtd_remocao, qtd_transferencia)  UNIQUE(boletim, tipo)
TipoItemBoletim(nome UK, preco_unitario)
BoletimDiario N:N Chapa(matricula PK, nome)  via ParticipacaoChapaBoletim(tipo_diaria)  PK(boletim, matricula)
```
Decisões: sem `armazem_id` em Agendamento (destinos = descargas); sem entidade PedidoCompra/SAP; usuários e perfis estão nas tabelas `usuario` e `sessao` (migrações V8–V9; o DER do Regulamento não os usa); indicadores calculados por query/view, não persistidos. Status do agendamento é decisão técnica nossa (ex.: `PENDENTE_COMPRAS`, `AUTORIZADO`, `NAO_AUTORIZADO`, `EM_DESCARGA`, `CONCLUIDO`, `CANCELADO`, `NAO_RECEBIDO`) — não apresentar como regra da Cocapec.

### Decisões de implementação da T1 (migration V5, 03/10/2026) — corrigir se a Cocapec/equipe discordar
- **Status do agendamento:** `PENDENTE_COMPRAS → AUTORIZADO → EM_DESCARGA → CONCLUIDO`, mais `NAO_AUTORIZADO`, `CANCELADO` e `NAO_RECEBIDO`. Chegada, entrada e saída são marcos de cada `Descarga`, não status.
- **Fluxo:** Compras decide (`validacao_compras`) → o armazém define os destinos, o que cria **uma `Descarga` por armazém** (status continua `AUTORIZADO`).
- **Interpretação:** `NAO_AUTORIZADO` (Compras recusou) libera a vaga e as NFs e registra também um `NaoRecebimento` com motivo `DIVERGENCIA_NF_PEDIDO`, para o indicador de não recebimentos por motivo. *(Assunção nossa.)*
- **NF:** `nota_fiscal.ativa` impede a mesma NF-e em dois agendamentos ativos; vira falso quando o agendamento libera a vaga.
- **Chegada antes da autorização (resolvido na V6):** a chegada do caminhão fica em `agendamento.chegada_em` e é copiada para cada `Descarga` (existente ou criada depois). Entrada/saída são por descarga. O tempo de espera é `entrada − chegada` da descarga.
- **Fluxos de desvio:** cancelamento em duas etapas (solicitar → efetivar) gera `vaga_liberada` `ABERTA`, que continua contando como ocupada até o armazém atribuí-la a um agendamento ou liberá-la ao público (sem seleção automática). Reagendamento por caso fortuito pode exceder a capacidade e grava data/horário anteriores. API completa em `docs/API-TAREFA1.md`.
- **Anexo da NF:** `.pdf`/`.xml` até 10 MB, tipo definido pela extensão (não pelo cliente); XML lido com `defusedxml` (sem DTD/entidades). Nas 460 NF-e do pacote, 29 não têm peso bruto (usa-se o líquido quando existe) e há 458 chaves distintas em 460 arquivos.
- **Equipamentos:** 19 unidades individuais (`INS-EMPG-01` etc.), geradas por nós; Loja tem 1 unidade provisória (a Cocapec não informou a quantidade).
- **Origem do dado:** `PLATAFORMA` ou `HISTORICO`.
- **Chapas (T2):** o identificador é o `CHAPA_nn` da folha (51 cadastrados via `app.etl.chapas`). O boletim de exemplo usa matrículas numéricas; a própria planilha traz correspondências parciais com os identificadores da folha, e nem todas as matrículas do exemplo aparecem na folha de 2025/2026. Preços do boletim conferidos no `boletim_diario_chapas.xlsx` (Sementes 0,3224; Alimentação animal 0,3387). Dinheiro do boletim em 4 casas, arredondando só na exibição; sem equipe = `INCONSISTENTE`. Guia: `docs/GUIA-TAREFA2.md`.

## 7. Tarefa 3 — Painel gerencial

Filtros: **período** e **armazém** (mínimo). Indicadores:
1. Cargas recebidas por dia e por armazém (contar descargas; na visão global deixar claro que caminhão multidestino conta por destino).
2. Tempo médio de espera (entrada − chegada) — só registros da plataforma.
3. Tempo médio de descarga (saída − entrada) — só registros da plataforma.
4. Chapas por recebimento (por descarga).
5. Utilização dos locais (local = armazém; fórmula não definida pela Cocapec → mostrar descargas e horas ocupadas por armazém, sem % "oficial").
6. Fornecedores com maior volume (sempre mostrar a unidade: nº de recebimentos, itens etc.; nunca somar kg com unidades).
7. Horários e dias de maior movimento.
8. Não recebimentos por motivo.
9. Custo da operação = soma de `total_a_pagar` dos boletins.
10. **Bloco central: sobra/falta de chapas por armazém e período, em R$.**

O histórico **não tem** horários de chegada/descarga, chapas ou equipamentos por recebimento → nunca inventar esses valores; estimativas do Dossiê (ex.: 10 paletes ≈ 15 min) são parâmetros, não medições.

### Metodologia do histórico (implementada em `api/src/main/java/com/skycef/recebimento/painel`; números em `docs/relatorio-gerencial.md`)
- Unidade de carga: **evento recebimento-destino** = único `(data_recebimento, nº recebimento, armazém físico)` em `pedido_recebimento_notafiscal.xlsx` (1 linha = 1 item de pedido, não 1 caminhão; a mediana é de 15 recebimentos por dia com movimento, contra "5 a 6 caminhões" do dossiê: confirmar com a Cocapec).
- Mapeamento depósito → armazém na tabela `deposito_armazem` (V7). Depósitos fora do dossiê (11 linhas) ficam fora da quebra por armazém. `MATProv`/`MATReser` não recebem.
- Carga: `java -jar api/target/recebimento-1.0.0.jar --dados=<zip>` (descarta 540 duplicatas; conta sábados, recebimento antes do documento, chaves ausentes/malformadas). **Não usar a coluna de peso** (mediana do Adubo ≈ 573 t por recebimento).
- Equipe: `chapas_presentes − chapas_operacao_cafe` de `chapas_por_dia.csv`, só segunda a sexta, só meses com ≥ 10 dias de folha (fora: jan/2025, ago/2025, dez/2025). Resultado: 350 dias úteis, fev/2025–ago/2026.
- Necessidade = recebimentos × esforço da norma do dossiê por armazém (Adubo 225, Insumos 100, Pátio 17,5, Loja 0 pessoa-min), com premissa de acondicionamento declarada. Equilíbrio = Σ necessidade ÷ Σ chapas líquidas de TODO o histórico (194,3 pessoa-min/chapa-dia); recortes de período não o alteram. R$ = saldo em diárias × piso R$ 90,1731.
- Resultado: correlação diária equipe × demanda ≈ 0,08; safra (out–mar) 9,3 chapas/dia para 19,4 recebimentos/dia × entressafra 7,8 para 22,5; folga ≈ pressão ≈ R$ 58 mil em 17 meses (ao piso; **ordem de grandeza, não economia comprovada**); com a capacidade demonstrada (3º quartil mensal) o saldo vira sobra líquida de ≈ R$ 22 mil.
- Conclusão: **não há sobra ou falta permanente; há descompasso no tempo**: a demanda sobe em julho (todo ano desde 2023) e o reforço (out–mar) chega depois e fica após a queda. O histórico só enxerga o recebimento (o carregamento de cooperados não foi registrado): mostra se a equipe acompanhou a demanda, não o tamanho absoluto ideal. O absoluto vem do **boletim**: sobra = complemento pago; falta = produção acima do piso; aproveitamento = produção ÷ (piso × diárias) (< 0,90 sobra · > 1,10 falta).
- Painel: `/painel`, API em `docs/API-TAREFA3.md`. O painel operacional considera apenas lançamentos reais (`PLATAFORMA`); a geração de registros operacionais artificiais foi removida.
- Outros tratamentos já identificados: 1.281 pares pedido-item com qtd/peso repetidos em recebimentos parciais (não somar peso/qtd como carga); código de item do XML é do **fornecedor** (não casa com o catálogo Cocapec); 460 XMLs são amostra não proporcional.

Implementar o painel de forma que, com dados da plataforma, o cálculo vire direto:
`necessidade (regra de chapas × descargas agendadas por slot/armazém) × efetivo do boletim × custo real do boletim`.
Cada número do painel deve indicar sua origem (`HISTORICO` / `PLATAFORMA`).

## 8. Dados do pacote (pasta local, fora do Git)

- `01_notas_fiscais/xml|danfe_pdf` — 460 NF-e (2022–2026), amostra.
- `02_cadastros/produtos.xlsx` (10.604; item, descrição, unidade, peso, grupo, depósito), `fornecedores.xlsx` (859; código, razão social, CNPJ), `estoque_por_armazem/`.
- `03_movimentacao/pedido_recebimento_notafiscal.xlsx` — **arquivo central**, 41.779 linhas, jun/2022–set/2026, 12.073 pedidos.
- `04_mao_de_obra/chapas_por_dia.csv` (+ xlsx originais 2025/2026, uma aba por mês, nomes anonimizados `CHAPA_XX`).
- `05_operacao/equipamentos_descarga.xlsx`, `registro_manual_recebimento.pdf`, `boletim_diario_chapas.xlsx` (tabela de preços + exemplo 17/11/2025).
- Chaves: chave de acesso (planilha ↔ XML), CNPJ (NF ↔ fornecedor), nº do item (planilha ↔ produtos/estoque), depósito (→ armazém), data de recebimento (↔ mão de obra).
- Importar fornecedores do cadastro (normalizar CNPJ) para popular a T1 é bom para a demo.

## 9. Pontos em aberto (não inventar regra; parametrizar ou sinalizar)
- DQ-006 Fila: "ordem de chegada" × prioridade do agendado → prevalece o Dossiê (agendado tem prioridade).
- DQ-015 A equipe informou tolerância de 15 minutos; a partir de 30 minutos perde-se o agendamento e o caminhão segue pelo fluxo de chegada sem agendamento. A API marca a agenda como não recebida e registra o motivo de atraso; Portaria encaminha para Agenda para solicitar encaixe.
- Peso exatamente 500 kg em carga batida não está definido no Dossiê; o D-1 usa 5 como referência e sinaliza para confirmação.
- DQ-002/003 Fórmulas de "utilização" e "volume".
- DQ-017 Não recebimento parcial em entrega multidestino (hoje ligado ao agendamento).
- Rateio de custo quando a mesma matrícula está em 2 boletins no mesmo dia.

## 10. Entregáveis obrigatórios em `/docs` (ausência = eliminação)
Relatório gerencial · Caso de Uso UML · BPMN do processo proposto · DER — **em texto e imagem (SVG/PNG) visíveis no GitHub**. Já existem os `.md` 01–07; falta renderizar os diagramas (Mermaid → SVG) e manter coerência com o código.

## 11. Linguagem
Interface e docs em português. Termos: **cooperado** (nunca "cliente"), **chapa/ensacador**, **armazém**, **descarga**, **boletim**.

## 12. Roteiro de demo (8 min)
1. Criar agendamento com 2 NFs → mostrar bloqueio de capacidade (batido + unitizado).
2. Compras autoriza → armazém define 2 destinos → registrar chegada/entrada/saída, chapas e equipamentos.
3. Cancelar / reagendar por chuva / não recebimento.
4. Boletim do exemplo oficial → R$ 918,20 / 991,90 / 73,71; trocar 1 para meia → 946,82 / 28,62.
5. Painel → resposta sobra/falta por armazém e período em R$ (histórico + plataforma, origem declarada).
