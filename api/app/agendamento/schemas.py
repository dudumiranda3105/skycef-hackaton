from collections.abc import Sequence
from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Any

from pydantic import Field, field_serializer

from app.agendamento.domain import Acondicionamento, StatusAgendamento, TipoEvento
from app.agendamento.models import Agendamento, EventoAgendamento
from app.agendamento.service import GradeDoDia
from app.shared.domain import Origem
from app.shared.schemas import EsquemaBase, EsquemaEntrada


def _hhmm(valor: time) -> str:
    return valor.strftime("%H:%M")


class AgendarIn(EsquemaEntrada):
    fornecedor_id: int
    data: date
    horario: time
    acondicionamento: Acondicionamento
    nf_chave: Annotated[str | None, Field(pattern=r"^[0-9]{44}$")] = None
    nf_numero: Annotated[str | None, Field(max_length=20)] = None
    peso_total_kg: Annotated[Decimal | None, Field(ge=0)] = None
    agendado_na_hora: bool = False


class ValidacaoComprasIn(EsquemaEntrada):
    """Decisão de Compras sobre a conformidade entre a nota fiscal e o pedido de compra."""

    conforme: bool
    pedido_compra: Annotated[str | None, Field(max_length=20)] = None  # obrigatório se conforme
    observacao: Annotated[str | None, Field(max_length=250)] = None  # obrigatória se divergente


class AutorizacaoIn(EsquemaEntrada):
    """Autorização do responsável do armazém, com o(s) armazém(ns) de destino."""

    armazem_ids: Annotated[list[int], Field(min_length=1, max_length=4)]
    observacao: Annotated[str | None, Field(max_length=250)] = None


class AgendamentoOut(EsquemaBase):
    id: int
    fornecedor_id: int
    data: date
    horario: time
    acondicionamento: Acondicionamento
    status: StatusAgendamento
    status_rotulo: str
    nf_numero: str | None
    nf_chave: str | None
    peso_total_kg: Decimal | None
    pedido_compra: str | None
    destinos: list[int]
    agendado_na_hora: bool
    limite_ignorado: bool
    origem: Origem
    criado_em: datetime
    compras_em: datetime | None
    autorizado_em: datetime | None

    @field_serializer("horario")
    def _serializa_horario(self, valor: time) -> str:
        return _hhmm(valor)

    @classmethod
    def desde(cls, a: Agendamento, destinos: Sequence[int] = ()) -> "AgendamentoOut":
        return cls(
            id=a.id,
            fornecedor_id=a.fornecedor_id,
            data=a.data_agendada,
            horario=a.horario,
            acondicionamento=a.acondicionamento,
            status=a.status,
            status_rotulo=a.status.rotulo,
            nf_numero=a.nf_numero,
            nf_chave=a.nf_chave,
            peso_total_kg=a.peso_total_kg,
            pedido_compra=a.pedido_compra,
            destinos=list(destinos),
            agendado_na_hora=a.agendado_na_hora,
            limite_ignorado=a.limite_ignorado,
            origem=a.origem,
            criado_em=a.criado_em,
            compras_em=a.compras_em,
            autorizado_em=a.autorizado_em,
        )


class SlotOut(EsquemaBase):
    horario: time
    ocupados: int
    aceita_batido: bool
    aceita_paletizado_ou_big_bag: bool

    @field_serializer("horario")
    def _serializa_horario(self, valor: time) -> str:
        return _hhmm(valor)


class GradeOut(EsquemaBase):
    data: date
    dia_util: bool
    motivo_indisponivel: str | None
    slots: list[SlotOut]

    @classmethod
    def desde(cls, g: GradeDoDia) -> "GradeOut":
        return cls(
            data=g.data,
            dia_util=g.dia_util,
            motivo_indisponivel=g.motivo_indisponivel,
            slots=[
                SlotOut(
                    horario=s.horario,
                    ocupados=s.ocupados,
                    aceita_batido=s.aceita_batido,
                    aceita_paletizado_ou_big_bag=s.aceita_paletizado_ou_big_bag,
                )
                for s in g.slots
            ],
        )


class EventoOut(EsquemaBase):
    id: int
    de_status: StatusAgendamento | None
    para_status: StatusAgendamento
    tipo: TipoEvento
    observacao: str | None
    detalhe: dict[str, Any] | None
    ocorrido_em: datetime

    @classmethod
    def desde(cls, e: EventoAgendamento) -> "EventoOut":
        return cls(
            id=e.id,
            de_status=e.de_status,
            para_status=e.para_status,
            tipo=e.tipo,
            observacao=e.observacao,
            detalhe=e.detalhe,
            ocorrido_em=e.ocorrido_em,
        )
