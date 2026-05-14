# Code Review

Date: 2026-05-13

## Summary

The MVP is well-scoped and mostly clean. The codebase is simple by design, and that restraint is a strength. Issues found are mostly correctness bugs, a few structural risks, and one security concern. Nothing is catastrophic, but several items should be addressed before any production use.

---

## Backend

### `backend/app/board_defaults.py` — module-level file read at import time

```python
with open(BOARD_DEFAULTS_PATH) as _f:
    _data = json.load(_f)
```

The file is opened at module import. If the path does not exist (e.g. in a test environment or alternative deployment layout), the entire application fails to start with an unhandled `FileNotFoundError`. The Docker build copies `frontend/default-board.json` to the expected location, but this is a fragile coupling. The path is also computed relative to `__file__` across three directory levels (`parent.parent.parent / "frontend" / ...`), which will silently break if the file layout changes.

**Recommendation:** Load the defaults lazily inside `init_db` or accept them as a parameter. Alternatively, embed the JSON directly in `board_defaults.py` to remove the cross-package file dependency entirely.

---

### `backend/app/db.py` — `_row_to_board` ignores `row_factory`

```python
def _row_to_board(row: sqlite3.Row) -> BoardRecord:
    return BoardRecord(board_id=row[0], title=row[1], state=json.loads(row[2]))
```

`_get_board` sets `connection.row_factory = sqlite3.Row`, which makes rows accessible by column name. Despite this, `_row_to_board` accesses columns by integer index (`row[0]`, `row[1]`, `row[2]`). The two styles are inconsistent. Integer indexing works here because `sqlite3.Row` supports both, but setting the `row_factory` on the connection is a side-effect that is easy to misread and the name-based access it enables is never used.

**Recommendation:** Remove the `row_factory` assignment and keep integer indexing, or switch to named access (`row["id"]`, `row["title"]`, `row["state_json"]`) and drop the integers.

---

### `backend/app/db.py` — `update_board_state` reads then writes without a transaction

```python
def update_board_state(...):
    with _connect(db_path) as connection:
        board = _get_board(connection, user_id)
        ...
        if board is None:
            # INSERT
        else:
            # UPDATE
```

The check for existence and the subsequent write are not atomic. Under concurrent access (not currently possible with the single-user MVP, but relevant if sessions are ever added), two writers could both observe `board is None` and attempt to insert, causing a `UNIQUE` constraint violation. SQLite's `INSERT OR REPLACE` or an upsert (`INSERT ... ON CONFLICT DO UPDATE`) would eliminate this race entirely.

**Recommendation:** Replace the read-then-branch with a single `INSERT OR REPLACE INTO boards ...` statement.

---

### `backend/app/ai.py` — `_strip_code_fences` uses `str.strip("` `` ` ``")` incorrectly

```python
trimmed = trimmed.strip("`")
```

`str.strip(chars)` removes any characters in the given set from both ends — it does not strip a literal three-backtick sequence. A string like `` `foo` `` would be fully stripped when only the fence characters `` ``` `` should be removed. The current code works accidentally for the common `` ```json\n...\n``` `` pattern because the inner content does not start or end with backticks, but it would corrupt content that legitimately starts or ends with a backtick.

**Recommendation:** Use `lstrip("```")` is still wrong for the same reason. Strip the leading `` ``` `` and trailing `` ``` `` with `removeprefix`/`removesuffix` or a regex:

```python
if trimmed.startswith("```") and trimmed.endswith("```"):
    trimmed = trimmed[3:]   # remove leading ```
    trimmed = trimmed[:-3]  # remove trailing ```
    if trimmed.startswith("json"):
        trimmed = trimmed[4:]
