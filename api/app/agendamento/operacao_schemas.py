from datetime import date, datetime, time
from typing import Annotated

from pydantic import Field, model_validator

from app.agendamento.domain import (
    MotivoNaoRecebimento,
    SituacaoCancelamento,
    StatusVagaLiberada,
)
from app.agendamento.models import Cancelamento, NaoRecebimento, Reagendamento, VagaLiberada
from app.shared.domain import Origem
from app.shared.schemas import EsquemaBase, EsquemaEntrada


class MomentoIn(EsquemaEntrada):
    ocorrido_em: datetime | None = None


class FinalizarDescargaIn(MomentoIn):
    quantidade_chapas: Annotated[int, Field(ge=0, le=100)]
    equipamento_ids: list[int] = Field(default_factory=list)


class CancelamentoIn(EsquemaEntrada):
    motivo: Annotated[str, Field(min_length=1, max_length=300)]


class CancelamentoOut(EsquemaBase):
    agendamento_id: int
    motivo: str
    situacao: SituacaoCancelamento
    solicitado_em: datetime
    efetivado_em: datetime | None

    @classmethod
    def desde(cls, item: Cancelamento) -> "CancelamentoOut":
        return cls.model_validate(item, from_attributes=True)


class VagaDecisaoIn(EsquemaEntrada):
    agendamento_id: int | None = None
    liberar_geral: bool = False

    @model_validator(mode="after")
    def escolha_exclusiva(self) -> "VagaDecisaoIn":
        if (self.agendamento_id is None) == (not self.liberar_geral):
            raise ValueError("Informe agendamentoId ou liberarGeral=true, mas não ambos.")
        return self


class VagaLiberadaOut(EsquemaBase):
    id: int
    data_vaga: date
    horario: time
    origem_agendamento_id: int
    status: StatusVagaLiberada
    atribuida_a_agendamento_id: int | None
    decidido_em: datetime | None

    @classmethod
    def desde(cls, item: VagaLiberada) -> "VagaLiberadaOut":
        return cls.model_validate(item, from_attributes=True)


class ReagendamentoIn(EsquemaEntrada):
    data: date
    horario: time
    motivo: Annotated[str, Field(min_length=1, max_length=300)]
    caso_fortuito: bool = False


class ReagendamentoOut(EsquemaBase):
    id: int
    agendamento_id: int
    data_anterior: date
    horario_anterior: time
    data_nova: date
    horario_novo: time
    motivo: str
    limite_excedido: bool
    criado_em: datetime

    @classmethod
    def desde(cls, item: Reagendamento) -> "ReagendamentoOut":
        return cls.model_validate(item, from_attributes=True)


class NaoRecebimentoIn(EsquemaEntrada):
    agendamento_id: int | None = None
    fornecedor_id: int | None = None
    fornecedor_nome: Annotated[str | None, Field(max_length=200)] = None
    data: date
    motivo: MotivoNaoRecebimento
    descricao: Annotated[str | None, Field(max_length=300)] = None


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
    def desde(cls, item: NaoRecebimento) -> "NaoRecebimentoOut":
        return cls.model_validate(item, from_attributes=True)
