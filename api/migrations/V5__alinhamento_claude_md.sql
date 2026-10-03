-- =====================================================================
-- V5: alinha o modelo ao Contexto.md (secao 6, "17 entidades")
--
--  * varias NFs por agendamento           -> nota_fiscal
--  * decisao de Compras                   -> validacao_compras (AUTORIZADO | NAO_AUTORIZADO)
--  * uma descarga por armazem de destino  -> descarga (substitui agendamento_destino)
--  * equipamentos individuais             -> equipamento.identificacao (ex.: INS-EMPG-01)
--  * historico de reagendamento           -> reagendamento
--  * cancelamento (solicitacao/efetivacao)-> cancelamento
--  * feriado                              -> data_nao_operacional
--  * origem SIMULADO                      -> TESTE
--  * boletim: tipo de diaria e situacao INCONSISTENTE (sem equipe)
--
-- Os dados das tabelas alteradas sao migrados; as tabelas que sao recriadas
-- (descarga, descarga_equipamento) precisam estar vazias, senao a migration aborta.
-- =====================================================================

do $$
begin
    if exists (select 1 from descarga) or exists (select 1 from descarga_equipamento) then
        raise exception 'V5: descarga/descarga_equipamento contem dados; migre-os manualmente antes';
    end if;
end $$;

-- ---------------------------------------------------------------------
-- Origem do dado: SIMULADO -> TESTE
-- ---------------------------------------------------------------------
-- a constraint antiga so aceita SIMULADO: solta, atualiza os dados e recria
alter table agendamento     drop constraint agendamento_origem_check;
alter table nao_recebimento drop constraint nao_recebimento_origem_check;
alter table boletim         drop constraint boletim_origem_check;

update agendamento     set origem = 'TESTE' where origem = 'SIMULADO';
update nao_recebimento set origem = 'TESTE' where origem = 'SIMULADO';
update boletim         set origem = 'TESTE' where origem = 'SIMULADO';

alter table agendamento
    add constraint agendamento_origem_check check (origem in ('PLATAFORMA', 'TESTE', 'HISTORICO'));
alter table nao_recebimento
    add constraint nao_recebimento_origem_check check (origem in ('PLATAFORMA', 'TESTE', 'HISTORICO'));
alter table boletim
    add constraint boletim_origem_check check (origem in ('PLATAFORMA', 'TESTE', 'HISTORICO'));

-- ---------------------------------------------------------------------
-- Dias sem operacao
-- ---------------------------------------------------------------------
alter table feriado rename to data_nao_operacional;
alter index feriado_pkey rename to data_nao_operacional_pkey;

-- ---------------------------------------------------------------------
-- Notas fiscais: 1 ou mais por agendamento
-- ---------------------------------------------------------------------
create table nota_fiscal (
    id              bigserial     primary key,
    agendamento_id  bigint        not null references agendamento (id),
    nf_numero       varchar(20),
    nf_chave        varchar(44)
        check (nf_chave is null or nf_chave ~ '^[0-9]{44}$'),
    peso_total_kg   numeric(14,3)
        check (peso_total_kg is null or peso_total_kg >= 0),
    arquivo_nome    varchar(200),   -- apenas informativo: nunca usar para gravar em disco
    content_type    varchar(80),
    tamanho_bytes   integer
        check (tamanho_bytes is null or tamanho_bytes > 0),
    conteudo        bytea,          -- o arquivo anexado (XML ou PDF)
    ativa           boolean       not null default true,   -- false quando o agendamento libera a vaga
    criado_em       timestamptz   not null default now()
);
create index ix_nota_fiscal_agendamento on nota_fiscal (agendamento_id);

-- A mesma NF-e nao pode estar ativa em dois agendamentos (protege contra duplo clique).
create unique index ux_nota_fiscal_chave_ativa
    on nota_fiscal (nf_chave) where nf_chave is not null and ativa;

