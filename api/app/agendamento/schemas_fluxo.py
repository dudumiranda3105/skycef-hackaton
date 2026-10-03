"""Contratos dos fluxos da descarga: marcos, cancelamento, reagendamento e não recebimento."""

from typing import Annotated

from pydantic import AwareDatetime, Field

from app.shared.schemas import EsquemaEntrada


class MarcoIn(EsquemaEntrada):
    """Chegada ou entrada. Sem `ocorrido_em`, vale o relógio do servidor (fuso de São Paulo)."""

    ocorrido_em: AwareDatetime | None = None


class SaidaIn(EsquemaEntrada):
    """Fim da descarga. `quantidade_chapas` é POR DESCARGA e não se soma ao longo do dia."""

    ocorrido_em: AwareDatetime | None = None
    quantidade_chapas: Annotated[int, Field(ge=0, le=100)]
    equipamento_ids: Annotated[list[int], Field(max_length=30)] = []
