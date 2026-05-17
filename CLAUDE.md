# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Kanban project management app: Next.js frontend statically exported and served by a FastAPI backend at `/`. Auth is purely client-side (hardcoded `user` / `password` in React state — no server session). Board state is persisted in SQLite. AI chat uses OpenRouter with in-memory conversation history (resets on restart).

## Running

**Start/stop (Docker):**

```bash
docker compose up --build -d
docker compose down
```

Scripts for your OS are in `scripts/` (start-mac.sh, stop-mac.sh, etc.).

**Backend tests:**

```bash
scripts/test-backend.sh          # macOS/Linux
scripts/test-backend.ps1         # Windows
# single test:
cd backend && python -m pytest tests/test_board_api.py::test_name -v
```

**Frontend tests:**

```bash
cd frontend
npm run test:unit                # Vitest unit tests
npm run typecheck                # tsc type check
npm run test:e2e                 # Playwright (requires running app)
```

## Architecture

### Request flow

Browser → FastAPI (`/api/*`) or static files (`/`) → SQLite for board, OpenRouter for AI.

### Docker build

`Dockerfile` is a two-stage build: stage 1 runs `npm run build` in `frontend/`, producing `out/`. Stage 2 copies that into `backend/static/` which FastAPI mounts at `/`.

### Backend (`backend/`)

- `app/main.py`: `create_app(db_path)` factory wires all routes. The `db_path` parameter lets tests inject a temp DB. `app.state.ai_history` holds the per-process AI conversation.
- `app/db.py`: SQLite helpers. `init_db` creates tables and seeds the single `"user"` row on startup. The `PM_DB_PATH` env var overrides the default path.
- `app/ai.py`: Calls OpenRouter (`call_openrouter_messages`), builds prompts with full board JSON + history, parses structured JSON responses.
- `app/schemas.py`: `BoardState` shape (`columns: list[dict]`, `cards: dict[str, dict]`). `AIChatResponse` carries `response: str` and optional `board: BoardState | None`.
- `backend/tests/conftest.py`: Sets `PM_DB_PATH` to a temp dir before any imports so tests never touch the production DB.

### Frontend (`frontend/src/`)

- `app/page.tsx`: Login gate — renders `LoginScreen` or `KanbanBoard` based on React state.
- `components/KanbanBoard.tsx`: Owns all board state. Fetches from `/api/board` on mount, calls `persistBoard` (PUT `/api/board`) on every mutation, and accepts AI board updates via `handleAiBoardUpdate`.
- `components/ChatSidebar.tsx`: Posts to `/api/ai/chat` with the current `board` snapshot and calls `onBoardUpdate` when the response includes a board.
- `lib/kanban.ts`: `BoardData` type (`columns: Column[], cards: Record<string, Card>`), `moveCard` logic, `createId` utility.

### Board data shape

```typescript
BoardData {
  columns: [{ id, title, cardIds: string[] }]
  cards:   { [cardId]: { id, title, details } }
}
```

The columns array defines order; `cardIds` within each column defines card order.

## Environment variables

Loaded from `.env` at the project root (both at runtime and in tests). Required: `OPENROUTER_API_KEY`. Optional: `OPENROUTER_MODEL` (default `openai/gpt-oss-120b:free`), `OPENROUTER_REFERRER`, `OPENROUTER_TITLE`, `PM_DB_PATH`.

## Coding standards

- No over-engineering. No unnecessary defensive programming. Keep it simple.
- No emojis anywhere.
- Identify root cause with evidence before fixing issues — do not guess.
- Use latest idiomatic approaches for both Python and TypeScript.
- work incrementally with small steps. Validate each increment.

## Color scheme (CSS variables in `frontend/src/app/globals.css`)

- `--accent-yellow`: `#ecad0a`
- `--primary-blue`: `#209dd7`
- `--secondary-purple`: `#753991`
- `--navy-dark`: `#032147`
- `--gray-text`: `#888888`