insert into nota_fiscal (agendamento_id, nf_numero, nf_chave, peso_total_kg, ativa, criado_em)
select a.id, a.nf_numero, a.nf_chave, a.peso_total_kg,
       a.status not in ('CANCELADO', 'NAO_RECEBIDO'), a.criado_em
from agendamento a
where a.nf_numero is not null or a.nf_chave is not null or a.peso_total_kg is not null
   or exists (select 1 from agendamento_anexo x where x.agendamento_id = a.id);

update nota_fiscal n
   set arquivo_nome = x.nome_original, content_type = x.content_type,
       tamanho_bytes = x.tamanho_bytes, conteudo = x.conteudo
  from agendamento_anexo x
 where x.agendamento_id = n.agendamento_id;

drop index ux_agendamento_nf_ativa;
alter table agendamento drop constraint ck_agendamento_nf_chave;
drop table agendamento_anexo;

-- ---------------------------------------------------------------------
-- Decisao de Compras
-- ---------------------------------------------------------------------
create table validacao_compras (
    agendamento_id     bigint       primary key references agendamento (id),
    decisao            varchar(15)  not null
        check (decisao in ('AUTORIZADO', 'NAO_AUTORIZADO')),
    pedido_referencia  varchar(20),
    observacao         varchar(250),
    decidido_em        timestamptz  not null default now(),
    check (decisao <> 'AUTORIZADO' or pedido_referencia is not null),
    check (decisao <> 'NAO_AUTORIZADO' or observacao is not null)
);

insert into validacao_compras (agendamento_id, decisao, pedido_referencia, decidido_em)
select id, 'AUTORIZADO', pedido_compra, coalesce(compras_em, criado_em)
from agendamento
where pedido_compra is not null
  and status in ('VALIDADO_COMPRAS', 'AUTORIZADO', 'CHEGOU', 'EM_DESCARGA', 'CONCLUIDO');

-- ---------------------------------------------------------------------
-- Status do agendamento (decisao tecnica nossa, nao regra da Cocapec):
-- PENDENTE_COMPRAS, AUTORIZADO, NAO_AUTORIZADO, EM_DESCARGA, CONCLUIDO, CANCELADO, NAO_RECEBIDO
-- A chegada passa a ser um marco da descarga, nao um status do agendamento.
-- ---------------------------------------------------------------------
alter table agendamento
    drop constraint agendamento_status_check,
    drop constraint ck_agendamento_pedido;

update agendamento set status = case status
    when 'AGENDADO'         then 'PENDENTE_COMPRAS'
    when 'VALIDADO_COMPRAS' then 'AUTORIZADO'
    when 'CHEGOU'           then 'AUTORIZADO'
    else status end;

alter table agendamento
    add constraint agendamento_status_check
        check (status in ('PENDENTE_COMPRAS', 'AUTORIZADO', 'NAO_AUTORIZADO', 'EM_DESCARGA',
                          'CONCLUIDO', 'CANCELADO', 'NAO_RECEBIDO'));

alter table evento_agendamento
    drop constraint ck_evento_de_status,
    drop constraint ck_evento_para_status;

update evento_agendamento set de_status = case de_status
    when 'AGENDADO'         then 'PENDENTE_COMPRAS'
    when 'VALIDADO_COMPRAS' then 'AUTORIZADO'
    when 'CHEGOU'           then 'AUTORIZADO'
    else de_status end
where de_status is not null;

update evento_agendamento set para_status = case para_status
    when 'AGENDADO'         then 'PENDENTE_COMPRAS'
    when 'VALIDADO_COMPRAS' then 'AUTORIZADO'
    when 'CHEGOU'           then 'AUTORIZADO'
    else para_status end;

alter table evento_agendamento
    add constraint ck_evento_de_status
        check (de_status is null or de_status in ('PENDENTE_COMPRAS', 'AUTORIZADO', 'NAO_AUTORIZADO',
                                                  'EM_DESCARGA', 'CONCLUIDO', 'CANCELADO', 'NAO_RECEBIDO')),
    add constraint ck_evento_para_status
        check (para_status in ('PENDENTE_COMPRAS', 'AUTORIZADO', 'NAO_AUTORIZADO', 'EM_DESCARGA',
                               'CONCLUIDO', 'CANCELADO', 'NAO_RECEBIDO'));

