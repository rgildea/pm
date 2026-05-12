import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import httpx

from app.ai import (
    build_ai_messages,
    call_openrouter,
    call_openrouter_messages,
    parse_ai_response,
)
from app.db import get_board_state, init_db, update_board_state
from app.schemas import AIChatRequest, BoardUpdateRequest

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
DEFAULT_DB_PATH = DATA_DIR / "app.db"


def _default_db_path() -> Path:
    configured_path = os.getenv("PM_DB_PATH")
    if configured_path:
        return Path(configured_path)
    return DEFAULT_DB_PATH


def create_app(db_path: Path | None = None) -> FastAPI:
    load_dotenv(ROOT_DIR / ".env", override=False)
    db_path = db_path or _default_db_path()
    app = FastAPI()

    app.state.ai_history = []

    init_db(db_path)

    def _dump_model(model):
        if hasattr(model, "model_dump"):
            return model.model_dump()
        return model.dict()

    @app.get("/api/health")
    def health() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    @app.get("/api/hello")
    def hello() -> JSONResponse:
        return JSONResponse({"message": "Hello from FastAPI"})

    @app.get("/api/board")
    def get_board() -> JSONResponse:
        board = get_board_state(db_path)
        return JSONResponse({"board": board})

    @app.put("/api/board")
    def put_board(payload: BoardUpdateRequest) -> JSONResponse:
        board = update_board_state(db_path, _dump_model(payload.board))
        return JSONResponse({"board": board})

    @app.get("/api/ai/test")
    def ai_test() -> JSONResponse:
        try:
            response = call_openrouter("2+2")
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="AI request failed") from exc
        return JSONResponse({"response": response})

    @app.post("/api/ai/chat")
    def ai_chat(payload: AIChatRequest) -> JSONResponse:
        history = app.state.ai_history
        board_payload = _dump_model(payload.board)
        messages = build_ai_messages(board_payload, history, payload.message)

        try:
            raw_content = call_openrouter_messages(messages)
            ai_response = parse_ai_response(raw_content)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="AI request failed") from exc
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(status_code=502, detail="AI response invalid") from exc

        history.append({"role": "user", "content": payload.message})
        history.append({"role": "assistant", "content": ai_response.response})

        response_board = None
        if ai_response.board is not None:
            response_board = _dump_model(ai_response.board)
            update_board_state(db_path, response_board)

        return JSONResponse({"response": ai_response.response, "board": response_board})

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

    return app


app = create_app()
