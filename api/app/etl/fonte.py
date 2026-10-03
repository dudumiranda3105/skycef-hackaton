"""Origem dos dados da Cocapec: a pasta extraída ou o próprio .zip. Os arquivos NUNCA vão para o Git."""

import zipfile
from pathlib import Path


class Fonte:
    def __init__(self, caminho: str | Path) -> None:
        self.caminho = Path(caminho)
        if not self.caminho.exists():
            raise FileNotFoundError(f"Dados da Cocapec não encontrados em {self.caminho}")
        self._zip = zipfile.ZipFile(self.caminho) if self.caminho.is_file() else None

    def ler(self, relativo: str) -> bytes:
        """`relativo` é o caminho dentro do pacote, ex.: 04_mao_de_obra/chapas_por_dia_2025.xlsx."""
        if self._zip is not None:
            nome = next(
                (n for n in self._zip.namelist() if n.endswith("/" + relativo) or n == relativo), None
            )
            if nome is None:
                raise FileNotFoundError(f"{relativo} não está em {self.caminho}")
            return self._zip.read(nome)
        candidatos = [self.caminho / relativo, *self.caminho.glob(f"*/{relativo}")]
        for candidato in candidatos:
            if candidato.exists():
                return candidato.read_bytes()
        raise FileNotFoundError(f"{relativo} não encontrado em {self.caminho}")
