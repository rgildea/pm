# Code Review

Date: 2026-05-13

## Summary

The codebase remains tight and well-scoped. Compared to the previous review (`docs/code_review_old.md`), several high-priority items have been addressed: `_strip_code_fences` now slices the fence delimiters correctly, `KanbanColumn` uses an explicit edit-state pattern that preserves in-progress edits while honoring external updates, `call_openrouter` delegates to `call_openrouter_messages` (no duplication), and `BoardState` now validates `Card` and `Column` shapes with Pydantic.

The issues that remain are mostly around resource hygiene (unbounded AI history), data integrity (no referential validation between `cardIds` and `cards`), and a handful of small correctness and ergonomics concerns. None block the MVP as scoped, but several should be fixed before any multi-user or network-accessible deployment.

---

## Backend

### `backend/app/main.py` — `app.state.ai_history` grows unbounded

```python
app.state.ai_history = []
...
history.append({"role": "user", "content": payload.message})
history.append({"role": "assistant", "content": ai_response.response})
```

Every chat turn appends two messages and they are never trimmed. The full history is then re-sent to OpenRouter on every subsequent call (`build_ai_messages` spreads `*history` into the message list), which means latency, token usage, and cost grow linearly with session length. A long-running process will eventually exceed the model context window and break.

**Recommendation:** Cap the in-memory history at e.g. the last 20 messages (10 turns) when building the message list, or evict from the front when the list exceeds that size.

---

### `backend/app/main.py` — no authentication on API endpoints

`/api/board`, `/api/ai/chat`, and `/api/ai/test` are all unauthenticated. The login screen is a pure client-side gate — anyone who can reach port 8000 can read/write the board and burn OpenRouter credits via `/api/ai/chat`. This is acceptable for a single-user local-only MVP, but the README and AGENTS notes should call it out as a hard blocker before any deployment beyond `localhost`.

A second concern: `/api/ai/test` is wired up in production. It is useful during development but does not need to ship — every public hit costs an OpenRouter request.

---

### `backend/app/main.py` — AI-returned board is persisted without referential validation

```python
if ai_response.board is not None:
    response_board = ai_response.board.model_dump()
    update_board_state(db_path, response_board)
```

The Pydantic `BoardState` validates the *shape* of columns and cards, but nothing checks that:

- every `cardIds` entry references a key in `cards`,
- every key in `cards` is referenced by exactly one column,
- card IDs are unique across columns.

The model is plenty happy with a board where `columns[0].cardIds == ["ghost-id"]` and `cards == {}`. The frontend then renders `column.cardIds.map(id => boardData.cards[id])` and produces `undefined` entries, which `KanbanCard` will dereference (`card.title`) and crash on. See the matching frontend item below.

**Recommendation:** Add a validator on `BoardState` (Pydantic `model_validator(mode="after")`) that enforces `set(itertools.chain(*[c.cardIds for c in columns])) == set(cards.keys())` and rejects duplicates. Return a 422 to the AI request when the model returns an inconsistent board.

---

### `backend/app/db.py` — `update_board_state` read-then-write is not atomic

```python
with _connect(db_path) as connection:
    board = _get_board(connection, user_id)
    ...
    if board is None:
        # INSERT
    else:
        # UPDATE
```

The presence check and the subsequent write are separate statements. Under concurrent writers two callers could both observe `board is None` and race to `INSERT`, causing a `UNIQUE` constraint violation. Not exploitable today (single user, single process), but trivial to remove with an upsert.

**Recommendation:** Replace the branch with a single `INSERT INTO boards ... ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`. The current code keys by `user_id`, so the unique key it conflicts on is the implicit one — switch the conflict target to `user_id` (which would require a `UNIQUE` constraint on that column, currently absent — see next item).

---

### `backend/app/db.py` — no uniqueness constraint on `boards.user_id`

The schema permits multiple board rows per `user_id`. Today the application code only ever creates one (via the read-then-branch in `update_board_state`), but the constraint is implicit rather than enforced. If a future concurrent insertion slips through, `_get_board` will silently return whichever row `fetchone()` happens to pick.

**Recommendation:** Add `UNIQUE` to the `user_id` column declaration in `CREATE TABLE boards`, or a partial index if multiple boards per user are eventually planned.

---

### `backend/app/db.py` — `_row_to_board` uses integer indexing after setting `row_factory`

