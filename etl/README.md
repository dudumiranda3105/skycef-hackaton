# ETL

Scripts de carga dos dados da Cocapec, em Python (pandas + openpyxl). Leem de `../data`
(fora do Git) e gravam no PostgreSQL, reaproveitando os modelos de `api/app`.

Ordem prevista:

1. `cadastros`: `fornecedores.xlsx`, `produtos.xlsx`, `chapas` (matrículas CHAPA_nn)
2. `historico de recebimentos`: `pedido_recebimento_notafiscal.xlsx` → `hist_recebimento_item`
3. `folha dos chapas`: `chapas_por_dia_2025/2026.xlsx` → `hist_chapa_dia`, `hist_chapa_presenca`

Os equipamentos por local já vêm da migration V4 (dossiê, seção 6); a planilha
`equipamentos_descarga.xlsx` só lista tipos e finalidades.

Pontos de atenção (dados não limpos):

- Não há registro de agosto e dezembro de 2025 na folha.
- O código de produto dentro do XML da NF é do fornecedor; o da planilha é o da Cocapec.
  A ligação NF ↔ pedido é pela chave de acesso.
- Documentar no relatório gerencial cada problema encontrado e o tratamento dado.
