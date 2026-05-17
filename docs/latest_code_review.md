# Code Review

Date: 2026-05-16

## Summary

The codebase is clean, well-structured, and appropriate for its MVP scope. The architecture decisions are sound: thin FastAPI backend, statically-exported Next.js frontend, SQLite persistence, and OpenRouter for AI. The coding standards from CLAUDE.md are being followed — no over-engineering, no unnecessary abstractions.

The issues below are ordered by severity: bugs and reliability concerns first, then code quality, then minor/UX observations.

---

## Backend

### Bug: `board_defaults.py` path traversal fails at import time outside Docker

`BOARD_DEFAULTS_PATH` is constructed by walking three `parent` levels up from `app/board_defaults.py` and then into `frontend/`. This path arithmetic assumes the backend is running with the frontend directory as a sibling. If that assumption breaks (standalone backend, restructured layout), the `open()` at module level raises `FileNotFoundError` on any import of `board_defaults` — not when the route is hit, but when the process starts.

```python
# board_defaults.py:4
BOARD_DEFAULTS_PATH = Path(__file__).resolve().parent.parent.parent / "frontend" / "default-board.json"

with open(BOARD_DEFAULTS_PATH) as _f:   # runs at import time
    ...
```

The fragility is in the hard-coded `parent.parent.parent` traversal. A `ROOT_DIR` constant like the one already in `main.py` would be cleaner and more explicit.

---

### Reliability: `update_board_state` has a TOCTOU gap

`_get_board` is called to decide whether to INSERT or UPDATE, then the INSERT/UPDATE runs as a separate statement. These two operations are not in the same SQLite transaction:

```python
# db.py:111-133
board = _get_board(connection, user_id)   # SELECT
if board is None:
    connection.execute("INSERT ...")       # separate statement
else:
    connection.execute("UPDATE ...")
```

For the single-user MVP this is harmless since SQLite serialises writes and only one user exists. If multi-user is added, this becomes a race condition. The fix is a single `INSERT OR REPLACE` or `INSERT ... ON CONFLICT DO UPDATE`.

---

### Code smell: `row_factory` set as a side effect inside `_get_board`

```python
# db.py:75-76
def _get_board(connection, user_id):
    connection.row_factory = sqlite3.Row   # mutates the connection
```

Setting `row_factory` on the connection object inside a query helper is an unexpected side effect. The factory should be set at connection time in `_connect`, or `_row_to_board` should use named column access (`row["id"]`, `row["title"]`, etc.) rather than positional indices, which would work with or without a row factory.

---

### Minor: `pydantic` is an implicit dependency

`pyproject.toml` lists `fastapi`, `httpx`, `python-dotenv`, `uvicorn`. Pydantic is used extensively in `schemas.py` but only present as a transitive dependency of FastAPI. This works today but would break if FastAPI ever made Pydantic optional.

---

### Minor: `MODEL_NAME` is read at module import time

```python
# ai.py:10
MODEL_NAME = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")
```

Changing the env var after the process has started has no effect. This is fine for production but means tests cannot monkeypatch `OPENROUTER_MODEL` after importing `ai`. Not a current problem since no test does this — just worth knowing.

---

### Minor: `_strip_code_fences` does not handle space between fence and language tag

```python
# ai.py:87-88
if trimmed.startswith("json"):
    trimmed = trimmed[4:]
```

