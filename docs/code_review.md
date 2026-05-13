# Code review

Reviewed: 2026-05-12. All 10 plan parts are complete and all tests pass.
Items are grouped by severity.

---

## P1 — Fix: bugs and data issues

### 1. `backend/data/app.db` is not gitignored

`backend/data/` is where the SQLite database lives at runtime. The root `.gitignore`
has patterns for `db.sqlite3` (Django default) but not `*.db`. If anyone runs the
app outside Docker the database file will be silently staged.

**Action:** add `backend/data/` to `.gitignore`.

---

### 2. Column rename fires a PUT `/api/board` on every keystroke

`KanbanColumn` has an `<input>` wired to `onChange → onRename → updateBoard →
persistBoard`. Every character typed triggers a network request, and because
`updateBoard` calls `setBoard` before awaiting the response, rapid edits can result
in out-of-order responses overwriting each other.

**Action:** fire `persistBoard` on `onBlur` instead of `onChange`, keeping
`onChange` for local state only.

---

### 3. `_strip_code_fences` silently mangles non-`json` language tags

`ai.py:89` — after stripping backticks with `trimmed.strip("`")`, the function
checks `startswith("json")` and removes 4 characters. If the model returns a fence
tagged with any other label (e.g. ` ```text `) the tag is left in the string and
`json.loads` raises, falling through to `_extract_json` which may still recover it.
The real gap is that the function never handles a newline between the fence tag and
the JSON body: ` ```json\n{...} ` becomes `json\n{...}` after stripping. The final
`.strip()` on `trimmed` removes the trailing newlines but not the leading `json\n`.

Trace through the current code for ` ```json\n{"response":"ok"}\n``` `:
- After `trimmed.strip("`")`: `json\n{"response":"ok"}\n`
- `startswith("json")` → True, `trimmed[4:]` → `\n{"response":"ok"}\n`
- `return trimmed.strip()` → `{"response":"ok"}` ✓

This works today, but only because `.strip()` discards the newline left by `[4:]`.
It breaks silently if the tag is longer than 4 chars (e.g. `jsonc`). The fix is
simple: strip the tag with a regex or `splitlines`.

**Action:** replace the tag-stripping block with:
```python
lines = trimmed.splitlines()
first = lines[0].lstrip("`").strip()
if first in ("json", ""):
    trimmed = "\n".join(lines[1:] if len(lines) > 1 else lines)
```

---

## P2 — Fix: code quality and maintenance

### 4. Pydantic v1 compatibility shims are dead code

`main.py:42–45` — `_dump_model` checks `hasattr(model, "model_dump")` before
calling it. This project uses FastAPI which requires pydantic v2; the v1 `.dict()`
path is unreachable.

`ai.py:115–117` — same pattern: `hasattr(AIChatResponse, "model_validate")` always
evaluates True.

**Action:** remove both shims. Call `model.model_dump()` and
`AIChatResponse.model_validate(payload)` directly.

---

### 5. Initial board data is duplicated between backend and frontend

`backend/app/board_defaults.py` and `frontend/src/lib/kanban.ts` define the exact
same 5 columns and 8 cards. They will drift as the project evolves. The backend
copy is the authoritative seed; the frontend copy is used as a load-failure
fallback.

**Action:** document the relationship with a short comment in each file so it is
obvious when one changes that the other may need updating. Longer-term, the
frontend could call `GET /api/board` unconditionally and let the backend always
return a seeded default.

---

### 6. Dead route: `GET /api/hello`

`main.py:51–53` — scaffolding route that is never called by the frontend or any
test.

**Action:** delete it.

---

### 7. `app.state.ai_history` is global, not per-user

`main.py:38` — the conversation history is attached to the app instance, shared
across all requests. For the MVP single-user case this is fine. However, if a
second user were added it would see the first user's history.

**Action:** no change needed for MVP. Document this as a known limitation in
`backend/AGENTS.md` so it is not forgotten when multi-user is added.

---

## P3 — Consider: test coverage gaps

### 8. `persistBoard` is never asserted in unit tests

`KanbanBoard.test.tsx` verifies UI state (card added, column title changed) but
never asserts that `fetch` was called with the right payload. If `persistBoard`
silently broke, all unit tests would still pass.

**Action:** add an assertion in the "renames a column" and "adds and removes a
card" tests that the mock `fetch` was called with `method: "PUT"` and the expected
board shape.

---

### 9. ChatSidebar error path has no test

`ChatSidebar.test.tsx` only covers the success case. The error branch (fetch
rejects or API returns non-200) sets an error message and appends a fallback
assistant message.

**Action:** add a test that mocks `fetch` to return a 500 and asserts the error
message and the fallback assistant message are rendered.

---

### 10. No e2e test for the AI chat sidebar

The Playwright suite covers login, board load, card add, and drag-and-drop but
skips the chat sidebar entirely.

**Action:** add a Playwright test that mocks `POST /api/ai/chat`, sends a message,
and verifies the assistant response appears and the board updates if the response
includes one.

---

### 11. `test_call_openrouter_requires_key` uses manual try/except

`test_ai.py:27–34` — wraps the call in a bare `try/except` rather than using
`pytest.raises`. If the function raises the wrong exception type the test passes
silently.

**Action:** rewrite as:
```python
with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
    call_openrouter("2+2")
```

---

### 12. `DummyResponse.raise_for_status` passes `None` to `httpx.HTTPStatusError`

`test_ai.py:20–22` — `httpx.HTTPStatusError.__init__` accepts `request` and
`response` as required positional args. Passing `None` works today but is
technically invalid and could break on an httpx version bump.

**Action:** construct minimal valid objects or use `monkeypatch` / `respx` to stub
at the transport layer instead of building a hand-rolled response class.

---

## Minor observations (no action required)

- `frontend/src/lib/kanban.ts:164` — `createId` uses `Math.random()`. Fine for
  local UI IDs; would need replacement if IDs ever become security-sensitive.
- `backend/tests/test_board_api.py` has only one test. The API surface is thin so
  this is proportionate, but a test for a missing board (first-run board creation
  via the API) would improve confidence.
- `docker-compose.yml` does not pin a restart policy. Adding `restart: unless-stopped`
  would make local use more resilient to machine reboots, though this is purely a
  convenience choice.
