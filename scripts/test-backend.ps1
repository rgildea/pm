$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

$pythonPath = Join-Path $root ".venv" "bin" "python"
if (Test-Path $pythonPath) {
  & $pythonPath -m pytest (Join-Path $root "backend")
} else {
  python -m pytest (Join-Path $root "backend")
}
