from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração por variável de ambiente (ou arquivo .env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    db_url: str = "postgresql+psycopg://skycef:skycef@localhost:5432/skycef"
    cors_origins: str = "http://localhost:5173"
    fuso: str = "America/Sao_Paulo"
    migrar_ao_iniciar: bool = True
    anthropic_api_key: str = ""

    @property
    def db_dsn(self) -> str:
        """URL no formato aceito pelo psycopg (sem o prefixo do SQLAlchemy)."""
        return self.db_url.replace("postgresql+psycopg://", "postgresql://", 1)

    @property
    def cors_origins_lista(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
