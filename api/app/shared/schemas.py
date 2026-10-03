from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class EsquemaBase(BaseModel):
    """JSON em camelCase (contrato com o front); no Python continua snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EsquemaEntrada(EsquemaBase):
    """Entrada da API. `extra=forbid` impede mass assignment: o cliente não consegue enviar
    campos que só o servidor define (status, origem, limite_ignorado...)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")