```

---

### `backend/app/ai.py` — `MODEL_NAME` is resolved at import time

```python
MODEL_NAME = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")
```

This is evaluated once when the module is imported. If `OPENROUTER_MODEL` is set after the module loads (e.g. in tests via `monkeypatch.setenv`), the cached value will be stale. In the current test suite this is not exercised, but it is a latent inconsistency.

**Recommendation:** Read the environment variable inside `call_openrouter_messages` or inside `_openrouter_headers`.

---

### `backend/app/main.py` — global in-memory AI history is not per-user

The `AGENTS.md` acknowledges this:

> `app.state.ai_history` is global to the process, not per-user.

For the MVP this is acceptable, but the risk is that the history grows unbounded. A long-running process will accumulate history indefinitely, eventually sending a very large prompt to OpenRouter with every request (increased latency and cost). There is no trimming or eviction.

**Recommendation:** Cap history at a fixed number of turns (e.g. last 20 messages) before building the message list.

---

### `backend/app/main.py` — no authentication on API endpoints

All API endpoints (`/api/board`, `/api/ai/chat`) are publicly accessible with no authentication check. Authentication is handled entirely in the frontend as client-side state. Any request to `http://localhost:8000/api/board` bypasses the login screen entirely.

For a locally-run MVP this is acceptable per the stated scope, but it should be explicitly noted as a blocker before any network-accessible deployment.

---

### `backend/pyproject.toml` — `pydantic` not listed as a dependency

`pydantic` is used in `app/schemas.py` but is not declared in `pyproject.toml`. It works in practice because `fastapi` pulls it in as a transitive dependency, but the missing explicit declaration means the version is not pinned in `uv.lock` directly and could be broken by a FastAPI upgrade that drops or changes its Pydantic dependency.

**Recommendation:** Add `pydantic` to the `dependencies` list in `pyproject.toml`.

---

## Frontend

### `frontend/src/app/page.tsx` — credentials hardcoded in client-side bundle

```typescript
const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";
```

These are compiled into the JavaScript bundle delivered to every browser. Anyone who views the page source or inspects the bundle can read them. The `AGENTS.md` and `PLAN.md` acknowledge the dummy-auth limitation, but it is worth flagging explicitly: this is not just "simple auth" — it is no auth at all from a security standpoint. The login form provides UX gating only.

This is a known MVP limitation but should be documented clearly and addressed before any real deployment.

---

### `frontend/src/components/KanbanColumn.tsx` — local title state diverges from prop

```typescript
const [localTitle, setLocalTitle] = useState(column.title);
```

`localTitle` is initialised once from `column.title` when the component mounts. If the column title is updated externally (e.g. via an AI board update that replaces the entire board), the column input will retain its stale local value until the component unmounts and remounts. An AI response that renames a column will not be reflected in the input field.

**Recommendation:** Add a `useEffect` that syncs `localTitle` when `column.title` changes:

```typescript
useEffect(() => {
  setLocalTitle(column.title);
}, [column.title]);
```

---

### `frontend/src/components/KanbanBoard.tsx` — `boardData` falls back to `initialData` silently

```typescript
const boardData = board ?? initialData;
```

If the board API fails, the component falls back to `initialData` (the demo data from `default-board.json`) and shows an error banner. Any user edits made while in the fallback state will call `persistBoard`, which will attempt to save to the API. If those saves also fail, the user's changes are lost silently. The error message ("Unable to save changes. They may not persist after refresh.") is accurate but easy to miss.

This is a minor UX issue rather than a bug, but the fallback to demo data can be confusing in a real deployment where the board is empty by design.

---

### `frontend/src/lib/kanban.ts` — `createId` uses `Math.random()`

```typescript
const randomPart = Math.random().toString(36).slice(2, 8);
```

`Math.random()` is not cryptographically secure and produces only 6 characters of entropy (about 2 billion combinations). For a single-user MVP the collision probability is negligible, but it is worth noting for future multi-user work. `crypto.randomUUID()` is available in all modern browsers and Node 19+ with no import needed.

---

### `frontend/src/components/KanbanBoard.tsx` — `cards` prop may contain `undefined` entries

```typescript
cards={column.cardIds.map((cardId) => boardData.cards[cardId])}
```

