# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Kanban project management app. Key features:

- Real user auth: login, registration, persistent sessions (Bearer tokens in localStorage)
- Multiple Kanban boards per user — create, rename, delete, switch boards
- Cards with drag-and-drop, inline editing, priority (low/medium/high), and due dates
- Search and filter cards by text or priority within a board
- AI chat sidebar (per board) that can create, edit, and move cards

**Auth model:** Server-side auth via `/api/auth/*` endpoints. Passwords hashed with PBKDF2-SHA256 + salt. Sessions stored in SQLite with 30-day expiry. Bearer token sent in `Authorization` header.

Next.js frontend statically exported and served by a FastAPI backend at `/`. Board state is persisted in SQLite. AI chat uses OpenRouter with per-user in-memory conversation history (resets on restart).

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

Browser → FastAPI (`/api/*`) or static files (`/`) → SQLite for board/auth, OpenRouter for AI.

All `/api/board*` endpoints require `Authorization: Bearer <token>`.

### Docker build

`Dockerfile` is a two-stage build: stage 1 runs `npm run build` in `frontend/`, producing `out/`. Stage 2 copies that into `backend/static/` which FastAPI mounts at `/`.

### Backend (`backend/`)

- `app/main.py`: `create_app(db_path)` factory wires all routes. Auth middleware via FastAPI `Depends`. Per-user AI history in `app.state.ai_history`.
- `app/auth.py`: Password hashing (PBKDF2-SHA256), verification, token generation.
- `app/db.py`: SQLite helpers. `init_db` creates tables (users, sessions, boards) and seeds the default `user/password` account. The `PM_DB_PATH` env var overrides the default path.
- `app/ai.py`: Calls OpenRouter (`call_openrouter_messages`), builds prompts with full board JSON + history, parses structured JSON responses.
- `app/schemas.py`: `BoardState` shape with `Card` (id, title, details, priority, due_date). Pydantic validation for referential integrity, priority values, and due_date format.
- `backend/tests/conftest.py`: Sets `PM_DB_PATH` to a temp dir before any imports so tests never touch the production DB. `login()` helper and `app_client` fixture provide authenticated test clients.

### API endpoints

**Auth:**
- `POST /api/auth/register` — create account, returns token
- `POST /api/auth/login` — returns token
- `POST /api/auth/logout` — invalidates token
- `GET /api/auth/me` — returns current user info (auth required)

**Boards (all auth required):**
- `GET /api/boards` — list user's boards
- `POST /api/boards` — create board
- `GET /api/boards/{id}` — get board state + title
- `PUT /api/boards/{id}` — replace board state
- `PATCH /api/boards/{id}` — rename board
- `DELETE /api/boards/{id}` — delete board (cannot delete last board)
- `POST /api/boards/{id}/ai/chat` — AI chat for this board

**Legacy (auth required, uses first board):**
- `GET /api/board`, `PUT /api/board`, `POST /api/ai/chat`

### Frontend (`frontend/src/`)

- `app/page.tsx`: Auth flow — checks localStorage token, renders login/register or board UI.
- `lib/api.ts`: API client — handles auth tokens, all fetch calls, `ApiError` class.
- `components/KanbanBoard.tsx`: Owns board state. Multi-board aware (takes `boards`, `activeBoardId` as props). Includes filter state and `handleEditCard`.
- `components/BoardSelector.tsx`: Board switcher with create/rename (double-click)/delete.
- `components/FilterBar.tsx`: Search by text + filter by priority.
- `components/ChatSidebar.tsx`: Per-board AI chat using `/api/boards/{id}/ai/chat`.
- `components/KanbanCard.tsx`: Draggable card with inline edit mode, priority badge, due date badge with overdue indicator.
- `components/NewCardForm.tsx`: Inline form to add cards with title, details, priority.
- `lib/kanban.ts`: `BoardData`, `Card`, `Column`, `Priority` types; `moveCard` logic; `createId` utility.

### Board data shape

```typescript
BoardData {
  columns: [{ id, title, cardIds: string[] }]
  cards:   { [cardId]: { id, title, details, priority, due_date } }
}
```

Cards have: `priority: "low" | "medium" | "high"` (default "medium") and `due_date: "YYYY-MM-DD" | null`.

## Environment variables

Loaded from `.env` at the project root (both at runtime and in tests). Required: `OPENROUTER_API_KEY`. Optional: `OPENROUTER_MODEL` (default `openai/gpt-oss-120b:free`), `OPENROUTER_REFERRER`, `OPENROUTER_TITLE`, `PM_DB_PATH`.

## Coding standards

- No over-engineering. No unnecessary defensive programming. No extra features. Keep it simple.
- No emojis anywhere. Keep READMEs minimal.
- Identify root cause with evidence before fixing — do not guess.
- Use latest idiomatic approaches for both Python and TypeScript.
- Work incrementally with small steps. Validate each increment.

## Docs

- `docs/DATABASE.md` — database model rationale (JSON blob per board, users table, schema approach)
- `docs/PLAN.md` — phased execution plan with checklists; useful for understanding what has been built and why

## Color scheme (CSS variables in `frontend/src/app/globals.css`)

- `--accent-yellow`: `#ecad0a`
- `--primary-blue`: `#209dd7`
- `--secondary-purple`: `#753991`
- `--navy-dark`: `#032147`
- `--gray-text`: `#888888`
