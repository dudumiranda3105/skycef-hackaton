"""Leitura da NF-e e anexo do arquivo da nota fiscal.

Os XMLs destes testes são sintéticos: os arquivos reais da Cocapec não podem ir para o repositório.
"""

from datetime import date, time
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import undefer

from app.agendamento.arquivos import LIMITE_BYTES, ArquivoService, nome_seguro
from app.agendamento.domain import Acondicionamento, DecisaoCompras
from app.agendamento.models import NotaFiscal
from app.agendamento.service import AgendamentoService, AgendarCommand, NotaFiscalCmd
from app.core.clock import get_relogio
from app.core.db import get_session
from app.core.errors import ArquivoGrandeError, ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.main import create_app
from app.nfe.parser import XmlInvalidoError, ler_nfe

CHAVE = "23220507467822000126551010000208031742408666"
DATA = date(2026, 10, 6)
HORA = time(8)


def nfe(chave: str = CHAVE, numero: str = "20803", volumes: str | None = None) -> bytes:
    volumes = (
        volumes
        if volumes is not None
        else "<vol><qVol>1</qVol><pesoL>100.000</pesoL><pesoB>110.500</pesoB></vol>"
        "<vol><qVol>2</qVol><pesoL>50.000</pesoL><pesoB>60.000</pesoB></vol>"
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe>'
        f'<infNFe Id="NFe{chave}" versao="4.00"><ide><nNF>{numero}</nNF></ide>'
        "<emit><CNPJ>07467822000126</CNPJ><xNome>Fornecedor Teste</xNome></emit>"
        f"<transp>{volumes}</transp></infNFe></NFe></nfeProc>"
    ).encode()


# ---------------------------------------------------------------- parser


def test_le_chave_numero_cnpj_e_soma_os_pesos_dos_volumes():
    dados = ler_nfe(nfe())

    assert dados.chave == CHAVE
    assert dados.numero == "20803"
    assert dados.cnpj_emitente == "07467822000126"
    assert dados.peso_bruto_kg == Decimal("170.500")
    assert dados.peso_liquido_kg == Decimal("150.000")


def test_nota_sem_peso_devolve_none():
    dados = ler_nfe(nfe(volumes=""))

    assert dados.peso_bruto_kg is None and dados.peso_liquido_kg is None


@pytest.mark.parametrize(
    "xml",
    [
        b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><NFe>&e;</NFe>',
        b'<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><x>&b;</x>',
        b"<a><b></a>",
        b"isto nao e xml",
        b"<outra><coisa/></outra>",
        b"\xff\xfe\x00 lixo",
    ],
    ids=["xxe-arquivo", "billion-laughs", "malformado", "texto", "nao-e-nfe", "bytes-invalidos"],
)
def test_recusa_xml_perigoso_invalido_ou_que_nao_e_nfe(xml):
    with pytest.raises(XmlInvalidoError):
        ler_nfe(xml)


def test_nome_seguro_nunca_carrega_caminho():
    assert nome_seguro("../../etc/passwd.xml") == "passwd.xml"
    assert nome_seguro("C:\\Users\\x\\nota.pdf") == "nota.pdf"
    assert nome_seguro(None) == "nota"
    assert nome_seguro('a"b\x00c.xml') == "abc.xml"
    assert len(nome_seguro("x" * 500 + ".xml")) <= 200


# ---------------------------------------------------------------- serviço


@pytest.fixture
def abertas():
    sessoes = []
    yield sessoes
    for sessao in sessoes:
        sessao.close()


@pytest.fixture
def servicos(db, relogio, abertas):
    class Servicos:
        def base(self):
            sessao = db()
            abertas.append(sessao)
            return AgendamentoService(sessao, relogio)

        def arquivos(self):
            sessao = db()
            abertas.append(sessao)
            return ArquivoService(sessao, relogio)

    return Servicos()


@pytest.fixture
def agendar(servicos, fornecedor_id):
    def _agendar(notas=None, horario=HORA) -> int:
        notas = notas if notas is not None else [NotaFiscalCmd()]
        cmd = AgendarCommand(fornecedor_id, DATA, horario, Acondicionamento.PALETIZADO, notas=tuple(notas))
        return servicos.base().agendar(cmd).id

    return _agendar


def _notas(db, agendamento_id):
    with db() as sessao:
        return list(
            sessao.scalars(
                select(NotaFiscal)
                .options(undefer(NotaFiscal.conteudo))
                .where(NotaFiscal.agendamento_id == agendamento_id)
                .order_by(NotaFiscal.id)
            )
        )


