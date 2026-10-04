-- Documentos fiscais históricos ficam separados de agendamentos atuais.
create table hist_nota_fiscal (
    id                 bigserial primary key,
    arquivo_origem     varchar(260) not null unique,
    chave_acesso       varchar(44),
    numero             varchar(20),
    data_emissao       timestamptz,
    emitente_cnpj      varchar(14),
    emitente_nome      varchar(200),
    destinatario_cnpj  varchar(14),
    destinatario_nome  varchar(200),
    valor_total        numeric(18,2),
    peso_bruto_kg      numeric(18,4),
    peso_liquido_kg    numeric(18,4),
    modalidade_frete   varchar(10),
    sha256             varchar(64) not null,
    conteudo_xml       bytea not null
);
create index ix_hist_nfe_chave on hist_nota_fiscal (chave_acesso);
create index ix_hist_nfe_emissao on hist_nota_fiscal (data_emissao);
create index ix_hist_nfe_emitente on hist_nota_fiscal (emitente_cnpj);

create table hist_nota_fiscal_item (
    nota_fiscal_id       bigint not null references hist_nota_fiscal (id) on delete cascade,
    numero_item          integer not null,
    codigo_fornecedor    varchar(60),
    descricao            varchar(500),
    ncm                  varchar(10),
    unidade              varchar(20),
    quantidade           numeric(18,4),
    valor_unitario       numeric(18,6),
    valor_total          numeric(18,2),
    primary key (nota_fiscal_id, numero_item)
);
create index ix_hist_nfe_item_codigo on hist_nota_fiscal_item (codigo_fornecedor);

-- PDFs de DANFE e registro manual preservados sem os converter em operação do sistema.
create table hist_documento_anexo (
    id                 bigserial primary key,
    nota_fiscal_id     bigint references hist_nota_fiscal (id) on delete cascade,
    arquivo_origem     varchar(260) not null unique,
    tipo               varchar(24) not null check (tipo in ('DANFE_PDF', 'REGISTRO_MANUAL_PDF')),
    sha256             varchar(64) not null,
    conteudo           bytea not null
);

-- A fonte oficial lista o tipo e a utilização dos equipamentos, sem informar
-- quantidade nem armazém de lotação. Mantém-se este catálogo global separado.
create table equipamento_catalogo_oficial (
    tipo             varchar(120) primary key,
    utilizacao       varchar(300) not null,
    arquivo_origem   varchar(120) not null
);

alter table boletim add column arquivo_origem varchar(260);
