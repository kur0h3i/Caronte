from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.connections.config import ConfigError, load_connections, normalize_url


def test_toml_and_env_are_merged(tmp_path: Path):
    toml = tmp_path / "connections.toml"
    toml.write_text(
        """
[connections.local]
url = "sqlite:///data/x.sqlite"
display_columns = { employee = "last_name" }

[connections.pg]
url = "postgresql://u:p@h/db"
schema = "ventas"
""",
        encoding="utf-8",
    )
    loaded = load_connections(toml, {"CARONTE_DB_PG": "postgresql://u2:p2@h2/db2", "OTHER": "x"})

    assert set(loaded) == {"local", "pg"}
    local_cfg, local_url = loaded["local"]
    assert local_cfg.display_columns == {"employee": "last_name"}
    # La ruta relativa se resuelve respecto al TOML y se abre en solo lectura.
    assert local_url.database == (tmp_path / "data" / "x.sqlite").as_uri()
    assert local_url.query["mode"] == "ro"

    pg_cfg, pg_url = loaded["pg"]
    assert pg_url.host == "h2"  # la variable de entorno tiene prioridad
    assert pg_cfg.db_schema == "ventas"  # pero conserva el resto de la entrada del TOML


@pytest.mark.parametrize(
    ("raw", "driver"),
    [
        ("postgresql://u:p@h/db", "postgresql+psycopg"),
        ("mysql://u:p@h/db", "mysql+pymysql"),
        ("mariadb://u:p@h/db", "mariadb+pymysql"),
        ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg"),
    ],
)
def test_driver_is_filled_in(raw: str, driver: str):
    assert normalize_url(raw, Path.cwd()).drivername == driver


@pytest.mark.parametrize(
    "raw",
    [
        "oracle://u:p@h/db",
        "postgresql+psycopg2://u:p@h/db",
        "sqlite://",
        "sqlite:///:memory:",
        "no es una url",
    ],
)
def test_invalid_urls_are_rejected(raw: str):
    with pytest.raises(ConfigError):
        normalize_url(raw, Path.cwd())


def test_invalid_connection_name_is_rejected():
    with pytest.raises(ConfigError):
        load_connections(None, {"CARONTE_DB_MAL;NOMBRE": "sqlite:///x.sqlite"})


def test_admin_password_is_required(monkeypatch):
    monkeypatch.delenv("CARONTE_ADMIN_PASSWORD", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
