#!/usr/bin/env bash
set -euo pipefail

if [ -x "/Users/ryan/projects/pm/.venv/bin/python" ]; then
  /Users/ryan/projects/pm/.venv/bin/python -m pytest /Users/ryan/projects/pm/backend
else
  python -m pytest /Users/ryan/projects/pm/backend
fi
