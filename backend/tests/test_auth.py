import time

import pytest
from fastapi.routing import APIRoute

from app.security.auth import SessionStore
from tests.conftest import ADMIN_PASSWORD, ADMIN_USER, login, make_client

PROTECTED = [
    "/api/connections",
    "/api/connections/chinook/tables",
    "/api/connections/chinook/tables/Track/meta",
    "/api/connections/chinook/tables/Track/rows",
    "/api/auth/me",
]


@pytest.fixture
def anon(sqlite_chinook):
    with make_client(sqlite_chinook) as client:
        yield client


@pytest.mark.parametrize("path", PROTECTED)
def test_protected_routes_require_session(anon, path):
    assert anon.get(path).status_code == 401


def test_health_is_public(anon):
    assert anon.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("username", "password"),
    [
        (ADMIN_USER, "otra-clave-cualquiera"),
        ("root", ADMIN_PASSWORD),
        ("", ""),
        (ADMIN_USER.upper(), ADMIN_PASSWORD),
    ],
)
def test_wrong_credentials(anon, username, password):
    resp = anon.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 401
    assert "set-cookie" not in resp.headers
    assert anon.get("/api/connections").status_code == 401


def test_login_sets_httponly_cookie_and_logout_invalidates(anon):
    resp = anon.post("/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    assert resp.json() == {"username": ADMIN_USER}
    cookie = resp.headers["set-cookie"].lower()
    assert "caronte_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "path=/api" in cookie
    assert "secure" not in cookie

    assert anon.get("/api/connections").status_code == 200
    assert anon.get("/api/auth/me").json() == {"username": ADMIN_USER}

    token = anon.cookies.get("caronte_session")
    assert anon.post("/api/auth/logout").status_code == 204
    assert anon.get("/api/connections").status_code == 401
    # Reenviar el token antiguo tampoco sirve: la sesión se borró en el servidor.
    anon.cookies.set("caronte_session", token, path="/api")
    assert anon.get("/api/connections").status_code == 401


def test_forged_token_is_rejected(anon):
    anon.cookies.set("caronte_session", "token-inventado", path="/api")
    assert anon.get("/api/connections").status_code == 401


def test_secure_cookie_flag(sqlite_chinook):
    with make_client(sqlite_chinook, cookie_secure=True) as client:
        resp = client.post(
            "/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD}
        )
        assert "secure" in resp.headers["set-cookie"].lower()


def test_login_throttling(anon):
    for _ in range(10):
        resp = anon.post("/api/auth/login", json={"username": ADMIN_USER, "password": "mal"})
        assert resp.status_code == 401
    # Bloqueado incluso con la contraseña correcta.
    resp = anon.post("/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    assert resp.status_code == 429


def test_session_expires(monkeypatch):
    store = SessionStore(ttl=60)
    token = store.create("admin")
    assert store.get(token) is not None
    now = time.monotonic()
    monkeypatch.setattr(time, "monotonic", lambda: now + 61)
    assert store.get(token) is None


def test_security_headers(sqlite_chinook):
    with make_client(sqlite_chinook) as client:
        login(client)
        resp = client.get("/api/connections")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["cache-control"] == "no-store"


def test_api_is_read_only(sqlite_chinook):
    """Ninguna ruta puede modificar datos: solo GET, salvo login/logout."""
    with make_client(sqlite_chinook) as client:
        routes = [r for r in client.app.routes if isinstance(r, APIRoute)]
    allowed_posts = {"/api/auth/login", "/api/auth/logout"}
    for route in routes:
        methods = route.methods - {"HEAD"}
        if route.path in allowed_posts:
            assert methods == {"POST"}, route.path
        else:
            assert methods == {"GET"}, (route.path, methods)
