# Code Review

Review date: 2026-05-13
Scope: Full project audit of backend, frontend, tests, and build configuration.

---

## Backend

### app/main.py

- **Duplicate AI call functions**: `call_openrouter` and `call_openrouter_messages` in `app/ai.py` (lines 41-66) are nearly identical. `call_openrouter` wraps a plain string prompt in a single-user message and delegates to the same HTTP logic. It could simply delegate to `call_openrouter_messages` to remove the duplication.

- **Global AI history**: `app.state.ai_history` (line 38) is shared across all requests. History persists across page refreshes and is not per-user. Acceptable for single-user MVP but documented as a known limitation in `backend/AGENTS.md`. Worth re-iterating: this means a browser refresh does not reset conversation context.

- **No API auth middleware**: The dummy auth is entirely client-side. Any client that can reach the backend can read/write board state and call the AI endpoint. This is an explicit MVP tradeoff (documented in `backend/AGENTS.md`) but should be flagged as a security gap for any future multi-user or public deployment.

- **Env var naming inconsistency**: `PM_DB_PATH` uses a project-specific prefix while `OPENROUTER_*` vars use the service name prefix. Minor but inconsistent.

### app/ai.py

- **Duplicate HTTP logic**: As noted above, `call_openrouter` and `call_openrouter_messages` share the same HTTP POST logic, timeout, error handling, and response parsing. Extract the shared body into a private helper.

- **System prompt may lead to invalid JSON**: The system prompt instructs the model to "Return JSON only" with specific keys. But the `_strip_code_fences` and `_extract_json` fallback logic suggests the model sometimes wraps JSON in markdown code fences. This defensive parsing works, but the prompt could be strengthened to reduce fence-wrapped responses.

### app/schemas.py

- **Weakly-typed board models**: `BoardState.columns` is `list[dict[str, Any]]` and `cards` is `dict[str, dict[str, Any]]`. Pydantic cannot validate the internal structure of columns (id, title, cardIds) or cards (id, title, details). Consider defining `ColumnModel` and `CardModel` for stronger validation.

### app/db.py

- **No connection pooling**: A new SQLite connection is opened and closed on every `get_board_state` / `update_board_state` call. Fine for single-user MVP but would not scale.

### app/board_defaults.py

- **Mirror comment is the only sync mechanism**: The comment says "If you change one, update the other" but there is no automated check that `DEFAULT_BOARD_STATE` matches `frontend/src/lib/kanban.ts:initialData`. These have already diverged if the frontend data changes — consider a shared fixture or a CI test.

### Tests

- **`conftest.py:realistic_board` uses `"description"` not `"details"`**: The test fixture at `backend/tests/conftest.py:41,45` used `"description"` as the card field key, but real board data uses `"details"`.
- **[FIXED]** Changed `"description"` to `"details"` in the fixture.

- **Good coverage overall**: DB init and read/write are tested. API round-trips are tested. AI call is tested with stubs and a real API check (gated behind `OPENROUTER_API_KEY`). Error paths (invalid AI response, missing API key) are covered.

---

## Frontend

### KanbanBoard.tsx

- **Side effect inside state updater (critical)**: Lines 89-95 called `void persistBoard(nextBoard)` inside the `setBoard` updater function. In React 18+ strict mode, updater functions may be called multiple times, leading to duplicate API calls.
- **[FIXED]** Moved the side effect out of the updater. The next board state is computed first, then both `setBoard` and `persistBoard` are called with that value. Since `updateBoard` is only called from synchronous event handlers (drag, click, blur), the closure value of `board` is never stale — React processes event handlers one at a time on the main thread.

- **No loading state distinction**: `isLoading` is `true` only on initial load. Subsequent `persistBoard` calls have no loading indicator — the UI updates immediately optimistically. The error banner is the only feedback for a failed save. Consider adding a saving indicator.

- **Optimistic updates can lose data**: The UI updates immediately, then sends the PUT request. If the PUT fails, the error banner appears but the local state has already changed. A subsequent successful update or refresh will overwrite the board with the last-applied change, potentially losing the failed update's data.

### ChatSidebar.tsx

- **Fixed scroll container height**: Line 104 uses `max-h-[380px]` which does not respond to viewport height. On small screens, the message list may overflow or be cut off. Use a relative or viewport-relative unit.

- **Welcome message ID format**: Line 7 uses `"msg-welcome"` while `createId` generates IDs like `"msg-a1b2c3d4e5"`. The welcome message is not deletable by ID, so this doesn't cause bugs, but it's inconsistent.

