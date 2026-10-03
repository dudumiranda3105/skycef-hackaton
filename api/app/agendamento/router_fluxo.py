"""Rotas do fluxo da descarga e de seus desvios (marcos, cancelamento, reagendamento...)."""

from datetime import date
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.agendamento.arquivos import LIMITE_BYTES, ArquivoService
from app.agendamento.cancelamento import CancelamentoService
from app.agendamento.domain import MotivoNaoRecebimento, StatusVagaLiberada
from app.agendamento.marcos import MarcosService
from app.agendamento.nao_recebimento import NaoRecebimentoService
from app.agendamento.reagendamento import ReagendamentoService
from app.agendamento.router import montar_saida
from app.agendamento.schemas import AgendamentoOut
from app.agendamento.schemas_fluxo import (
    AtribuicaoIn,
    CancelamentoIn,
    MarcoIn,
    NaoRecebimentoIn,
    NaoRecebimentoOut,
    ReagendamentoIn,
    SaidaIn,
    VagaLiberadaOut,
)
from app.core.clock import Relogio, get_relogio
from app.core.db import get_session

router = APIRouter(prefix="/api", tags=["Fluxo da descarga"])

SessaoDep = Annotated[Session, Depends(get_session)]
RelogioDep = Annotated[Relogio, Depends(get_relogio)]


def get_marcos(session: SessaoDep, relogio: RelogioDep) -> MarcosService:
    return MarcosService(session, relogio)


Marcos = Annotated[MarcosService, Depends(get_marcos)]


