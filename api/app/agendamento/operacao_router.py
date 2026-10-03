from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.agendamento.operacao import OperacaoAgendamentoService
from app.agendamento.operacao_schemas import (
    CancelamentoIn,
    CancelamentoOut,
    FinalizarDescargaIn,
    MomentoIn,
    NaoRecebimentoIn,
    NaoRecebimentoOut,
    ReagendamentoIn,
    ReagendamentoOut,
    VagaDecisaoIn,
    VagaLiberadaOut,
)
from app.agendamento.schemas import AgendamentoOut, DescargaOut
from app.core.clock import Relogio, get_relogio
from app.core.db import get_session

router = APIRouter(prefix="/api", tags=["Operação do recebimento"])


def get_service(
    session: Annotated[Session, Depends(get_session)],
    relogio: Annotated[Relogio, Depends(get_relogio)],
) -> OperacaoAgendamentoService:
    return OperacaoAgendamentoService(session, relogio)


Servico = Annotated[OperacaoAgendamentoService, Depends(get_service)]


def _descarga(servico: Servico, descarga_id: int) -> DescargaOut:
    descarga = servico._descarga_travada(descarga_id)
    detalhes = servico.agendamentos.detalhes([descarga.agendamento_id])[descarga.agendamento_id]
    return DescargaOut(
        id=descarga.id,
        armazem_id=descarga.armazem_id,
        chegada_em=descarga.chegada_em,
        entrada_em=descarga.entrada_em,
        saida_em=descarga.saida_em,
        quantidade_chapas=descarga.quantidade_chapas,
        equipamento_ids=detalhes.equipamentos_por_descarga.get(descarga.id, []),
    )


@router.post("/descargas/{descarga_id}/chegada", response_model=DescargaOut)
def chegada(descarga_id: int, corpo: MomentoIn, servico: Servico) -> DescargaOut:
    servico.registrar_chegada(descarga_id, corpo.ocorrido_em)
    return _descarga(servico, descarga_id)


@router.post("/descargas/{descarga_id}/entrada", response_model=DescargaOut)
def entrada(descarga_id: int, corpo: MomentoIn, servico: Servico) -> DescargaOut:
    servico.registrar_entrada(descarga_id, corpo.ocorrido_em)
    return _descarga(servico, descarga_id)


@router.post("/descargas/{descarga_id}/saida", response_model=AgendamentoOut)
def saida(descarga_id: int, corpo: FinalizarDescargaIn, servico: Servico) -> AgendamentoOut:
    descarga = servico.registrar_saida(
        descarga_id, corpo.quantidade_chapas, corpo.equipamento_ids, corpo.ocorrido_em
    )
    agendamento = servico.agendamentos.obter(descarga.agendamento_id)
    detalhes = servico.agendamentos.detalhes([agendamento.id])[agendamento.id]
    return AgendamentoOut.desde(agendamento, detalhes)


@router.post("/agendamentos/{agendamento_id}/cancelamento", response_model=CancelamentoOut)
def solicitar_cancelamento(
    agendamento_id: int, corpo: CancelamentoIn, servico: Servico
) -> CancelamentoOut:
    return CancelamentoOut.desde(servico.solicitar_cancelamento(agendamento_id, corpo.motivo))


@router.post(
    "/agendamentos/{agendamento_id}/cancelamento/efetivacao",
    response_model=VagaLiberadaOut,
)
def efetivar_cancelamento(agendamento_id: int, servico: Servico) -> VagaLiberadaOut:
    _, vaga = servico.efetivar_cancelamento(agendamento_id)
    return VagaLiberadaOut.desde(vaga)


@router.post("/vagas-liberadas/{vaga_id}/atribuicao", response_model=VagaLiberadaOut)
def decidir_vaga(vaga_id: int, corpo: VagaDecisaoIn, servico: Servico) -> VagaLiberadaOut:
    return VagaLiberadaOut.desde(
        servico.decidir_vaga(vaga_id, corpo.agendamento_id, corpo.liberar_geral)
    )


@router.post(
    "/agendamentos/{agendamento_id}/reagendamento", response_model=ReagendamentoOut
)
def reagendar(
    agendamento_id: int, corpo: ReagendamentoIn, servico: Servico
) -> ReagendamentoOut:
    return ReagendamentoOut.desde(
        servico.reagendar(
            agendamento_id,
            corpo.data,
            corpo.horario,
            corpo.motivo,
            corpo.caso_fortuito,
        )
    )


@router.post("/nao-recebimentos", response_model=NaoRecebimentoOut, status_code=201)
def registrar_nao_recebimento(
    corpo: NaoRecebimentoIn, servico: Servico
) -> NaoRecebimentoOut:
    return NaoRecebimentoOut.desde(
        servico.registrar_nao_recebimento(
            corpo.agendamento_id,
            corpo.fornecedor_id,
            corpo.fornecedor_nome,
            corpo.data,
            corpo.motivo,
            corpo.descricao,
        )
    )


@router.get("/nao-recebimentos", response_model=list[NaoRecebimentoOut])
def listar_nao_recebimentos(
    servico: Servico, data: Annotated[date | None, Query()] = None
) -> list[NaoRecebimentoOut]:
    return [NaoRecebimentoOut.desde(x) for x in servico.listar_nao_recebimentos(data)]
