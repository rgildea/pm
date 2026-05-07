from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"


@app.get("/api/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})


@app.get("/api/hello")
def hello() -> JSONResponse:
    return JSONResponse({"message": "Hello from FastAPI"})


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