-- ---------------------------------------------------------------------
-- Cancelamento: solicitacao -> efetivacao
-- ---------------------------------------------------------------------
create table cancelamento (
    agendamento_id  bigint        primary key references agendamento (id),
    motivo          varchar(300)  not null,
    situacao        varchar(12)   not null default 'SOLICITADO'
        check (situacao in ('SOLICITADO', 'EFETIVADO')),
    solicitado_em   timestamptz   not null default now(),
    efetivado_em    timestamptz,
    check ((situacao = 'EFETIVADO') = (efetivado_em is not null))
);

insert into cancelamento (agendamento_id, motivo, situacao, solicitado_em, efetivado_em)
select id, coalesce(motivo_cancelamento, 'Não informado'), 'EFETIVADO', criado_em, criado_em
from agendamento
where status = 'CANCELADO';

-- ---------------------------------------------------------------------
-- Reagendamento (por caso fortuito pode exceder a capacidade do horario)
-- ---------------------------------------------------------------------
create table reagendamento (
    id                bigserial    primary key,
    agendamento_id    bigint       not null references agendamento (id),
    data_anterior     date         not null,
    horario_anterior  time         not null,
    data_nova         date         not null,
    horario_novo      time         not null
        check (horario_novo in ('08:00', '10:00', '13:00', '15:00')),
    motivo            varchar(300) not null,
    limite_excedido   boolean      not null default false,
    criado_em         timestamptz  not null default now()
);
create index ix_reagendamento_agendamento on reagendamento (agendamento_id);

-- ---------------------------------------------------------------------
-- Equipamentos individuais (Contexto.md, secao 4). Nao ha numero patrimonial
-- oficial: as identificacoes sao geradas por nos.
-- ---------------------------------------------------------------------
drop table descarga_equipamento;
drop table descarga;

delete from equipamento;   -- tipos antigos, sem referencias (descarga_equipamento acabou de ser removida)
alter table equipamento
    drop column quantidade,
    add column identificacao varchar(20);
alter table equipamento
    alter column identificacao set not null,
    add constraint uq_equipamento_identificacao unique (identificacao);

insert into equipamento (armazem_id, identificacao, tipo, observacao) values
    -- Insumos
    (1, 'INS-EMPG-01', 'Empilhadeira a gás',              'fixa'),
    (1, 'INS-EMPE-01', 'Empilhadeira elétrica / retrátil', 'fixa'),
    (1, 'INS-TRAE-01', 'Transpaleteira elétrica',         'fixa'),
    (1, 'INS-TRAE-02', 'Transpaleteira elétrica',         'fixa'),
    (1, 'INS-PALE-01', 'Paleteira elétrica',              'pode ir a outros armazéns conforme a demanda'),
    (1, 'INS-PALE-02', 'Paleteira elétrica',              'pode ir a outros armazéns conforme a demanda'),
    (1, 'INS-PALM-01', 'Paleteira manual',                'transita entre armazéns'),
    (1, 'INS-PALM-02', 'Paleteira manual',                'transita entre armazéns'),
    (1, 'INS-CARM-01', 'Carrinho de mão',                 'transita entre armazéns'),
    (1, 'INS-CARM-02', 'Carrinho de mão',                 'transita entre armazéns'),
    -- Adubo
    (2, 'ADU-EMPG-01', 'Empilhadeira a gás',              'pode subir para auxiliar o Insumos'),
    (2, 'ADU-EMPG-02', 'Empilhadeira a gás',              'pode subir para auxiliar o Insumos'),
    (2, 'ADU-PALM-01', 'Paleteira manual',                'fixa'),
    -- Pátio de Máquinas
    (3, 'PAT-EMPG-01', 'Empilhadeira a gás',              'lotada no centro de custo de Logística, dedicada à descarga de máquinas e implementos'),
    (3, 'PAT-TRAT-01', 'Trator',                          null),
    (3, 'PAT-TRAT-02', 'Trator',                          null),
    (3, 'PAT-TRAT-03', 'Trator',                          null),
    (3, 'PAT-TRAT-04', 'Trator',                          null),
    -- Loja: a Cocapec não informou a quantidade; 1 unidade provisória
    (4, 'LOJ-CARM-01', 'Carrinho de mão',                 'quantidade não informada pela Cocapec; unidade provisória');

