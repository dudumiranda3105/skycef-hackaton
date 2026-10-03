# API FastAPI — Tarefa 1

Backend do agendamento da Cocapec com FastAPI, SQLAlchemy, Alembic e PostgreSQL.

## Execução local

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-dev.txt
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

- Swagger: `http://localhost:8000/docs`
- OpenAPI: `http://localhost:8000/openapi.json`
- Saúde: `http://localhost:8000/health`

O fluxo principal está em `/api/agendamentos`: upload da NF, validação de Compras,
autorização do armazém, chegada, entrada, saída, cancelamento, reagendamento e não
recebimento. Execute os testes com `.\.venv\Scripts\pytest`.
