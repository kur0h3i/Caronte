from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.connections.config import normalize_url
from app.connections.engine import create_readonly_engine
from app.connections.errors import is_timeout

SLOW_QUERY = {
    "postgresql": "SELECT pg_sleep(5)",
    "mariadb": "SELECT SLEEP(5)",
    # Recursión infinita: solo el timeout la detiene.
    "sqlite": "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) "
    "SELECT count(*) FROM c",
}


@pytest.fixture
def engine(chinook):
    eng = create_readonly_engine(normalize_url(chinook.url, Path.cwd()), statement_timeout=0.5)
    yield eng
    eng.dispose()


def test_list_connections_does_not_leak_credentials(client, chinook):
    resp = client.get("/api/connections")
    assert resp.status_code == 200
    expected_dialect = "mysql" if chinook.engine == "mariadb" else chinook.engine
    assert resp.json() == [{"name": "chinook", "dialect": expected_dialect}]
    assert "caronte_ro" not in resp.text
    assert "127.0.0.1" not in resp.text


def test_engine_is_read_only(engine, chinook):
    table = chinook.n("Genre")
    with engine.connect() as conn, pytest.raises(DBAPIError):
        conn.execute(text(f"DELETE FROM {table}"))


def test_statement_timeout(engine, chinook):
    with engine.connect() as conn, pytest.raises(DBAPIError) as info:
        conn.execute(text(SLOW_QUERY[chinook.engine])).fetchall()
    assert is_timeout(info.value)
