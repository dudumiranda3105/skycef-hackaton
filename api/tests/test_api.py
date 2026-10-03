"""Endpoints HTTP de ponta a ponta (FastAPI + PostgreSQL real)."""

import pytest
from fastapi.testclient import TestClient

from app.core.clock import get_relogio
from app.core.db import get_session
from app.main import create_app


@pytest.fixture
def cliente(db, relogio):
    app = create_app()

    def _sessao():
        with db() as sessao:
            yield sessao

    app.dependency_overrides[get_session] = _sessao
    app.dependency_overrides[get_relogio] = lambda: relogio
    return TestClient(app)  # sem `with`: não dispara o lifespan (migrations)


def _corpo(fornecedor_id, **extra):
    return {
        "fornecedorId": fornecedor_id,
        "data": "2026-10-06",
        "horario": "08:00",
        "acondicionamento": "PALETIZADO",
        **extra,
    }


def test_health(cliente):
    assert cliente.get("/health").json() == {"status": "ok"}


def test_agendar_devolve_201_em_camel_case_e_depois_lista(cliente, fornecedor_id):
    resposta = cliente.post("/api/agendamentos", json=_corpo(fornecedor_id, nfChave="4" * 44))

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["status"] == "AGENDADO"
    assert corpo["origem"] == "PLATAFORMA"
    assert corpo["horario"] == "08:00"
    assert corpo["data"] == "2026-10-06"
    assert corpo["fornecedorId"] == fornecedor_id
    assert corpo["nfChave"] == "4" * 44

    detalhe = cliente.get(f"/api/agendamentos/{corpo['id']}").json()
    assert detalhe["id"] == corpo["id"]
    assert [a["id"] for a in cliente.get("/api/agendamentos", params={"data": "2026-10-06"}).json()] == [
        corpo["id"]
    ]
    eventos = cliente.get(f"/api/agendamentos/{corpo['id']}/eventos").json()
    assert [e["paraStatus"] for e in eventos] == ["AGENDADO"]


@pytest.mark.parametrize("campo", ["status", "origem", "limiteIgnorado", "id"])
def test_cliente_nao_consegue_definir_campos_do_servidor(cliente, fornecedor_id, campo):
    resposta = cliente.post("/api/agendamentos", json=_corpo(fornecedor_id, **{campo: "CONCLUIDO"}))

    assert resposta.status_code == 400
    assert resposta.json()["codigo"] == "REQUISICAO_INVALIDA"


def test_sem_vaga_devolve_409_com_codigo_estavel(cliente, fornecedor_id):
    cliente.post("/api/agendamentos", json=_corpo(fornecedor_id))
    cliente.post("/api/agendamentos", json=_corpo(fornecedor_id, acondicionamento="BIG_BAG"))

    resposta = cliente.post("/api/agendamentos", json=_corpo(fornecedor_id))

    assert resposta.status_code == 409
    assert resposta.json()["codigo"] == "CONFLITO"
    assert "limite de 2" in resposta.json()["detail"]


def test_fim_de_semana_devolve_422(cliente, fornecedor_id):
    resposta = cliente.post("/api/agendamentos", json=_corpo(fornecedor_id, data="2026-10-10"))

    assert resposta.status_code == 422
    assert resposta.json()["codigo"] == "REGRA_DE_NEGOCIO"


def test_horario_fora_da_grade_devolve_422(cliente, fornecedor_id):
    resposta = cliente.post("/api/agendamentos", json=_corpo(fornecedor_id, horario="09:00"))

    assert resposta.status_code == 422


def test_fornecedor_inexistente_devolve_404(cliente):
    resposta = cliente.post("/api/agendamentos", json=_corpo(999_999))

    assert resposta.status_code == 404
    assert resposta.json()["codigo"] == "NAO_ENCONTRADO"


def test_agendamento_inexistente_devolve_404(cliente):
    assert cliente.get("/api/agendamentos/12345").status_code == 404


def test_consultar_agenda(cliente, fornecedor_id):
    cliente.post("/api/agendamentos", json=_corpo(fornecedor_id, acondicionamento="BATIDO"))

    grade = cliente.get("/api/agenda", params={"data": "2026-10-06"}).json()

    assert grade["diaUtil"] is True
    assert [s["horario"] for s in grade["slots"]] == ["08:00", "10:00", "13:00", "15:00"]
    assert grade["slots"][0]["ocupados"] == 1
    assert grade["slots"][0]["aceitaBatido"] is False
    assert grade["slots"][0]["aceitaPaletizadoOuBigBag"] is False
    assert grade["slots"][1]["aceitaBatido"] is True


def test_agenda_de_domingo_explica_o_motivo(cliente):
    grade = cliente.get("/api/agenda", params={"data": "2026-10-11"}).json()

    assert grade["diaUtil"] is False
    assert grade["slots"] == []
    assert "domingos" in grade["motivoIndisponivel"]


def test_data_em_formato_invalido_devolve_400(cliente):
    assert cliente.get("/api/agenda", params={"data": "amanha"}).status_code == 400


def test_cadastro_rapido_de_fornecedor_e_cnpj_duplicado(cliente):
    novo = cliente.post(
        "/api/fornecedores", json={"razaoSocial": "Agro Teste Ltda", "cnpj": "11222333000181"}
    )
    assert novo.status_code == 201
    assert novo.json()["razaoSocial"] == "Agro Teste Ltda"

    repetido = cliente.post("/api/fornecedores", json={"razaoSocial": "Outra", "cnpj": "11222333000181"})
    assert repetido.status_code == 409

    assert cliente.post("/api/fornecedores", json={"razaoSocial": "X", "cnpj": "123"}).status_code == 400
