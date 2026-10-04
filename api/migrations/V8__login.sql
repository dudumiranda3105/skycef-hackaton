-- Login: usuários, perfis e sessões.
-- A senha nunca é guardada: só o hash PBKDF2-SHA256 com sal (formato pbkdf2$iterações$sal$hash).
-- O token da sessão vai só no cookie HttpOnly; aqui fica apenas o SHA-256 dele.

create table usuario (
    id                serial       primary key,
    login             varchar(40)  not null unique,
    nome              varchar(120) not null,
    papel             varchar(20)  not null
        check (papel in ('ADMIN', 'DIRETORIA', 'COMPRAS', 'ARMAZEM', 'ENCARREGADO', 'FORNECEDOR')),
    senha_hash        varchar(300) not null,
    ativo             boolean      not null default true,
    criado_em         timestamptz  not null default now(),
    ultimo_acesso_em  timestamptz
);

create table sessao (
    token_hash  varchar(64)  primary key,
    usuario_id  integer      not null references usuario (id) on delete cascade,
    criada_em   timestamptz  not null default now(),
    expira_em   timestamptz  not null
);
create index sessao_usuario_idx on sessao (usuario_id);
create index sessao_expira_idx on sessao (expira_em);
