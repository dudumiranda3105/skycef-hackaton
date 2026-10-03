from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import get_settings


class Relogio:
    """Relógio único da aplicação, no fuso da cooperativa.

    O servidor pode rodar em UTC; sem isto "hoje" viraria "amanhã" depois das 21h.
    Injetá-lo permite fixar o tempo nos testes.
    """

    def __init__(self, fuso: str = "America/Sao_Paulo") -> None:
        self.fuso = ZoneInfo(fuso)

    def agora(self) -> datetime:
        return datetime.now(self.fuso)


class RelogioFixo(Relogio):
    def __init__(self, instante: datetime) -> None:
        super().__init__(str(instante.tzinfo) if instante.tzinfo else "America/Sao_Paulo")
        self._instante = instante

    def agora(self) -> datetime:
        return self._instante


def get_relogio() -> Relogio:
    """Dependência do FastAPI."""
    return Relogio(get_settings().fuso)
