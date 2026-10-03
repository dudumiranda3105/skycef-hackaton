from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    Time,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.agendamento.domain import (
    Acondicionamento,
    DecisaoCompras,
    MotivoNaoRecebimento,
    SituacaoCancelamento,
    StatusAgendamento,
    StatusVagaLiberada,
    TipoEvento,
)
from app.core.db import Base
from app.shared.domain import Origem


def _enum(tipo: type, tamanho: int) -> Enum:
    """Enum guardado como texto; os CHECK das migrations garantem os valores no banco."""
    return Enum(tipo, native_enum=False, length=tamanho, create_constraint=False, validate_strings=True)


class Agendamento(Base):
    """Agendamento de recebimento. Nunca é apagado: só muda de status."""

    __tablename__ = "agendamento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fornecedor_id: Mapped[int] = mapped_column(BigInteger)
    data_agendada: Mapped[date] = mapped_column(Date)
    horario: Mapped[time] = mapped_column(Time)
    acondicionamento: Mapped[Acondicionamento] = mapped_column(_enum(Acondicionamento, 12))
    status: Mapped[StatusAgendamento] = mapped_column(_enum(StatusAgendamento, 20))
    # caminhão que chegou sem aviso e agendou no ato
    agendado_na_hora: Mapped[bool] = mapped_column(Boolean, default=False)
    # reagendamento por caso fortuito que desconsiderou o limite de caminhões do horário
    limite_ignorado: Mapped[bool] = mapped_column(Boolean, default=False)
    origem: Mapped[Origem] = mapped_column(_enum(Origem, 12), default=Origem.PLATAFORMA)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # quando o caminhão encostou e entrou na fila; copiado para cada descarga (ver V6)
    chegada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    versao: Mapped[int] = mapped_column(Integer)

    # Evita que duas transições concorrentes sobrescrevam uma à outra
    __mapper_args__ = {"version_id_col": versao}


class EventoAgendamento(Base):
    """Trilha de auditoria do agendamento. Somente inserção."""

    __tablename__ = "evento_agendamento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agendamento_id: Mapped[int] = mapped_column(BigInteger)
    de_status: Mapped[StatusAgendamento | None] = mapped_column(_enum(StatusAgendamento, 20))
    para_status: Mapped[StatusAgendamento] = mapped_column(_enum(StatusAgendamento, 20))
    tipo: Mapped[TipoEvento] = mapped_column(_enum(TipoEvento, 20), default=TipoEvento.STATUS)
    observacao: Mapped[str | None] = mapped_column(String(300))
    detalhe: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class VagaLiberada(Base):
    """Vaga liberada por cancelamento. Cabe ao responsável do armazém decidir quem a ocupa;
    enquanto ABERTA ela continua contando como ocupada."""

    __tablename__ = "vaga_liberada"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    data_vaga: Mapped[date] = mapped_column(Date)
    horario: Mapped[time] = mapped_column(Time)
    acondicionamento: Mapped[Acondicionamento] = mapped_column(_enum(Acondicionamento, 12))
    origem_agendamento_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[StatusVagaLiberada] = mapped_column(
        _enum(StatusVagaLiberada, 15), default=StatusVagaLiberada.ABERTA
    )
    atribuida_a_agendamento_id: Mapped[int | None] = mapped_column(BigInteger)
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class NotaFiscal(Base):
    """Uma ou mais notas fiscais por agendamento. `ativa` vira falso quando o agendamento
    libera a vaga, para a mesma NF-e poder ser agendada de novo."""

    __tablename__ = "nota_fiscal"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agendamento_id: Mapped[int] = mapped_column(BigInteger)
    nf_numero: Mapped[str | None] = mapped_column(String(20))
    nf_chave: Mapped[str | None] = mapped_column(String(44))
    peso_total_kg: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    arquivo_nome: Mapped[str | None] = mapped_column(String(200))
    content_type: Mapped[str | None] = mapped_column(String(80))
    tamanho_bytes: Mapped[int | None] = mapped_column(Integer)
    conteudo: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)  # só carrega se pedido
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ValidacaoCompras(Base):
    """Decisão de Compras sobre a conformidade entre a nota e o pedido (no máximo uma)."""

    __tablename__ = "validacao_compras"

    agendamento_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    decisao: Mapped[DecisaoCompras] = mapped_column(_enum(DecisaoCompras, 15))
    pedido_referencia: Mapped[str | None] = mapped_column(String(20))
    observacao: Mapped[str | None] = mapped_column(String(250))
    decidido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Descarga(Base):
    """Uma por armazém de destino. chegada -> entrada -> saída são os três marcos.

    `quantidade_chapas` mede a intensidade DESTA descarga e nunca deve ser somada ao longo do
    dia como efetivo (a mesma equipe atende várias descargas); o efetivo vem do boletim."""

    __tablename__ = "descarga"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agendamento_id: Mapped[int] = mapped_column(BigInteger)
    armazem_id: Mapped[int] = mapped_column(SmallInteger)
    chegada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entrada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    saida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quantidade_chapas: Mapped[int | None] = mapped_column(SmallInteger)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DescargaEquipamento(Base):
    """Equipamento (unidade individual) usado em uma descarga."""

    __tablename__ = "descarga_equipamento"

    descarga_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    equipamento_id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)


class Reagendamento(Base):
    """Histórico de mudanças de data/horário (por caso fortuito pode exceder a capacidade)."""

    __tablename__ = "reagendamento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agendamento_id: Mapped[int] = mapped_column(BigInteger)
    data_anterior: Mapped[date] = mapped_column(Date)
    horario_anterior: Mapped[time] = mapped_column(Time)
    data_nova: Mapped[date] = mapped_column(Date)
    horario_novo: Mapped[time] = mapped_column(Time)
    motivo: Mapped[str] = mapped_column(String(300))
    limite_excedido: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Cancelamento(Base):
    """Cancelamento do agendamento: solicitação, depois efetivação (que libera a vaga)."""

    __tablename__ = "cancelamento"

    agendamento_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    motivo: Mapped[str] = mapped_column(String(300))
    situacao: Mapped[SituacaoCancelamento] = mapped_column(
        _enum(SituacaoCancelamento, 12), default=SituacaoCancelamento.SOLICITADO
    )
    solicitado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    efetivado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NaoRecebimento(Base):
    """Caminhão que não descarregou. `agendamento_id` e `fornecedor_id` são nulos quando o
    caminhão chegou sem agendamento e sem vaga."""

    __tablename__ = "nao_recebimento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agendamento_id: Mapped[int | None] = mapped_column(BigInteger)
    fornecedor_id: Mapped[int | None] = mapped_column(BigInteger)
    fornecedor_nome: Mapped[str | None] = mapped_column(String(200))
    data: Mapped[date] = mapped_column(Date)
    motivo: Mapped[MotivoNaoRecebimento] = mapped_column(_enum(MotivoNaoRecebimento, 30))
    descricao: Mapped[str | None] = mapped_column(String(300))
    origem: Mapped[Origem] = mapped_column(_enum(Origem, 12), default=Origem.PLATAFORMA)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
