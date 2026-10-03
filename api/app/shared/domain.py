from enum import StrEnum


class Origem(StrEnum):
    """De onde vem o dado. O regulamento exige declarar a origem de cada informação do painel."""

    PLATAFORMA = "PLATAFORMA"  # registrado pelo uso real do sistema
    SIMULADO = "SIMULADO"  # gerado pela equipe para teste/demonstração
    HISTORICO = "HISTORICO"  # importado do pacote de dados da Cocapec
