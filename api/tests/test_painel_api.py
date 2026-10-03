"""Rotas do painel de ponta a ponta (FastAPI + PostgreSQL real)."""

from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.agendamento.domain import Acondicionamento
from app.core.db import get_session
from app.etl.chapas import carregar
from app.main import create_app
from tests.helpers_painel import descarga, dias_uteis, fornecedor, historico_dia, limpar_historico

SEG = date(2026, 10, 5)


@pytest.fixture
def cliente(db):
    with db() as s:
        s.execute(text("truncate boletim, nao_recebimento restart identity cascade"))
        carregar(s, ["CHAPA_01", "CHAPA_02"])
        limpar_historico(s)
        for dia in dias_uteis(2026, 3, 10):
            historico_dia(s, dia, 4, {"MATFerti": 10})
        for dia in dias_uteis(2026, 4, 10):
            historico_dia(s, dia, 4, {"MATFerti": 30})
        f = fornecedor(s, "Agro Alfa")
        descarga(s, f, SEG, time(8), Acondicionamento.BATIDO, 2, (7, 50), (8, 10), (8, 55), chapas=5)
    app = create_app()

    def _sessao():
        with db() as sessao:
            yield sessao

    app.dependency_overrides[get_session] = _sessao
    return TestClient(app)


def boletim(cliente, armazem=2, dia="2026-01-05", linhas=None, equipe=None):
    corpo = {
        "armazemId": armazem,
        "data": dia,
        "linhas": linhas or [{"tipoItem": "FERTILIZANTES", "descarga": 100}],
        "equipe": equipe or [{"matricula": "CHAPA_01", "tipoDiaria": "COMPLETA"}],
    }
    resposta = cliente.post("/api/boletins", json=corpo)
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def test_operacao_devolve_os_indicadores_da_plataforma(cliente):
    r = cliente.get("/api/painel/operacao")

    assert r.status_code == 200
    corpo = r.json()
    assert corpo["cargasRecebidas"]["total"] == 1
    assert corpo["tempoMedioEsperaMin"]["media"] == 20.0 and corpo["tempoMedioDescargaMin"]["media"] == 45.0
    assert corpo["origens"] == {"PLATAFORMA": 1}
    assert corpo["porArmazem"][0]["armazem"] == "Adubo"


def test_dinheiro_sai_como_texto_decimal_nunca_float(cliente):
    boletim(cliente, dia="2026-01-05")

    custo = cliente.get("/api/painel/operacao").json()["custoDaOperacao"]
    sobra = cliente.get("/api/painel/dimensionamento/plataforma").json()["total"]

    assert custo["totalAPagar"] == "90.1731"  # 100 × 0,3224 = 32,24 < piso: paga o piso de 1 diária
    assert custo["complemento"] == "57.9331"
    assert sobra["sobraReais"] == "57.9331" and isinstance(sobra["sobraReais"], str)


def test_dimensionamento_da_plataforma_com_agrupamento(cliente):
    boletim(cliente, dia="2026-01-05")
    boletim(cliente, dia="2026-02-02")

    r = cliente.get("/api/painel/dimensionamento/plataforma", params={"agrupar": "mes"}).json()

    assert r["agrupadoPor"] == "mes" and r["piso"] == "90.1731"
    assert [p["periodo"] for p in r["porPeriodo"]] == ["2026-01", "2026-02"]
    assert r["porArmazem"][0]["situacao"] == "SOBRA"
    assert r["total"]["boletins"] == 2


def test_dimensionamento_do_historico(cliente):
    r = cliente.get("/api/painel/dimensionamento/historico")

    assert r.status_code == 200
    corpo = r.json()
    assert corpo["origem"] == "HISTORICO"
    assert [m["situacao"] for m in corpo["meses"]] == ["SOBRA", "FALTA"]
    assert corpo["totais"]["sobraReais"] == "1803.4620"
    assert corpo["totais"]["saldoReais"] == "0.0000"
    assert corpo["limitacoes"], "as limitações precisam acompanhar o resultado"


def test_historico_aceita_recorte_de_periodo(cliente):
    r = cliente.get("/api/painel/dimensionamento/historico", params={"de": "2026-04-01"}).json()

    assert [m["mes"] for m in r["meses"]] == ["2026-04"]
    assert r["equilibrio"]["pessoaMinutosPorChapaDia"] == 1125.0


def test_filtros_de_armazem_periodo_e_origem(cliente):
    assert (
        cliente.get("/api/painel/operacao", params={"armazemId": 1}).json()["cargasRecebidas"]["total"] == 0
    )
    assert (
        cliente.get("/api/painel/operacao", params={"de": "2026-10-06"}).json()["cargasRecebidas"]["total"]
        == 0
    )
    assert (
        cliente.get("/api/painel/operacao", params={"origem": "TESTE"}).json()["cargasRecebidas"]["total"]
        == 0
    )
    assert (
        cliente.get("/api/painel/operacao", params={"origem": "PLATAFORMA"}).json()["cargasRecebidas"][
            "total"
        ]
        == 1
    )


@pytest.mark.parametrize(
    ("rota", "params"),
    [
        ("/api/painel/operacao", {"origem": "INVENTADA"}),
        ("/api/painel/operacao", {"de": "ontem"}),
        ("/api/painel/dimensionamento/plataforma", {"agrupar": "ano"}),
        ("/api/painel/dimensionamento/historico", {"ate": "31-12-2026"}),
    ],
)
def test_parametros_invalidos_devolvem_400(cliente, rota, params):
    r = cliente.get(rota, params=params)

    assert r.status_code == 400
    assert r.json()["codigo"] == "REQUISICAO_INVALIDA"


def test_pagina_do_painel_e_servida_sem_depender_de_cdn(cliente):
    r = cliente.get("/painel")

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "Painel gerencial" in r.text
    assert "https://" not in r.text.replace("http://www.w3.org", ""), "a página deve funcionar offline"


def test_indicadores_do_historico_pela_api(cliente):
    r = cliente.get("/api/painel/historico/indicadores", params={"de": "2026-04-01"})

    assert r.status_code == 200
    corpo = r.json()
    assert corpo["fornecedoresMaiorVolume"] == [{"fornecedor": "ACME", "recebimentos": 300}]
    assert corpo["porAnoEArmazem"][0]["armazem"] == "Adubo"
