"""A V5 realinha o modelo ao CLAUDE.md e precisa MIGRAR os dados existentes, não só a estrutura.

O teste monta um schema com as migrations V1-V4, insere dados no formato antigo, aplica a V5
e confere o resultado.
"""

import uuid
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from app.core.migrate import PASTA


def _sql(versao: int) -> str:
    return next(Path(PASTA).glob(f"V{versao}__*.sql")).read_text(encoding="utf-8")


@pytest.fixture
def conexao(banco):
    dsn, _ = banco
    schema = f"t_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(dsn, autocommit=True) as c:
        c.execute(f'create schema "{schema}"')
    with psycopg.connect(dsn, options=f"-csearch_path={schema}") as conn:
        yield conn
    with psycopg.connect(dsn, autocommit=True) as c:
        c.execute(f'drop schema "{schema}" cascade')


@pytest.fixture
def antes_da_v5(conexao):
    """Banco na V4 com dados no formato antigo."""
    for versao in (1, 2, 3, 4):
        conexao.execute(_sql(versao))
    conexao.execute("insert into fornecedor (razao_social, cnpj) values ('Agro Teste', '00000000000191')")
    conexao.execute(
        """insert into agendamento (fornecedor_id, data_agendada, horario, acondicionamento, status,
                                    nf_numero, nf_chave, peso_total_kg, pedido_compra, origem, compras_em)
           values (1, '2026-10-06', '08:00', 'PALETIZADO', 'VALIDADO_COMPRAS',
                   '10', %s, 1500.5, '4500123', 'SIMULADO', now())""",
        ("1" * 44,),
    )
    conexao.execute(
        """insert into agendamento (fornecedor_id, data_agendada, horario, acondicionamento, status,
                                    nf_chave, motivo_cancelamento)
           values (1, '2026-10-06', '10:00', 'BIG_BAG', 'CANCELADO', %s, 'chuva forte')""",
        ("2" * 44,),
    )
    conexao.execute(
        """insert into agendamento (fornecedor_id, data_agendada, horario, acondicionamento, status)
           values (1, '2026-10-07', '13:00', 'BATIDO', 'AGENDADO')"""
    )
    conexao.execute(
        """insert into agendamento_anexo
               (agendamento_id, nome_original, content_type, tamanho_bytes, conteudo)
           values (3, 'nota.xml', 'application/xml', 3, '\\x616263')"""
    )
    conexao.execute("insert into agendamento_destino values (1, 1), (1, 2)")
    conexao.execute(
        "insert into evento_agendamento (agendamento_id, de_status, para_status) "
        "values (1, 'AGENDADO', 'VALIDADO_COMPRAS')"
    )
    conexao.execute("insert into chapa (matricula) values ('CHAPA_01'), ('CHAPA_02')")
    conexao.execute(
        """insert into boletim (armazem_id, data, producao_total, diarias_equivalentes,
                                valor_por_diaria, total_a_pagar, complemento, origem)
           values (2, '2025-11-17', 918.1952, 11, 83.4723, 991.9041, 73.7089, 'SIMULADO')"""
    )
    conexao.execute("insert into boletim_equipe values (1, 'CHAPA_01', false), (1, 'CHAPA_02', true)")
    return conexao


def _todas(conn, sql, *params):
    return conn.execute(sql, params).fetchall()


