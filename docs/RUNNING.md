# Running locally

## Prerequisites

- Docker Desktop (or Docker Engine + Compose)

## Start

Use the script for your OS:

- macOS: scripts/start-mac.sh
- Linux: scripts/start-linux.sh
- Windows (PowerShell): scripts/start-windows.ps1

Or run directly:

```bash
docker compose up --build -d
```

## Stop

Use the script for your OS:

- macOS: scripts/stop-mac.sh
- Linux: scripts/stop-linux.sh
- Windows (PowerShell): scripts/stop-windows.ps1

Or run directly:

```bash
docker compose down
```

## Verify

```bash
curl http://localhost:8000/
curl http://localhost:8000/api/health
```
