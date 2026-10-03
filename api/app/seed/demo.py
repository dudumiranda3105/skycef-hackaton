"""Dados de demonstração (origem TESTE): 3 semanas de operação geradas pelos SERVIÇOS reais.

Nada aqui é dado da Cocapec: são registros de teste da equipe, marcados `TESTE`, para o painel ter o que
mostrar na demonstração. O roteiro simulado tem três momentos, para o painel mostrar os dois lados:

  semana 1 — equipe grande e pouco serviço   -> SOBRA (complemento do piso)
  semana 2 — equipe e serviço em equilíbrio  -> EQUILIBRADO
  semana 3 — equipe curta e muito serviço    -> FALTA (produção acima do piso)

    uv run python -m app.seed.demo --recriar

`--recriar` ESVAZIA fornecedores, agendamentos e boletins (inclusive os da plataforma) antes de gerar.
"""

import argparse
import random
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.agendamento import domain
from app.agendamento.domain import Acondicionamento, DecisaoCompras, MotivoNaoRecebimento
from app.agendamento.marcos import MarcosService
from app.agendamento.models import Agendamento, Descarga, NaoRecebimento
from app.agendamento.nao_recebimento import NaoRecebimentoService
from app.agendamento.service import AgendamentoService, AgendarCommand, NotaFiscalCmd
from app.boletim.domain import TipoDiaria
from app.boletim.service import BoletimService, LancarCommand, LinhaCmd, MembroCmd
from app.cadastros.service import ArmazemService, FornecedorService
from app.core.clock import Relogio
from app.core.db import get_sessionmaker
from app.shared.domain import Origem

FUSO = ZoneInfo("America/Sao_Paulo")
INSUMOS, ADUBO, PATIO, LOJA = 1, 2, 3, 4
PRIMEIRO_DIA = date(2026, 9, 14)  # segunda-feira
DIAS_UTEIS = 15

FORNECEDORES = [
    ("Agro Insumos Alfa Ltda", "11222333000181"),
    ("Fertilizantes Beta S.A.", "22333444000172"),
    ("Defensivos Gama do Brasil", "33444555000163"),
    ("Máquinas Delta Implementos", "44555666000154"),
    ("Nutrição Animal Épsilon", "55666777000145"),
    ("Sementes Zeta Ltda", "66777888000136"),
    ("Distribuidora Eta Agro", "77888999000127"),
    ("Peças Theta Agrícolas", "88999000000118"),
]

# Por semana: (chapas, carga de serviço em unidades) de cada armazém
ROTEIRO = {
    0: {ADUBO: (11, 1500), INSUMOS: (6, 700), LOJA: (3, 650), PATIO: (2, 90)},
    1: {ADUBO: (8, 2150), INSUMOS: (5, 1100), LOJA: (2, 600), PATIO: (1, 120)},
    2: {ADUBO: (6, 2500), INSUMOS: (4, 1700), LOJA: (2, 900), PATIO: (1, 160)},
}
PRIMEIRA_MATRICULA = {ADUBO: 1, INSUMOS: 14, LOJA: 24, PATIO: 30}
TIPO_PRINCIPAL = {ADUBO: "FERTILIZANTES", INSUMOS: "AGROQUIMICO", LOJA: "PECAS", PATIO: "MAQUINAS"}
TIPO_SECUNDARIO = {
    ADUBO: "SERVICOS_DIVERSOS",
    INSUMOS: "SERVICOS_DIVERSOS",
    LOJA: "MEDICAMENTOS",
    PATIO: "SERVICOS_DIVERSOS",
}


class RelogioMutavel(Relogio):
    """Relógio que o seed move para cada momento simulado."""

    def __init__(self, instante: datetime) -> None:
        super().__init__()
        self._instante = instante

    def definir(self, instante: datetime) -> None:
        self._instante = instante

    def agora(self) -> datetime:
        return self._instante


def _em(dia: date, hora: int, minuto: int = 0) -> datetime:
    return datetime.combine(dia, time(hora, minuto), tzinfo=FUSO)


def _dias_uteis() -> list[date]:
    dias, d = [], PRIMEIRO_DIA
    while len(dias) < DIAS_UTEIS:
        if d.weekday() < 5:
            dias.append(d)
        d += timedelta(days=1)
    return dias