If `cardIds` contains an ID that does not exist in `cards` (possible if the AI returns a board with inconsistent state), this produces an array with `undefined` entries. `KanbanCard` and `KanbanColumn` have no null guards and would throw a runtime error.

**Recommendation:** Filter or validate: `column.cardIds.map((id) => boardData.cards[id]).filter(Boolean)`.

---

### `frontend/src/components/ChatSidebar.tsx` — chat scroll does not follow new messages

The messages container uses `overflow-y-auto` but there is no auto-scroll to the latest message when new messages are appended. After a few exchanges the user must scroll manually to see the latest reply.

**Recommendation:** Add a `useEffect` with a `ref` on the messages container to scroll to the bottom after each new message.

---

## Tests

### `backend/tests/conftest.py` — module-level side effects in test setup

```python
os.environ["PM_DB_PATH"] = str(TEST_DEFAULT_DB_PATH)
if TEST_DEFAULT_DB_PATH.exists():
    TEST_DEFAULT_DB_PATH.unlink()
```

These run at import time, before any fixtures are set up. Setting environment variables at module level is fragile — the order in which pytest collects and imports test files can affect whether `PM_DB_PATH` is set before or after other modules that read it. Moving this into a session-scoped fixture with `autouse=True` would be safer.

---

### `backend/tests/test_board_api.py` — hardcoded assertion on default column count

```python
assert len(payload["columns"]) == 5
```

This couples the test to the number of columns in `default-board.json`. If the default data changes, this test breaks for an unrelated reason.

---

### Frontend — no unit tests for `NewCardForm` or `KanbanCard` in isolation

`KanbanBoard.test.tsx` tests add/delete behaviour indirectly through the board. `NewCardForm` and `KanbanCard` have no dedicated unit tests. This is a minor gap given the simplicity of those components, but worth noting.

---

## Infrastructure

### `Dockerfile` — no explicit platform target

The `FROM node:20-slim` and `FROM python:3.12-slim` stages have no `--platform` argument. On Apple Silicon (arm64) hosts, Docker may pull arm64 images that behave differently from the amd64 images used in CI or production. Adding `--platform=linux/amd64` (or leaving it explicit as `linux/arm64`) avoids ambiguity.

---

### `docker-compose.yml` — no restart policy

```yaml
services:
  app:
    build: .
    ports:
      - "8000:8000"
```

No `restart` policy is set. If the process crashes, the container stops and requires manual intervention. For a locally-run tool this is fine, but `restart: unless-stopped` is a one-line addition that makes local use more reliable.

---

### `scripts/` — no error handling in start scripts

`start-mac.sh` is three lines with `set -euo pipefail`. That is correct, but there is no check that Docker is running before invoking `docker compose`, so the error message on failure is Docker's raw output rather than a friendly hint.

---

## Missing items relative to plan

The plan (Parts 1-10) is fully checked off. No items from the plan appear to be missing from the implementation.

---

## Priority summary

| Severity | Item |
|---|---|
| High | Credentials compiled into the client bundle (security) |
| High | `_strip_code_fences` strips individual backtick characters, not fence sequences (correctness) |
| High | `KanbanColumn` local title state does not sync with external updates (bug) |
| Medium | `board_defaults.py` opens a file at import time across three directory levels (fragility) |
| Medium | `update_board_state` read-then-write is not atomic (correctness under concurrency) |
| Medium | AI history grows unbounded (resource leak) |
| Medium | `cards` prop may contain `undefined` if AI returns inconsistent board (runtime error risk) |
| Medium | `pydantic` missing from `pyproject.toml` (dependency declaration) |
| Low | `MODEL_NAME` resolved at import time (test isolation) |
| Low | `_row_to_board` uses integer indexing after setting `row_factory` (style inconsistency) |
| Low | No auto-scroll in chat sidebar |
| Low | `createId` uses `Math.random()` |
| Low | Hardcoded column count assertion in `test_board_api.py` |
| Low | Module-level side effects in `conftest.py` |
