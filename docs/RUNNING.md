# Running locally

## Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- OPENROUTER_API_KEY in .env at the project root

## Start

Use the script for your OS:

- macOS: scripts/start-mac.sh
- Linux: scripts/start-linux.sh
- Windows (PowerShell): scripts/start-windows.ps1

Or run directly:

```bash
docker compose up --build -d
```

## Environment

The backend loads .env from the project root on startup and in tests. Supported
variables:

- OPENROUTER_API_KEY (required for AI endpoints)
- OPENROUTER_MODEL (optional, defaults to openai/gpt-oss-120b:free)
- OPENROUTER_REFERRER (optional)
- OPENROUTER_TITLE (optional)

## Stop

Use the script for your OS:

- macOS: scripts/stop-mac.sh
- Linux: scripts/stop-linux.sh
- Windows (PowerShell): scripts/stop-windows.ps1

Or run directly:

```bash
docker compose down
```

## Tests

Backend:

- macOS/Linux: scripts/test-backend.sh
- Windows (PowerShell): scripts/test-backend.ps1

Frontend:

- npm run test:unit
- npm run typecheck

## Verify

```bash
curl http://localhost:8000/
curl http://localhost:8000/api/health
```
