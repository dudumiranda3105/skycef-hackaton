-- Mantém rastreabilidade até a linha da planilha e permite registros parciais
-- legítimos com o mesmo pedido/item/recebimento sem descartar quantidades.
alter table hist_recebimento_item add column linha_origem integer;

with linhas as (
    select id, row_number() over (order by id)::integer as numero
    from hist_recebimento_item
)
update hist_recebimento_item h
set linha_origem = linhas.numero
from linhas
where h.id = linhas.id;

-- Dados externos de teste/ajuste manual podem não ter uma linha-fonte conhecida.
create unique index ux_hist_recebimento_linha_origem on hist_recebimento_item (linha_origem)
    where linha_origem is not null;
