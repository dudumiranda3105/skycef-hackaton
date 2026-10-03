"""ETL do histórico com planilhas sintéticas: os arquivos reais da Cocapec não podem ir para o repositório."""

import zipfile
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from app.etl.fonte import Fonte
from app.etl.historico import (
    ARQUIVO_FOLHA,
    ARQUIVO_MOVIMENTACAO,
    ResumoCarga,
    carregar,
    carregar_folha,
    ler_movimentacao,
    serial_para_data,
)
from app.painel.models import HistChapaDia, HistRecebimentoItem
from tests.test_etl_chapas import planilha

CABECALHO = {
    "A1": "Pedido Compra",
    "B1": "Data Lançamento",
    "C1": "Data do Documento",
    "D1": "Cod PN",
    "E1": "Nome",
    "F1": "Cod Item",
    "G1": "Desc Item",
    "H1": "Qtd",
    "I1": "Peso",
    "J1": "Deposito",
    "K1": "Nº Recebimento",
    "L1": "Data Recebimento",
    "M1": "Nota Fiscal de Entrada",
    "N1": "Chave de Acesso",
}
CABECALHO_FOLHA = "data,dia_semana,chapas_presentes,chapas_operacao_cafe,valor_pago_dia\n"
CHAVE = "35260112345678000190550010000012341000012345"  # 44 dígitos

# Números de série do Excel usados abaixo
TERCA, QUINTA, SABADO, SEXTA = 46000, 46002, 46004, 46010  # 09/12, 11/12, 13/12 e 19/12 de 2025


def linha(n: int, recebimento: int, deposito: str = "MATFerti", chave: str = CHAVE, documento: int = TERCA):
    """Linha n (>= 2) da planilha; as datas vão como número de série, como no Excel."""
    return {
        f"A{n}": "100",
        f"B{n}": str(documento),
        f"C{n}": str(documento),
        f"D{n}": "FD001",
        f"E{n}": "ACME LTDA",
        f"F{n}": "FER000003",
        f"G{n}": "ADUBO 20-05-20",
        f"H{n}": "10",
        f"I{n}": "500",
        f"J{n}": deposito,
        f"K{n}": "7001",
        f"L{n}": str(recebimento),
        f"M{n}": "1234",
        f"N{n}": chave,
    }


def xlsx(*linhas: dict[str, str]) -> bytes:
    celulas = dict(CABECALHO)
    for item in linhas:
        celulas.update(item)
    return planilha({"Plan1": celulas})


def pacote(tmp_path, movimentacao: bytes, folha: str) -> Fonte:
    destino = tmp_path / "dados.zip"
    with zipfile.ZipFile(destino, "w") as z:
        z.writestr("DADOS/" + ARQUIVO_MOVIMENTACAO, movimentacao)
        z.writestr("DADOS/" + ARQUIVO_FOLHA, folha)
    return Fonte(destino)


@pytest.fixture
def sessao(db):
    with db() as s:
        s.execute(text("truncate hist_recebimento_item, hist_chapa_dia restart identity"))
        s.commit()
        yield s


def test_serial_do_excel_vira_data():
    assert serial_para_data("46000") == date(2025, 12, 9)
    assert serial_para_data("46000.0") == date(2025, 12, 9)
    assert serial_para_data("") is None
    assert serial_para_data(None) is None
    assert serial_para_data("abc") is None


def test_duplicata_exata_e_descartada_e_contada():
    linhas, duplicadas = ler_movimentacao(xlsx(linha(2, SEXTA), linha(3, SEXTA), linha(4, QUINTA)))

    assert len(linhas) == 2
    assert duplicadas == 1


def test_mesma_nota_em_outro_dia_nao_e_duplicata():
    linhas, duplicadas = ler_movimentacao(xlsx(linha(2, SEXTA), linha(3, QUINTA)))

    assert (len(linhas), duplicadas) == (2, 0)


def test_planilha_sem_coluna_obrigatoria_e_recusada():
    sem_deposito = {k: v for k, v in CABECALHO.items() if v != "Deposito"}

    with pytest.raises(ValueError, match="deposito"):
        ler_movimentacao(planilha({"Plan1": sem_deposito}))


def test_carga_trata_e_conta_os_problemas_do_pacote(sessao, tmp_path):
    mov = xlsx(
        linha(2, TERCA),
        linha(3, TERCA),  # duplicata exata da anterior
        linha(4, SABADO),  # recebimento num sábado
        linha(5, TERCA, chave="123"),  # chave de acesso malformada
        linha(6, TERCA, chave="", deposito="MATIndus"),  # sem chave; depósito fora do dossiê
        linha(7, TERCA, documento=QUINTA),  # recebimento (terça) antes do documento (quinta)
    )
    folha = CABECALHO_FOLHA + "2025-12-09,terca,9,1,684.86\n2025-12-10,quarta,12,0,1001.49\n"

    resumo = carregar(sessao, pacote(tmp_path, mov, folha))

    assert resumo.linhas_lidas == 6 and resumo.duplicadas_descartadas == 1
    assert resumo.recebimentos_inseridos == 5
    assert resumo.sabados_com_recebimento == 1
    assert resumo.chave_de_acesso_malformada == 1
    assert resumo.sem_chave_de_acesso == 1
    assert resumo.recebimento_antes_do_documento == 1
    assert resumo.dias_da_folha == 2
    linhas = sessao.scalars(select(HistRecebimentoItem).order_by(HistRecebimentoItem.id)).all()
    assert [x.nf_chave for x in linhas] == [CHAVE, CHAVE, None, None, CHAVE]
    assert linhas[0].fornecedor_nome == "ACME LTDA" and linhas[0].nr_recebimento == "7001"
    assert linhas[0].data_recebimento == date(2025, 12, 9)
    assert linhas[2].deposito == "MATFerti" and linhas[3].deposito == "MATIndus"


def test_chave_malformada_vira_nula_e_nao_derruba_a_carga(sessao, tmp_path):
    fonte = pacote(tmp_path, xlsx(linha(2, TERCA, chave="1" * 60)), CABECALHO_FOLHA)

    carregar(sessao, fonte)

    assert sessao.scalars(select(HistRecebimentoItem.nf_chave)).all() == [None]


def test_carga_e_idempotente_e_substitui_o_conteudo(sessao, tmp_path):
    fonte = pacote(
        tmp_path, xlsx(linha(2, TERCA), linha(3, QUINTA)), CABECALHO_FOLHA + "2025-12-09,terca,9,0,684.86\n"
    )

    carregar(sessao, fonte)
    carregar(sessao, fonte)

    assert len(sessao.scalars(select(HistRecebimentoItem)).all()) == 2
    assert len(sessao.scalars(select(HistChapaDia)).all()) == 1


def test_folha_guarda_presentes_cafe_e_valor_em_decimal(sessao):
    resumo = ResumoCarga()
    carregar_folha(sessao, (CABECALHO_FOLHA + "2026-01-02,sexta,12,2,1001.49\n").encode(), resumo)
    sessao.commit()

    dia = sessao.get(HistChapaDia, date(2026, 1, 2))
    assert (dia.qtd_presentes, dia.qtd_cafe, dia.valor_pago) == (12, 2, Decimal("1001.49"))
