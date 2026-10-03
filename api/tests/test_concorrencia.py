"""Prova a regra de ocupação de horário sob concorrência, contra o PostgreSQL real.

Sem a trava (pg_advisory_xact_lock), estes testes falham: todas as threads leem a mesma
ocupação antes de qualquer commit e a regra é estourada.
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time

from sqlalchemy import select

from app.agendamento.domain import Acondicionamento
from app.agendamento.models import Agendamento
from app.agendamento.service import AgendamentoService, AgendarCommand
from app.core.errors import ConflitoError

DATA = date(2026, 10, 6)
B, P = Acondicionamento.BATIDO, Acondicionamento.PALETIZADO


def _disparar(db, relogio, fornecedor_id, pedidos):
    """Cada pedido (horario, acondicionamento) roda em uma thread, com sessão própria, e todas
    largam ao mesmo tempo. Devolve a lista de resultados: True = agendou, False = sem vaga."""
    largada = threading.Barrier(len(pedidos))

    def tentar(pedido):
        horario, acond = pedido
        largada.wait()
        try:
            with db() as sessao:
                AgendamentoService(sessao, relogio).agendar(
                    AgendarCommand(fornecedor_id, DATA, horario, acond)
                )
            return True
        except ConflitoError:
            return False

    with ThreadPoolExecutor(max_workers=len(pedidos)) as pool:
        return list(pool.map(tentar, pedidos))  # qualquer outra exceção derruba o teste


def _ocupantes(db, horario):
    with db() as sessao:
        return list(
            sessao.scalars(
                select(Agendamento.acondicionamento).where(
                    Agendamento.data_agendada == DATA,
                    Agendamento.horario == horario,
                    Agendamento.status.not_in(["CANCELADO", "NAO_RECEBIDO"]),
                )
            )
        )


def test_dez_fornecedores_no_mesmo_horario_sobram_exatamente_duas_vagas(db, relogio, fornecedor_id):
    for _ in range(8):  # repete: uma corrida só aparece em parte das execuções
        _limpar(db)
        resultados = _disparar(db, relogio, fornecedor_id, [(time(8), P)] * 10)

        assert resultados.count(True) == 2
        assert resultados.count(False) == 8
        assert len(_ocupantes(db, time(8))) == 2


def test_carga_batida_competindo_com_paletizados_nunca_convivem(db, relogio, fornecedor_id):
    for _ in range(5):  # repete para dar chance a uma corrida ruim aparecer
        _limpar(db)
        _disparar(db, relogio, fornecedor_id, [(time(8), B)] + [(time(8), P)] * 5)

        ocupantes = _ocupantes(db, time(8))
        assert ocupantes, "alguém precisa ter conseguido a vaga"
        if B in ocupantes:
            assert len(ocupantes) == 1
        else:
            assert len(ocupantes) <= 2


def test_horarios_diferentes_nao_se_bloqueiam(db, relogio, fornecedor_id):
    resultados = _disparar(db, relogio, fornecedor_id, [(time(h), B) for h in (8, 10, 13, 15)])

    assert resultados == [True, True, True, True]


def _limpar(db):
    from sqlalchemy import text

    with db() as sessao:
        sessao.execute(text("truncate agendamento restart identity cascade"))
        sessao.commit()
