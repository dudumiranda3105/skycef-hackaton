from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import Field
from sqlalchemy.orm import Session

from app.cadastros.models import Armazem, Equipamento, Fornecedor
from app.cadastros.service import ArmazemService, FornecedorService
from app.core.db import get_session
from app.shared.schemas import EsquemaBase, EsquemaEntrada

router = APIRouter(prefix="/api", tags=["Cadastros"])


class FornecedorIn(EsquemaEntrada):
    razao_social: Annotated[str, Field(min_length=1, max_length=200)]
    cnpj: Annotated[str | None, Field(pattern=r"^[0-9]{14}$", description="14 dígitos, sem pontuação")] = None


class FornecedorOut(EsquemaBase):
    id: int
    razao_social: str
    cnpj: str | None

    @classmethod
    def desde(cls, f: Fornecedor) -> "FornecedorOut":
        return cls(id=f.id, razao_social=f.razao_social, cnpj=f.cnpj)


class ArmazemOut(EsquemaBase):
    id: int
    codigo: str
    nome: str

    @classmethod
    def desde(cls, a: Armazem) -> "ArmazemOut":
        return cls(id=a.id, codigo=a.codigo, nome=a.nome)


class EquipamentoOut(EsquemaBase):
    id: int
    armazem_id: int
    identificacao: str
    tipo: str
    observacao: str | None

    @classmethod
    def desde(cls, e: Equipamento) -> "EquipamentoOut":
        return cls.model_validate(e, from_attributes=True)


def get_service(session: Annotated[Session, Depends(get_session)]) -> FornecedorService:
    return FornecedorService(session)


def get_armazens(session: Annotated[Session, Depends(get_session)]) -> ArmazemService:
    return ArmazemService(session)


@router.get("/fornecedores", response_model=list[FornecedorOut], summary="Lista os fornecedores")
def listar(servico: Annotated[FornecedorService, Depends(get_service)]) -> list[FornecedorOut]:
    return [FornecedorOut.desde(f) for f in servico.listar()]


@router.post(
    "/fornecedores",
    response_model=FornecedorOut,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastro rápido de fornecedor",
)
def cadastrar(
    corpo: FornecedorIn, servico: Annotated[FornecedorService, Depends(get_service)]
) -> FornecedorOut:
    return FornecedorOut.desde(servico.cadastrar(corpo.razao_social, corpo.cnpj))


@router.get(
    "/armazens",
    response_model=list[ArmazemOut],
    summary="Armazéns de destino (Insumos, Adubo, Pátio de Máquinas, Loja)",
)
def listar_armazens(servico: Annotated[ArmazemService, Depends(get_armazens)]) -> list[ArmazemOut]:
    return [ArmazemOut.desde(a) for a in servico.listar()]


@router.get(
    "/equipamentos",
    response_model=list[EquipamentoOut],
    summary="Equipamentos individuais disponíveis para registrar uma descarga",
)
def listar_equipamentos(
    servico: Annotated[ArmazemService, Depends(get_armazens)],
    armazem_id: int | None = None,
) -> list[EquipamentoOut]:
    return [EquipamentoOut.desde(e) for e in servico.listar_equipamentos(armazem_id)]
