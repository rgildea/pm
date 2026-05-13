#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE_URL="http://localhost:8000"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

trap 'docker compose down' EXIT

echo "Building and starting container..."
docker compose up --build -d

echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -sf "$BASE_URL/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    fail "Server did not start within 30 seconds"
  fi
done

curl -sf "$BASE_URL/api/health" | grep -q "ok" || fail "/api/health"
pass "/api/health"

response=$(curl -sf "$BASE_URL/api/board")
echo "$response" | grep -q "columns" || fail "/api/board missing columns"
echo "$response" | grep -q "cards"   || fail "/api/board missing cards"
pass "/api/board"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
[ "$status" = "200" ] || fail "/ returned HTTP $status"
pass "/ (static frontend)"

if ! grep -q "OPENROUTER_API_KEY" "$ROOT/.env" 2>/dev/null; then
  echo "SKIP: AI tests (OPENROUTER_API_KEY not in .env)"
else
  curl -sf "$BASE_URL/api/ai/test" | grep -q "response" || fail "/api/ai/test"
  pass "/api/ai/test"

  response=$(curl -sf -X POST "$BASE_URL/api/ai/chat" \
    -H "Content-Type: application/json" \
    -d '{
      "message": "Move card-1 to the Done column",
      "board": {
        "columns": [
          {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]},
          {"id": "col-done",    "title": "Done",    "cardIds": []}
        ],
        "cards": {
          "card-1": {"id": "card-1", "title": "Test card", "details": "Details here"}
        }
      }
    }')
  echo "$response" | grep -q "response" || fail "/api/ai/chat missing response field"
  echo "$response" | grep -q "board"    || fail "/api/ai/chat missing board field"
  pass "/api/ai/chat"
fi

echo ""
echo "All smoke tests passed."
