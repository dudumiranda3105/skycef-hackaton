"""Contrato e interface da Tarefa 1 não dependem de um banco ativo para serem verificados."""

from pathlib import Path

from app.main import create_app

ROTAS_OBRIGATORIAS = {
    "/api/agendamentos",
    "/api/agendamentos/{agendamento_id}/notas/{nota_id}/arquivo",
    "/api/agendamentos/{agendamento_id}/chegada",
    "/api/descargas/{descarga_id}/chegada",
    "/api/descargas/{descarga_id}/entrada",
    "/api/descargas/{descarga_id}/saida",
    "/api/agendamentos/{agendamento_id}/cancelamento",
    "/api/agendamentos/{agendamento_id}/cancelamento/efetivacao",
    "/api/vagas-liberadas/{vaga_id}/atribuicao",
    "/api/vagas-liberadas/{vaga_id}/liberacao-geral",
    "/api/agendamentos/{agendamento_id}/reagendamento",
    "/api/nao-recebimentos",
    "/api/equipamentos",
}


def test_openapi_expoe_o_fluxo_completo_da_tarefa_1():
    caminhos = set(create_app().openapi()["paths"])
    assert ROTAS_OBRIGATORIAS <= caminhos


def test_interface_da_tarefa_1_e_servida_pela_api():
    raiz = Path(__file__).parents[1] / "app" / "static"
    pagina = (raiz / "index.html").read_text(encoding="utf-8")
    assert "Agenda de recebimentos" in pagina
    assert "Novo agendamento" in pagina
    assert (raiz / "app.js").is_file()
    assert (raiz / "styles.css").is_file()
