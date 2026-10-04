alter table usuario drop constraint if exists usuario_papel_check;
alter table usuario add constraint usuario_papel_check
    check (papel in ('ADMIN', 'DIRETORIA', 'COMPRAS', 'ARMAZEM', 'ENCARREGADO', 'FORNECEDOR', 'INSUMO', 'PORTEIRO'));
