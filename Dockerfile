FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* /app/frontend/
RUN npm install

COPY frontend /app/frontend
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

COPY backend/requirements.txt /app/requirements.txt
RUN uv pip install --system -r /app/requirements.txt

COPY backend /app/backend
COPY --from=frontend-build /app/frontend/out /app/backend/static

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
