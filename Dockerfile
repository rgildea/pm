FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* /app/frontend/
RUN npm install

COPY frontend /app/frontend
RUN npm run build

FROM python:3.12-slim

WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
ENV PATH="/app/backend/.venv/bin:$PATH"

COPY backend /app/backend
COPY frontend/default-board.json /app/frontend/default-board.json
COPY --from=frontend-build /app/frontend/out /app/backend/static

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
