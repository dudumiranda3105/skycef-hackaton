# Relatório Gerencial — A quantidade de chapas está sobrando ou faltando?

**Cliente:** COCAPEC · **Evento:** X Hackathon Uni-FACEF (3 e 4 de outubro de 2026) · **Equipe:** Skycef

Os números deste relatório saem do painel gerencial (tela **Painel gerencial** em `/ui/#/painel` e rotas
`/api/painel/*`) e, na seção 7, dos contadores da carga de dados; todos podem ser reproduzidos com os comandos da
seção 8. Cada número declara a origem do dado (seção 6). Onde a base não permite afirmar algo, o relatório diz isso
em vez de preencher a lacuna.

---

## 1. A resposta à direção

> **O histórico aponta um descompasso no tempo: a quantidade de chapas presentes não acompanha a demanda de recebimentos.**
> A análise estima folga nos meses de baixa demanda e pressão no pico; isso não prova, por si só, que exista excesso ou falta
> permanente de pessoas. O reforço de pessoal informado pela Cocapec (out a mar) começa depois que a demanda já subiu em julho
> e continua até março, quando a demanda já caiu.

| O que medimos (histórico real, fev/2025 a ago/2026) | Resultado |
|---|---|
| Correlação diária entre chapas líquidos (presentes − café) e esforço de recebimento ponderado pela norma | **0,08** (0,03 contando só recebimentos; ≈ zero: a equipe não segue a carga) |
| Safra (out a mar): chapas por dia × recebimentos por dia | **9,3** chapas para 19,4 recebimentos |
| Entressafra (abr a set): chapas por dia × recebimentos por dia | **7,8** chapas para 22,4 recebimentos |
| Folga em meses de baixa demanda (valorada ao piso do boletim) | **R$ 58.370** (647 diárias, em 11 meses) |
| Pressão em meses de pico (mesma valoração) | **R$ 58.370** (647 diárias, em 4 meses, + 2 equilibrados) |
| Equivalente anual da folga (R$ 58.370 em 17 meses) | cerca de **R$ 41 mil por ano** |

Em linguagem direta: na safra a equipe tem **19% mais gente com 14% menos recebimentos** do que na entressafra. O
dinheiro da folga é o mesmo da pressão no método de equilíbrio adotado: é um **sinal de possível desencontro entre escala e
demanda ao longo do ano**, não uma contagem de pessoas excedentes nem prova de que a folga possa ser integralmente eliminada.

**O que isso vale em R$.** Pela regra do boletim, cada diária de folga custa o piso (R$ 90,1731). Valorando o saldo
mensal ao piso, a folga acumulada é de R$ 58 mil em 17 meses. É uma **estimativa de ordem de grandeza**, não uma
economia comprovada: ela depende do ponto de equilíbrio adotado (seção 5) e do carregamento de cooperados, que o
histórico não enxerga. Com o ponto de equilíbrio mais exigente (a capacidade que a equipe já demonstrou), o conjunto
passa a mostrar sobra líquida de R$ 22 mil.

**O que passa a responder com exatidão.** O boletim da plataforma mede o complemento efetivamente pago para atingir o piso
quando a produção da equipe não o alcança, e a produção que excede o valor garantido pelas diárias. Esses valores são exatos
para os boletins lançados, por armazém e período (seção 4); interpretar complemento como excesso de escala exige também
examinar a demanda e as condições operacionais do período.

---

## 2. O que os dados mostram

### 2.1 A demanda sobe em julho, não em outubro

Recebimentos por mês (um recebimento = nº do recebimento na data e armazém físico, como na seção 5; ver seção 7), histórico completo:

| Mês | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---:|---:|---:|---:|---:|
| Abr | – | 172 | 312 | 326 | 347 |
| Jul | 232 | 313 | 549 | 628 | 605 |
| Set | 312 | 438 | 477 | 632 | 432¹ |
| Out | 359 | 474 | 573 | 692 | – |
| Dez | 180 | 236 | 276 | 284 | – |

¹ setembro de 2026 está incompleto na base (vai até 22/09). Em **todos os anos** a demanda sobe entre 74% e 93% de abril para julho
e fica alta até outubro. Os recebimentos por ano cresceram de 3.457 (2023) para 5.214 (2025).

