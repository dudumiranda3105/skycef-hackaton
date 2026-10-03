"""Montagem de dados para os testes do painel: histórico sintético e fluxos reais da plataforma."""

from datetime import date, datetime, time, timedelta
from itertools import count

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.agendamento.domain import Acondicionamento, DecisaoCompras
from app.agendamento.marcos import MarcosService
from app.agendamento.models import Descarga
from app.agendamento.service import AgendamentoService, AgendarCommand, NotaFiscalCmd
from app.cadastros.models import Fornecedor
from app.painel.models import HistChapaDia, HistRecebimentoItem
from app.seed.demo import FUSO, RelogioMutavel

_NF = count(1)
_NR = count(1)


def em(dia: date, hora: int, minuto: int = 0) -> datetime:
    return datetime.combine(dia, time(hora, minuto), tzinfo=FUSO)


def dias_uteis(ano: int, mes: int, quantos: int) -> list[date]:
    dias, d = [], date(ano, mes, 1)
    while len(dias) < quantos:
        if d.weekday() < 5:
            dias.append(d)
        d += timedelta(days=1)
    return dias


# ---------------------------------------------------------------- histórico sintético


def limpar_historico(s: Session) -> None:
    s.execute(text("truncate hist_recebimento_item, hist_chapa_dia restart identity"))
    s.commit()


def historico_dia(s: Session, dia: date, presentes: int, eventos: dict[str, int], cafe: int = 0) -> None:
    """Um dia de folha e `eventos` = {depósito: nº de recebimentos}. O 1º recebimento de cada depósito tem
    DOIS itens (duas linhas), para provar que a contagem é por recebimento e não por linha."""
    s.add(HistChapaDia(data=dia, dia_semana=dia.strftime("%a"), qtd_presentes=presentes, qtd_cafe=cafe))
    for deposito, n in eventos.items():
        for i in range(n):
            nr = str(next(_NR))
            for item in range(2 if i == 0 else 1):
                s.add(
                    HistRecebimentoItem(
                        item_codigo=f"X{item}",
                        deposito=deposito,
                        nr_recebimento=nr,
                        data_recebimento=dia,
                        fornecedor_nome="ACME",
                    )
                )
    s.commit()


def recebimentos_sem_folha(s: Session, dia: date, deposito: str, n: int) -> None:
    for _ in range(n):
        s.add(
            HistRecebimentoItem(
                item_codigo="X", deposito=deposito, nr_recebimento=str(next(_NR)), data_recebimento=dia
            )
        )
    s.commit()


# ---------------------------------------------------------------- plataforma


def fornecedor(s: Session, nome: str = "Fornecedor Teste") -> int:
    f = Fornecedor(razao_social=nome, cnpj=None)
    s.add(f)
    s.commit()
    return f.id


def descarga(
    s: Session,
    fornecedor_id: int,
    dia: date,
    horario: time,
    acond: Acondicionamento,
    armazem: int,
    chegada: tuple[int, int],
    entrada: tuple[int, int],
    saida: tuple[int, int] | None,
    chapas: int = 2,
) -> int:
    """Percorre o fluxo REAL (agendar -> Compras -> destino -> chegada -> entrada -> saída) e devolve o
    id do agendamento. `saida=None` deixa a descarga em andamento."""
    relogio = RelogioMutavel(em(dia, 6))
    agenda, marcos = AgendamentoService(s, relogio), MarcosService(s, relogio)
    n = next(_NF)
    ag = agenda.agendar(
        AgendarCommand(fornecedor_id, dia, horario, acond, (NotaFiscalCmd(str(n).zfill(44), str(n)),))
    )
    agenda.decidir_compras(ag.id, DecisaoCompras.AUTORIZADO, f"PC{n}")
    agenda.definir_destinos(ag.id, [armazem])
    d = s.scalars(select(Descarga).where(Descarga.agendamento_id == ag.id)).one()
    for instante, passo in ((chegada, "chegada"), (entrada, "entrada")):
        quando = em(dia, *instante)
        relogio.definir(quando)
        if passo == "chegada":
            marcos.registrar_chegada(ag.id, quando)
        else:
            marcos.registrar_entrada(d.id, quando)
    if saida is not None:
        quando = em(dia, *saida)
        relogio.definir(quando)
        marcos.registrar_saida(d.id, chapas, [], quando)
    return ag.id