The language tag is stripped only when it immediately follows the opening triple-backtick with no space (e.g., ` ```json`). A response with ` ``` json` (space before language tag) would leave ` json` in the string and cause a JSON parse error downstream. This is an edge case unlikely to occur in practice.

---

## Frontend

### Bug: Blank column title accepted on blur

`KanbanColumn.handleBlur` calls `onRename` unconditionally when `editingTitle` is not null:

```typescript
// KanbanColumn.tsx:29-33
const handleBlur = () => {
    if (editingTitle !== null) {
        onRename(column.id, editingTitle);   // fires even if editingTitle === ""
        setEditingTitle(null);
    }
};
```

A user who selects all text and blurs without typing will rename the column to an empty string. The guard should be `editingTitle.trim() !== ""`.

---

### Code smell: `useMemo` for `cardsById` adds no value

```typescript
// KanbanBoard.tsx:44
const cardsById = useMemo(() => boardData.cards, [boardData.cards]);
```

This memo wraps a property access. `boardData.cards` is already a stable object reference when `boardData` hasn't changed, so the memo never avoids any work. It adds reader overhead without benefit and can be removed.

---

### Implicit contract: `handleAiBoardUpdate` skips `persistBoard`

```typescript
// KanbanBoard.tsx:102-105
const handleAiBoardUpdate = (nextBoard: BoardData) => {
    setBoard(nextBoard);
    setError(null);
    // no persistBoard call
};
```

This is correct because the backend already persisted the board as part of handling `POST /api/ai/chat`. But the omission is silent — nothing in the code explains why this path skips persistence while every other mutation calls `persistBoard`. A future maintainer could easily add the persist call thinking it was accidentally omitted, causing a duplicate write. A brief comment here is warranted (one of the few places a comment earns its keep).

---

### Reliability: Concurrent `persistBoard` calls can write stale state

Rapid card actions each fire an independent `PUT /api/board`. If two requests are in flight and complete out of order, the server ends up with the state from whichever response arrived last, which may not be the most recent client state. For a single-user MVP this is unlikely to cause visible issues, but it is a latent data loss scenario.

---

### Minor: `createId` uses `Math.random()`

```typescript
// kanban.ts:113
const randomPart = Math.random().toString(36).slice(2, 8);
```

`Math.random()` is not cryptographically random and has low entropy (6 characters in base-36 ≈ 31 bits). For non-secret IDs this is acceptable, but `crypto.randomUUID()` is available in all modern browsers and Node, costs nothing, and eliminates the collision concern entirely.

---

### UX: Chat message list does not auto-scroll

When a new assistant message arrives, the chat list (`overflow-y-auto` div in `ChatSidebar`) does not scroll to the bottom. Users must manually scroll after each response. A `useEffect` + `scrollIntoView` on the last message would fix this.

---

### UX: Credentials pre-filled on login screen

```typescript
// page.tsx:41
const [username, setUsername] = useState(VALID_USERNAME);
```

The username field defaults to `"user"`. This is presumably intentional for the demo ("Use the demo credentials"), but combined with the "Demo credentials: user / password" hint below the button, the pre-fill is redundant. The password field is not pre-filled, creating an inconsistency.

---

## Tests

### Backend

Coverage is solid for the AI parsing paths: fenced JSON, JSON extraction fallback, history accumulation, board update persistence, and error cases. The board API test (`test_board_api.py`) is thin — one round-trip test — but covers the main path.

**Missing coverage:**
- `BoardState` model_validator: no test for duplicate cardId across columns, orphaned card, or cardId referencing a nonexistent card. This validator is the main data integrity guard.
- `GET /api/health` is untested.
- `PUT /api/board` with a malformed or schema-invalid payload.
- The `_strip_code_fences` test with a space before the language tag (as noted above).

**Code smell in `conftest.py`:** The `os.environ["PM_DB_PATH"] = ...` assignment and `TEST_DEFAULT_DB_PATH.unlink()` run at module import time, before any pytest fixture or session setup. This is a side effect of importing the conftest and can produce surprising behaviour if tests are collected but not run, or if multiple test sessions share the same temp path.

### Frontend

The frontend tests are good: login flow (valid, invalid, logout), board mutation (add, rename, delete), column title sync (external update preserves in-progress edit), and ChatSidebar (success path, error path). These cover the meaningful user interactions.

**Missing coverage:**
- `moveCard` with an unknown `activeId` or `overId` (should return columns unchanged).
- `moveCard` when the active card is already at the target position (no-op case).
- `NewCardForm` submission with blank title (should not call `onAdd`).
- `KanbanColumn` blur with empty title (the bug noted above has no regression test).

---

## Overall Assessment

The codebase is in good shape. Most issues are minor quality improvements rather than functional defects. The one genuine bug is the blank column title on blur; the import-time path construction in `board_defaults.py` is the highest-reliability risk if the project structure ever changes. Everything else is polish.

Priority order for fixes:
1. Blank column title allowed on blur (`KanbanColumn.tsx`)
2. `board_defaults.py` path construction + import-time open
3. `useMemo` removal in `KanbanBoard.tsx`
4. `update_board_state` TOCTOU (only matters when multi-user is added)
5. `createId` → `crypto.randomUUID()`
6. Chat auto-scroll
7. Test coverage gaps (model_validator, health endpoint, moveCard edge cases)