### 2.2 A equipe faz o caminho inverso

Chapas líquidas por dia (presentes − operação de café) e recebimentos por dia útil, mês a mês:

| Mês | Receb./dia | Chapas/dia | Chapas necessárias/dia* | Saldo (diárias) | Saldo (R$) | Situação |
|---|---:|---:|---:|---:|---:|---|
| fev/25 | 15,8 | 9,1 | 4,7 | +82 | R$ 7.408 | Sobra |
| mar/25 | 13,6 | 7,3 | 4,6 | +58 | R$ 5.251 | Sobra |
| abr/25 | 16,6 | 7,2 | 4,5 | +51 | R$ 4.566 | Sobra |
| mai/25 | 18,4 | 7,4 | 3,3 | +82 | R$ 7.385 | Sobra |
| jun/25 | 19,6 | 6,5 | 4,3 | +44 | R$ 3.952 | Sobra |
| **jul/25** | **28,5** | **6,6** | 13,7 | **−156** | **−R$ 14.051** | **Falta** |
| **set/25** | **28,7** | **8,5** | 18,1 | **−213** | **−R$ 19.167** | **Falta** |
| **out/25** | **30,0** | **9,3** | 17,6 | **−190** | **−R$ 17.163** | **Falta** |
| nov/25 | 22,6 | 10,8 | 11,0 | −3 | −R$ 295 | Equilibrado |
| jan/26 | 17,4 | 8,6 | 6,6 | +43 | R$ 3.912 | Sobra |
| fev/26 | 19,5 | 10,4 | 6,6 | +71 | R$ 6.432 | Sobra |
| mar/26 | 16,3 | 9,6 | 4,8 | +106 | R$ 9.571 | Sobra |
| abr/26 | 17,4 | 8,5 | 5,4 | +62 | R$ 5.568 | Sobra |
| mai/26 | 21,2 | 8,3 | 6,9 | +27 | R$ 2.406 | Sobra |
| jun/26 | 21,1 | 8,5 | 7,5 | +21 | R$ 1.918 | Sobra |
| **jul/26** | **27,5** | **8,5** | 11,7 | **−69** | **−R$ 6.251** | **Falta** |
| ago/26 | 23,5 | 8,3 | 9,1 | −16 | −R$ 1.442 | Equilibrado |

\* Chapas necessárias = esforço dos recebimentos do mês (norma do dossiê) ÷ o ritmo médio da equipe em todo o
histórico. **"Falta" significa demanda por chapa acima do ritmo histórico, não serviço não feito**: a equipe deu conta
trabalhando mais, e como é paga por produção, isso sai pelo piso. É sinal de pressão e de risco de fila (e de perda
de pontos com fornecedores de adubo), não de custo extra.

Não há folha de agosto e dezembro de 2025, nem de janeiro/2025 completo: esses meses ficam fora (seção 7).

### 2.3 Por que podemos chamar isso de descompasso

- **A equipe não segue a carga:** a correlação diária é 0,08 com o esforço ponderado pela norma e 0,03 contando só
  recebimentos. O resultado não depende da ponderação.
- **O reforço está atrasado:** chapas por dia sobem de 6,6 (jul/25) para 10,8 (nov/25), enquanto os recebimentos por dia
  já estavam em 28,5 em julho e caem para 16 a 19 de janeiro a março, quando a equipe ainda é de 8,6 a 10,4.
- **O ritmo por chapa varia 2,5×:** de 1,7 recebimento por chapa-dia (mar/26) a 4,3 (jul/25), contando só recebimentos.

---

## 3. Dimensionamento por armazém e período

O histórico não separa os chapas por armazém (a folha lista as pessoas, não o local). Por isso o saldo é **repartido
pela participação de cada armazém na necessidade** (esforço da norma do dossiê, seção 5). Isto é uma convenção
declarada; o número exato por armazém vem do boletim (seção 4).