### KanbanColumn.tsx

- **No column title validation**: The title input (line 44-49) has no minimum-length or empty-string check. Empty titles can be persisted to the backend. Consider trimming and rejecting empty values on blur.

### KanbanCard.tsx

- **Card details rendering is safe**: React escapes text content by default, so no XSS vector here. Good.

### lib/kanban.ts

- **`moveCard` logic is well-tested**: The function correctly handles intra-column reorder, cross-column move, and drop-on-column (append to end). Test coverage is basic (3 cases) and could be extended (non-existent card, drop at index 0, already-last position).

- **`createId` uses `Math.random()`**: Not cryptographically secure, but fine for UI element IDs in an MVP.

### Accessibility

- **No keyboard sensor for drag-and-drop**: `PointerSensor` is configured but `KeyboardSensor` is not. Users relying on keyboard navigation cannot move cards. Add `KeyboardSensor` from `@dnd-kit/sortable`.

- **Column title input lacks `aria-label`**: It has `aria-label="Column title"` on line 49 — good.

---

## Build and Configuration

### Dockerfile

- **`uv pip install --system`**: Uses pip-compatible mode rather than `uv sync`. Does not leverage uv's lockfile (`uv.lock`). If lockfile reproducibility is desired, switch to `uv sync` with a `pyproject.toml`.

- **Multi-stage build**: Good separation of Node frontend build and Python runtime. The `node:20-slim` and `python:3.12-slim` stages are appropriately minimal.

### docker-compose.yml

- **No volume mount for database**: `backend/data/app.db` was created inside the container and lost on `docker compose down`.
- **[FIXED]** Added a bind mount `./backend/data:/app/backend/data` to `docker-compose.yml`.

### scripts/test-backend.sh

- **Hardcoded path**: Line 4 references `/Users/ryan/projects/pm/.venv/bin/python` which is specific to the developer's machine. Other contributors will get an error. Use a relative virtualenv path or fall back fully to `python -m pytest`.

### playwright.config.ts

- **Port mismatch for Docker**: Playwright is configured to run against `127.0.0.1:3000` (Next.js dev server). When running the app in Docker, the backend serves on port 8000. The config does not support this mode. Consider making the base URL configurable via `PLAYWRIGHT_BASE_URL` env var.

### requirements.txt / pyproject.toml

- **No version pins**: All five dependencies were unpinned, risking unexpected breakage.
- **[FIXED]** Replaced `requirements.txt` with `pyproject.toml` + `uv.lock`. The lockfile pins exact versions for all 22 packages. Dockerfile now uses `uv sync --frozen --no-dev` for reproducible builds.

---

## Documentation

### Strengths

- `AGENTS.md` files at root, `backend/`, `frontend/`, and `scripts/` provide good context for AI-assisted development.
- `PLAN.md` has clear checklists and success criteria.
- `DATABASE.md` explains the JSON-blob tradeoff.
- `RUNNING.md` covers start/stop for all three platforms.

### Gaps

- **No API reference**: Endpoints and their request/response shapes are documented only in `backend/AGENTS.md` (briefly) and in the source code. A dedicated API doc would help contributors.
- **No architecture diagram**: A simple diagram showing the request flow (browser -> FastAPI -> SQLite / OpenRouter) would help new contributors.
- **No frontend component hierarchy**: The `frontend/AGENTS.md` lists key files but does not describe how they compose.

---

## Summary

### High priority

1. ~~Move side effects out of React state updater in `KanbanBoard.tsx:89-95`.~~ **[FIXED]**
2. ~~Fix `description` vs `details` mismatch in test fixtures.~~ **[FIXED]**
3. ~~Pin dependency versions in `requirements.txt`.~~ **[FIXED]** Switched to `pyproject.toml` + `uv.lock` with `uv sync --frozen`.
4. ~~Add a volume mount for the SQLite database in `docker-compose.yml`.~~ **[FIXED]**
5. Fix the hardcoded path in `scripts/test-backend.sh`.

### Medium priority

6. Add `KeyboardSensor` for accessible drag-and-drop.
7. Make `ChatSidebar` scroll area height responsive.
8. Replace generic dict types in `schemas.py` with specific Pydantic models.
9. Deduplicate `call_openrouter` and `call_openrouter_messages`.

### Low priority

10. Strengthen AI system prompt to reduce markdown-fenced responses.
11. Add `moveCard` edge-case tests.
12. Document endpoints formally.
13. Fix env var naming inconsistency.
