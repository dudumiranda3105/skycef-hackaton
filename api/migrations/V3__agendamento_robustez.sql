-- =====================================================================
-- V3: robustez da Tarefa 1 (agendamento)
-- Resultado da revisao de qualidade / escopo / seguranca. A V1 ja foi
-- publicada, entao os ajustes entram como nova migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- agendamento: controle de versao, trilha de decisoes e invariantes
-- ---------------------------------------------------------------------
alter table agendamento
    add column versao              integer      not null default 0,   -- @Version (transicoes concorrentes)
    add column compras_em          timestamptz,                       -- quando Compras validou
    add column autorizado_em       timestamptz,                       -- quando o armazem autorizou
    add column motivo_cancelamento varchar(300);

-- O arquivo anexado passa a ficar em agendamento_anexo (XML ou PDF), nao no corpo da linha.
alter table agendamento drop column nf_xml;

alter table agendamento
    add constraint ck_agendamento_nf_chave
        check (nf_chave is null or nf_chave ~ '^[0-9]{44}$'),
    -- recebimento so de segunda a sexta; historico importado nao e validado
    add constraint ck_agendamento_dia_util
        check (origem = 'HISTORICO' or extract(isodow from data_agendada) <= 5),
    -- depois de AGENDADO, Compras ja informou o pedido de compra
    add constraint ck_agendamento_pedido
        check (status in ('AGENDADO', 'CANCELADO', 'NAO_RECEBIDO') or pedido_compra is not null);

-- A mesma NF-e nao pode estar ativa em dois agendamentos (protege contra duplo clique).
create unique index ux_agendamento_nf_ativa
    on agendamento (nf_chave)
    where nf_chave is not null and status not in ('CANCELADO', 'NAO_RECEBIDO');

create index ix_agendamento_fornecedor on agendamento (fornecedor_id);

-- ---------------------------------------------------------------------
-- Arquivo da nota fiscal anexada pelo fornecedor
-- ---------------------------------------------------------------------
create table agendamento_anexo (
    agendamento_id  bigint       primary key references agendamento (id),
    nome_original   varchar(200),   -- apenas informativo: nunca usar para gravar em disco
    content_type    varchar(80)  not null,
    tamanho_bytes   integer      not null check (tamanho_bytes > 0),
    conteudo        bytea        not null
);

-- ---------------------------------------------------------------------
-- Calendario: sem recebimento em feriados (dossie, secao 7)
-- ---------------------------------------------------------------------
create table feriado (
    data       date        primary key,
    descricao  varchar(80) not null
);

insert into feriado (data, descricao) values
    ('2026-10-12', 'Nossa Senhora Aparecida'),
    ('2026-11-02', 'Finados'),
    ('2026-11-15', 'Proclamação da República'),
    ('2026-11-20', 'Consciência Negra'),
    ('2026-12-25', 'Natal'),
    ('2027-01-01', 'Confraternização Universal');

-- ---------------------------------------------------------------------
-- Auditoria: nunca apagar eventos junto com o agendamento
-- ---------------------------------------------------------------------
alter table evento_agendamento
    drop constraint evento_agendamento_agendamento_id_fkey,
    add constraint evento_agendamento_agendamento_id_fkey
        foreign key (agendamento_id) references agendamento (id),
    add column tipo     varchar(20) not null default 'STATUS',
    add column detalhe  jsonb,   -- ex.: data/horario anteriores num reagendamento
    add constraint ck_evento_tipo
        check (tipo in ('STATUS', 'REAGENDAMENTO', 'DESTINO', 'VAGA')),
    add constraint ck_evento_de_status
        check (de_status is null or de_status in ('AGENDADO', 'VALIDADO_COMPRAS', 'AUTORIZADO', 'CHEGOU',
                                                  'EM_DESCARGA', 'CONCLUIDO', 'CANCELADO', 'NAO_RECEBIDO')),
    add constraint ck_evento_para_status
        check (para_status in ('AGENDADO', 'VALIDADO_COMPRAS', 'AUTORIZADO', 'CHEGOU',
                               'EM_DESCARGA', 'CONCLUIDO', 'CANCELADO', 'NAO_RECEBIDO'));