| Armazém | Recebimentos nos 350 dias úteis com folha (fev/25–ago/26, sem ago/25 e dez/25) | Participação na necessidade | Parcela da folga | Parcela da pressão |
|---|---:|---:|---:|---:|
| Adubo | 1.721 | **67,7%** | R$ 39.524 | R$ 39.524 |
| Insumos | 1.719 | 30,1% | R$ 17.546 | R$ 17.546 |
| Pátio de Máquinas | 728 | 2,2% | R$ 1.300 | R$ 1.300 |
| Loja | 3.254 | 0% (premissa: carga leve, abaixo de 500 kg não usa chapa) | – | – |

**Leitura:** o Adubo concentra dois terços da necessidade de chapas (carga batida, 5 chapas por descarga, e o pico de
julho a outubro é o do adubo: no ano, o Adubo passou de 650 recebimentos em 2023 para 1.454 em 2025; só de julho a
outubro, de 443 para 1.034). A Loja tem 44% dos recebimentos e quase nenhum esforço de chapa. Cada recomendação de
reforço deve olhar o **Adubo e o Insumos**.

**Por período:**

| Período | Situação | Direção da recomendação |
|---|---|---|
| Jan a jun | Folga recorrente: de 1 a 5 chapas por dia acima do necessário (ao ritmo histórico) | Não repor nem reforçar; em fev/mar o reforço da safra ainda está contratado |
| **Jul a out** | **Pressão**: de 3 a 10 chapas por dia abaixo do necessário (ao ritmo histórico); ago/26 ficou equilibrado (0,8 abaixo) e não há folha de ago/25 | **Antecipar o reforço de outubro para junho/julho** |
| Nov a mar | Equilibrado em nov; folga a partir de janeiro | Encerrar o reforço mais cedo; quanto da folga é realocado a outros setores precisa ser informado pela Cocapec (o painel não registra realocação; mede o complemento pago por armazém e período) |

---

## 4. Como o painel responde daqui para frente (dados da plataforma)

O boletim registra a produção e a equipe de cada dia. Dele saem a sobra e a falta **exatas**, sem estimativa:

```
diárias que a produção paga = produção ÷ piso (R$ 90,1731)
SOBRA (R$)  = complemento pago          = piso × (diárias da equipe − diárias que a produção paga)
FALTA (R$)  = produção acima do piso    = produção − piso × diárias da equipe   (equipe curta para o dia)
aproveitamento = produção ÷ (piso × diárias):  abaixo de 100% há complemento · acima de 100% há produção acima do piso
situação no painel: SOBRA abaixo de 90% · EQUILIBRADO de 90% a 110% · FALTA acima de 110%
```

**Leitura para gestão.** No áudio transcrito pela equipe, Dani descreve o complemento como custo a acompanhar: quando há
muita equipe para pouco volume, a produção pode não alcançar o mínimo garantido, e a empresa paga a diferença. Isso torna
o complemento um **indicador de alerta para revisar a escala e a alocação**, em conjunto com o volume recebido e o trabalho
realizado. O valor, isoladamente, não prova ociosidade nem quantas pessoas poderiam ser retiradas: também pode refletir
variação de demanda, composição das cargas, restrições operacionais ou trabalho não registrado no boletim. Essa fala é
contexto qualitativo de negócio, não uma medição adicionada ao histórico.

**Exemplo oficial (Adubo, 17/11/2025; origem `HISTORICO`, único lançamento preenchido na planilha de boletim da
Cocapec):** produção R$ 918,1952 e 11 chapas. A produção equivale a 10,18 pisos diários; como o boletim garante 11, o
complemento é **R$ 73,71**. Aproveitamento de 92,6%: faixa "equilibrado" nos limiares
operacionais do painel. O complemento é uma despesa observada; classificá-la como excesso de escala requer olhar o contexto
da operação.

O painel mostra, por armazém e por dia, semana ou mês: aproveitamento, sobra e falta em R$ e em diárias, dias com
complemento e dias acima do piso. Também alerta quando a **mesma matrícula aparece em dois boletins no mesmo dia**
(cada boletim paga as suas diárias, mas o efetivo conta a pessoa uma vez).

