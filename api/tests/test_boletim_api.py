"""Endpoints do boletim, de ponta a ponta (FastAPI + PostgreSQL real)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.clock import get_relogio
from app.core.db import get_session
from app.etl.chapas import carregar
from app.main import create_app

ADUBO, INSUMOS = 2, 1
DIA = "2025-11-17"
MATRICULAS = [f"CHAPA_{n:02d}" for n in range(1, 31)]
LINHAS_EXEMPLO = [
    {"tipoItem": "FERTILIZANTES", "descarga": 2378, "remocao": 400},
    {"tipoItem": "AGROQUIMICO", "descarga": 30},
    {"tipoItem": "SERVICOS_DIVERSOS", "remocao": 40},
]


@pytest.fixture
def cliente(db, relogio):
    with db() as s:
        s.execute(text("truncate boletim restart identity cascade"))
        carregar(s, MATRICULAS)
    app = create_app()

    def _sessao():
        with db() as sessao:
            yield sessao

    app.dependency_overrides[get_session] = _sessao
    app.dependency_overrides[get_relogio] = lambda: relogio
    return TestClient(app)  # sem `with`: não dispara o lifespan (migrations)


def corpo(armazem=ADUBO, data=DIA, completas=11, meias=0, linhas=None, **extra):
    equipe = [{"matricula": m, "tipoDiaria": "COMPLETA"} for m in MATRICULAS[:completas]]
    equipe += [{"matricula": m, "tipoDiaria": "MEIA"} for m in MATRICULAS[completas : completas + meias]]
    return {
        "armazemId": armazem,
        "data": data,
        "linhas": LINHAS_EXEMPLO if linhas is None else linhas,
        "equipe": equipe,
        **extra,
    }


def test_exemplo_oficial_devolve_201_com_os_valores_do_dossie(cliente):
    resposta = cliente.post("/api/boletins", json=corpo())

    assert resposta.status_code == 201
    b = resposta.json()
    assert b["situacao"] == "CONSISTENTE"
    assert b["origem"] == "PLATAFORMA"
    assert b["armazemNome"] == "Adubo"
    assert b["producaoTotal"] == "918.1952"
    assert b["diariasEquivalentes"] == "11.0"
    assert b["valorPorDiaria"] == "83.4723"
    assert b["totalAPagar"] == "991.9041"
    assert b["complemento"] == "73.7089"
    assert b["abaixoDoPiso"] is True
    assert b["quantidadeChapas"] == 11
    assert (b["chapasDiariaCompleta"], b["chapasMeiaDiaria"]) == (11, 0)
    # a exibição é o arredondamento de 2 casas: R$ 918,20 / 991,90 / 73,71
    assert b["exibicao"] == {
        "producaoTotal": "918.20",
        "valorPorDiaria": "83.47",
        "totalAPagar": "991.90",
        "complemento": "73.71",
    }
    fert = next(x for x in b["linhas"] if x["tipoItem"] == "FERTILIZANTES")
    assert (fert["quantidadeTotal"], fert["precoUnitario"], fert["valor"]) == (2778, "0.3224", "895.6272")


def test_variacao_com_meia_diaria(cliente):
    b = cliente.post("/api/boletins", json=corpo(completas=10, meias=1)).json()

    assert b["diariasEquivalentes"] == "10.5"
    assert b["exibicao"]["valorPorDiaria"] == "87.45"
    assert b["exibicao"]["totalAPagar"] == "946.82"
    assert b["exibicao"]["complemento"] == "28.62"
    assert (b["chapasDiariaCompleta"], b["chapasMeiaDiaria"]) == (10, 1)


def test_acima_do_piso_sem_complemento(cliente):
    b = cliente.post(
        "/api/boletins", json=corpo(linhas=[{"tipoItem": "FERTILIZANTES", "descarga": 1000}], completas=1)
    ).json()

    assert (b["totalAPagar"], b["complemento"], b["abaixoDoPiso"]) == ("322.4000", "0.0000", False)


def test_sem_equipe_fica_inconsistente_sem_valores_calculados(cliente):
    resposta = cliente.post("/api/boletins", json=corpo(completas=0))

    assert resposta.status_code == 201  # é um resultado válido (pendente de conferência), não um erro
    b = resposta.json()
    assert b["situacao"] == "INCONSISTENTE"
    assert b["producaoTotal"] == "918.1952"
    assert b["diariasEquivalentes"] == "0.0"
    assert (b["valorPorDiaria"], b["totalAPagar"], b["complemento"], b["abaixoDoPiso"]) == (None,) * 4
    assert b["exibicao"]["totalAPagar"] is None


def test_prever_nao_grava_e_traz_o_piso(cliente):
    previa = cliente.post("/api/boletins/calculo", json=corpo())

    assert previa.status_code == 200
    assert previa.json()["totalAPagar"] == "991.9041"
    assert previa.json()["piso"] == "90.1731"
    assert "id" not in previa.json()
    assert cliente.get("/api/boletins").json() == []


def test_prever_e_lancar_dao_o_mesmo_resultado(cliente):
    previa = cliente.post("/api/boletins/calculo", json=corpo(completas=10, meias=1)).json()
    gravado = cliente.post("/api/boletins", json=corpo(completas=10, meias=1)).json()

    for campo in ("producaoTotal", "diariasEquivalentes", "valorPorDiaria", "totalAPagar", "complemento"):
        assert previa[campo] == gravado[campo], campo
    assert previa["exibicao"] == gravado["exibicao"]


def test_boletim_duplicado_devolve_409(cliente):
    cliente.post("/api/boletins", json=corpo())

    resposta = cliente.post("/api/boletins", json=corpo(completas=3))

    assert resposta.status_code == 409
    assert resposta.json()["codigo"] == "CONFLITO"
    assert "17/11/2025" in resposta.json()["detail"]
    assert len(cliente.get("/api/boletins").json()) == 1


def test_mesma_matricula_em_dois_armazens_no_mesmo_dia(cliente):
    assert cliente.post("/api/boletins", json=corpo(armazem=ADUBO, completas=2)).status_code == 201
    assert cliente.post("/api/boletins", json=corpo(armazem=INSUMOS, completas=2)).status_code == 201


def test_vinte_chapas_passam_e_o_21o_devolve_422(cliente):
    assert cliente.post("/api/boletins", json=corpo(completas=20)).status_code == 201

    resposta = cliente.post("/api/boletins", json=corpo(armazem=INSUMOS, completas=21))

    assert resposta.status_code == 422
    assert resposta.json()["codigo"] == "REGRA_DE_NEGOCIO"
    assert "no máximo 20" in resposta.json()["detail"]


@pytest.mark.parametrize(
    ("alteracao", "trecho"),
    [
        ({"armazemId": 99}, "Armazém inválido"),
        ({"data": "2026-10-06"}, "futuro"),
        ({"linhas": [{"tipoItem": "BANANA", "descarga": 1}]}, "Tipo de item inválido"),
        (
            {"linhas": [{"tipoItem": "PECAS", "descarga": 1}, {"tipoItem": "PECAS", "remocao": 1}]},
            "repetido",
        ),
        ({"equipe": [{"matricula": "CHAPA_999", "tipoDiaria": "COMPLETA"}]}, "Matrícula não cadastrada"),
        (
            {"equipe": [{"matricula": "CHAPA_01", "tipoDiaria": "COMPLETA"}] * 2},
            "duas vezes",
        ),
        ({"linhas": [], "equipe": []}, "vazio"),
    ],
)
def test_regras_de_negocio_devolvem_422(cliente, alteracao, trecho):
    resposta = cliente.post("/api/boletins", json={**corpo(), **alteracao})

    assert resposta.status_code == 422, resposta.text
    assert trecho in resposta.json()["detail"]
    assert cliente.get("/api/boletins").json() == []


@pytest.mark.parametrize(
    "campo",
    ["situacao", "origem", "totalAPagar", "complemento", "producaoTotal", "valorPorDiaria", "id", "piso"],
)
def test_cliente_nao_consegue_definir_campos_do_servidor(cliente, campo):
    resposta = cliente.post("/api/boletins", json=corpo(**{campo: "1"}))

    assert resposta.status_code == 400
    assert resposta.json()["codigo"] == "REQUISICAO_INVALIDA"


@pytest.mark.parametrize(
    "linhas",
    [
        [{"tipoItem": "PECAS", "descarga": -1}],
        [{"tipoItem": "PECAS", "descarga": 1.5}],
        [{"tipoItem": "PECAS", "descarga": "muitas"}],
        [{"descarga": 1}],
        [{"tipoItem": "PECAS", "descarga": 1, "preco": "0.01"}],  # o cliente não define preço
    ],
)
def test_linhas_invalidas_devolvem_400(cliente, linhas):
    assert cliente.post("/api/boletins", json=corpo(linhas=linhas)).status_code == 400


def test_tipo_de_diaria_e_obrigatorio_e_so_aceita_completa_ou_meia(cliente):
    sem = corpo(equipe=[{"matricula": "CHAPA_01"}])
    outra = {**corpo(), "equipe": [{"matricula": "CHAPA_01", "tipoDiaria": "QUARTO"}]}

    assert cliente.post("/api/boletins", json=sem).status_code == 400
    assert cliente.post("/api/boletins", json=outra).status_code == 400


def test_data_invalida_devolve_400(cliente):
    assert cliente.post("/api/boletins", json=corpo(data="ontem")).status_code == 400


def test_consulta_por_id_armazem_e_periodo(cliente):
    a = cliente.post("/api/boletins", json=corpo(armazem=ADUBO, data="2025-11-17")).json()
    b = cliente.post("/api/boletins", json=corpo(armazem=INSUMOS, data="2025-11-17", completas=4)).json()
    c = cliente.post("/api/boletins", json=corpo(armazem=ADUBO, data="2025-11-20")).json()

    detalhe = cliente.get(f"/api/boletins/{a['id']}").json()
    # a mesma representação do lançamento (o instante de criação volta no fuso do banco: compara à parte)
    assert {k: v for k, v in detalhe.items() if k != "criadoEm"} == {
        k: v for k, v in a.items() if k != "criadoEm"
    }
    assert [x["id"] for x in cliente.get("/api/boletins").json()] == [c["id"], b["id"], a["id"]]
    assert [x["id"] for x in cliente.get("/api/boletins", params={"armazemId": ADUBO}).json()] == [
        c["id"],
        a["id"],
    ]
    assert [x["id"] for x in cliente.get("/api/boletins", params={"de": "2025-11-18"}).json()] == [c["id"]]
    periodo = {"armazemId": INSUMOS, "de": "2025-11-01", "ate": "2025-11-30"}
    assert [x["id"] for x in cliente.get("/api/boletins", params=periodo).json()] == [b["id"]]
    assert b["quantidadeChapas"] == 4


def test_listagem_traz_linhas_e_equipe_de_cada_boletim(cliente):
    cliente.post("/api/boletins", json=corpo(completas=10, meias=1))

    [b] = cliente.get("/api/boletins").json()

    assert len(b["linhas"]) == 3
    assert len(b["equipe"]) == 11
    assert b["equipe"][0] == {"matricula": "CHAPA_01", "nome": "CHAPA_01", "tipoDiaria": "COMPLETA"}


def test_boletim_inexistente_devolve_404(cliente):
    resposta = cliente.get("/api/boletins/12345")

    assert resposta.status_code == 404
    assert resposta.json()["codigo"] == "NAO_ENCONTRADO"


def test_periodo_invertido_devolve_422(cliente):
    assert cliente.get("/api/boletins", params={"de": "2025-12-01", "ate": "2025-11-01"}).status_code == 422


def test_tipos_de_item_e_chapas_para_montar_o_formulario(cliente):
    tipos = cliente.get("/api/boletim/tipos-item").json()
    chapas = cliente.get("/api/chapas").json()

    assert len(tipos) == 14
    assert {"codigo": "SEMENTES", "descricao": "Sementes", "precoUnitario": "0.3224"} in tipos
    assert {"matricula": "CHAPA_01", "nome": "CHAPA_01"} in chapas