def test_xml_preenche_o_que_faltava_e_guarda_o_arquivo(servicos, agendar, db):
    ag = agendar()
    (nota,) = _notas(db, ag)

    servicos.arquivos().anexar(ag, nota.id, "nfe.xml", nfe())

    (nota,) = _notas(db, ag)
    assert (nota.nf_chave, nota.nf_numero, nota.peso_total_kg) == (CHAVE, "20803", Decimal("170.500"))
    assert (nota.arquivo_nome, nota.content_type, nota.tamanho_bytes) == (
        "nfe.xml",
        "application/xml",
        len(nfe()),
    )
    assert nota.conteudo == nfe()


def test_dados_informados_pelo_fornecedor_nao_sao_sobrescritos(servicos, agendar, db):
    ag = agendar([NotaFiscalCmd(nf_chave=CHAVE, nf_numero="999", peso_total_kg=Decimal("5"))])
    (nota,) = _notas(db, ag)

    servicos.arquivos().anexar(ag, nota.id, "nfe.xml", nfe())

    (nota,) = _notas(db, ag)
    assert (nota.nf_numero, nota.peso_total_kg) == ("999", Decimal("5.000"))


def test_chave_do_arquivo_diferente_da_informada_e_recusada(servicos, agendar, db):
    ag = agendar([NotaFiscalCmd(nf_chave="1" * 44)])
    (nota,) = _notas(db, ag)

    with pytest.raises(RegraDeNegocioError, match="não confere"):
        servicos.arquivos().anexar(ag, nota.id, "nfe.xml", nfe())

    assert _notas(db, ag)[0].conteudo is None


def test_chave_do_arquivo_ja_agendada_em_outro_agendamento(servicos, agendar, db):
    agendar([NotaFiscalCmd(nf_chave=CHAVE)], horario=HORA)
    ag = agendar(horario=time(10))
    (nota,) = _notas(db, ag)

    with pytest.raises(ConflitoError, match="já está agendada"):
        servicos.arquivos().anexar(ag, nota.id, "nfe.xml", nfe())


def test_pdf_e_aceito_sem_alterar_os_dados_da_nota(servicos, agendar, db):
    ag = agendar([NotaFiscalCmd(nf_numero="7")])
    (nota,) = _notas(db, ag)

    servicos.arquivos().anexar(ag, nota.id, "danfe.PDF", b"%PDF-1.4 conteudo")

    (nota,) = _notas(db, ag)
    assert (nota.content_type, nota.nf_numero, nota.nf_chave) == ("application/pdf", "7", None)


@pytest.mark.parametrize(
    "nome,conteudo,mensagem",
    [
        ("virus.exe", b"MZ", "PDF ou XML"),
        ("semextensao", b"x", "PDF ou XML"),
        ("nfe.xml", b"", "vazio"),
        ("falso.pdf", b"nao sou pdf", "PDF válido"),
        ("nfe.xml", b"<a><b></a>", "inválido"),
    ],
)
def test_arquivos_invalidos_sao_recusados(servicos, agendar, db, nome, conteudo, mensagem):
    ag = agendar()
    (nota,) = _notas(db, ag)

    with pytest.raises(RegraDeNegocioError, match=mensagem):
        servicos.arquivos().anexar(ag, nota.id, nome, conteudo)

    assert _notas(db, ag)[0].conteudo is None


def test_arquivo_acima_do_limite(servicos, agendar, db):
    ag = agendar()
    (nota,) = _notas(db, ag)

    with pytest.raises(ArquivoGrandeError, match="10 MB"):
        servicos.arquivos().anexar(ag, nota.id, "grande.pdf", b"%PDF" + b"0" * LIMITE_BYTES)


def test_nota_de_outro_agendamento_nao_pode_receber_o_arquivo(servicos, agendar, db):
    ag1, ag2 = agendar(), agendar(horario=time(10))
    (nota2,) = _notas(db, ag2)

    with pytest.raises(NaoEncontradoError):
        servicos.arquivos().anexar(ag1, nota2.id, "nfe.xml", nfe())


def test_agendamento_encerrado_nao_recebe_arquivo(servicos, agendar, db):
    ag = agendar()
    (nota,) = _notas(db, ag)
    servicos.base().decidir_compras(ag, DecisaoCompras.NAO_AUTORIZADO, observacao="Itens divergentes")

    with pytest.raises(ConflitoError, match="'Não autorizado'"):
        servicos.arquivos().anexar(ag, nota.id, "nfe.xml", nfe())


