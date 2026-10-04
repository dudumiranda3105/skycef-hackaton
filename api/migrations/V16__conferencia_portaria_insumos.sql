alter table agendamento add column placa_veiculo varchar(7);
-- Agendamentos anteriores à implantação preservam o fluxo operacional já iniciado.
alter table agendamento add column exige_conferencia_portaria boolean not null default false;

create table portaria_recebimento (
    agendamento_id bigint primary key references agendamento(id),
    situacao varchar(30) not null check (situacao in ('AGUARDANDO_DOCUMENTOS','PENDENTE_INSUMOS','DIRECIONADO','RECUSADO')),
    placa varchar(7) not null,
    conferido_em timestamptz not null,
    enviado_em timestamptz,
    decidido_em timestamptz,
    conferido_por_usuario_id bigint not null references usuario(id),
    decidido_por_usuario_id bigint references usuario(id),
    observacao varchar(300),
    check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$')
);
create index idx_portaria_situacao on portaria_recebimento(situacao, enviado_em);

alter table evento_agendamento
    drop constraint ck_evento_tipo,
    add constraint ck_evento_tipo check (tipo in (
        'STATUS', 'REAGENDAMENTO', 'DESTINO', 'VAGA', 'MARCO', 'CANCELAMENTO',
        'PORTARIA_CONFERENCIA', 'PORTARIA_ENVIO', 'INSUMOS_DECISAO'
    ));