@router.post(
    "/agendamentos/{agendamento_id}/chegada",
    response_model=AgendamentoOut,
    summary="Marco 1: o caminhão encostou e entrou na fila",
)
def chegada(agendamento_id: int, corpo: MarcoIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(marcos.base, marcos.registrar_chegada(agendamento_id, corpo.ocorrido_em))


@router.post(
    "/descargas/{descarga_id}/chegada",
    response_model=AgendamentoOut,
    summary="Chegada de uma descarga específica (ex.: caminhão voltou à fila para o 2º armazém)",
)
def chegada_descarga(descarga_id: int, corpo: MarcoIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(marcos.base, marcos.registrar_chegada_descarga(descarga_id, corpo.ocorrido_em))


@router.post(
    "/descargas/{descarga_id}/entrada",
    response_model=AgendamentoOut,
    summary="Marco 2: o caminhão é liberado e a descarga começa",
)
def entrada(descarga_id: int, corpo: MarcoIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(marcos.base, marcos.registrar_entrada(descarga_id, corpo.ocorrido_em))


@router.post(
    "/descargas/{descarga_id}/saida",
    response_model=AgendamentoOut,
    summary="Marco 3: a descarga terminou; informa chapas e equipamentos usados",
)
def saida(descarga_id: int, corpo: SaidaIn, marcos: Marcos) -> AgendamentoOut:
    return montar_saida(
        marcos.base,
        marcos.registrar_saida(
            descarga_id, corpo.quantidade_chapas, corpo.equipamento_ids, corpo.ocorrido_em
        ),
    )


# ---------------------------------------------------------------- reagendamento


def get_reagendamento(session: SessaoDep, relogio: RelogioDep) -> ReagendamentoService:
    return ReagendamentoService(session, relogio)


@router.post(
    "/agendamentos/{agendamento_id}/reagendamento",
    response_model=AgendamentoOut,
    summary="Reagendar (por caso fortuito pode exceder o limite de caminhões do horário)",
)
def reagendar(
    agendamento_id: int,
    corpo: ReagendamentoIn,
    servico: Annotated[ReagendamentoService, Depends(get_reagendamento)],
) -> AgendamentoOut:
    reagendado = servico.reagendar(
        agendamento_id, corpo.data, corpo.horario, corpo.motivo, corpo.caso_fortuito
    )
    return montar_saida(servico.base, reagendado)


# ---------------------------------------------------------------- cancelamento e vagas liberadas


def get_cancelamento(session: SessaoDep, relogio: RelogioDep) -> CancelamentoService:
    return CancelamentoService(session, relogio)


Cancelamentos = Annotated[CancelamentoService, Depends(get_cancelamento)]


@router.post(
    "/agendamentos/{agendamento_id}/cancelamento",
    response_model=AgendamentoOut,
    summary="Solicitar o cancelamento do agendamento",
)
def solicitar_cancelamento(
    agendamento_id: int, corpo: CancelamentoIn, servico: Cancelamentos
) -> AgendamentoOut:
    return montar_saida(servico.base, servico.solicitar(agendamento_id, corpo.motivo))


@router.post(
    "/agendamentos/{agendamento_id}/cancelamento/efetivacao",
    response_model=AgendamentoOut,
    summary="Efetivar o cancelamento: libera a vaga para o armazém decidir quem a ocupa",
)
def efetivar_cancelamento(agendamento_id: int, servico: Cancelamentos) -> AgendamentoOut:
    return montar_saida(servico.base, servico.efetivar(agendamento_id))


@router.get(
    "/vagas-liberadas",
    response_model=list[VagaLiberadaOut],
    summary="Vagas liberadas por cancelamento",
)
def listar_vagas(
    servico: Cancelamentos, situacao: Annotated[StatusVagaLiberada | None, Query()] = None
) -> list[VagaLiberadaOut]:
    return [VagaLiberadaOut.desde(v) for v in servico.listar_vagas(situacao)]


@router.get(
    "/vagas-liberadas/{vaga_id}/candidatos",
    response_model=list[AgendamentoOut],
    summary="Agendamentos que caberiam na vaga (sugestão; a escolha é do responsável do armazém)",
)
def candidatos(vaga_id: int, servico: Cancelamentos) -> list[AgendamentoOut]:
    agendamentos = servico.candidatos(vaga_id)
    detalhes = servico.base.detalhes([a.id for a in agendamentos])
    return [AgendamentoOut.desde(a, detalhes[a.id]) for a in agendamentos]


@router.post(
    "/vagas-liberadas/{vaga_id}/atribuicao",
    response_model=AgendamentoOut,
    summary="O armazém escolhe quem ocupa a vaga: o agendamento é movido para ela",
)
def atribuir_vaga(vaga_id: int, corpo: AtribuicaoIn, servico: Cancelamentos) -> AgendamentoOut:
    return montar_saida(servico.base, servico.atribuir(vaga_id, corpo.agendamento_id))


@router.post(
    "/vagas-liberadas/{vaga_id}/liberacao-geral",
    response_model=VagaLiberadaOut,
    summary="O armazém devolve a vaga: ela volta a ficar disponível para novos agendamentos",
)
def liberar_vaga(vaga_id: int, servico: Cancelamentos) -> VagaLiberadaOut:
    return VagaLiberadaOut.desde(servico.liberar_geral(vaga_id))


# ---------------------------------------------------------------- não recebimento


def get_nao_recebimento(session: SessaoDep, relogio: RelogioDep) -> NaoRecebimentoService:
    return NaoRecebimentoService(session, relogio)


NaoRecebimentos = Annotated[NaoRecebimentoService, Depends(get_nao_recebimento)]


@router.post(
    "/nao-recebimentos",
    response_model=NaoRecebimentoOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar um não recebimento, com o motivo (com ou sem agendamento)",
)
def registrar_nao_recebimento(corpo: NaoRecebimentoIn, servico: NaoRecebimentos) -> NaoRecebimentoOut:
    registro = servico.registrar(
        corpo.motivo,
        data=corpo.data,
        agendamento_id=corpo.agendamento_id,
        fornecedor_id=corpo.fornecedor_id,
        fornecedor_nome=corpo.fornecedor_nome,
        descricao=corpo.descricao,
    )
    return NaoRecebimentoOut.desde(registro)


@router.get(
    "/nao-recebimentos",
    response_model=list[NaoRecebimentoOut],
    summary="Não recebimentos, filtráveis por data e motivo",
)
def listar_nao_recebimentos(
    servico: NaoRecebimentos,
    data: Annotated[date | None, Query(description="AAAA-MM-DD")] = None,
    motivo: Annotated[MotivoNaoRecebimento | None, Query()] = None,
) -> list[NaoRecebimentoOut]:
    return [NaoRecebimentoOut.desde(n) for n in servico.listar(data, motivo)]


# ---------------------------------------------------------------- arquivo da nota fiscal


def get_arquivos(session: SessaoDep, relogio: RelogioDep) -> ArquivoService:
    return ArquivoService(session, relogio)


Arquivos = Annotated[ArquivoService, Depends(get_arquivos)]


@router.post(
    "/agendamentos/{agendamento_id}/notas/{nota_id}/arquivo",
    response_model=AgendamentoOut,
    summary="Anexar o arquivo (PDF ou XML, até 10 MB) de uma nota fiscal do agendamento",
)
def anexar_arquivo(
    agendamento_id: int, nota_id: int, arquivo: UploadFile, servico: Arquivos
) -> AgendamentoOut:
    # lê 1 byte além do limite para detectar o excesso sem carregar um arquivo gigante
    conteudo = arquivo.file.read(LIMITE_BYTES + 1)
    servico.anexar(agendamento_id, nota_id, arquivo.filename, conteudo)
    return montar_saida(servico.base, servico.base.obter(agendamento_id))


@router.get(
    "/agendamentos/{agendamento_id}/notas/{nota_id}/arquivo",
    summary="Baixar o arquivo anexado da nota fiscal",
    response_class=Response,
)
def baixar_arquivo(agendamento_id: int, nota_id: int, servico: Arquivos) -> Response:
    nota = servico.obter(agendamento_id, nota_id)
    return Response(
        content=nota.conteudo,
        media_type=nota.content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(nota.arquivo_nome or 'nota')}",
            "X-Content-Type-Options": "nosniff",
        },
    )