def test_v5_migra_os_dados_do_formato_antigo(antes_da_v5):
    conn = antes_da_v5
    conn.execute(_sql(5))

    assert _todas(conn, "select id, status, origem from agendamento order by id") == [
        (1, "AUTORIZADO", "TESTE"),
        (2, "CANCELADO", "PLATAFORMA"),
        (3, "PENDENTE_COMPRAS", "PLATAFORMA"),
    ]
    assert _todas(conn, "select de_status, para_status from evento_agendamento") == [
        ("PENDENTE_COMPRAS", "AUTORIZADO")
    ]

    notas = _todas(
        conn,
        "select agendamento_id, nf_numero, nf_chave, ativa, arquivo_nome, tamanho_bytes "
        "from nota_fiscal order by agendamento_id",
    )
    assert notas == [
        (1, "10", "1" * 44, True, None, None),
        (2, None, "2" * 44, False, None, None),  # agendamento cancelado: NF liberada
        (3, None, None, True, "nota.xml", 3),  # só tinha o anexo
    ]

    assert _todas(conn, "select agendamento_id, decisao, pedido_referencia from validacao_compras") == [
        (1, "AUTORIZADO", "4500123")
    ]
    assert _todas(conn, "select agendamento_id, armazem_id from descarga order by armazem_id") == [
        (1, 1),
        (1, 2),
    ]
    assert _todas(conn, "select agendamento_id, motivo, situacao from cancelamento") == [
        (2, "chuva forte", "EFETIVADO")
    ]
    assert _todas(conn, "select matricula, tipo_diaria from boletim_equipe order by 1") == [
        ("CHAPA_01", "COMPLETA"),
        ("CHAPA_02", "MEIA"),
    ]
    assert _todas(conn, "select situacao, total_a_pagar, origem from boletim") == [
        ("CONSISTENTE", Decimal("991.9041"), "TESTE")
    ]


def test_v5_remove_as_colunas_migradas_e_cria_os_equipamentos_individuais(antes_da_v5):
    conn = antes_da_v5
    conn.execute(_sql(5))

    colunas = {
        r[0]
        for r in _todas(
            conn,
            "select column_name from information_schema.columns "
            "where table_schema = current_schema() and table_name = 'agendamento'",
        )
    }
    assert colunas.isdisjoint({"nf_numero", "nf_chave", "peso_total_kg", "pedido_compra", "compras_em"})
    total, distintos = conn.execute(
        "select count(*), count(distinct identificacao) from equipamento"
    ).fetchone()
    assert total == distintos == 19
    assert conn.execute("select count(*) from data_nao_operacional").fetchone()[0] >= 6


@pytest.mark.parametrize(
    "descricao,sql",
    [
        ("NF ativa duplicada", "insert into nota_fiscal (agendamento_id, nf_chave) values (3, '{ch}')"),
        (
            "saída sem entrada",
            "insert into descarga (agendamento_id, armazem_id, saida_em, quantidade_chapas) "
            "values (3, 3, now(), 1)",
        ),
        ("status do modelo antigo", "update agendamento set status = 'CHEGOU' where id = 1"),
        ("origem SIMULADO", "update agendamento set origem = 'SIMULADO' where id = 1"),
        (
            "boletim consistente sem total",
            "insert into boletim (armazem_id, data, producao_total, diarias_equivalentes) "
            "values (1, '2025-11-18', 1, 0)",
        ),
        (
            "compras autoriza sem pedido",
            "insert into validacao_compras (agendamento_id, decisao) values (3, 'AUTORIZADO')",
        ),
        (
            "compras recusa sem motivo",
            "insert into validacao_compras (agendamento_id, decisao) values (3, 'NAO_AUTORIZADO')",
        ),
    ],
)
def test_v5_constraints_novas_rejeitam_dados_invalidos(antes_da_v5, descricao, sql):
    conn = antes_da_v5
    conn.execute(_sql(5))

    with pytest.raises((psycopg.errors.CheckViolation, psycopg.errors.UniqueViolation)):
        with conn.transaction():
            conn.execute(sql.format(ch="1" * 44))


def test_v5_aborta_se_descarga_tiver_dados(antes_da_v5):
    conn = antes_da_v5
    conn.execute("insert into descarga (agendamento_id, qtd_chapas) values (1, 2)")

    with pytest.raises(psycopg.errors.RaiseException, match="descarga"):
        with conn.transaction():
            conn.execute(_sql(5))
