# DER — esquema PostgreSQL

O [DER em SVG](der.svg) resume as tabelas efetivas das migrações [`V1`–`V7`](../api/migrations/), após as alterações da V5. PK = chave primária; FK = chave estrangeira; UK = unicidade. As tabelas históricas aparecem em área própria porque o ETL preserva seus códigos de origem e não força FK com cadastros operacionais.

## Relações operacionais

| Origem | Cardinalidade | Destino / chave |
|---|---|---|
| Fornecedor | 1:N | Agendamento (`fornecedor_id`) |
| Agendamento | 1:N | NotaFiscal, EventoAgendamento, Reagendamento e Descarga (`agendamento_id`) |
| Agendamento | 1:0..1 | ValidacaoCompras e Cancelamento (`agendamento_id` PK/FK) |
| Agendamento | 1:N | NaoRecebimento (`agendamento_id`, nulo para chegada sem agendamento) |
| Agendamento | 1:0..1 | VagaLiberada (`origem_agendamento_id` UK); `atribuida_a_agendamento_id` é FK opcional para Agendamento |
| Armazem | 1:N | Descarga, Equipamento, Boletim, GrupoProduto e DepositoArmazem |
| Descarga | N:N | Equipamento via DescargaEquipamento |
| Boletim | 1:N | BoletimProducao e BoletimEquipe |
| TipoItem | 1:N | BoletimProducao |
| Chapa | 1:N | BoletimEquipe |

## Restrições e medidas

- `descarga`: `UNIQUE(agendamento_id, armazem_id)`; seus marcos respeitam `chegada_em ≤ entrada_em ≤ saida_em`.
- `nota_fiscal`: índice único parcial para `nf_chave` ativa; há uma ou mais NFs por agendamento na regra de aplicação.
- `boletim`: `UNIQUE(armazem_id, data)`; `boletim_producao` e `boletim_equipe` têm PK composta.
- Dinheiro e preços usam `numeric(...,4)`; `total_a_pagar` é o custo do boletim para o painel. O `quantidade_chapas` da descarga mede intensidade, não efetivo diário.
- `usuario` e `sessao` (migration V8) só servem ao login e não aparecem no diagrama: senha em PBKDF2 e, da sessão, apenas o SHA-256 do token.
- `data_nao_operacional` e `parametro` são tabelas de regra independentes. `hist_recebimento_item`, `hist_chapa_dia` e `hist_chapa_presenca` guardam a base histórica; `deposito_armazem` traduz depósitos físicos para a análise.

## Fonte textual Mermaid

```mermaid
erDiagram
  FORNECEDOR ||--o{ AGENDAMENTO : agenda
  AGENDAMENTO ||--|{ NOTA_FISCAL : anexa
  AGENDAMENTO ||--o| VALIDACAO_COMPRAS : recebe
  AGENDAMENTO ||--o{ DESCARGA : distribui
  AGENDAMENTO ||--o{ EVENTO_AGENDAMENTO : audita
  AGENDAMENTO ||--o{ REAGENDAMENTO : historiza
  AGENDAMENTO ||--o| CANCELAMENTO : permite
  AGENDAMENTO ||--o{ NAO_RECEBIMENTO : registra
  AGENDAMENTO ||--o| VAGA_LIBERADA : libera
  ARMAZEM ||--o{ DESCARGA : recebe
  ARMAZEM ||--o{ EQUIPAMENTO : possui
  DESCARGA ||--o{ DESCARGA_EQUIPAMENTO : usa
  EQUIPAMENTO ||--o{ DESCARGA_EQUIPAMENTO : usado_em
  ARMAZEM ||--o{ BOLETIM : registra
  BOLETIM ||--o{ BOLETIM_PRODUCAO : contem
  BOLETIM ||--o{ BOLETIM_EQUIPE : aloca
  TIPO_ITEM ||--o{ BOLETIM_PRODUCAO : precifica
  CHAPA ||--o{ BOLETIM_EQUIPE : participa
  ARMAZEM ||--o{ GRUPO_PRODUTO : destino
  ARMAZEM |o--o{ DEPOSITO_ARMAZEM : mapeia
  FORNECEDOR { bigint id PK; string codigo; string cnpj }
  AGENDAMENTO { bigint id PK; bigint fornecedor_id FK; date data_agendada; time horario; string acondicionamento; string status; timestamp chegada_em; string origem }
  NOTA_FISCAL { bigint id PK; bigint agendamento_id FK; string nf_chave; boolean ativa; binary conteudo }
  VALIDACAO_COMPRAS { bigint agendamento_id PK,FK; string decisao; string pedido_referencia }
  DESCARGA { bigint id PK; bigint agendamento_id FK; smallint armazem_id FK; timestamp chegada_em; timestamp entrada_em; timestamp saida_em; smallint quantidade_chapas }
  EVENTO_AGENDAMENTO { bigint id PK; bigint agendamento_id FK; string tipo; json detalhe }
  REAGENDAMENTO { bigint id PK; bigint agendamento_id FK; date data_anterior; date data_nova; string motivo }
  CANCELAMENTO { bigint agendamento_id PK,FK; string situacao; string motivo }
  NAO_RECEBIMENTO { bigint id PK; bigint agendamento_id FK; bigint fornecedor_id FK; string motivo }
  VAGA_LIBERADA { bigint id PK; bigint origem_agendamento_id FK; bigint atribuida_a_agendamento_id FK; string status }
  ARMAZEM { smallint id PK; string codigo UK; string nome }
  EQUIPAMENTO { smallint id PK; smallint armazem_id FK; string identificacao UK; string tipo }
  DESCARGA_EQUIPAMENTO { bigint descarga_id PK,FK; smallint equipamento_id PK,FK }
  BOLETIM { bigint id PK; smallint armazem_id FK; date data; decimal producao_total; decimal total_a_pagar; decimal complemento; string situacao }
  BOLETIM_PRODUCAO { bigint boletim_id PK,FK; string tipo_item PK,FK; int qtd_descarga; int qtd_remocao; int qtd_transferencia; decimal preco_unitario }
  BOLETIM_EQUIPE { bigint boletim_id PK,FK; string matricula PK,FK; string tipo_diaria }
  TIPO_ITEM { string codigo PK; string descricao; decimal preco_unitario }
  CHAPA { string matricula PK; string nome }
  GRUPO_PRODUTO { string codigo PK; smallint armazem_id FK }
  DEPOSITO_ARMAZEM { string deposito PK; smallint armazem_id FK }
```

`produto`, `parametro`, `data_nao_operacional` e as três tabelas `hist_*` são mostradas no SVG como tabelas de apoio/histórico sem relações FK adicionais.
