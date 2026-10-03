-- Dados fixos definidos no dossie (secoes 5 e 8)

insert into armazem (id, codigo, nome) values
    (1, 'INSUMOS',        'Insumos'),
    (2, 'ADUBO',          'Adubo'),
    (3, 'PATIO_MAQUINAS', 'Patio de Maquinas'),
    (4, 'LOJA',           'Loja');

insert into grupo_produto (codigo, descricao, armazem_id) values
    ('FER', 'Fertilizantes',                  2),
    ('MAQ', 'Maquinas e equipamentos',        3),
    ('AGR', 'Agroquimicos e defensivos',      1),
    ('PEC', 'Pecas',                          4),
    ('ALI', 'Alimentacao animal',             4),
    ('MED', 'Medicamentos',                   4),
    ('ACE', 'Acessorios',                     4);

-- 14 tipos de item do boletim e seus precos unitarios
insert into tipo_item (codigo, descricao, preco_unitario) values
    ('SACARIA_MALAS_25',  'Sacaria malas c/ 25',   0.1824),
    ('SACARIA_MALAS_40',  'Sacaria malas c/ 40',   0.2635),
    ('SACARIA_MALAS_50',  'Sacaria malas c/ 50',   0.3224),
    ('SACARIA_FARDO_250', 'Sacaria fardo c/ 250',  1.1780),
    ('SACARIA_FARDO_500', 'Sacaria fardo c/ 500',  2.3561),
    ('PECAS',             'Pecas',                 0.3387),
    ('MAQUINAS',          'Maquinas / equipamentos', 0.3224),
    ('AGROQUIMICO',       'Agroquimico',           0.3224),
    ('FERTILIZANTES',     'Fertilizantes',         0.3224),
    ('SEMENTES',          'Sementes',              0.3224),
    ('MEDICAMENTOS',      'Medicamentos',          0.3387),
    ('ALIMENTACAO_ANIMAL','Alimentacao animal',    0.3387),
    ('ACESSORIOS',        'Acessorios agropecuarios', 0.3224),
    ('SERVICOS_DIVERSOS', 'Servicos diversos',     0.3224);

-- Piso do boletim: e ESTE valor que forma o custo da operacao (nao R$ 180, nao R$ 99-113)
insert into parametro (chave, valor) values
    ('DIARIA_COMPLETA', 90.1731),
    ('MEIA_DIARIA',     45.0786);