```python
def _get_board(connection, user_id):
    connection.row_factory = sqlite3.Row
    row = connection.execute(...).fetchone()
    ...

def _row_to_board(row):
    return BoardRecord(board_id=row[0], title=row[1], state=json.loads(row[2]))
```

`row_factory = sqlite3.Row` enables name-based access (`row["id"]`), but the row is then read by integer index. Both work, but the assignment is dead code — either use the names or drop the `row_factory` line. Also note that `connection.row_factory = sqlite3.Row` mutates connection state but the connection is closed at the end of the `with` block, so this isn't actually problematic — just inconsistent.

---

### `backend/app/board_defaults.py` — file read at module import time

```python
BOARD_DEFAULTS_PATH = Path(__file__).resolve().parent.parent.parent / "frontend" / "default-board.json"

with open(BOARD_DEFAULTS_PATH) as _f:
    _data = json.load(_f)
```

The path traverses three levels up and assumes a `frontend/` sibling at runtime. The Dockerfile copies `frontend/default-board.json` into the image at the right relative location (line 25), so this works, but the coupling is fragile: any change to the directory layout silently breaks application startup with an unhandled `FileNotFoundError`. Worse, the file is read at *import* time, so the error fires while FastAPI is wiring routes rather than at a clear startup hook.

**Recommendation:** Either inline the defaults into a Python literal in `board_defaults.py` (removing the cross-package file dependency entirely), or load lazily inside `_create_board` and surface a clear error if missing.

---

### `backend/app/ai.py` — `MODEL_NAME` resolved at import

```python
MODEL_NAME = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")
```

Evaluated once on import. Setting `OPENROUTER_MODEL` in a test via `monkeypatch.setenv` after the module loads has no effect. The current tests do not exercise this, so it is latent.

**Recommendation:** Move the lookup inside `call_openrouter_messages` (`model = os.getenv("OPENROUTER_MODEL", ...)`).

---

### `backend/app/ai.py` — `_extract_json` fallback may grab the wrong braces

```python
start = stripped.find("{")
end = stripped.rfind("}")
```

If the model returns text like `"Here is the JSON: {response: 'use {curly}', ...}"`, `find("{")` and `rfind("}")` will straddle the inner-brace text correctly (greediest possible window), but they will also grab any unbalanced brace count in prose, e.g. `"Note the {bracket} usage. {actual: json}"` produces a slice that includes both pairs and parses as invalid JSON. The current logic is best-effort, and the `_strip_code_fences` path already handles the common case — the fallback exists primarily for chatty models. Acceptable for the MVP, but worth a comment, and ideally constrained by also requiring `_extract_json` to find a top-level `}` that balances the leading `{`.

---

### `backend/pyproject.toml` — `pydantic` is not declared

`app/schemas.py` imports `pydantic`, but `pyproject.toml`'s `dependencies` list does not include it. It works because `fastapi` declares it transitively, but the project should pin what it directly imports — otherwise a future FastAPI version that drops or replaces Pydantic silently breaks the build.

**Recommendation:** Add `pydantic` to `dependencies`.

---

### `backend/app/ai.py` — system prompt does not require referential consistency

The system prompt instructs the model to return JSON with `response` and optional `board`, but says nothing about referential integrity, ID format, or the requirement that `cardIds` references must exist in `cards`. Combined with the missing backend validator (see above), the model can return a malformed board that crashes the frontend.

**Recommendation:** Add explicit constraints to `AI_CHAT_SYSTEM_PROMPT`: "Every id in any column's cardIds must also exist as a key in cards. Every key in cards must appear in exactly one column's cardIds. Preserve existing card and column IDs when possible."

---

## Frontend

### `frontend/src/components/KanbanBoard.tsx` — `cards` prop may contain `undefined` entries

```tsx
cards={column.cardIds.map((cardId) => boardData.cards[cardId])}
```

If the AI returns an inconsistent board (see backend item above), this produces an array containing `undefined`, which is then passed to `KanbanCard` as `card={undefined}` — and `KanbanCard` dereferences `card.title` and `card.id` immediately. The component will throw, and the whole board will fail to render until the user manually edits the database or reloads with a clean board.

**Recommendation:** Either guard at this call site (`.filter(Boolean)` plus a typecast, or `flatMap`), or add an effect in `KanbanBoard` that prunes orphaned `cardIds` before render. The best fix is upstream — reject malformed AI boards in the backend (see above).

---

### `frontend/src/components/KanbanColumn.tsx` — empty edited title is committed

