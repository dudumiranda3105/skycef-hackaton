-- =====================================================================
-- Recebimento Inteligente - Cocapec
-- V1: modelo de dados inicial (base do DER entregue em /docs)
-- Toda tabela alimentada por carga ou simulacao tem coluna `origem`,
-- pois o regulamento exige declarar a origem de cada dado do painel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table armazem (
    id      smallint    primary key,
    codigo  varchar(20) not null unique,
    nome    varchar(40) not null
);

-- Destino fisico acompanha o GRUPO do produto, nao o deposito (dossie, secao 5)
create table grupo_produto (
    codigo      varchar(3)  primary key,
    descricao   varchar(60) not null,
    armazem_id  smallint    not null references armazem (id)
);

-- Dados vindos de planilha suja: sem UNIQUE em codigo/cnpj; o ETL deduplica.
create table fornecedor (
    id            bigserial    primary key,
    codigo        varchar(20),
    razao_social  varchar(200) not null,
    cnpj          varchar(14)
);
create index ix_fornecedor_cnpj   on fornecedor (cnpj);
create index ix_fornecedor_codigo on fornecedor (codigo);

create table produto (
    id            bigserial     primary key,
    codigo        varchar(20)   not null,       -- codigo Cocapec (ex.: FER000003)
    descricao     varchar(300),
    unidade       varchar(10),
    peso_unitario numeric(14,4),
    grupo         varchar(3),
    deposito      varchar(12)
);
create index ix_produto_codigo on produto (codigo);

create table chapa (
    matricula  varchar(20) primary key,         -- ex.: CHAPA_01
    nome       varchar(120)
);

create table equipamento (
    id          smallserial primary key,
    armazem_id  smallint    not null references armazem (id),
    tipo        varchar(60) not null,
    quantidade  smallint,
    observacao  varchar(200)
);

-- ---------------------------------------------------------------------
-- Tarefa 1 - Agendamento
-- ---------------------------------------------------------------------
create table agendamento (
    id                     bigserial     primary key,
    fornecedor_id          bigint        not null references fornecedor (id),
    data_agendada          date          not null,
    horario                time          not null
        check (horario in ('08:00', '10:00', '13:00', '15:00')),
    acondicionamento       varchar(12)   not null
        check (acondicionamento in ('BATIDO', 'PALETIZADO', 'BIG_BAG')),
    status                 varchar(20)   not null
        check (status in ('AGENDADO', 'VALIDADO_COMPRAS', 'AUTORIZADO', 'CHEGOU',
                          'EM_DESCARGA', 'CONCLUIDO', 'CANCELADO', 'NAO_RECEBIDO')),
    nf_numero              varchar(20),
    nf_chave               varchar(44),
    nf_xml                 text,
    peso_total_kg          numeric(14,3),
    pedido_compra          varchar(20),
    agendado_na_hora       boolean       not null default false,  -- sem aviso previo, agendou ao chegar
    limite_ignorado        boolean       not null default false,  -- reagendamento por caso fortuito
    origem                 varchar(12)   not null default 'PLATAFORMA'
        check (origem in ('PLATAFORMA', 'SIMULADO', 'HISTORICO')),
    criado_em              timestamptz   not null default now()
);
create index ix_agendamento_slot   on agendamento (data_agendada, horario);
create index ix_agendamento_status on agendamento (status);

-- Um caminhao pode descarregar em mais de um armazem
create table agendamento_destino (
    agendamento_id  bigint   not null references agendamento (id) on delete cascade,
    armazem_id      smallint not null references armazem (id),
    primary key (agendamento_id, armazem_id)
);

-- Trilha de auditoria das transicoes de estado
create table evento_agendamento (
    id              bigserial   primary key,
    agendamento_id  bigint      not null references agendamento (id) on delete cascade,
    de_status       varchar(20),
    para_status     varchar(20) not null,
    observacao      varchar(300),
    ocorrido_em     timestamptz not null default now()
);
create index ix_evento_agendamento on evento_agendamento (agendamento_id);

-- Tres marcos: chegada (fila), entrada (inicio da descarga), saida (fim).
-- qtd_chapas e por descarga e NAO e somavel ao longo do dia (dossie, secao 4).
create table descarga (
    agendamento_id  bigint      primary key references agendamento (id) on delete cascade,
    chegada_em      timestamptz,
    entrada_em      timestamptz,
    saida_em        timestamptz,
    qtd_chapas      smallint    check (qtd_chapas >= 0),
    check (entrada_em is null or chegada_em is null or entrada_em >= chegada_em),
    check (saida_em   is null or entrada_em is null or saida_em   >= entrada_em)
);

