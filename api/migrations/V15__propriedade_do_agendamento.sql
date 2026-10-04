-- Associa novas reservas ao usuário que as criou, para o perfil FORNECEDOR
-- consultar e alterar somente sua própria carteira.
alter table agendamento add column solicitado_por_usuario_id bigint references usuario (id);
create index ix_agendamento_solicitado_por_usuario on agendamento (solicitado_por_usuario_id, data_agendada, horario);
