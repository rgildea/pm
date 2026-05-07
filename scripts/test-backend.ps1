$ErrorActionPreference = "Stop"

$pythonPath = "/Users/ryan/projects/pm/.venv/bin/python"
if (Test-Path $pythonPath) {
  & $pythonPath -m pytest /Users/ryan/projects/pm/backend
} else {
  python -m pytest /Users/ryan/projects/pm/backend
}