**Indicadores operacionais** (cargas por dia e armazém, espera = entrada − chegada, descarga = saída − entrada, chapas por
recebimento, descargas e horas ocupadas por armazém (sem percentual de utilização, cuja fórmula a Cocapec não definiu),
fornecedores, horários e dias de maior movimento, não recebimentos por motivo e custo da operação = Σ `total a pagar`
dos boletins, sem encargos nem equipamentos) são calculados somente sobre os registros lançados pela própria plataforma
(origem `PLATAFORMA`), com filtro de período e armazém. A exceção são os não recebimentos, filtrados só por período,
porque nem todo não recebimento tem armazém associado. O boletim de exemplo
acima, de origem `HISTORICO`, não entra nesses indicadores.

**Origem dos registros da plataforma.** Agendamentos (e as descargas ligadas a eles), não recebimentos e boletins lançados
pela interface são gravados com origem `PLATAFORMA`. Registros que a equipe lançar para teste ou demonstração entram pelo mesmo caminho e
**não são operação real da Cocapec**; por isso este relatório não apresenta resultados desses indicadores. Na revisão
deste relatório (04/10/2026), a base não tinha agendamentos nem boletins lançados pela plataforma: o painel mostra a
fórmula e passa a medir a partir do primeiro boletim registrado.

---

## 5. Método, premissas e limites

**Unidade de carga.** O **recebimento** (nº do recebimento na data e armazém físico). A planilha tem uma linha por item
de pedido (41.779 linhas); contar linhas inflaria a demanda.

**Esforço por recebimento** (pessoa-minutos, a partir do dossiê, seções 7 e 9). O histórico não registra o
acondicionamento, então há uma premissa por armazém:

| Armazém | Premissa | Pessoa-min/recebimento |
|---|---|---:|
| Adubo | carga batida: 5 chapas × 45 min | 225 |
| Insumos | paletizado: 2 chapas × 50 min (10 paletes × 5 min de ciclo completo) | 100 |
| Pátio de Máquinas | 1 chapa × 17,5 min | 17,5 |
| Loja | fracionado leve: abaixo de 500 kg não usa chapa | 0 |

**Ponto de equilíbrio.** Pessoa-minutos de recebimento por chapa-dia, em todo o histórico com folha: **194,3**
(350 dias úteis). Chapas necessárias do mês = esforço ÷ 194,3. O saldo é a diferença para os chapas presentes (líquidos
da operação de café). Valoração: diárias × R$ 90,1731.

**Sensibilidade ao equilíbrio:**

| Referência | Folga | Pressão | Saldo |
|---|---:|---:|---:|
| Equilíbrio médio do histórico (194,3) | R$ 58.370 | R$ 58.370 | R$ 0 |
| Capacidade demonstrada (3º quartil mensal: 212,1) | R$ 68.569 | R$ 46.348 | + R$ 22.222 |

**O que o método NÃO afirma:**

1. **O tamanho absoluto ideal da equipe ou a causa de cada complemento.** O histórico só enxerga o recebimento; o carregamento de cooperados divide a
   mesma equipe e nunca foi registrado. O método mostra se a equipe **acompanhou a demanda**, não quantos chapas
   existem demais ou de menos em termos absolutos. No dado da plataforma, o complemento é conhecido com exatidão, mas
   não demonstra sozinho que houve ociosidade nem identifica a causa. Para decidir ajuste de escala, é preciso confrontá-lo
   com recebimentos, produção, armazém, horários e outras atividades da equipe. Isso fecha com o boletim, que registra
   movimentações declaradas, mas não mede sozinho toda a ocupação do trabalhador.
2. **Economia garantida.** Os R$ são ordem de grandeza (valorados ao piso), não redução de folha comprovada.
3. **Tempos de espera e de descarga do passado.** Nunca foram medidos. Não inventamos horários, chapas por descarga
   nem equipamentos para o histórico; as estimativas do dossiê são parâmetros, não medições.
4. **Que a Loja não usa chapas.** É a norma do dossiê (menos de 500 kg), não uma medição.

---

## 6. Origem dos dados

