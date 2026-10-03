"""Lançamento e consulta do Boletim Diário de Serviços dos Ensacadores (dossiê, seção 8).

O servidor calcula tudo: o cliente envia só as linhas de produção e a equipe. A regra do piso
está em `app.boletim.domain`; aqui ficam as validações, a gravação e a consulta.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.boletim.domain import (
    PISO_DIARIA_COMPLETA,
    LinhaProducao,
    ResultadoBoletim,
    TipoDiaria,
    calcular_boletim,
    validar_equipe,
)
from app.boletim.models import Boletim, BoletimEquipe, BoletimProducao, TipoItem
from app.cadastros.models import Armazem, Chapa
from app.cadastros.service import ArmazemService
from app.core.clock import Relogio
from app.core.db import transacao
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError
from app.shared.domain import Origem


@dataclass(frozen=True)
class LinhaCmd:
    """Quantidades de um tipo de item. O operador escolhe o tipo; o sistema não infere."""

    tipo_item: str
    descarga: int = 0
    remocao: int = 0
    transferencia: int = 0


@dataclass(frozen=True)
class MembroCmd:
    matricula: str
    tipo_diaria: TipoDiaria


@dataclass(frozen=True)
class LancarCommand:
    """Lançamento já interpretado. O serviço nunca aceita situação, origem nem totais do cliente."""

    armazem_id: int
    data: date
    linhas: tuple[LinhaCmd, ...] = ()
    equipe: tuple[MembroCmd, ...] = ()


@dataclass(frozen=True)
class LinhaCalculada:
    tipo_item: str
    descricao: str
    descarga: int
    remocao: int
    transferencia: int
    preco_unitario: Decimal
    quantidade_total: int
    valor: Decimal


@dataclass(frozen=True)
class MembroEquipe:
    matricula: str
    nome: str | None
    tipo_diaria: TipoDiaria


@dataclass
class Calculo:
    """Resultado da apuração antes de gravar (a prévia do `POST /boletins/calculo`)."""

    piso: Decimal
    resultado: ResultadoBoletim
    linhas: list[LinhaCalculada]
    equipe: list[MembroEquipe]


@dataclass
class DetalhesBoletim:
    """O que acompanha um boletim gravado: linhas de produção e equipe."""

    linhas: list[LinhaCalculada] = field(default_factory=list)
    equipe: list[MembroEquipe] = field(default_factory=list)


class BoletimService:
    def __init__(self, session: Session, relogio: Relogio) -> None:
        self.session = session
        self.relogio = relogio
        self.armazens = ArmazemService(session)

    # ------------------------------------------------------------------ cadastros de apoio

    def listar_tipos_item(self) -> list[TipoItem]:
        return list(self.session.scalars(select(TipoItem).order_by(TipoItem.codigo)))

    def listar_chapas(self) -> list[Chapa]:
        return list(self.session.scalars(select(Chapa).order_by(Chapa.matricula)))

    def piso(self) -> Decimal:
        """Diária completa (piso) vigente. Cai na constante do domínio se o parâmetro não existir."""
        valor = self.session.execute(
            text("select valor from parametro where chave = 'DIARIA_COMPLETA'")
        ).scalar_one_or_none()
        return PISO_DIARIA_COMPLETA if valor is None else Decimal(valor)

    # ------------------------------------------------------------------ cálculo e lançamento

    def calcular(self, cmd: LancarCommand) -> Calculo:
        """Valida e apura sem gravar nada (prévia do lançamento)."""
        self._validar_cabecalho(cmd)
        return self._apurar(cmd)

    def lancar(self, cmd: LancarCommand, origem: Origem = Origem.PLATAFORMA) -> Boletim:
        """Grava o boletim com as linhas (preço congelado) e a equipe, já apurado."""
        with transacao(self.session):
            self._validar_cabecalho(cmd)
            if self._existente(cmd.armazem_id, cmd.data) is not None:
                raise ConflitoError(self._mensagem_duplicado(cmd))
            calculo = self._apurar(cmd)
            r = calculo.resultado
            boletim = Boletim(
                armazem_id=cmd.armazem_id,
                data=cmd.data,
                producao_total=r.producao_total,
                diarias_equivalentes=r.diarias_equivalentes,
                valor_por_diaria=r.valor_por_diaria,
                total_a_pagar=r.total_a_pagar,
                complemento=r.complemento,
                situacao=r.situacao,
                origem=origem,
                criado_em=self.relogio.agora(),
            )
            self.session.add(boletim)
            try:
                self.session.flush()  # UNIQUE(armazem, data) é a garantia final contra lançamento simultâneo
            except IntegrityError as erro:
                raise ConflitoError(self._mensagem_duplicado(cmd)) from erro
            self.session.add_all(
                BoletimProducao(
                    boletim_id=boletim.id,
                    tipo_item=linha.tipo_item,
                    qtd_descarga=linha.descarga,
                    qtd_remocao=linha.remocao,
                    qtd_transferencia=linha.transferencia,
                    preco_unitario=linha.preco_unitario,
                )
                for linha in calculo.linhas
            )
            self.session.add_all(
                BoletimEquipe(boletim_id=boletim.id, matricula=m.matricula, tipo_diaria=m.tipo_diaria)
                for m in calculo.equipe
            )
        return boletim

    # ------------------------------------------------------------------ consulta

    def obter(self, boletim_id: int) -> Boletim:
        boletim = self.session.get(Boletim, boletim_id)
        if boletim is None:
            raise NaoEncontradoError(f"Boletim não encontrado: {boletim_id}")
        return boletim

    def listar(
        self, armazem_id: int | None = None, de: date | None = None, ate: date | None = None
    ) -> list[Boletim]:
        if de is not None and ate is not None and de > ate:
            raise RegraDeNegocioError("A data inicial não pode ser posterior à data final.")
        consulta = select(Boletim).order_by(Boletim.data.desc(), Boletim.armazem_id)
        if armazem_id is not None:
            consulta = consulta.where(Boletim.armazem_id == armazem_id)
        if de is not None:
            consulta = consulta.where(Boletim.data >= de)
        if ate is not None:
            consulta = consulta.where(Boletim.data <= ate)
        return list(self.session.scalars(consulta))

    def detalhes(self, ids: Sequence[int]) -> dict[int, DetalhesBoletim]:
        """Linhas e equipe de vários boletins, em poucas consultas (evita N+1 nas listagens)."""
        detalhes = {i: DetalhesBoletim() for i in ids}
        if not detalhes:
            return detalhes
        linhas = self.session.execute(
            select(BoletimProducao, TipoItem.descricao)
            .join(TipoItem, TipoItem.codigo == BoletimProducao.tipo_item)
            .where(BoletimProducao.boletim_id.in_(detalhes))
            .order_by(BoletimProducao.boletim_id, BoletimProducao.tipo_item)
        )
        for p, descricao in linhas:
            detalhes[p.boletim_id].linhas.append(
                _linha_calculada(
                    p.tipo_item,
                    descricao,
                    p.qtd_descarga,
                    p.qtd_remocao,
                    p.qtd_transferencia,
                    p.preco_unitario,
                )
            )
        equipe = self.session.execute(
            select(BoletimEquipe, Chapa.nome)
            .join(Chapa, Chapa.matricula == BoletimEquipe.matricula)
            .where(BoletimEquipe.boletim_id.in_(detalhes))
            .order_by(BoletimEquipe.boletim_id, BoletimEquipe.matricula)
        )
        for e, nome in equipe:
            detalhes[e.boletim_id].equipe.append(MembroEquipe(e.matricula, nome, e.tipo_diaria))
        return detalhes

    def nomes_armazens(self) -> dict[int, str]:
        return {a.id: a.nome for a in self.session.scalars(select(Armazem))}

    # ------------------------------------------------------------------ internos

    def _existente(self, armazem_id: int, data: date) -> Boletim | None:
        return self.session.scalar(
            select(Boletim).where(Boletim.armazem_id == armazem_id, Boletim.data == data)
        )

    def _mensagem_duplicado(self, cmd: LancarCommand) -> str:
        nome = self.nomes_armazens().get(cmd.armazem_id, str(cmd.armazem_id))
        return f"Já existe um boletim do armazém {nome} para {cmd.data.strftime('%d/%m/%Y')}."

    def _validar_cabecalho(self, cmd: LancarCommand) -> None:
        self.armazens.exigir_existentes([cmd.armazem_id])
        if cmd.data > self.relogio.agora().date():
            raise RegraDeNegocioError(
                "O boletim se refere a um dia que já passou: a data não pode estar no futuro."
            )

    def _apurar(self, cmd: LancarCommand) -> Calculo:
        """Valida linhas e equipe e aplica a regra do piso (domínio)."""
        tipos = {t.codigo: t for t in self.session.scalars(select(TipoItem))}
        repetidos = _repetidos(linha.tipo_item for linha in cmd.linhas)
        if repetidos:
            raise RegraDeNegocioError(
                f"Cada tipo de item entra uma única vez no boletim (repetido: {', '.join(repetidos)})."
            )
        desconhecidos = sorted({linha.tipo_item for linha in cmd.linhas} - tipos.keys())
        if desconhecidos:
            raise RegraDeNegocioError(f"Tipo de item inválido: {', '.join(desconhecidos)}.")

        # Linhas sem nenhuma movimentação não são gravadas: o boletim só guarda o que foi feito.
        try:  # o domínio recusa quantidade negativa; valida TODAS antes de descartar as zeradas
            calculadas = [
                _linha_calculada(
                    linha.tipo_item,
                    tipos[linha.tipo_item].descricao,
                    linha.descarga,
                    linha.remocao,
                    linha.transferencia,
                    tipos[linha.tipo_item].preco_unitario,
                )
                for linha in cmd.linhas
            ]
        except ValueError as erro:
            raise RegraDeNegocioError(str(erro)) from erro
        linhas = [x for x in calculadas if x.quantidade_total > 0]

        if not linhas and not cmd.equipe:
            raise RegraDeNegocioError("Informe a produção do dia e/ou a equipe: o boletim está vazio.")

        matriculas = [m.matricula for m in cmd.equipe]
        try:
            validar_equipe(matriculas)
        except ValueError as erro:
            raise RegraDeNegocioError(str(erro)) from erro
        cadastrados = self.session.execute(
            select(Chapa.matricula, Chapa.nome).where(Chapa.matricula.in_(matriculas))
        )
        nomes = {matricula: nome for matricula, nome in cadastrados}
        ausentes = sorted(set(matriculas) - nomes.keys())
        if ausentes:
            raise RegraDeNegocioError(f"Matrícula não cadastrada: {', '.join(ausentes)}.")
        equipe = [MembroEquipe(m.matricula, nomes[m.matricula], m.tipo_diaria) for m in cmd.equipe]

        piso = self.piso()
        completas = sum(1 for m in equipe if m.tipo_diaria is TipoDiaria.COMPLETA)
        meias = len(equipe) - completas
        resultado = calcular_boletim(
            [LinhaProducao(x.preco_unitario, x.descarga, x.remocao, x.transferencia) for x in linhas],
            completas,
            meias,
            piso,
        )
        return Calculo(piso=piso, resultado=resultado, linhas=linhas, equipe=equipe)


def _linha_calculada(
    tipo_item: str,
    descricao: str,
    descarga: int,
    remocao: int,
    transferencia: int,
    preco_unitario: Decimal,
) -> LinhaCalculada:
    linha = LinhaProducao(preco_unitario, descarga, remocao, transferencia)
    return LinhaCalculada(
        tipo_item,
        descricao,
        descarga,
        remocao,
        transferencia,
        preco_unitario,
        linha.quantidade_total,
        linha.valor,
    )


def _repetidos(valores: Iterable[str]) -> list[str]:
    vistos: set[str] = set()
    repetidos: set[str] = set()
    for valor in valores:
        (repetidos if valor in vistos else vistos).add(valor)
    return sorted(repetidos)
