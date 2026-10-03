-- =====================================================================
-- V6: marcos da descarga (chegada, entrada, saida) e fluxos da Tarefa 1
--
-- A chegada do caminhao ao portao acontece ANTES de Compras autorizar e de o armazem
-- definir os destinos (caminhao sem aviso previo; dossie, secao 4). Como a Descarga so
-- existe depois dos destinos, a chegada fica no agendamento e e copiada para cada
-- descarga (nova ou existente). Assim o tempo de espera (entrada - chegada) nao e
-- subestimado.
-- =====================================================================

alter table agendamento add column chegada_em timestamptz;

comment on column agendamento.chegada_em is
    'Instante em que o caminhao encostou e entrou na fila. Copiado para as descargas (chegada_em).';

-- novos tipos na trilha de auditoria
alter table evento_agendamento
    drop constraint ck_evento_tipo,
    add constraint ck_evento_tipo
        check (tipo in ('STATUS', 'REAGENDAMENTO', 'DESTINO', 'VAGA', 'MARCO', 'CANCELAMENTO'));