-- ---------------------------------------------------------------------
-- Descarga: UMA POR ARMAZEM DE DESTINO (substitui agendamento_destino).
-- quantidade_chapas e por descarga e NAO e somavel ao longo do dia (a mesma equipe
-- atende varias descargas); o efetivo do dia vem do boletim.
-- ---------------------------------------------------------------------
create table descarga (
    id                 bigserial    primary key,
    agendamento_id     bigint       not null references agendamento (id),
    armazem_id         smallint     not null references armazem (id),
    chegada_em         timestamptz,
    entrada_em         timestamptz,
    saida_em           timestamptz,
    quantidade_chapas  smallint     check (quantidade_chapas >= 0),
    criado_em          timestamptz  not null default now(),
    unique (agendamento_id, armazem_id),
    check (entrada_em is null or chegada_em is not null),
    check (saida_em   is null or entrada_em is not null),
    check (entrada_em is null or entrada_em >= chegada_em),
    check (saida_em   is null or saida_em   >= entrada_em),
    -- ao finalizar, a quantidade de chapas daquela descarga e obrigatoria (0 = carga < 500 kg)
    check (saida_em   is null or quantidade_chapas is not null)
);
create index ix_descarga_agendamento on descarga (agendamento_id);
create index ix_descarga_armazem_chegada on descarga (armazem_id, chegada_em);

comment on column descarga.quantidade_chapas is
    'Chapas que atuaram NESTA descarga. Mede a intensidade da carga; NAO e somavel ao longo do dia.';

insert into descarga (agendamento_id, armazem_id)
select agendamento_id, armazem_id from agendamento_destino;

drop table agendamento_destino;

create table descarga_equipamento (
    descarga_id     bigint   not null references descarga (id),
    equipamento_id  smallint not null references equipamento (id),
    primary key (descarga_id, equipamento_id)
);

-- ---------------------------------------------------------------------
-- Agendamento: sai o que migrou para tabelas proprias
-- ---------------------------------------------------------------------
alter table agendamento
    drop column nf_numero,
    drop column nf_chave,
    drop column peso_total_kg,
    drop column pedido_compra,
    drop column compras_em,
    drop column autorizado_em,
    drop column motivo_cancelamento;

-- Nao recebimento e 1:N com o agendamento (Contexto.md, DQ-017)
drop index ux_nao_recebimento_agendamento;

-- ---------------------------------------------------------------------
-- Boletim: tipo de diaria e situacao INCONSISTENTE (diarias equivalentes = 0)
-- ---------------------------------------------------------------------
alter table boletim_equipe add column tipo_diaria varchar(8);
update boletim_equipe set tipo_diaria = case when meia_diaria then 'MEIA' else 'COMPLETA' end;
alter table boletim_equipe
    alter column tipo_diaria set not null,
    add constraint ck_boletim_equipe_tipo_diaria check (tipo_diaria in ('COMPLETA', 'MEIA')),
    drop column meia_diaria;

alter table boletim
    add column situacao varchar(14) not null default 'CONSISTENTE'
        check (situacao in ('CONSISTENTE', 'INCONSISTENTE')),
    alter column valor_por_diaria drop not null,
    alter column total_a_pagar    drop not null,
    alter column complemento      drop not null;
-- sem equipe nao ha divisao: o boletim fica pendente de conferencia e sem valores calculados
alter table boletim
    add constraint ck_boletim_situacao check ((situacao = 'CONSISTENTE') = (total_a_pagar is not null));
