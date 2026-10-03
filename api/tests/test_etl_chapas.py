"""Carga do cadastro de chapas. As planilhas dos testes são sintéticas: os arquivos reais da Cocapec
não podem ir para o repositório."""

import io
import zipfile

import pytest
from sqlalchemy import select, text

from app.cadastros.models import Chapa
from app.etl.chapas import carregar, extrair_chapas, extrair_chapas_do_boletim
from app.etl.fonte import Fonte
from app.etl.xlsx import coluna, ler_xlsx, linha


def planilha(abas: dict[str, dict[str, str]]) -> bytes:
    """Monta um .xlsx mínimo com textos inline."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        nomes = list(abas)
        z.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
            + "".join(f'<sheet name="{n}" sheetId="{i}" r:id="rId{i}"/>' for i, n in enumerate(nomes, 1))
            + "</sheets></workbook>",
        )
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(
                f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml"/>'
                for i, _ in enumerate(nomes, 1)
            )
            + "</Relationships>",
        )
        for i, nome in enumerate(nomes, 1):
            celulas = "".join(
                f'<c r="{ref}" t="inlineStr"><is><t>{valor}</t></is></c>' for ref, valor in abas[nome].items()
            )
            z.writestr(
                f"xl/worksheets/sheet{i}.xml",
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
                f"<row>{celulas}</row></sheetData></worksheet>",
            )
    return buffer.getvalue()


FOLHA = planilha(
    {
        "JANEIRO 2025": {"A5": "LOCAL", "B5": "NOME", "A6": "FRANCA", "B6": "CHAPA_01", "B7": "CHAPA_04"},
        "FEVEREIRO 2025": {"B6": "CHAPA_04", "B7": "CHAPA_10", "B8": "TOTAL", "C6": "CHAPA_99"},
    }
)


def test_leitor_devolve_as_abas_e_celulas():
    abas = ler_xlsx(FOLHA)

    assert list(abas) == ["JANEIRO 2025", "FEVEREIRO 2025"]
    assert abas["JANEIRO 2025"]["B6"] == "CHAPA_01"
    assert (coluna("AB12"), linha("AB12")) == ("AB", 12)


def test_extrai_so_chapas_da_coluna_nome_sem_repetir():
    # CHAPA_99 está na coluna C (não é NOME) e TOTAL não é um chapa
    assert extrair_chapas(FOLHA) == {"CHAPA_01", "CHAPA_04", "CHAPA_10"}


def test_extrai_os_chapas_da_tabela_do_boletim():
    boletim = planilha(
        {
            "Plan1": {
                "N1": "MATRICULA",
                "O1": "FUNCIONARIOS ADUBO",
                "N3": "158",
                "O3": "CHAPA_08",
                "O4": "CHAPA_09",
            }
        }
    )

    assert extrair_chapas_do_boletim(boletim) == {"CHAPA_08", "CHAPA_09"}


def test_carga_e_idempotente(db):
    with db() as sessao:
        sessao.execute(text("truncate chapa cascade"))
        sessao.commit()
        assert carregar(sessao, ["CHAPA_02", "CHAPA_01", "CHAPA_02"]) == 2
        assert carregar(sessao, ["CHAPA_01", "CHAPA_03"]) == 1  # só o novo
        assert carregar(sessao, []) == 0
        assert [c.matricula for c in sessao.scalars(select(Chapa).order_by(Chapa.matricula))] == [
            "CHAPA_01",
            "CHAPA_02",
            "CHAPA_03",
        ]


def test_fonte_le_de_pasta_e_de_zip(tmp_path):
    (tmp_path / "pacote" / "04_mao_de_obra").mkdir(parents=True)
    (tmp_path / "pacote" / "04_mao_de_obra" / "folha.xlsx").write_bytes(FOLHA)
    with zipfile.ZipFile(tmp_path / "dados.zip", "w") as z:
        z.writestr("PACOTE/04_mao_de_obra/folha.xlsx", FOLHA)

    assert Fonte(tmp_path).ler("04_mao_de_obra/folha.xlsx") == FOLHA
    assert Fonte(tmp_path / "dados.zip").ler("04_mao_de_obra/folha.xlsx") == FOLHA
    with pytest.raises(FileNotFoundError):
        Fonte(tmp_path / "dados.zip").ler("nao/existe.xlsx")
    with pytest.raises(FileNotFoundError):
        Fonte(tmp_path / "pasta-que-nao-existe")