| Informação no painel | Origem | Fonte |
|---|---|---|
| Recebimentos por ano, armazém, fornecedor e dia da semana; demanda mensal | `HISTORICO` | `pedido_recebimento_notafiscal.xlsx` (41.779 linhas, jun/2022–set/2026) |
| Chapas presentes e da operação de café por dia | `HISTORICO` | `chapas_por_dia.csv` (428 dias, jan/2025–ago/2026) |
| Tabela de preços e piso do boletim | `HISTORICO` | `boletim_diario_chapas.xlsx` (Cocapec) e dossiê, seção 8 |
| Esforço por recebimento | Norma do dossiê (parâmetro) | Dossiê, seções 7 e 9 |
| Interpretação do complemento como alerta para revisar escala | Contexto qualitativo, não numérico | Relato oral de Dani, transcrito e organizado pela equipe; não entra nos cálculos |
| Boletim de exemplo (Adubo, 17/11/2025), na tela de boletins | `HISTORICO` | `boletim_diario_chapas.xlsx`: único lançamento preenchido na planilha; não são criados boletins para outros armazéns ou datas |
| Notas fiscais históricas (XML e DANFE em PDF) e registro manual digitalizado, na tela "Notas fiscais históricas" | `HISTORICO` | `01_notas_fiscais` (460 XML com 838 itens; 461 DANFEs, 459 vinculados a um XML) e `registro_manual_recebimento.pdf`, guardados como arquivo, sem transcrição; não criam agendamentos nem recebimentos |
| Estoque de referência por armazém, na tela de Insumos | `HISTORICO` | `02_cadastros/estoque_por_armazem` (4 planilhas, 1.242 itens); a fonte não informa a data de corte do saldo |
| Catálogo oficial de equipamentos de descarga (tipo e utilização), na tela de Insumos | `HISTORICO` | `equipamentos_descarga.xlsx` (4 tipos); local e quantidade não são presumidos |
| Agendamentos, descargas, não recebimentos e boletins lançados pela interface | `PLATAFORMA` | registrados pelo sistema; inclui o que a equipe lançar para teste ou demonstração, que **não é operação real da Cocapec** |

Os arquivos de dados da Cocapec não fazem parte do repositório (ficam fora do Git); a carga `--dados` os lê do pacote
oficial (seção 8). Os registros operacionais (agendamento, não recebimento, boletim) carregam a coluna `origem`: a
interface grava `PLATAFORMA` e a carga grava `HISTORICO` no boletim de exemplo. Os indicadores da plataforma (seção 4)
usam só `PLATAFORMA`. A tela do painel mostra a origem ao lado de cada bloco.

---

## 7. Tratamento das inconsistências dos dados

Os dados vieram sem limpeza. A carga de dados em Java (`CargaDadosService`, acionada por `--dados`; seção 8) conta
os principais problemas da movimentação e imprime os contadores ao terminar (`linhas_lidas`, `duplicadas_descartadas`,
`sabados_com_recebimento`, `recebimento_antes_do_documento`, `sem_chave_de_acesso`, `chave_de_acesso_malformada`,
`parciais_agrupados` etc.). As demais quantidades foram conferidas na planilha original e no banco carregado
(`hist_recebimento_item`, `hist_chapa_dia`, `deposito_armazem`, `hist_nota_fiscal`, `hist_nota_fiscal_item`, `produto`).

