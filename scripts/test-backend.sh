#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -x "$ROOT/.venv/bin/python" ]; then
  "$ROOT/.venv/bin/python" -m pytest "$ROOT/backend"
else
  python -m pytest "$ROOT/backend"
fi
