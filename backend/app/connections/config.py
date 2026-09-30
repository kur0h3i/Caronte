"""Carga de conexiones desde `connections.toml` y/o variables `CARONTE_DB_<NOMBRE>`.

Formato del TOML:

    [connections.mi_bd]
    url = "postgresql+psycopg://usuario:clave@host:5432/bd"
    schema = "public"                      # opcional
    display_columns = { empleado = "apellido" }  # opcional: fuerza la columna de display
"""

import tomllib
from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

ENV_PREFIX = "CARONTE_DB_"

# backend -> driver que instalamos. Si la URL no indica driver, se usa este.
SUPPORTED_DRIVERS = {
    "postgresql": "psycopg",
    "mysql": "pymysql",
    "mariadb": "pymysql",
    "sqlite": "pysqlite",
}


class ConfigError(ValueError):
    pass


class ConnectionConfig(BaseModel):
    name: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    url: str
    db_schema: str | None = Field(default=None, alias="schema")
    display_columns: dict[str, str] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


def normalize_url(raw: str, base_dir: Path) -> URL:
    """Fija el driver y, en SQLite, abre el fichero en modo solo lectura."""
    try:
        url = make_url(raw)
    except ArgumentError as exc:
        raise ConfigError(f"URL de conexión no válida: {exc}") from None

    backend = url.get_backend_name()
    expected = SUPPORTED_DRIVERS.get(backend)
    if expected is None:
        raise ConfigError(f"Motor no soportado: {backend!r}")
    driver = url.get_driver_name()
    if url.drivername == backend and backend != "sqlite":
        url = url.set(drivername=f"{backend}+{expected}")
    elif driver != expected:
        raise ConfigError(f"Driver no soportado para {backend}: {driver!r} (usa {expected})")

    if backend == "sqlite":
        url = _sqlite_readonly_url(url, base_dir)
    return url


def _sqlite_readonly_url(url: URL, base_dir: Path) -> URL:
    database = url.database or ""
    if database in ("", ":memory:") or database.startswith("file:"):
        raise ConfigError("SQLite necesita la ruta a un fichero (sqlite:///ruta/bd.sqlite)")
    path = Path(database).expanduser()
    if not path.is_absolute():
        path = (base_dir / path).resolve()
    # URI "file:...?mode=ro": SQLite rechaza cualquier escritura a nivel de fichero.
    return url.set(database=path.as_uri(), query={**url.query, "mode": "ro", "uri": "true"})


def load_connections(
    config_file: Path | None, environ: Mapping[str, str]
) -> dict[str, tuple[ConnectionConfig, URL]]:
    raw: dict[str, dict] = {}
    base_dirs: dict[str, Path] = {}

    if config_file is not None:
        try:
            data = tomllib.loads(config_file.read_text(encoding="utf-8"))
        except (OSError, tomllib.TOMLDecodeError) as exc:
            raise ConfigError(f"No se pudo leer {config_file}: {exc}") from None
        for name, entry in data.get("connections", {}).items():
            if not isinstance(entry, dict):
                raise ConfigError(f"La conexión {name!r} debe ser una tabla TOML")
            raw[name] = {**entry, "name": name}
            base_dirs[name] = config_file.resolve().parent

    for key, value in environ.items():
        if key.startswith(ENV_PREFIX) and len(key) > len(ENV_PREFIX):
            name = key[len(ENV_PREFIX) :].lower()
            raw[name] = {**raw.get(name, {}), "name": name, "url": value}
            base_dirs[name] = Path.cwd()

    result: dict[str, tuple[ConnectionConfig, URL]] = {}
    for name, entry in raw.items():
        try:
            cfg = ConnectionConfig.model_validate(entry)
        except ValidationError as exc:
            raise ConfigError(f"Conexión {name!r} mal definida: {exc}") from None
        result[cfg.name] = (cfg, normalize_url(cfg.url, base_dirs[name]))
    return result
