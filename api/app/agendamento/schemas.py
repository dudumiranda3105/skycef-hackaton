from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Any

from pydantic import Field, field_serializer

from app.agendamento.domain import (
    Acondicionamento,
    DecisaoCompras,
    StatusAgendamento,
    TipoEvento,
)
from app.agendamento.models import Agendamento, EventoAgendamento, NotaFiscal, ValidacaoCompras
from app.agendamento.service import DetalhesAgendamento, GradeDoDia
from app.shared.domain import Origem
from app.shared.schemas import EsquemaBase, EsquemaEntrada


def _hhmm(valor: time) -> str:
    return valor.strftime("%H:%M")


# ---------------------------------------------------------------- entrada


class NotaFiscalIn(EsquemaEntrada):
    nf_chave: Annotated[str | None, Field(pattern=r"^[0-9]{44}$")] = None
    nf_numero: Annotated[str | None, Field(max_length=20)] = None
    peso_total_kg: Annotated[Decimal | None, Field(ge=0)] = None


class AgendarIn(EsquemaEntrada):
    fornecedor_id: int
    data: date
    horario: time
    acondicionamento: Acondicionamento
    notas: Annotated[list[NotaFiscalIn], Field(min_length=1, max_length=20)]
    agendado_na_hora: bool = False


class DecisaoComprasIn(EsquemaEntrada):
    """Decisão de Compras sobre a nota fiscal x pedido de compra."""

    decisao: DecisaoCompras
    pedido_referencia: Annotated[str | None, Field(max_length=20)] = None  # obrigatório se AUTORIZADO
    observacao: Annotated[str | None, Field(max_length=250)] = None  # obrigatória se NAO_AUTORIZADO


class DestinosIn(EsquemaEntrada):
    """Armazém(ns) onde a carga será descarregada; gera uma descarga por destino."""

    armazem_ids: Annotated[list[int], Field(min_length=1, max_length=4)]
    observacao: Annotated[str | None, Field(max_length=250)] = None


# ---------------------------------------------------------------- saída


class NotaFiscalOut(EsquemaBase):
    id: int
    nf_numero: str | None
    nf_chave: str | None
    peso_total_kg: Decimal | None
    arquivo_nome: str | None
    ativa: bool

    @classmethod
    def desde(cls, n: NotaFiscal) -> "NotaFiscalOut":
        return cls(
            id=n.id,
            nf_numero=n.nf_numero,
            nf_chave=n.nf_chave,
            peso_total_kg=n.peso_total_kg,
            arquivo_nome=n.arquivo_nome,
            ativa=n.ativa,
        )


class ValidacaoComprasOut(EsquemaBase):
    decisao: DecisaoCompras
    pedido_referencia: str | None
    observacao: str | None
    decidido_em: datetime

    @classmethod
    def desde(cls, v: ValidacaoCompras) -> "ValidacaoComprasOut":
        return cls(
            decisao=v.decisao,
            pedido_referencia=v.pedido_referencia,
            observacao=v.observacao,
            decidido_em=v.decidido_em,
        )


class DescargaOut(EsquemaBase):
    id: int
    armazem_id: int
    chegada_em: datetime | None
    entrada_em: datetime | None
    saida_em: datetime | None
    quantidade_chapas: int | None
    equipamento_ids: list[int] = Field(default_factory=list)


class AgendamentoOut(EsquemaBase):
    id: int
    fornecedor_id: int
    data: date
    horario: time
    acondicionamento: Acondicionamento
    status: StatusAgendamento
    status_rotulo: str
    agendado_na_hora: bool
    limite_ignorado: bool
    origem: Origem
    criado_em: datetime
    notas: list[NotaFiscalOut]
    validacao_compras: ValidacaoComprasOut | None
    descargas: list[DescargaOut]

    @field_serializer("horario")
    def _serializa_horario(self, valor: time) -> str:
        return _hhmm(valor)

    @classmethod
    def desde(cls, a: Agendamento, detalhes: DetalhesAgendamento | None = None) -> "AgendamentoOut":
        d = detalhes or DetalhesAgendamento()
        return cls(
            id=a.id,
            fornecedor_id=a.fornecedor_id,
            data=a.data_agendada,
            horario=a.horario,
            acondicionamento=a.acondicionamento,
            status=a.status,
            status_rotulo=a.status.rotulo,
            agendado_na_hora=a.agendado_na_hora,
            limite_ignorado=a.limite_ignorado,
            origem=a.origem,
            criado_em=a.criado_em,
            notas=[NotaFiscalOut.desde(n) for n in d.notas],
            validacao_compras=ValidacaoComprasOut.desde(d.validacao) if d.validacao else None,
            descargas=[
                DescargaOut(
                    id=x.id,
                    armazem_id=x.armazem_id,
                    chegada_em=x.chegada_em,
                    entrada_em=x.entrada_em,
                    saida_em=x.saida_em,
                    quantidade_chapas=x.quantidade_chapas,
                    equipamento_ids=d.equipamentos_por_descarga.get(x.id, []),
                )
                for x in d.descargas
            ],
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
