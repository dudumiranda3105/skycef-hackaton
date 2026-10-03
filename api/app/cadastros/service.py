from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cadastros.models import Armazem, DataNaoOperacional, Equipamento, Fornecedor
from app.core.errors import ConflitoError, NaoEncontradoError, RegraDeNegocioError

_SABADO, _DOMINGO = 5, 6  # date.weekday()


class CalendarioService:
    """Recebimento de fornecedor só de segunda a sexta, sem feriados (dossiê, seção 7)."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def motivo_dia_nao_util(self, data: date) -> str | None:
        """Devolve o motivo pelo qual não há recebimento na data, ou None se for dia útil."""
        if data.weekday() in (_SABADO, _DOMINGO):
            return "Não há recebimento aos sábados e domingos."
        dia = self.session.get(DataNaoOperacional, data)
        if dia is not None:
            return f"Não há recebimento em feriados ({dia.descricao})."
        return None


class ArmazemService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def listar(self) -> list[Armazem]:
        return list(self.session.scalars(select(Armazem).order_by(Armazem.id)))

    def listar_equipamentos(self, armazem_id: int | None = None) -> list[Equipamento]:
        consulta = select(Equipamento).order_by(Equipamento.armazem_id, Equipamento.identificacao)
        if armazem_id is not None:
            consulta = consulta.where(Equipamento.armazem_id == armazem_id)
        return list(self.session.scalars(consulta))

    def exigir_existentes(self, ids: Sequence[int]) -> None:
        achados = set(self.session.scalars(select(Armazem.id).where(Armazem.id.in_(ids))))
        faltando = sorted(set(ids) - achados)
        if faltando:
            raise RegraDeNegocioError(f"Armazém inválido: {', '.join(str(i) for i in faltando)}.")

class FornecedorService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def exigir_existente(self, fornecedor_id: int) -> None:
        if self.session.get(Fornecedor, fornecedor_id) is None:
            raise NaoEncontradoError(f"Fornecedor não encontrado: {fornecedor_id}")

    def listar(self) -> list[Fornecedor]:
        return list(self.session.scalars(select(Fornecedor).order_by(Fornecedor.razao_social)))

    def cadastrar(self, razao_social: str, cnpj: str | None) -> Fornecedor:
        """Cadastro rápido, usado também no fluxo de caminhão sem agendamento."""
        if cnpj is not None:
            existente = self.session.scalar(select(Fornecedor).where(Fornecedor.cnpj == cnpj))
            if existente is not None:
                raise ConflitoError("Já existe um fornecedor cadastrado com este CNPJ.")
        fornecedor = Fornecedor(razao_social=razao_social.strip(), cnpj=cnpj)
        self.session.add(fornecedor)
        self.session.commit()
        return fornecedor
