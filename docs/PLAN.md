# Project plan

This plan expands each phase with checklists, tests, and success criteria. It targets:

- FastAPI backend serving the statically built NextJS frontend at /
- Single container with minimal multi-process setup allowed
- Dummy auth with in-memory session state
- Board-state read/write API for MVP simplicity
- In-memory AI chat history

## Part 1: Plan

Goal: Finalize the execution plan and document the existing frontend.

Checklist:

- [x] Expand this document with detailed steps, tests, and success criteria for each part.
- [x] Create a concise frontend agent guide in frontend/AGENTS.md that explains code layout and key files.
- [x] Review plan with the user and get approval before proceeding to Part 2.

Tests:

- None (documentation only).

Success criteria:

- This file contains checklists, tests, and success criteria for Parts 2-10.
- frontend/AGENTS.md exists and accurately describes the current frontend.
- User confirms plan approval.

## Part 2: Scaffolding

Goal: Create Docker setup, FastAPI backend skeleton, and start/stop scripts with a hello world page and API check.

Checklist:

- [x] Add Dockerfile and docker-compose or equivalent single-container setup.
- [x] Scaffold backend/ FastAPI app with health route and sample API route.
- [x] Serve a minimal static HTML page at / from the backend to validate wiring.
- [x] Add scripts to start/stop on macOS, Linux, and Windows.
- [x] Document how to run the container locally in docs/.

Tests:

- `curl http://localhost:<port>/` returns static HTML.
- `curl http://localhost:<port>/api/health` returns 200 OK JSON.

Success criteria:

- Container builds and runs locally.
- Root path serves static HTML from FastAPI.
- Health route responds successfully.
- Start/stop scripts work on each OS.

## Part 3: Add in Frontend

Goal: Build the existing frontend as static assets and serve it from FastAPI at /.

Checklist:

- [x] Configure NextJS static export build output for the container.
- [x] Update backend static file serving to deliver the built frontend.
- [x] Verify that the demo Kanban board renders at /.
- [x] Wire unit/integration test commands for frontend in the container workflow.

Tests:

- `npm run test:unit` in frontend/.
- `npm run test:e2e` (playwright) against local app.

Success criteria:

- Root page shows the Kanban board UI.
- Frontend tests pass locally.
- Static assets served by FastAPI.

## Part 4: Add fake sign-in

Goal: Require dummy credentials to access the board and allow logout.

Checklist:

- [x] Add a login screen at / when not authenticated.
- [x] Validate credentials against "user" / "password".
- [x] Store auth state in memory/session (no persistence required).
- [x] Add logout control and clear session state.
- [x] Ensure guard redirects from board to login when not authenticated.

Tests:

- Frontend unit test for login form validation and logout.
- E2E test verifying login gate and logout flow.

Success criteria:

- Login required on first load.
- Correct credentials allow access.
- Logout returns to login screen.

## Part 5: Database modeling

Goal: Propose and document a simple SQLite schema for the board state.

Checklist:

- [x] Draft schema JSON in docs/ (tables, fields, relationships).
- [x] Choose storage approach (normalized tables vs JSON blob).
- [x] Document tradeoffs and MVP rationale.
- [x] Get user approval before implementing.

Tests:

- None (design only).

Success criteria:

- Schema JSON exists in docs/.
- Design decision documented and approved by user.

## Part 6: Backend

Goal: Add board read/write API with SQLite storage and backend tests.

Checklist:

- [x] Implement database initialization and migration-free startup.
- [x] Implement board-state read endpoint for a user.
- [x] Implement board-state write endpoint for a user.
- [x] Ensure database auto-creates on first run.
- [x] Add backend unit tests for persistence and API behavior.
- [x] Add backend test scripts for consistent local runs.

Tests:

- Pytest suite for database init and read/write behavior.
- API tests for GET/PUT (or POST) board state.

Success criteria:

- API can load/save board state for the user.
- SQLite database is created on first run.
- Backend tests pass.

## Part 7: Frontend + Backend

Goal: Use backend API for board data instead of local state.

Checklist:

- [x] Replace frontend initial data with API fetch.
- [x] Persist board edits (renames, add/delete, moves) through the API.
- [x] Handle loading and error states cleanly.
- [x] Add integration/E2E tests for persistent behavior.

Tests:

- Frontend integration tests for API state sync.
- E2E tests against the full app.

Success criteria:

- Board changes persist after refresh.
- API errors are handled with user feedback.
- Tests pass.

## Part 8: AI connectivity

Goal: Enable backend to call OpenRouter with a simple test prompt.

Checklist:

- [x] Add OpenRouter client configuration using OPENROUTER_API_KEY.
- [x] Implement a backend endpoint that performs a simple AI call.
- [x] Verify response with a "2+2" prompt.

Tests:

- Backend test that stubs AI call (unit).
- Manual or integration check for real API call if key present.
- Load .env from project root for tests and app startup.

Success criteria:

- Backend can call OpenRouter and return a response.
- "2+2" test returns expected response content.

## Part 9: AI board updates

Goal: Send board JSON + user question to AI and accept structured outputs.

Checklist:

- [x] Define a structured output schema (response text + optional board update).
- [x] Include board JSON and in-memory conversation history in prompt.
- [x] Validate structured output and apply updates if present.
- [x] Add tests for schema validation and update application.

Tests:

- Unit tests for schema validation and update application.
- Integration test using a stubbed AI response.

Success criteria:

- AI endpoint returns a user-visible response.
- Optional board updates are applied safely and deterministically.
- Tests cover validation and update flow.

## Part 10: AI chat UI

Goal: Add a sidebar chat UI that uses the AI endpoint and updates the board.

Checklist:

- [x] Add sidebar layout and chat UI components.
- [x] Wire chat to backend AI endpoint.
- [x] On AI board updates, refresh the board UI automatically.
- [x] Add frontend tests for chat flow.

Tests:

- Unit tests for chat UI components.
- E2E test for message send and UI update.

Success criteria:

- Chat sidebar works end-to-end.
- Board updates reflect AI structured outputs without manual refresh.
