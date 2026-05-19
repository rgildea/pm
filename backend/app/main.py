import os
import re
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import httpx

from app.ai import (
    build_ai_messages,
    call_openrouter,
    call_openrouter_messages,
    parse_ai_response,
)
from app.auth import hash_password, verify_password
from app.db import (
    count_boards,
    create_board,
    create_session,
    create_user,
    delete_board,
    delete_session,
    get_board,
    get_or_create_default_board,
    get_session_user_id,
    get_user_by_id,
    get_user_by_username,
    init_db,
    list_boards,
    rename_board,
    update_board_state,
)
from app.schemas import (
    AIChatRequest,
    BoardCreateRequest,
    BoardRenameRequest,
    BoardSummary,
    BoardUpdateRequest,
    LoginRequest,
    RegisterRequest,
)

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
DEFAULT_DB_PATH = DATA_DIR / "app.db"
MAX_AI_HISTORY_MESSAGES = 20


def _default_db_path() -> Path:
    configured_path = os.getenv("PM_DB_PATH")
    if configured_path:
        return Path(configured_path)
    return DEFAULT_DB_PATH


def create_app(db_path: Path | None = None) -> FastAPI:
    load_dotenv(ROOT_DIR / ".env", override=False)
    db_path = db_path or _default_db_path()
    app = FastAPI()

    app.state.ai_history: dict[str, list[dict[str, str]]] = {}

    init_db(db_path)

    # --- Auth dependency ---

    def get_current_user(authorization: str = Header(default="")) -> str:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Not authenticated")
        token = authorization[len("Bearer "):]
        user_id = get_session_user_id(db_path, token)
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return user_id

    # --- AI helper ---

    def _run_ai_chat(board_id: str, user_id: str, payload: AIChatRequest) -> JSONResponse:
        history = app.state.ai_history.setdefault(user_id, [])
        board_payload = payload.board.model_dump()
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
        history[:] = history[-MAX_AI_HISTORY_MESSAGES:]

        response_board = None
        if ai_response.board is not None:
            response_board = ai_response.board.model_dump()
            update_board_state(db_path, board_id, user_id, response_board)

        return JSONResponse({"response": ai_response.response, "board": response_board})

    # --- Health ---

    @app.get("/api/health")
    def health() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    # --- Auth endpoints ---

    @app.post("/api/auth/register")
    def register(payload: RegisterRequest) -> JSONResponse:
        username = payload.username.strip()
        if not username or len(username) < 2:
            raise HTTPException(status_code=422, detail="Username must be at least 2 characters")
        if len(username) > 32:
            raise HTTPException(status_code=422, detail="Username must be at most 32 characters")
        if not re.match(r"^[a-zA-Z0-9_-]+$", username):
            raise HTTPException(status_code=422, detail="Username may only contain letters, numbers, _ and -")
        if len(payload.password) < 6:
            raise HTTPException(status_code=422, detail="Password must be at least 6 characters")
        if len(payload.password) > 128:
            raise HTTPException(status_code=422, detail="Password too long")
        if get_user_by_username(db_path, username) is not None:
            raise HTTPException(status_code=409, detail="Username already taken")
        password_hash = hash_password(payload.password)
        user = create_user(db_path, username, password_hash)
        token = create_session(db_path, user.user_id)
        return JSONResponse({"token": token, "username": user.username})

    @app.post("/api/auth/login")
    def login(payload: LoginRequest) -> JSONResponse:
        user = get_user_by_username(db_path, payload.username)
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token = create_session(db_path, user.user_id)
        return JSONResponse({"token": token, "username": user.username})

    @app.post("/api/auth/logout")
    def logout(authorization: str = Header(default="")) -> JSONResponse:
        if authorization.startswith("Bearer "):
            token = authorization[len("Bearer "):]
            delete_session(db_path, token)
        return JSONResponse({"ok": True})

    @app.get("/api/auth/me")
    def me(user_id: str = Depends(get_current_user)) -> JSONResponse:
        user = get_user_by_id(db_path, user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return JSONResponse({"user_id": user_id, "username": user.username})

    # --- Board endpoints ---

    @app.get("/api/boards")
    def get_boards(user_id: str = Depends(get_current_user)) -> JSONResponse:
        boards = list_boards(db_path, user_id)
        if not boards:
            board = get_or_create_default_board(db_path, user_id)
            boards = [board]
        return JSONResponse({
            "boards": [
                BoardSummary(
                    id=b.board_id,
                    title=b.title,
                    created_at=b.created_at,
                    updated_at=b.updated_at,
                ).model_dump()
                for b in boards
            ]
        })

    @app.post("/api/boards")
    def post_boards(
        payload: BoardCreateRequest,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="Board title cannot be empty")
        board = create_board(db_path, user_id, title)
        return JSONResponse({
            "board": {
                "id": board.board_id,
                "title": board.title,
                "created_at": board.created_at,
                "updated_at": board.updated_at,
                "state": board.state,
            }
        })

    @app.get("/api/boards/{board_id}")
    def get_board_by_id(
        board_id: str,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        board = get_board(db_path, board_id, user_id)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")
        return JSONResponse({"board": board.state, "id": board.board_id, "title": board.title})

    @app.put("/api/boards/{board_id}")
    def put_board_by_id(
        board_id: str,
        payload: BoardUpdateRequest,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        board = update_board_state(db_path, board_id, user_id, payload.board.model_dump())
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")
        return JSONResponse({"board": board.state})

    @app.patch("/api/boards/{board_id}")
    def patch_board_by_id(
        board_id: str,
        payload: BoardRenameRequest,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="Board title cannot be empty")
        board = rename_board(db_path, board_id, user_id, title)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")
        return JSONResponse({"id": board.board_id, "title": board.title})

    @app.delete("/api/boards/{board_id}")
    def delete_board_by_id(
        board_id: str,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        if get_board(db_path, board_id, user_id) is None:
            raise HTTPException(status_code=404, detail="Board not found")
        if count_boards(db_path, user_id) <= 1:
            raise HTTPException(status_code=409, detail="Cannot delete your only board")
        delete_board(db_path, board_id, user_id)
        return JSONResponse({"ok": True})

    # --- AI endpoints ---

    @app.get("/api/ai/test")
    def ai_test() -> JSONResponse:
        try:
            response = call_openrouter("2+2")
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="AI request failed") from exc
        return JSONResponse({"response": response})

    @app.post("/api/boards/{board_id}/ai/chat")
    def ai_chat(
        board_id: str,
        payload: AIChatRequest,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        if get_board(db_path, board_id, user_id) is None:
            raise HTTPException(status_code=404, detail="Board not found")
        return _run_ai_chat(board_id, user_id, payload)

    # --- Legacy board endpoints (auth required) ---

    @app.get("/api/board")
    def get_board_legacy(user_id: str = Depends(get_current_user)) -> JSONResponse:
        board = get_or_create_default_board(db_path, user_id)
        return JSONResponse({"board": board.state})

    @app.put("/api/board")
    def put_board_legacy(
        payload: BoardUpdateRequest,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        board = get_or_create_default_board(db_path, user_id)
        updated = update_board_state(db_path, board.board_id, user_id, payload.board.model_dump())
        return JSONResponse({"board": updated.state if updated else payload.board.model_dump()})

    @app.post("/api/ai/chat")
    def ai_chat_legacy(
        payload: AIChatRequest,
        user_id: str = Depends(get_current_user),
    ) -> JSONResponse:
        board = get_or_create_default_board(db_path, user_id)
        return _run_ai_chat(board.board_id, user_id, payload)

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

    return app


app = create_app()