```tsx
const handleBlur = () => {
  if (editingTitle !== null) {
    onRename(column.id, editingTitle);
    setEditingTitle(null);
  }
};
```

The guard checks `!== null`, not "is non-empty". A user who clears the input and blurs commits `""` as the column title. The board has no display fallback for an empty column title — the column header becomes a blank line.

**Recommendation:** Treat empty/whitespace-only edits as cancels: `if (editingTitle !== null && editingTitle.trim()) onRename(...); else if (editingTitle === "") setEditingTitle(null);` — and make sure the input snaps back to `column.title` on cancel.

---

### `frontend/src/components/KanbanColumn.tsx` — blur fires `onRename` even when unchanged

If the user clicks the input and clicks away without typing, `editingTitle` is still `null` (never set), so `handleBlur` no-ops — good. But if the user *types* and then deletes back to the original title, `editingTitle === column.title` and `onRename` is invoked anyway, triggering a `persistBoard` PUT. Not a bug, just a wasted round-trip.

**Recommendation:** Skip the call when `editingTitle === column.title`.

---

### `frontend/src/components/KanbanCard.tsx` — drag listeners cover the Remove button

```tsx
<article
  ref={setNodeRef}
  {...attributes}
  {...listeners}
>
  ...
  <button onClick={() => onDelete(card.id)}>Remove</button>
</article>
```

`{...listeners}` from `useSortable` is spread on the article that also contains the Remove button. On pointer-press the dnd-kit `PointerSensor` activates only after 6px of movement (`activationConstraint: { distance: 6 }`), so a quick click of Remove is safe in practice. Still, the more idiomatic pattern is to apply `listeners` to a dedicated drag handle (or to the title area only), so accidentally long-pressing the Remove button can't begin a drag.

This is a minor UX/safety issue, not a correctness bug.

---

### `frontend/src/components/ChatSidebar.tsx` — message list does not auto-scroll

The container uses `overflow-y-auto` but there is no effect to scroll to the latest message after a send. After two or three exchanges, new replies render below the visible window.

**Recommendation:** Add a `useRef` on the messages container and a `useEffect` that scrolls to the bottom when `messages.length` changes.

---

### `frontend/src/components/ChatSidebar.tsx` — chat history is never trimmed

The frontend keeps every message in component state for the life of the session. Lower-impact than the backend's unbounded `ai_history` (this one resets on logout/refresh), but worth noting if sessions are ever long-lived.

---

### `frontend/src/app/page.tsx` — credentials hardcoded in the client bundle

```tsx
const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";
```

These ship to every browser as plain strings. The login screen is UX gating, not authentication. Documented as an MVP limitation, but worth flagging in the README/onboarding alongside the unauthenticated API endpoints.

---

### `frontend/src/lib/kanban.ts` — `createId` uses `Math.random()` and time

```ts
const randomPart = Math.random().toString(36).slice(2, 8);
const timePart = Date.now().toString(36);
return `${prefix}-${randomPart}${timePart}`;
```

Six base36 chars of `Math.random()` entropy plus a millisecond timestamp is sufficient for a single-user MVP. `crypto.randomUUID()` is supported in all modern browsers and is a one-line replacement with stronger guarantees. Optional cleanup.

---

### `frontend/src/components/ChatSidebar.tsx` — only the latest board snapshot is sent

```tsx
body: JSON.stringify({ message, board })
```

The frontend sends `board` from its current state. If the user makes a local edit while a chat request is in flight, the AI receives the pre-edit board, returns a board derived from it, and `handleAiBoardUpdate` overwrites the user's edit. There is no "request in flight" lock on board mutations.

Disabling the textarea while `isSending` prevents new chat sends, but does not prevent the user from dragging a card or renaming a column during that window. For the MVP this is unlikely to be hit, but it can produce surprising lost-update behavior.

---

## Tests

### `backend/tests/conftest.py` — module-level env mutation

```python
TEST_DEFAULT_DB_PATH = Path(tempfile.gettempdir()) / "pm-backend-tests" / "app.db"
os.environ["PM_DB_PATH"] = str(TEST_DEFAULT_DB_PATH)
if TEST_DEFAULT_DB_PATH.exists():
    TEST_DEFAULT_DB_PATH.unlink()
```

Setting `PM_DB_PATH` at module import time works because pytest imports `conftest.py` before collecting test modules, but it relies on collection order more than is healthy. Wrapping it in a `pytest_configure` hook or a session-scoped autouse fixture makes the contract explicit.