class Semeador:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.relogio = RelogioMutavel(_em(PRIMEIRO_DIA, 6))
        self.agenda = AgendamentoService(session, self.relogio)
        self.marcos = MarcosService(session, self.relogio)
        self.nao_receb = NaoRecebimentoService(session, self.relogio)
        self.boletins = BoletimService(session, self.relogio)
        self.rng = random.Random(2026)
        self.sequencia_nf = 0
        self.fornecedores: list[int] = []
        self.empilhadeira_gas = {
            a: [e.id for e in ArmazemService(session).listar_equipamentos(a) if "gás" in e.tipo.lower()]
            for a in (INSUMOS, ADUBO, PATIO, LOJA)
        }

    # ------------------------------------------------------------------ fornecedores e agenda

    def criar_fornecedores(self) -> None:
        servico = FornecedorService(self.session)
        for nome, cnpj in FORNECEDORES:
            self.fornecedores.append(servico.cadastrar(nome, cnpj).id)

    def _nota(self) -> NotaFiscalCmd:
        self.sequencia_nf += 1
        return NotaFiscalCmd(
            nf_chave=f"3526{self.sequencia_nf:040d}", nf_numero=str(7000 + self.sequencia_nf)
        )

    def _acondicionamento(self) -> Acondicionamento:
        return self.rng.choices(
            [Acondicionamento.BATIDO, Acondicionamento.PALETIZADO, Acondicionamento.BIG_BAG], [25, 50, 25]
        )[0]

    def _destinos(self, acond: Acondicionamento) -> list[int]:
        if acond == Acondicionamento.BATIDO:
            return [ADUBO]
        if acond == Acondicionamento.BIG_BAG:
            return [self.rng.choice([ADUBO, INSUMOS])]
        return self.rng.choices([[INSUMOS], [LOJA], [INSUMOS, LOJA], [PATIO]], [55, 20, 10, 15])[0]

    def agendar_dia(self, dia: date, semana: int) -> list[tuple[int, datetime, Acondicionamento]]:
        """Agenda e autoriza os caminhões do dia: (agendamento, chegada prevista, acondicionamento)."""
        self.relogio.definir(_em(dia, 6, 0))
        caminhoes = self.rng.randint(5, 7) + (2 if semana == 2 else 0)
        ocupantes: dict[time, list[Acondicionamento]] = {h: [] for h in domain.HORARIOS}
        agendados = []
        for _ in range(caminhoes):
            acond, fornecedor = self._acondicionamento(), self.rng.choice(self.fornecedores)
            horarios = [h for h in domain.HORARIOS if domain.cabe(ocupantes[h], acond)]
            if not horarios:  # sem vaga: o caminhão chegou, não coube e não foi recebido
                self.relogio.definir(_em(dia, 11, 30))
                self.nao_receb.registrar(
                    MotivoNaoRecebimento.SEM_AGENDAMENTO_SEM_VAGA,
                    data=dia,
                    fornecedor_id=fornecedor,
                    descricao="Chegou sem agendamento e a grade do dia estava cheia",
                )
                self.relogio.definir(_em(dia, 6, 0))
                continue
            horario = self.rng.choice(horarios)
            ocupantes[horario].append(acond)
            ag = self.agenda.agendar(AgendarCommand(fornecedor, dia, horario, acond, (self._nota(),)))
            self.relogio.definir(_em(dia, 6, 20))
            if self.rng.random() < 0.06:  # divergência entre nota e pedido: Compras não autoriza
                self.agenda.decidir_compras(
                    ag.id,
                    DecisaoCompras.NAO_AUTORIZADO,
                    observacao="Quantidade da nota maior que a do pedido",
                )
                ocupantes[horario].remove(acond)
                continue
            self.agenda.decidir_compras(ag.id, DecisaoCompras.AUTORIZADO, f"PC{40000 + ag.id}")
            self.agenda.definir_destinos(ag.id, self._destinos(acond))
            atraso = timedelta(minutes=self.rng.randint(-15, 25))
            agendados.append((ag.id, datetime.combine(dia, horario, tzinfo=FUSO) + atraso, acond))
        return agendados

    # ------------------------------------------------------------------ descarga

    def descarregar(self, ocupado_ate: dict[int, datetime], previstos: list) -> None:
        """Chegada, entrada e saída de cada caminhão, na ordem de chegada. O tempo de espera nasce da fila:
        um armazém só começa outra descarga quando termina a anterior."""
        for agendamento_id, chegada, acond in sorted(previstos, key=lambda p: p[1]):
            self.relogio.definir(chegada)
            self.marcos.registrar_chegada(agendamento_id, chegada)
            descargas = list(
                self.session.scalars(
                    select(Descarga).where(Descarga.agendamento_id == agendamento_id).order_by(Descarga.id)
                )
            )
            disponivel = chegada
            for descarga in descargas:
                entrada = max(disponivel, ocupado_ate.get(descarga.armazem_id, disponivel)) + timedelta(
                    minutes=self.rng.randint(1, 6)
                )
                if disponivel > chegada:  # 2º destino: voltou à fila ao sair do 1º
                    self.relogio.definir(disponivel)
                    self.marcos.registrar_chegada_descarga(descarga.id, disponivel)
                duracao = timedelta(minutes=self._duracao(acond, descarga.armazem_id))
                self.relogio.definir(entrada)
                self.marcos.registrar_entrada(descarga.id, entrada)
                saida = entrada + duracao
                chapas = 1 if descarga.armazem_id == PATIO else 5 if acond == Acondicionamento.BATIDO else 2
                equipamentos = (
                    self.empilhadeira_gas[descarga.armazem_id][:1] if acond != Acondicionamento.BATIDO else []
                )
                self.relogio.definir(saida)
                self.marcos.registrar_saida(descarga.id, chapas, equipamentos, saida)
                ocupado_ate[descarga.armazem_id] = saida
                disponivel = saida

    def _duracao(self, acond: Acondicionamento, armazem: int) -> int:
        """Minutos de descarga, em torno das estimativas do dossiê (seção 9), com variação."""
        if armazem == PATIO:
            return self.rng.randint(15, 22)
        if acond == Acondicionamento.BATIDO:
            return self.rng.randint(38, 55)
        if acond == Acondicionamento.BIG_BAG:
            return self.rng.randint(26, 36)
        return self.rng.randint(14, 30)

    def nao_recebimentos_avulsos(self, dia: date, semana: int) -> None:
        if dia.weekday() == 1:
            self.relogio.definir(_em(dia, 9, 10))
            self.nao_receb.registrar(
                MotivoNaoRecebimento.CASO_FORTUITO,
                data=dia,
                fornecedor_id=self.rng.choice(self.fornecedores),
                descricao="Chuva forte impediu a descarga",
            )
        if dia.weekday() == 3 and semana == 1:
            self.relogio.definir(_em(dia, 14, 0))
            self.nao_receb.registrar(
                MotivoNaoRecebimento.OUTRO,
                data=dia,
                fornecedor_nome="Transportadora Iota",
                descricao="Veículo sem condição de descarga (carroceria danificada)",
            )

    # ------------------------------------------------------------------ boletim

    def lancar_boletins(self, dia: date, semana: int) -> None:
        """Boletim do dia, lançado na manhã seguinte (como na operação real)."""
        seguinte = dia + timedelta(days=1)
        self.relogio.definir(_em(seguinte, 8, 0))
        for armazem, (n_chapas, carga) in ROTEIRO[semana].items():
            movimento = max(10, int(carga * self.rng.uniform(0.85, 1.15)))
            descarga = int(movimento * self.rng.uniform(0.45, 0.6))
            transferencia = int(movimento * self.rng.uniform(0.0, 0.08))
            remocao = movimento - descarga - transferencia
            secundario = max(1, int(movimento * 0.03))
            linhas = (
                LinhaCmd(TIPO_PRINCIPAL[armazem], descarga, remocao - secundario, transferencia),
                LinhaCmd(TIPO_SECUNDARIO[armazem], remocao=secundario),
            )
            inicio = PRIMEIRA_MATRICULA[armazem]
            equipe = [
                MembroCmd(
                    f"CHAPA_{inicio + i:02d}",
                    TipoDiaria.MEIA if self.rng.random() < 0.1 else TipoDiaria.COMPLETA,
                )
                for i in range(n_chapas)
            ]
            if armazem == INSUMOS and dia.weekday() == 2:  # mesma pessoa em dois armazéns no mesmo dia
                equipe[0] = MembroCmd("CHAPA_01", TipoDiaria.MEIA)
            self.boletins.lancar(LancarCommand(armazem, dia, linhas, tuple(equipe)), origem=Origem.TESTE)


