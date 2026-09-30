"""Fixtures comunes.

Los tests se ejecutan contra Chinook en los tres motores:
- SQLite siempre (se genera en un directorio temporal).
- PostgreSQL y MariaDB si están levantados (`docker compose -f dev/docker-compose.yml up -d`);
  si no, esos casos se saltan. Las URLs se pueden cambiar con CARONTE_TEST_PG_URL y
  CARONTE_TEST_MARIADB_URL.
"""

import importlib.util
import os
import re
from collections.abc import Iterator
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.config import Settings
from app.main import create_app

DEV_DIR = Path(__file__).resolve().parents[2] / "dev"
ADMIN_USER = "admin"
ADMIN_PASSWORD = "test-password-123"

PG_URL = os.environ.get(
    "CARONTE_TEST_PG_URL", "postgresql+psycopg://caronte_ro:caronte_ro@127.0.0.1:5433/chinook"
)
MARIADB_URL = os.environ.get(
    "CARONTE_TEST_MARIADB_URL", "mysql+pymysql://caronte_ro:caronte_ro@127.0.0.1:3307/Chinook"
)


def _load_build_sqlite():
    spec = importlib.util.spec_from_file_location("build_sqlite", DEV_DIR / "build_sqlite.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@cache
def _reachable(url: str) -> bool:
    engine = create_engine(url, connect_args={"connect_timeout": 2})
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
    finally:
        engine.dispose()


@dataclass(frozen=True)
class Chinook:
    """Chinook usa PascalCase en MariaDB/SQLite y snake_case en Postgres."""

    engine: str
    url: str

    @property
    def snake(self) -> bool:
        return self.engine == "postgresql"

    def n(self, pascal: str) -> str:
        """Nombre de tabla o columna en el estilo de este motor: n("MediaTypeId")."""
        if not self.snake:
            return pascal
        return re.sub(r"(?<!^)(?=[A-Z])", "_", pascal).lower()


@pytest.fixture(scope="session")
def sqlite_path(tmp_path_factory) -> Path:
    return _load_build_sqlite().build(tmp_path_factory.mktemp("db") / "chinook.sqlite")


@pytest.fixture(
    scope="session",
    params=[
        "sqlite",
        pytest.param("postgresql", marks=pytest.mark.integration),
        pytest.param("mariadb", marks=pytest.mark.integration),
    ],
)
def chinook(request, sqlite_path) -> Chinook:
    if request.param == "sqlite":
        return Chinook("sqlite", f"sqlite:///{sqlite_path}")
    url = PG_URL if request.param == "postgresql" else MARIADB_URL
    if not _reachable(url):
        pytest.skip(f"{request.param} no disponible en {url.split('@')[-1]}")
    return Chinook(request.param, url)


def make_settings(**overrides) -> Settings:
    values = {"admin_user": ADMIN_USER, "admin_password": ADMIN_PASSWORD, **overrides}
    return Settings(_env_file=None, **values)


def make_client(chinook: Chinook, **settings) -> TestClient:
    app = create_app(make_settings(**settings), environ={"CARONTE_DB_CHINOOK": chinook.url})
    return TestClient(app)


def login(client: TestClient) -> None:
    resp = client.post("/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    assert resp.status_code == 200, resp.text


# La API es de solo lectura, así que un cliente autenticado por motor sirve para toda la
# sesión de tests (y la introspección se hace una sola vez).
@pytest.fixture(scope="session")
def client(chinook) -> Iterator[TestClient]:
    with make_client(chinook) as test_client:
        login(test_client)
        yield test_client


@pytest.fixture
def sqlite_chinook(sqlite_path) -> Chinook:
    return Chinook("sqlite", f"sqlite:///{sqlite_path}")
