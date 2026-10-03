"""Aceite da Tarefa 1 inteira, sem tocar no boletim diário (Tarefa 2)."""

import json
from itertools import count

import pytest
from fastapi.testclient import TestClient

from app.core.clock import get_relogio
from app.core.db import get_session
from app.main import create_app

_SEQ = count(700)


@pytest.fixture
def cliente_t1(db, relogio):
    app = create_app()

    def _sessao():
        with db() as sessao:
            yield sessao

    app.dependency_overrides[get_session] = _sessao
    app.dependency_overrides[get_relogio] = lambda: relogio
    return TestClient(app)


def _agendar(cliente, fornecedor_id, horario="08:00"):
    numero = next(_SEQ)
    resposta = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-06",
            "horario": horario,
            "acondicionamento": "PALETIZADO",
            "notas": [{"nfChave": str(numero).zfill(44), "nfNumero": str(numero)}],
        },
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _autorizar_e_destinar(cliente, agendamento_id, destinos):
    assert cliente.post(
        f"/api/agendamentos/{agendamento_id}/validacao-compras",
        json={"decisao": "AUTORIZADO", "pedidoReferencia": "4500001234"},
    ).status_code == 200
    resposta = cliente.post(
        f"/api/agendamentos/{agendamento_id}/destinos", json={"armazemIds": destinos}
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_fluxo_multidestino_so_conclui_depois_da_ultima_descarga(cliente_t1, fornecedor_id):
    agendamento = _agendar(cliente_t1, fornecedor_id)
    agendamento = _autorizar_e_destinar(cliente_t1, agendamento["id"], [1, 2])
    descargas = agendamento["descargas"]

    for indice, descarga in enumerate(descargas):
        descarga_id = descarga["id"]
        assert cliente_t1.post(f"/api/descargas/{descarga_id}/chegada", json={}).status_code == 200
        assert cliente_t1.post(f"/api/descargas/{descarga_id}/entrada", json={}).status_code == 200
        resposta = cliente_t1.post(
            f"/api/descargas/{descarga_id}/saida",
            json={"quantidadeChapas": 2, "equipamentoIds": [1]},
        )
        assert resposta.status_code == 200, resposta.text
        esperado = "CONCLUIDO" if indice == len(descargas) - 1 else "EM_DESCARGA"
        assert resposta.json()["status"] == esperado


def test_upload_e_download_da_nota_fiscal(cliente_t1, fornecedor_id):
    numero = next(_SEQ)
    dados = {
        "fornecedorId": fornecedor_id,
        "data": "2026-10-06",
        "horario": "10:00",
        "acondicionamento": "BIG_BAG",
        "notas": [{"nfChave": str(numero).zfill(44), "nfNumero": str(numero)}],
    }
    resposta = cliente_t1.post(
        "/api/agendamentos/com-anexos",
        data={"dados": json.dumps(dados)},
        files=[("arquivos", ("nota.xml", b"<nfe>teste</nfe>", "application/xml"))],
    )
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    nota = corpo["notas"][0]
    baixado = cliente_t1.get(
        f"/api/agendamentos/{corpo['id']}/notas/{nota['id']}/arquivo"
    )
    assert baixado.status_code == 200
    assert baixado.content == b"<nfe>teste</nfe>"


def test_cancelamento_em_duas_etapas_cria_vaga_para_decisao(cliente_t1, fornecedor_id):
    agendamento = _agendar(cliente_t1, fornecedor_id, "13:00")
    solicitado = cliente_t1.post(
        f"/api/agendamentos/{agendamento['id']}/cancelamento", json={"motivo": "Carga adiada"}
    )
    assert solicitado.status_code == 200
    assert solicitado.json()["situacao"] == "SOLICITADO"

    efetivado = cliente_t1.post(
        f"/api/agendamentos/{agendamento['id']}/cancelamento/efetivacao"
    )
    assert efetivado.status_code == 200
    vaga = efetivado.json()
    assert vaga["status"] == "ABERTA"

    decidida = cliente_t1.post(
        f"/api/vagas-liberadas/{vaga['id']}/atribuicao", json={"liberarGeral": True}
    )
    assert decidida.status_code == 200
    assert decidida.json()["status"] == "LIBERADA_GERAL"


def test_nao_recebimento_sem_agendamento_e_reagendamento(cliente_t1, fornecedor_id):
    recusado = cliente_t1.post(
        "/api/nao-recebimentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-05",
            "motivo": "SEM_AGENDAMENTO_SEM_VAGA",
        },
    )
    assert recusado.status_code == 201, recusado.text

    agendamento = _agendar(cliente_t1, fornecedor_id, "15:00")
    reagendado = cliente_t1.post(
        f"/api/agendamentos/{agendamento['id']}/reagendamento",
        json={
            "data": "2026-10-07",
            "horario": "08:00",
            "motivo": "Chuva forte",
            "casoFortuito": True,
        },
    )
    assert reagendado.status_code == 200, reagendado.text
    assert reagendado.json()["dataAnterior"] == "2026-10-06"
    assert reagendado.json()["dataNova"] == "2026-10-07"

