"""O seed de demonstração precisa continuar contando a história que o painel mostra na apresentação."""

import pytest
from sqlalchemy import text

from app.etl.chapas import carregar
from app.painel import plataforma
from app.painel.plataforma import Filtro
from app.seed.demo import semear

ADUBO = 2


@pytest.fixture(scope="module")
def semeado(sessionmaker_teste):
    with sessionmaker_teste() as s:
        s.execute(text("truncate nao_recebimento restart identity"))
        # outro teste (test_etl_chapas) esvazia a tabela; o seed precisa dos chapas da V7
        carregar(s, [f"CHAPA_{n:02d}" for n in range(1, 52)])
        resumo = semear(s, recriar=True)
    return sessionmaker_teste, resumo


def test_gera_agendamentos_descargas_nao_recebimentos_e_um_boletim_por_armazem_por_dia(semeado):
    _, resumo = semeado

    assert resumo["boletins"] == 60  # 15 dias úteis × 4 armazéns
    assert resumo["agendamentos"] > 60 and resumo["descargas"] >= resumo["agendamentos"] - 10
    assert resumo["naoRecebimentos"] > 0


def test_tudo_o_que_o_seed_cria_e_marcado_como_teste(semeado):
    fabrica, _ = semeado
    with fabrica() as s:
        origens = {
            tabela: s.execute(text(f"select distinct origem from {tabela}")).scalars().all()
            for tabela in ("agendamento", "nao_recebimento", "boletim")
        }

    assert origens == {"agendamento": ["TESTE"], "nao_recebimento": ["TESTE"], "boletim": ["TESTE"]}


def test_o_roteiro_mostra_sobra_equilibrio_e_falta_no_adubo(semeado):
    fabrica, _ = semeado
    with fabrica() as s:
        d = plataforma.dimensionamento_plataforma(s, Filtro(armazem_id=ADUBO), "semana")

    situacoes = [p["situacao"] for p in d["porPeriodo"]]
    assert situacoes[0] == "SOBRA" and situacoes[-1] == "FALTA"


def test_a_espera_nasce_da_fila_e_a_descarga_segue_as_estimativas_do_dossie(semeado):
    fabrica, _ = semeado
    with fabrica() as s:
        i = plataforma.indicadores_operacionais(s, Filtro())

    assert 0 < i["tempoMedioEsperaMin"]["media"] < 30
    assert 15 <= i["tempoMedioDescargaMin"]["media"] <= 45
    assert i["origens"] == {"TESTE": i["cargasRecebidas"]["total"]}


def test_nao_roda_em_banco_com_dados_sem_pedir_para_recriar(semeado):
    fabrica, _ = semeado
    with fabrica() as s, pytest.raises(SystemExit, match="--recriar"):
        semear(s, recriar=False)
