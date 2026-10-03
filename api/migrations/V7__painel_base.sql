-- Base da Tarefa 3 (painel gerencial)
--  * cadastro de chapas semeado: o seletor do boletim nao fica vazio num banco novo
--    (CHAPA_nn sao identificadores anonimizados da folha; o ETL `app.etl.chapas` continua valendo)
--  * mapa deposito -> armazem fisico (dossie, secao 5), usado para quebrar o historico por armazem
--  * colunas extras no historico de recebimentos (nome do fornecedor e data do documento)

insert into chapa (matricula, nome)
select 'CHAPA_' || lpad(n::text, 2, '0'), 'CHAPA_' || lpad(n::text, 2, '0')
from generate_series(1, 51) as n
on conflict (matricula) do nothing;

create table deposito_armazem (
    deposito    varchar(12) primary key,
    armazem_id  smallint    references armazem (id),   -- nulo = fora da quebra por armazem
    observacao  varchar(200)
);

insert into deposito_armazem (deposito, armazem_id, observacao) values
    ('MATFerti', 2, 'Fertilizantes -> Adubo'),
    ('MATFert2', 2, 'Fertilizantes (secundario) -> Adubo'),
    ('MATDefe',  1, 'Defensivos -> Insumos'),
    ('MATDef2',  1, 'Defensivos (secundario) -> Insumos'),
    ('MATGeral', 1, 'Geral: fica dentro da reparticao de Insumos'),
    ('MATGer2',  1, 'Geral (secundario) -> Insumos'),
    ('MATMaq',   3, 'Maquinas e equipamentos -> Patio de Maquinas'),
    ('MATLoja',  4, 'Loja'),
    -- depositos que aparecem no historico mas nao constam do dossie: ficam fora da quebra por armazem
    ('MATIndus', null, 'Fora do dossie (6 linhas no historico)'),
    ('MATTrans', null, 'Fora do dossie (2 linhas no historico)'),
    ('MATProp',  null, 'Fora do dossie (2 linhas no historico)'),
    ('MATDT',    null, 'Fora do dossie (1 linha no historico)'),
    -- nunca recebem mercadoria diretamente (dossie, secao 5)
    ('MATProv',  null, 'Provisionado: nao recebe mercadoria'),
    ('MATReser', null, 'Reserva: nao recebe mercadoria');

alter table hist_recebimento_item
    add column fornecedor_nome varchar(200),
    add column data_documento  date;

create index ix_hist_rec_deposito on hist_recebimento_item (deposito);
