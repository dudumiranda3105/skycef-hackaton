# ETL

Scripts de carga dos dados da Cocapec. Leem de `../data` (fora do Git) e gravam no PostgreSQL.

Ordem prevista:

1. `cadastros`: `fornecedores.xlsx`, `produtos.xlsx`, `chapas` (matrículas CHAPA_nn)
2. `historico de recebimentos`: `pedido_recebimento_notafiscal.xlsx` → `hist_recebimento_item`
3. `folha dos chapas`: `chapas_por_dia_2025/2026.xlsx` → `hist_chapa_dia`, `hist_chapa_presenca`
4. `equipamentos`: `equipamentos_descarga.xlsx` → `equipamento`

Pontos de atenção (dados não limpos):

- Não há registro de agosto e dezembro de 2025 na folha.
- O código de produto dentro do XML da NF é do fornecedor; o da planilha é o da Cocapec.
  A ligação NF ↔ pedido é pela chave de acesso.
- Documentar no relatório gerencial cada problema encontrado e o tratamento dado.
