# Backend

## Overview

FastAPI backend that serves the static Next.js export at `/` and provides API endpoints for board state, AI chat, and health checks. SQLite persists the board state. Auth is handled entirely on the frontend.

`.env` is loaded from the project root at app startup and in tests. OpenRouter is used for AI calls, with `OPENROUTER_API_KEY` required and `OPENROUTER_MODEL` optional (defaults to `openai/gpt-oss-120b:free`).

## Key files

- `app/main.py`: FastAPI app setup, routes, static file mount, dotenv loading.
- `app/ai.py`: OpenRouter client, prompt building, AI response parsing.
- `app/db.py`: SQLite setup, board read/write helpers.
- `app/board_defaults.py`: Default board state for new users.
- `app/schemas.py`: Pydantic request/response models.
- `tests/`: Pytest suite for AI, API, and DB behavior.

## Endpoints

- `GET /api/health`: Health check.
- `GET /api/board`: Fetch current board state.
- `PUT /api/board`: Replace board state.
- `GET /api/ai/test`: Simple OpenRouter test prompt.
- `POST /api/ai/chat`: Chat endpoint returning assistant response and optional board updates.

## Known limitations

- `app.state.ai_history` is global to the process, not per-user. All requests share one conversation history. Fine for the single-user MVP but must change if multi-user support is added.

## Tests

- `scripts/test-backend.sh` (macOS/Linux) and `scripts/test-backend.ps1` (Windows).
- Real OpenRouter test runs when `OPENROUTER_API_KEY` is set.
