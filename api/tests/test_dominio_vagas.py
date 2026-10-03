from datetime import time

import pytest

from app.agendamento.domain import HORARIOS, Acondicionamento, cabe, horario_valido

B, P, G = Acondicionamento.BATIDO, Acondicionamento.PALETIZADO, Acondicionamento.BIG_BAG


@pytest.mark.parametrize("novo", [B, P, G])
def test_horario_vazio_aceita_qualquer_tipo(novo):
    assert cabe([], novo)


@pytest.mark.parametrize("ocupantes,novo", [([B], P), ([B], B), ([P], B), ([P, G], B)])
def test_carga_batida_reserva_o_horario_somente_para_si(ocupantes, novo):
    assert not cabe(ocupantes, novo)


def test_sem_batido_aceita_ate_dois_caminhoes():
    assert cabe([P], G)
    assert not cabe([P, G], P)


def test_caso_fortuito_desconsidera_o_limite():
    assert cabe([P, G], P, ignorar_limite=True)
    assert cabe([B], B, ignorar_limite=True)


def test_grade_tem_exatamente_os_quatro_horarios():
    assert HORARIOS == (time(8), time(10), time(13), time(15))


@pytest.mark.parametrize("h", [time(8), time(10), time(13), time(15)])
def test_horarios_validos(h):
    assert horario_valido(h)


@pytest.mark.parametrize("h", [time(9), time(8, 30), time(14), None])
def test_horarios_invalidos_inclusive_nulo(h):
    assert not horario_valido(h)
