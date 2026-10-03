"""Contratos dos fluxos da descarga: marcos, reagendamento, cancelamento e não recebimento."""

from datetime import date, datetime, time
from typing import Annotated

from pydantic import AwareDatetime, Field, field_serializer

from app.agendamento.domain import Acondicionamento, MotivoNaoRecebimento, StatusVagaLiberada
from app.agendamento.models import NaoRecebimento, VagaLiberada
from app.shared.domain import Origem
from app.shared.schemas import EsquemaBase, EsquemaEntrada

# ---------------------------------------------------------------- marcos


class MarcoIn(EsquemaEntrada):
    """Chegada ou entrada. Sem `ocorrido_em`, vale o relógio do servidor (fuso de São Paulo)."""

    ocorrido_em: AwareDatetime | None = None


class SaidaIn(EsquemaEntrada):
    """Fim da descarga. `quantidade_chapas` é POR DESCARGA e não se soma ao longo do dia."""

    ocorrido_em: AwareDatetime | None = None
    quantidade_chapas: Annotated[int, Field(ge=0, le=100)]
    equipamento_ids: Annotated[list[int], Field(max_length=30)] = []


# ---------------------------------------------------------------- reagendamento


class ReagendamentoIn(EsquemaEntrada):
    """Nova data e horário. `caso_fortuito` (ex.: chuva) permite exceder o limite de caminhões."""

    data: date
    horario: time
    motivo: Annotated[str, Field(min_length=1, max_length=300)]
    caso_fortuito: bool = False


# ---------------------------------------------------------------- cancelamento e vagas


class CancelamentoIn(EsquemaEntrada):
    motivo: Annotated[str, Field(min_length=1, max_length=300)]


class AtribuicaoIn(EsquemaEntrada):
    """Quem ocupa a vaga liberada: um agendamento existente."""

    agendamento_id: int


class VagaLiberadaOut(EsquemaBase):
    id: int
    data: date
    horario: time
    acondicionamento: Acondicionamento
    origem_agendamento_id: int
    status: StatusVagaLiberada
    atribuida_a_agendamento_id: int | None
    decidido_em: datetime | None
    criado_em: datetime

    @field_serializer("horario")
    def _serializa_horario(self, valor: time) -> str:
        return valor.strftime("%H:%M")

    @classmethod
    def desde(cls, v: VagaLiberada) -> "VagaLiberadaOut":
        return cls(
            id=v.id,
            data=v.data_vaga,
            horario=v.horario,
            acondicionamento=v.acondicionamento,
            origem_agendamento_id=v.origem_agendamento_id,
            status=v.status,
            atribuida_a_agendamento_id=v.atribuida_a_agendamento_id,
            decidido_em=v.decidido_em,
            criado_em=v.criado_em,
        )


# ---------------------------------------------------------------- não recebimento


class NaoRecebimentoIn(EsquemaEntrada):
    """Sem `agendamento_id` (caminhão sem agendamento), informe `fornecedor_id` ou `fornecedor_nome`."""

    motivo: MotivoNaoRecebimento
    data: date | None = None
    agendamento_id: int | None = None
    fornecedor_id: int | None = None
    fornecedor_nome: Annotated[str | None, Field(max_length=200)] = None
    descricao: Annotated[str | None, Field(max_length=300)] = None  # obrigatória se motivo = OUTRO


class NaoRecebimentoOut(EsquemaBase):
    id: int
    agendamento_id: int | None
    fornecedor_id: int | None
    fornecedor_nome: str | None
    data: date
    motivo: MotivoNaoRecebimento
    descricao: str | None
    origem: Origem
    criado_em: datetime

    @classmethod
    def desde(cls, n: NaoRecebimento) -> "NaoRecebimentoOut":
        return cls(
            id=n.id,
            agendamento_id=n.agendamento_id,
            fornecedor_id=n.fornecedor_id,
            fornecedor_nome=n.fornecedor_nome,
            data=n.data,
            motivo=n.motivo,
            descricao=n.descricao,
            origem=n.origem,
            criado_em=n.criado_em,
        )
