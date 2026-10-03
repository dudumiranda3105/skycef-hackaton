-- Equipamentos de descarga por local (dossie, secao 6).
-- Uma linha por TIPO; `quantidade` e a capacidade instalada naquele local.
-- A descarga registra quantas unidades de cada tipo foram usadas (descarga_equipamento.quantidade).

-- Insumos (armazem 1)
insert into equipamento (armazem_id, tipo, quantidade, observacao) values
    (1, 'Empilhadeira a gás',             1, 'fixa'),
    (1, 'Empilhadeira elétrica / retrátil', 1, 'fixa'),
    (1, 'Transpaleteira elétrica',        2, 'fixas'),
    (1, 'Paleteira elétrica',             2, 'podem ir a outros armazéns conforme a demanda'),
    (1, 'Paleteira manual',               2, 'transitam entre armazéns'),
    (1, 'Carrinho de mão',                2, 'transitam entre armazéns');

-- Adubo (armazem 2)
insert into equipamento (armazem_id, tipo, quantidade, observacao) values
    (2, 'Empilhadeira a gás',             2, 'podem subir para auxiliar o Insumos'),
    (2, 'Paleteira manual',               1, 'fixa');

-- Pátio de Máquinas (armazem 3)
insert into equipamento (armazem_id, tipo, quantidade, observacao) values
    (3, 'Empilhadeira a gás',             1, 'lotada no centro de custo de Logística, dedicada à descarga de máquinas e implementos'),
    (3, 'Trator',                         4, null);

-- Loja (armazem 4): quantidade nao informada no dossie
insert into equipamento (armazem_id, tipo, quantidade, observacao) values
    (4, 'Carrinho de mão',             null, null);
