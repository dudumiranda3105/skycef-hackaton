"""Serviço do boletim contra o PostgreSQL real: lançamento, regra do piso e as validações.

Os casos obrigatórios do CLAUDE.md (seção 5) estão aqui: exemplo oficial, variação com meia diária,
acima do piso, zero diárias, 21º chapa, boletim duplicado e mesma matrícula em dois armazéns.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from app.boletim.domain import SituacaoBoletim, TipoDiaria
from app.boletim.models import Boletim, BoletimEquipe, BoletimProducao
from app.boletim.service import BoletimService, LancarCommand, LinhaCmd, MembroCmd
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.etl.chapas import carregar
from app.shared.domain import Origem

DIA = date(2025, 11, 17)
INSUMOS, ADUBO = 1, 2
EQUIPE_EXEMPLO = [
    "CHAPA_08",
    "CHAPA_09",
    "CHAPA_15",
    "CHAPA_48",
    "CHAPA_30",
    "CHAPA_49",
    "CHAPA_37",
    "CHAPA_38",
    "CHAPA_41",
    "CHAPA_42",
    "CHAPA_43",
]  # as 11 chapas do exemplo oficial
# 33 matrículas distintas (as 11 do exemplo primeiro): dá para montar equipes de 20 e de 21
MATRICULAS = EQUIPE_EXEMPLO + [c for c in (f"CHAPA_{n:02d}" for n in range(1, 26)) if c not in EQUIPE_EXEMPLO]

D = Decimal
COMPLETA, MEIA = TipoDiaria.COMPLETA, TipoDiaria.MEIA

# 2.378 + 400 de fertilizantes, 30 de agroquímico e 40 de serviços diversos = 2.848 × 0,3224
LINHAS_EXEMPLO = (
    LinhaCmd("FERTILIZANTES", descarga=2378, remocao=400),
    LinhaCmd("AGROQUIMICO", descarga=30),
    LinhaCmd("SERVICOS_DIVERSOS", remocao=40),
)


def equipe(completas: int, meias: int = 0) -> tuple[MembroCmd, ...]:
    membros = [MembroCmd(m, COMPLETA) for m in MATRICULAS[:completas]]
    membros += [MembroCmd(m, MEIA) for m in MATRICULAS[completas : completas + meias]]
    return tuple(membros)


def comando(armazem=ADUBO, data=DIA, linhas=LINHAS_EXEMPLO, completas=11, meias=0) -> LancarCommand:
    return LancarCommand(armazem, data, linhas, equipe(completas, meias))


@pytest.fixture
def sessao(db):
    with db() as s:
        s.execute(text("truncate boletim restart identity cascade"))
        carregar(s, MATRICULAS)
        yield s


@pytest.fixture
def servico(sessao, relogio):
    return BoletimService(sessao, relogio)


# ------------------------------------------------------------------ casos obrigatórios


def test_exemplo_oficial_adubo_17_11_2025(servico):
    boletim = servico.lancar(comando())

    assert boletim.situacao is SituacaoBoletim.CONSISTENTE
    assert boletim.producao_total == D("918.1952")  # R$ 918,20
    assert boletim.diarias_equivalentes == D("11.0")
    assert boletim.valor_por_diaria == D("83.4723")  # abaixo do piso de 90,1731
    assert boletim.total_a_pagar == D("991.9041")  # R$ 991,90
    assert boletim.complemento == D("73.7089")  # R$ 73,71
    assert boletim.origem is Origem.PLATAFORMA


def test_variacao_com_uma_meia_diaria(servico):
    boletim = servico.lancar(comando(completas=10, meias=1))

    assert boletim.diarias_equivalentes == D("10.5")
    assert boletim.valor_por_diaria == D("87.4472")  # R$ 87,45
    assert boletim.total_a_pagar == D("946.8176")  # R$ 946,82
    assert boletim.complemento == D("28.6224")  # R$ 28,62


def test_acima_do_piso_paga_a_producao_e_nao_ha_complemento(servico):
    # 1 chapa produziu R$ 322,40 (1.000 × 0,3224): bem acima do piso, sem teto
    boletim = servico.lancar(comando(linhas=(LinhaCmd("FERTILIZANTES", descarga=1000),), completas=1))

    assert boletim.valor_por_diaria == D("322.4000")
    assert boletim.total_a_pagar == D("322.4000")
    assert boletim.complemento == D("0.0000")


def test_exatamente_no_piso_nao_gera_complemento(servico, sessao):
    # A regra é "abaixo do piso": valor por diária igual ao piso paga a produção, sem complemento.
    # Nenhuma combinação de preços dá exatamente 90,1731; então ajusto o parâmetro ao valor produzido
    # (60 × 0,3387 = 20,3220 por 1 diária completa).
    sessao.execute(text("update parametro set valor = 20.3220 where chave = 'DIARIA_COMPLETA'"))
    sessao.commit()
    try:
        r = servico.calcular(comando(linhas=(LinhaCmd("PECAS", descarga=60),), completas=1)).resultado
        assert r.valor_por_diaria == D("20.3220")
        assert r.total_a_pagar == D("20.3220")
        assert r.complemento == D("0.0000")
    finally:
        sessao.execute(text("update parametro set valor = 90.1731 where chave = 'DIARIA_COMPLETA'"))
        sessao.commit()


def test_zero_diarias_nao_divide_e_fica_inconsistente(servico):
    boletim = servico.lancar(comando(completas=0))

    assert boletim.situacao is SituacaoBoletim.INCONSISTENTE
    assert boletim.producao_total == D("918.1952")
    assert boletim.diarias_equivalentes == D("0.0")
    assert (boletim.valor_por_diaria, boletim.total_a_pagar, boletim.complemento) == (None, None, None)


def test_dia_sem_servico_com_equipe_paga_o_piso_inteiro(servico):
    # Exatamente o que a direção quer enxergar: gente alocada e nenhuma produção
    boletim = servico.lancar(comando(linhas=(), completas=3))

    assert boletim.producao_total == D("0.0000")
    assert boletim.total_a_pagar == D("270.5193")  # 3 × 90,1731
    assert boletim.complemento == D("270.5193")


def test_vinte_chapas_passam_e_o_21o_e_bloqueado(servico):
    assert servico.lancar(comando(completas=20)).diarias_equivalentes == D("20.0")

    with pytest.raises(RegraDeNegocioError, match="no máximo 20"):
        servico.lancar(comando(armazem=INSUMOS, completas=21))


def test_boletim_duplicado_no_mesmo_armazem_e_dia_e_bloqueado(servico, sessao):
    servico.lancar(comando())

    with pytest.raises(ConflitoError, match="Já existe um boletim do armazém Adubo para 17/11/2025"):
        servico.lancar(comando(completas=5))

    assert len(sessao.scalars(select(Boletim)).all()) == 1


def test_a_mesma_matricula_pode_estar_em_dois_armazens_no_mesmo_dia(servico, sessao):
    servico.lancar(comando(armazem=ADUBO, completas=2))
    servico.lancar(comando(armazem=INSUMOS, completas=2))  # mesmas 2 matrículas

    matriculas = sessao.scalars(select(BoletimEquipe.matricula)).all()
    assert len(matriculas) == 4
    assert len(set(matriculas)) == 2


def test_outro_dia_no_mesmo_armazem_pode(servico):
    servico.lancar(comando())
    servico.lancar(comando(data=date(2025, 11, 18)))


# ------------------------------------------------------------------ gravação


def test_grava_linhas_com_preco_congelado_e_equipe(servico, sessao):
    boletim = servico.lancar(comando(completas=10, meias=1))

    linhas = sessao.scalars(
        select(BoletimProducao)
        .where(BoletimProducao.boletim_id == boletim.id)
        .order_by(BoletimProducao.tipo_item)
    ).all()
    assert [
        (x.tipo_item, x.qtd_descarga, x.qtd_remocao, x.qtd_transferencia, x.preco_unitario) for x in linhas
    ] == [
        ("AGROQUIMICO", 30, 0, 0, D("0.3224")),
        ("FERTILIZANTES", 2378, 400, 0, D("0.3224")),
        ("SERVICOS_DIVERSOS", 0, 40, 0, D("0.3224")),
    ]
    tipos = sessao.scalars(
        select(BoletimEquipe.tipo_diaria).where(BoletimEquipe.boletim_id == boletim.id)
    ).all()
    assert sorted(tipos) == [COMPLETA] * 10 + [MEIA]


def test_reajuste_de_preco_nao_altera_boletins_passados(servico, sessao):
    boletim = servico.lancar(comando())
    sessao.execute(text("update tipo_item set preco_unitario = 0.5000 where codigo = 'FERTILIZANTES'"))
    sessao.commit()
    try:
        detalhes = servico.detalhes([boletim.id])[boletim.id]
        fert = next(x for x in detalhes.linhas if x.tipo_item == "FERTILIZANTES")
        assert fert.preco_unitario == D("0.3224")
        assert fert.valor == D("895.6272")  # 2.778 × 0,3224
        assert sessao.get(Boletim, boletim.id).total_a_pagar == D("991.9041")
    finally:
        sessao.execute(text("update tipo_item set preco_unitario = 0.3224 where codigo = 'FERTILIZANTES'"))
        sessao.commit()


def test_linhas_sem_movimentacao_nao_sao_gravadas(servico, sessao):
    boletim = servico.lancar(
        comando(linhas=(LinhaCmd("PECAS"), LinhaCmd("FERTILIZANTES", transferencia=10)), completas=1)
    )

    assert sessao.scalars(
        select(BoletimProducao.tipo_item).where(BoletimProducao.boletim_id == boletim.id)
    ).all() == ["FERTILIZANTES"]


def test_detalhes_devolvem_linhas_e_equipe_com_nome(servico):
    boletim = servico.lancar(comando(completas=10, meias=1))

    d = servico.detalhes([boletim.id])[boletim.id]

    assert {x.tipo_item: x.quantidade_total for x in d.linhas} == {
        "AGROQUIMICO": 30,
        "FERTILIZANTES": 2778,
        "SERVICOS_DIVERSOS": 40,
    }
    assert len(d.equipe) == 11
    assert sum(1 for m in d.equipe if m.tipo_diaria is MEIA) == 1
    assert all(m.nome == m.matricula for m in d.equipe)  # nome anonimizado: o próprio CHAPA_nn


def test_a_modalidade_soma_descarga_remocao_e_transferencia(servico):
    boletim = servico.lancar(
        comando(linhas=(LinhaCmd("PECAS", descarga=10, remocao=20, transferencia=30),), completas=1)
    )

    # 60 × 0,3387
    assert boletim.producao_total == D("20.3220")


# ------------------------------------------------------------------ validações


def test_calcular_nao_grava_nada(servico, sessao):
    calculo = servico.calcular(comando())

    assert calculo.resultado.total_a_pagar == D("991.9041")
    assert calculo.piso == D("90.1731")
    assert sessao.scalars(select(Boletim)).all() == []


def test_calcular_nao_acusa_duplicidade_mas_lancar_acusa(servico):
    servico.lancar(comando())

    assert servico.calcular(comando()).resultado.total_a_pagar == D("991.9041")


@pytest.mark.parametrize(
    ("cmd", "trecho"),
    [
        (comando(linhas=(LinhaCmd("BANANA", descarga=1),)), "Tipo de item inválido: BANANA"),
        (
            comando(linhas=(LinhaCmd("PECAS", descarga=1), LinhaCmd("PECAS", remocao=1))),
            "repetido: PECAS",
        ),
        (comando(armazem=99), "Armazém inválido: 99"),
        (comando(data=date(2026, 10, 6)), "não pode estar no futuro"),  # relógio: 05/10/2026
        (LancarCommand(ADUBO, DIA), "o boletim está vazio"),
        (LancarCommand(ADUBO, DIA, (LinhaCmd("PECAS"),)), "o boletim está vazio"),
        (
            LancarCommand(ADUBO, DIA, (), (MembroCmd("CHAPA_01", COMPLETA), MembroCmd("CHAPA_01", MEIA))),
            "duas vezes",
        ),
        (
            LancarCommand(ADUBO, DIA, (), (MembroCmd("CHAPA_999", COMPLETA),)),
            "Matrícula não cadastrada: CHAPA_999",
        ),
    ],
)
def test_regras_de_negocio_devolvem_422(servico, sessao, cmd, trecho):
    with pytest.raises(RegraDeNegocioError, match=trecho):
        servico.lancar(cmd)

    assert sessao.scalars(select(Boletim)).all() == []  # nada foi gravado


def test_o_dia_de_hoje_e_aceito(servico, relogio):
    assert servico.lancar(comando(data=relogio.agora().date())).data == date(2026, 10, 5)


def test_fim_de_semana_e_aceito_porque_a_equipe_trabalha_aos_sabados(servico):
    assert servico.lancar(comando(data=date(2025, 11, 15))).data.weekday() == 5  # sábado


def test_quantidade_negativa_e_recusada_pelo_dominio(servico):
    with pytest.raises(RegraDeNegocioError):
        servico.lancar(comando(linhas=(LinhaCmd("PECAS", descarga=-1),)))


# ------------------------------------------------------------------ consulta


def test_obter_inexistente_devolve_nao_encontrado(servico):
    with pytest.raises(NaoEncontradoError):
        servico.obter(12345)


def test_listar_filtra_por_armazem_e_periodo(servico):
    a = servico.lancar(comando(armazem=ADUBO, data=date(2025, 11, 17)))
    b = servico.lancar(comando(armazem=INSUMOS, data=date(2025, 11, 17)))
    c = servico.lancar(comando(armazem=ADUBO, data=date(2025, 11, 20)))

    assert [x.id for x in servico.listar()] == [c.id, b.id, a.id]  # mais recentes primeiro
    assert [x.id for x in servico.listar(armazem_id=ADUBO)] == [c.id, a.id]
    assert [x.id for x in servico.listar(de=date(2025, 11, 18))] == [c.id]
    assert [x.id for x in servico.listar(ate=date(2025, 11, 17))] == [b.id, a.id]
    assert [x.id for x in servico.listar(INSUMOS, date(2025, 11, 1), date(2025, 11, 30))] == [b.id]


def test_listar_com_periodo_invertido_devolve_422(servico):
    with pytest.raises(RegraDeNegocioError, match="inicial"):
        servico.listar(de=date(2025, 12, 1), ate=date(2025, 11, 1))


def test_detalhes_de_lista_vazia(servico):
    assert servico.detalhes([]) == {}


def test_tipos_de_item_e_chapas_para_os_formularios(servico):
    assert len(servico.listar_tipos_item()) == 14
    assert {t.codigo for t in servico.listar_tipos_item()} >= {"FERTILIZANTES", "SEMENTES"}
    assert "CHAPA_08" in {c.matricula for c in servico.listar_chapas()}


def test_piso_vem_do_parametro_do_banco(servico, sessao):
    assert servico.piso() == D("90.1731")
    sessao.execute(text("update parametro set valor = 100 where chave = 'DIARIA_COMPLETA'"))
    sessao.commit()
    try:
        assert servico.piso() == D("100")
        assert servico.calcular(comando()).resultado.total_a_pagar == D("1100.0000")  # 11 × 100
    finally:
        sessao.execute(text("update parametro set valor = 90.1731 where chave = 'DIARIA_COMPLETA'"))
        sessao.commit()
