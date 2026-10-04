-- Estoques extraídos das quatro planilhas oficiais. As planilhas não informam
-- a data de referência do saldo, portanto importado_em registra só a carga.
create table hist_estoque_item (
    arquivo_origem varchar(120) not null,
    linha_origem   integer      not null,
    armazem_id     smallint     not null references armazem (id),
    produto_codigo varchar(20)  not null,
    descricao      varchar(300) not null,
    quantidade     numeric(18,4) not null,
    importado_em   timestamptz  not null default now(),
    primary key (arquivo_origem, linha_origem)
);
create index ix_hist_estoque_armazem on hist_estoque_item (armazem_id, produto_codigo);
