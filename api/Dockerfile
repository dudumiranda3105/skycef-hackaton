FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Sao_Paulo

WORKDIR /app
RUN pip install --no-cache-dir uv

# dependências primeiro, para aproveitar o cache de camadas
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app
COPY migrations ./migrations

ENV PATH="/app/.venv/bin:$PATH"

# usuário sem privilégios
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
