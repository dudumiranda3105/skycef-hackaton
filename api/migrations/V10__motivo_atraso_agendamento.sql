alter table nao_recebimento drop constraint if exists nao_recebimento_motivo_check;
alter table nao_recebimento add constraint nao_recebimento_motivo_check
    check (motivo in ('DIVERGENCIA_NF_PEDIDO', 'SEM_AGENDAMENTO_SEM_VAGA', 'CASO_FORTUITO', 'OUTRO', 'ATRASO_AGENDAMENTO'));