Most tests pass an explicit `db_path` to `create_app(tmp_path / "app.db")`, so the env var is mostly defensive — but `test_ai_real_api_call` still relies on `tmp_path`, and `test_init_creates_default_board` uses `tmp_path` too. The only consumer of `PM_DB_PATH` would be a test that called `create_app()` with no argument, of which there are none. The env var setup may be redundant.

---

### `backend/tests/test_board_api.py` — assertion couples to default column count

```python
assert len(payload["columns"]) == 5
```

If `default-board.json` is edited (e.g. to add a "Backlog ideas" column), this test breaks for an unrelated reason. Either pin the default in the test fixture, or assert on the *type* (`isinstance(payload["columns"], list)`) and a per-column assertion.

---

### Frontend — no unit tests for `NewCardForm`, `KanbanCard`, or `KanbanCardPreview`

`KanbanBoard.test.tsx` exercises card add/remove through the full board, and `kanban.test.ts` covers the `moveCard` reducer. The leaf components have no isolated coverage. Low priority given their simplicity, but `NewCardForm` has light validation logic (`if (!formState.title.trim()) return;`) that is worth a focused test.

---

## Infrastructure

### `Dockerfile` — no explicit `--platform`

`FROM node:20-slim` and `FROM python:3.12-slim` resolve per-host. On Apple Silicon the image is arm64; in CI or on x86 hosts it's amd64. The current code has no architecture-specific behavior, but mixed-arch images can subtly break wheel compatibility for native Python deps. Pinning `--platform=linux/amd64` (or building multi-arch with buildx) avoids the ambiguity.

---

### `Dockerfile` — runtime stage installs `uv` but does not pin its version

```dockerfile
RUN pip install --no-cache-dir uv
```

`uv` is installed at the latest available version. The Python project is pinned via `uv.lock`, but the tool that consumes the lock is not. A future uv release that changes lockfile semantics would break the build silently.

**Recommendation:** Pin `uv==X.Y.Z` (or use the official `astral-sh/uv` image).

---

### `docker-compose.yml` — no `restart` policy

```yaml
services:
  app:
    build: .
    ports:
      - "8000:8000"
```

If the process crashes (e.g. unhandled exception during startup), the container stays stopped. A one-line addition (`restart: unless-stopped`) makes local operation more robust.

---

### `docker-compose.yml` — `backend/data` bind mount is not declared in the repo

The compose file bind-mounts `./backend/data`. If the host directory doesn't exist, Docker will create it as a root-owned directory (depending on the daemon) which can cause permission surprises. Worth a `mkdir -p backend/data` in the start scripts, or switching to a named volume.

---

### `scripts/start-*.sh` — no preflight checks

The start scripts call `docker compose up --build -d` directly. If Docker is not running or the `.env` file is missing, the error surface is Docker's raw output. A one-line check (`docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }`) and a check for `.env` would make the failure mode clearer for first-time users.

---

## Priority summary

| Severity | Item |
|---|---|
| High | AI-returned board is persisted without referential validation; can crash the frontend on render |
| High | `app.state.ai_history` is unbounded — resource/cost leak in long-running processes |
| High | Credentials compiled into the client bundle; API endpoints are unauthenticated (documented MVP limitation, but blocker for any non-local deploy) |
| Medium | `board_defaults.py` reads a sibling-package file at import time across three levels |
| Medium | `update_board_state` read-then-write is not atomic, and `boards.user_id` has no `UNIQUE` constraint |
| Medium | `KanbanColumn` commits empty/whitespace titles on blur |
| Medium | `pydantic` not declared in `pyproject.toml` |
| Medium | Local edits made while a chat request is in flight can be silently overwritten by the AI response |
| Low | `MODEL_NAME` resolved at import time |
| Low | `_row_to_board` uses integer indexing despite setting `row_factory` |
| Low | `_extract_json` fallback can return unbalanced brace slices on chatty model output |
| Low | `KanbanCard` drag listeners overlap the Remove button (mitigated by 6px activation distance) |
| Low | No auto-scroll in chat sidebar |
| Low | `createId` uses `Math.random()` |
| Low | `test_board_api.py` hardcoded column count assertion |
| Low | `conftest.py` module-level env mutation (also possibly redundant) |
| Low | Dockerfile pins neither `--platform` nor `uv` version |
| Low | `docker-compose.yml` has no `restart` policy |
| Low | Start scripts have no preflight checks for Docker/.env |
