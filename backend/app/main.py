from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import httpx

from app.ai import call_openrouter
from app.db import get_board_state, init_db, update_board_state
from app.schemas import BoardUpdateRequest

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
DEFAULT_DB_PATH = DATA_DIR / "app.db"


def create_app(db_path: Path = DEFAULT_DB_PATH) -> FastAPI:
    app = FastAPI()

    init_db(db_path)

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
        board = update_board_state(db_path, payload.board)
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

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

    return app


app = create_app()