def semear(session: Session, recriar: bool) -> dict[str, int]:
    existentes = session.scalar(select(func.count()).select_from(Agendamento))
    if existentes and not recriar:
        raise SystemExit(
            f"O banco já tem {existentes} agendamentos. Use --recriar para esvaziar e gerar de novo "
            "(isso apaga também os registros da plataforma)."
        )
    if recriar:
        session.execute(text("truncate fornecedor, agendamento, boletim restart identity cascade"))
        session.commit()
    ids_antes = session.scalar(select(func.coalesce(func.max(Agendamento.id), 0)))
    nao_antes = session.scalar(select(func.coalesce(func.max(NaoRecebimento.id), 0)))

    s = Semeador(session)
    s.criar_fornecedores()
    ocupado_ate: dict[int, datetime] = {}
    for i, dia in enumerate(_dias_uteis()):
        semana = i // 5
        previstos = s.agendar_dia(dia, semana)
        s.descarregar(ocupado_ate, previstos)
        s.nao_recebimentos_avulsos(dia, semana)
        s.lancar_boletins(dia, semana)

    # Os serviços gravam PLATAFORMA; tudo o que o seed criou é TESTE
    session.execute(text("update agendamento set origem = 'TESTE' where id > :i"), {"i": ids_antes})
    session.execute(text("update nao_recebimento set origem = 'TESTE' where id > :i"), {"i": nao_antes})
    session.commit()
    return {
        "agendamentos": session.scalar(select(func.count()).select_from(Agendamento)),
        "descargas": session.scalar(select(func.count()).select_from(Descarga)),
        "naoRecebimentos": session.scalar(select(func.count()).select_from(NaoRecebimento)),
        "boletins": session.execute(text("select count(*) from boletim")).scalar_one(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera dados de demonstração (origem TESTE).")
    parser.add_argument("--recriar", action="store_true", help="esvazia os dados operacionais antes")
    args = parser.parse_args()
    with get_sessionmaker()() as session:
        resumo = semear(session, args.recriar)
    for campo, valor in resumo.items():
        print(f"{campo}: {valor}")


if __name__ == "__main__":
    main()
