"""Creación de engines de solo lectura con timeout por sentencia.

Cada motor lo hace a su manera:
- PostgreSQL: parámetros de sesión `statement_timeout` y `default_transaction_read_only`.
- MariaDB/MySQL: `max_statement_time` (MariaDB) o `max_execution_time` (MySQL) y
  `SET SESSION TRANSACTION READ ONLY` al abrir cada conexión.
- SQLite: fichero abierto con `mode=ro`, `PRAGMA query_only` y un "progress handler"
  que aborta la sentencia cuando se pasa el plazo.
"""

import time
from functools import partial

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL

POOL_OPTIONS = {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 5, "pool_recycle": 1800}
CONNECT_TIMEOUT = 5


def create_readonly_engine(url: URL, statement_timeout: float) -> Engine:
    backend = url.get_backend_name()
    if backend == "postgresql":
        return _postgres_engine(url, statement_timeout)
    if backend in ("mysql", "mariadb"):
        return _mysql_engine(url, statement_timeout)
    if backend == "sqlite":
        return _sqlite_engine(url, statement_timeout)
    raise ValueError(f"Motor no soportado: {backend}")


def _postgres_engine(url: URL, timeout: float) -> Engine:
    options = f"-c statement_timeout={int(timeout * 1000)} -c default_transaction_read_only=on"
    return create_engine(
        url,
        connect_args={
            "options": options,
            "application_name": "caronte",
            "connect_timeout": CONNECT_TIMEOUT,
        },
        **POOL_OPTIONS,
    )


def _mysql_engine(url: URL, timeout: float) -> Engine:
    engine = create_engine(url, connect_args={"connect_timeout": CONNECT_TIMEOUT}, **POOL_OPTIONS)
    event.listen(engine, "connect", partial(_mysql_on_connect, timeout=timeout))
    return engine


def _mysql_on_connect(dbapi_conn, _record, *, timeout: float) -> None:
    is_mariadb = "mariadb" in dbapi_conn.get_server_info().lower()
    with dbapi_conn.cursor() as cur:
        if is_mariadb:
            cur.execute("SET SESSION max_statement_time = %s", (timeout,))
        else:
            cur.execute("SET SESSION max_execution_time = %s", (int(timeout * 1000),))
        cur.execute("SET SESSION TRANSACTION READ ONLY")


def _sqlite_engine(url: URL, timeout: float) -> Engine:
    engine = create_engine(url, pool_pre_ping=True)
    event.listen(engine, "connect", _sqlite_on_connect)
    event.listen(engine, "before_cursor_execute", partial(_sqlite_arm_timeout, timeout=timeout))
    return engine


def _sqlite_on_connect(dbapi_conn, _record) -> None:
    dbapi_conn.execute("PRAGMA query_only = ON")


def _sqlite_arm_timeout(conn, _cursor, _stmt, _params, _ctx, _many, *, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    # SQLite llama al handler cada N instrucciones de su VM; si devuelve True, aborta
    # la sentencia con "interrupted". El plazo cubre también el fetch de filas.
    conn.connection.dbapi_connection.set_progress_handler(
        lambda: time.monotonic() > deadline, 10_000
    )