def test_novo_envio_substitui_o_arquivo(servicos, agendar, db):
    ag = agendar()
    (nota,) = _notas(db, ag)
    servicos.arquivos().anexar(ag, nota.id, "primeira.pdf", b"%PDF-1")

    servicos.arquivos().anexar(ag, nota.id, "segunda.pdf", b"%PDF-22")

    (nota,) = _notas(db, ag)
    assert (nota.arquivo_nome, nota.tamanho_bytes) == ("segunda.pdf", 7)


# ---------------------------------------------------------------- HTTP


@pytest.fixture
def cliente(db, relogio):
    app = create_app()

    def _sessao():
        with db() as sessao:
            yield sessao

    app.dependency_overrides[get_session] = _sessao
    app.dependency_overrides[get_relogio] = lambda: relogio
    return TestClient(app)


def _criar(cliente, fornecedor_id, horario="08:00", notas=None) -> dict:
    resposta = cliente.post(
        "/api/agendamentos",
        json={
            "fornecedorId": fornecedor_id,
            "data": "2026-10-06",
            "horario": horario,
            "acondicionamento": "PALETIZADO",
            "notas": notas or [{}],
        },
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def test_http_upload_e_download(cliente, fornecedor_id):
    criado = _criar(cliente, fornecedor_id)
    id_, nota_id = criado["id"], criado["notas"][0]["id"]

    enviado = cliente.post(
        f"/api/agendamentos/{id_}/notas/{nota_id}/arquivo",
        files={"arquivo": ("nfe.xml", nfe(), "text/html")},  # o tipo enviado pelo cliente é ignorado
    )

    assert enviado.status_code == 200, enviado.text
    nota = enviado.json()["notas"][0]
    assert (nota["arquivoNome"], nota["nfChave"], nota["nfNumero"]) == ("nfe.xml", CHAVE, "20803")

    baixado = cliente.get(f"/api/agendamentos/{id_}/notas/{nota_id}/arquivo")
    assert baixado.status_code == 200
    assert baixado.content == nfe()
    assert baixado.headers["content-type"].startswith("application/xml")
    assert baixado.headers["x-content-type-options"] == "nosniff"
    assert "attachment" in baixado.headers["content-disposition"]


def test_http_erros_do_upload(cliente, fornecedor_id):
    criado = _criar(cliente, fornecedor_id)
    id_, nota_id = criado["id"], criado["notas"][0]["id"]
    url = f"/api/agendamentos/{id_}/notas/{nota_id}/arquivo"

    assert cliente.get(url).status_code == 404  # ainda sem arquivo
    assert cliente.post(url, files={"arquivo": ("a.exe", b"MZ")}).status_code == 422
    grande = cliente.post(url, files={"arquivo": ("g.pdf", b"%PDF" + b"0" * LIMITE_BYTES)})
    assert grande.status_code == 413
    assert grande.json()["codigo"] == "ARQUIVO_MUITO_GRANDE"
    assert cliente.post(url).status_code == 400  # sem arquivo
    assert (
        cliente.post(
            f"/api/agendamentos/{id_}/notas/999999/arquivo", files={"arquivo": ("a.pdf", b"%PDF")}
        ).status_code
        == 404
    )


def test_http_equipamentos_individuais_por_armazem(cliente):
    todos = cliente.get("/api/equipamentos").json()
    patio = cliente.get("/api/equipamentos", params={"armazemId": 3}).json()

    assert len(todos) == 19
    assert sorted(e["identificacao"] for e in patio) == [
        "PAT-EMPG-01",
        "PAT-TRAT-01",
        "PAT-TRAT-02",
        "PAT-TRAT-03",
        "PAT-TRAT-04",
    ]


def test_http_lista_de_agendamentos_filtra_por_dia_e_status(cliente, fornecedor_id):
    a = _criar(cliente, fornecedor_id, "08:00")["id"]
    b = _criar(cliente, fornecedor_id, "10:00")["id"]
    cliente.post(
        f"/api/agendamentos/{b}/validacao-compras", json={"decisao": "AUTORIZADO", "pedidoReferencia": "1"}
    )

    todos = cliente.get("/api/agendamentos").json()
    autorizados = cliente.get("/api/agendamentos", params={"status": "AUTORIZADO"}).json()
    pendentes = cliente.get(
        "/api/agendamentos", params={"data": "2026-10-06", "status": "PENDENTE_COMPRAS"}
    ).json()

    assert [x["id"] for x in todos] == [a, b]
    assert [x["id"] for x in autorizados] == [b]
    assert [x["id"] for x in pendentes] == [a]