-- ---------------------------------------------------------------------
-- Descarga: ordem dos marcos e dados ao finalizar
-- ---------------------------------------------------------------------
alter table descarga
    add constraint ck_descarga_ordem
        check ((entrada_em is null or chegada_em is not null)
           and (saida_em   is null or entrada_em is not null)),
    -- ao finalizar, a quantidade de chapas daquela descarga e obrigatoria (0 = carga < 500 kg)
    add constraint ck_descarga_fim
        check (saida_em is null or qtd_chapas is not null);

comment on column descarga.qtd_chapas is
    'Chapas que atuaram NESTA descarga. Mede a intensidade da carga; NAO e somavel ao longo do dia '
    '(a mesma equipe atende varias descargas). O efetivo do dia vem do boletim.';

alter table descarga_equipamento
    add column quantidade smallint not null default 1 check (quantidade > 0);

-- ---------------------------------------------------------------------
-- Nao recebimento
-- ---------------------------------------------------------------------
alter table nao_recebimento
    add column fornecedor_nome varchar(200),   -- caminhao sem agendamento e sem cadastro
    add column criado_em       timestamptz not null default now(),
    add constraint ck_nao_recebimento_descricao
        check (descricao is null or btrim(descricao) <> '');

create unique index ux_nao_recebimento_agendamento
    on nao_recebimento (agendamento_id) where agendamento_id is not null;
create index ix_nao_recebimento_data on nao_recebimento (data);

-- ---------------------------------------------------------------------
-- Vaga liberada por cancelamento: quem a ocupa e decisao do responsavel
-- do armazem (regulamento, Tarefa 1). Enquanto ABERTA, o servico deve
-- contar esta vaga como ocupada (com o acondicionamento do cancelado)
-- para que nenhum novo agendamento a pegue sozinho.
-- ---------------------------------------------------------------------
create table vaga_liberada (
    id                        bigserial   primary key,
    data_vaga                 date        not null,
    horario                   time        not null
        check (horario in ('08:00', '10:00', '13:00', '15:00')),
    acondicionamento          varchar(12) not null
        check (acondicionamento in ('BATIDO', 'PALETIZADO', 'BIG_BAG')),
    origem_agendamento_id     bigint      not null references agendamento (id),
    status                    varchar(15) not null default 'ABERTA'
        check (status in ('ABERTA', 'ATRIBUIDA', 'LIBERADA_GERAL')),
    atribuida_a_agendamento_id bigint     references agendamento (id),
    decidido_em               timestamptz,
    criado_em                 timestamptz not null default now(),
    check ((status = 'ATRIBUIDA') = (atribuida_a_agendamento_id is not null))
);
create unique index ux_vaga_liberada_origem on vaga_liberada (origem_agendamento_id);
create index ix_vaga_liberada_slot on vaga_liberada (data_vaga, horario, status);

-- ---------------------------------------------------------------------
-- Acentuacao dos nomes semeados na V2 (aparecem no painel)
-- ---------------------------------------------------------------------
update armazem set nome = 'Pátio de Máquinas' where codigo = 'PATIO_MAQUINAS';

update grupo_produto set descricao = 'Máquinas e equipamentos'   where codigo = 'MAQ';
update grupo_produto set descricao = 'Agroquímicos e defensivos' where codigo = 'AGR';
update grupo_produto set descricao = 'Peças'                     where codigo = 'PEC';
update grupo_produto set descricao = 'Alimentação animal'        where codigo = 'ALI';
update grupo_produto set descricao = 'Acessórios'                where codigo = 'ACE';

update tipo_item set descricao = 'Peças'                    where codigo = 'PECAS';
update tipo_item set descricao = 'Máquinas / equipamentos'  where codigo = 'MAQUINAS';
update tipo_item set descricao = 'Agroquímico'              where codigo = 'AGROQUIMICO';
update tipo_item set descricao = 'Alimentação animal'       where codigo = 'ALIMENTACAO_ANIMAL';
update tipo_item set descricao = 'Acessórios agropecuários' where codigo = 'ACESSORIOS';
update tipo_item set descricao = 'Serviços diversos'        where codigo = 'SERVICOS_DIVERSOS';