create table descarga_equipamento (
    agendamento_id  bigint   not null references descarga (agendamento_id) on delete cascade,
    equipamento_id  smallint not null references equipamento (id),
    primary key (agendamento_id, equipamento_id)
);

-- agendamento_id e fornecedor_id podem ser nulos: caminhao que chegou sem agendamento e sem vaga
create table nao_recebimento (
    id              bigserial   primary key,
    agendamento_id  bigint      references agendamento (id),
    fornecedor_id   bigint      references fornecedor (id),
    data            date        not null,
    motivo          varchar(30) not null
        check (motivo in ('DIVERGENCIA_NF_PEDIDO', 'SEM_AGENDAMENTO_SEM_VAGA',
                          'CASO_FORTUITO', 'OUTRO')),
    descricao       varchar(300),
    origem          varchar(12) not null default 'PLATAFORMA'
        check (origem in ('PLATAFORMA', 'SIMULADO', 'HISTORICO')),
    check (motivo <> 'OUTRO' or descricao is not null)
);

-- ---------------------------------------------------------------------
-- Tarefa 2 - Boletim diario de servicos dos ensacadores
-- ---------------------------------------------------------------------
create table tipo_item (
    codigo          varchar(30)  primary key,
    descricao       varchar(60)  not null,
    preco_unitario  numeric(10,4) not null
);

create table parametro (
    chave  varchar(40)    primary key,
    valor  numeric(12,4)  not null
);

-- Um boletim por armazem por dia
create table boletim (
    id                   bigserial     primary key,
    armazem_id           smallint      not null references armazem (id),
    data                 date          not null,
    producao_total       numeric(14,4) not null,
    diarias_equivalentes numeric(6,1)  not null,
    valor_por_diaria     numeric(14,4) not null,
    total_a_pagar        numeric(14,4) not null,
    complemento          numeric(14,4) not null,
    origem               varchar(12)   not null default 'PLATAFORMA'
        check (origem in ('PLATAFORMA', 'SIMULADO', 'HISTORICO')),
    criado_em            timestamptz   not null default now(),
    unique (armazem_id, data)
);

create table boletim_producao (
    boletim_id          bigint        not null references boletim (id) on delete cascade,
    tipo_item           varchar(30)   not null references tipo_item (codigo),
    qtd_descarga        integer       not null default 0 check (qtd_descarga >= 0),
    qtd_remocao         integer       not null default 0 check (qtd_remocao >= 0),
    qtd_transferencia   integer       not null default 0 check (qtd_transferencia >= 0),
    preco_unitario      numeric(10,4) not null,   -- preco vigente no dia, congelado
    primary key (boletim_id, tipo_item)
);

-- Ate 20 chapas por boletim (validado no servico)
create table boletim_equipe (
    boletim_id   bigint      not null references boletim (id) on delete cascade,
    matricula    varchar(20) not null references chapa (matricula),
    meia_diaria  boolean     not null default false,
    primary key (boletim_id, matricula)
);

-- ---------------------------------------------------------------------
-- Historico carregado pelo ETL (origem sempre HISTORICO)
-- ---------------------------------------------------------------------
create table hist_recebimento_item (
    id                bigserial     primary key,
    pedido_compra     varchar(20),
    item_codigo       varchar(20),
    fornecedor_codigo varchar(20),
    descricao         varchar(300),
    quantidade        numeric(14,4),
    peso_kg           numeric(14,4),
    deposito          varchar(12),
    nr_recebimento    varchar(20),
    data_recebimento  date,
    nf_numero         varchar(20),
    nf_chave          varchar(44)
);
create index ix_hist_rec_data  on hist_recebimento_item (data_recebimento);
create index ix_hist_rec_chave on hist_recebimento_item (nf_chave);

-- Presenca diaria na folha dos ensacadores (nao ha agosto/dezembro de 2025)
create table hist_chapa_dia (
    data            date         primary key,
    dia_semana      varchar(15),
    qtd_presentes   smallint,
    qtd_cafe        smallint,
    valor_pago      numeric(14,2)
);

create table hist_chapa_presenca (
    data       date        not null,
    matricula  varchar(20) not null,
    primary key (data, matricula)
);