| Problema encontrado | Quantidade | Tratamento |
|---|---:|---|
| Linhas 100% duplicadas na movimentação | 540 | Descartadas (41.779 → 41.239) |
| Mais de uma linha com o mesmo pedido, item, nº e data de recebimento | 396 grupos (829 linhas) | Preservadas, cada uma com a sua linha de origem na planilha; no recebimento contam uma vez. Contado no banco pela mesma chave do contador `parciais_agrupados` |
| **Uma linha por item, não por caminhão** | 41.239 linhas → 18.821 recebimentos por armazém | A carga é o recebimento (data, nº, armazém). Contar linhas inflaria a demanda |
| **Recebimentos por dia × caminhões informados** | mediana de **15** números de recebimento distintos por dia com movimento (16 contando por armazém), contra "5 a 6 caminhões" do dossiê | Usamos o recebimento só como **índice relativo** de demanda. Um recebimento não é um caminhão; deve ser confirmado com a Cocapec |
| Recebimentos em sábados (o dossiê diz que não há) | 21 linhas em 5 dias | Preservados e contados; a análise de equipe usa só segunda a sexta |
| Data de recebimento anterior à data do documento | 308 | Preservadas e contadas (provável lançamento retroativo do documento) |
| **Coluna de peso inutilizável** | mediana do Adubo ≈ 573 **toneladas** por recebimento | Não usamos peso em nenhum cálculo (unidades misturadas e itens repetidos em recebimentos parciais) |
| Chave de acesso ausente | 224 | Guardada como nula |
| Chave de acesso malformada (≠ 44 dígitos) | 111 | Guardada como nula |
| Depósitos fora do dossiê (`MATIndus`, `MATTrans`, `MATProp`, `MATDT`) | 11 | Ficam fora da quebra por armazém; contados |
| Depósito ≠ armazém físico | – | `MATFerti`/`MATFert2`→Adubo; `MATDefe`/`MATDef2`/`MATGeral`/`MATGer2`→Insumos; `MATMaq`→Pátio; `MATLoja`→Loja |
| Folha sem agosto e dezembro de 2025; janeiro/2025 com 5 dias | 2 meses + 1 parcial | Meses com menos de 10 dias de folha ficam fora; o recebimento desses meses aparece na série de demanda, mas não no saldo |
| Folha de sábado (72 dias) | 72 | Fora do saldo: sábado é organização de estoque |
| Código do item do XML é do fornecedor, não do catálogo | 837 de 838 itens não casam | Não casamos pelo código do XML; a amarração é pelo **pedido de compra** validado por Compras (Tarefa 1) |
| NF-e sem peso bruto na amostra de XML | 29 de 460 (só 3 delas têm peso líquido) | O histórico guarda os dois pesos como vieram; na leitura do XML do agendamento, usa-se o peso líquido quando o bruto falta |
| `Peso` e `Qtd` repetidos em recebimentos parciais | 1.281 pares pedido-item aparecem em mais de um recebimento; em 1.140 deles o mesmo `Peso` e a mesma `Qtd` se repetem entre recebimentos | Não se somam peso nem quantidade como carga |

---

## 8. Como reproduzir

```bash
# 1. Sobe PostgreSQL e API; o Flyway aplica as migrations V1–V16 ao iniciar
docker compose up --build

# 2. Carrega o histórico oficial (pasta extraída do pacote, montada só para leitura)
docker compose run --rm -v "<caminho>/DADOS_HACKATHON_2026:/tmp/dados:ro" --entrypoint java api \
  -jar /app/app.jar --spring.main.web-application-type=none --dados=/tmp/dados
```

Interface em `http://localhost:8000/ui/`; o painel gerencial fica em `http://localhost:8000/ui/#/painel` (perfis
administrador, diretoria e responsável de armazém; usuários iniciais no `README.md`). A carga substitui os históricos
importados e atualiza os cadastros oficiais de fornecedores e produtos; não cria agendamentos nem altera agendamentos e
boletins lançados pela plataforma, e reexecutá-la produz o mesmo histórico.

Sem Docker, com um PostgreSQL próprio: compile o frontend (`cd web && npm ci && npm run build`), depois a API
(`cd api && mvn clean package`) e rode `java -jar target/recebimento-1.0.0.jar --dados=<pasta ou DADOS_HACKATHON_2026.zip>`.

Rotas do painel (`GET`, exigem login): `/api/painel/operacao` e `/api/painel/dimensionamento/plataforma` (filtros `de`,
`ate`, `armazemId` e `origem`, que aceita só `PLATAFORMA`; a segunda também aceita `agrupar=dia|semana|mes`),
`/api/painel/dimensionamento/historico` e `/api/painel/historico/indicadores` (filtros `de` e `ate`). Swagger em `/docs`.

---

## 9. Perguntas em aberto para a Cocapec

1. **Um "recebimento" no SAP é um caminhão?** A base tem 15 por dia útil; o dossiê fala em 5 a 6 caminhões.
2. **Quanto da equipe vai para o carregamento de cooperados?** É o que separa "folga relativa" de "folga absoluta".
3. **A Loja usa chapas?** Foi assumida zero pela norma de menos de 500 kg.
4. **Quanto da folga já é realocada a outros setores?** A Cocapec informou que realoca chapas (conforme registrado pela equipe); se a folga é realocada, ela é capacidade realocável, não ociosidade, e o custo real da folga é menor que o valorado ao piso.
5. **O reforço de pessoal (out a mar) pode ser antecipado para jun/jul?** É a principal ação sugerida pelos dados.
