from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_login_default_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    resp = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["username"] == "user"


def test_login_invalid_credentials(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    resp = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert resp.status_code == 401


def test_login_unknown_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "pass"})
    assert resp.status_code == 401


def test_register_and_login(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    reg = client.post("/api/auth/register", json={"username": "newuser", "password": "securepass"})
    assert reg.status_code == 200
    assert reg.json()["username"] == "newuser"
    token = reg.json()["token"]
    assert token != ""

    # Can log in afterwards
    login = client.post("/api/auth/login", json={"username": "newuser", "password": "securepass"})
    assert login.status_code == 200


def test_register_duplicate_username(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    client.post("/api/auth/register", json={"username": "dupuser", "password": "pass123"})
    resp = client.post("/api/auth/register", json={"username": "dupuser", "password": "other123"})
    assert resp.status_code == 409


def test_register_short_password(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    resp = client.post("/api/auth/register", json={"username": "alice", "password": "abc"})
    assert resp.status_code == 422


def test_register_short_username(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    resp = client.post("/api/auth/register", json={"username": "a", "password": "validpass"})
    assert resp.status_code == 422


def test_me_endpoint(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    token = client.post("/api/auth/login", json={"username": "user", "password": "password"}).json()["token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "user"


def test_me_requires_auth(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    assert client.get("/api/auth/me").status_code == 401


def test_logout_invalidates_token(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    token = client.post("/api/auth/login", json={"username": "user", "password": "password"}).json()["token"]
    auth = {"Authorization": f"Bearer {token}"}

    # Token works before logout
    assert client.get("/api/auth/me", headers=auth).status_code == 200

    client.post("/api/auth/logout", headers=auth)

    # Token no longer works
    assert client.get("/api/auth/me", headers=auth).status_code == 401


def test_register_invalid_username_chars(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    resp = client.post("/api/auth/register", json={"username": "bad user!", "password": "validpass"})
    assert resp.status_code == 422


def test_register_username_too_long(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    resp = client.post("/api/auth/register", json={"username": "a" * 33, "password": "validpass"})
    assert resp.status_code == 422
