from collections.abc import Mapping
from dataclasses import dataclass

from sqlalchemy import Engine
from sqlalchemy.engine import URL

from app.config import Settings
from app.connections.config import ConnectionConfig, load_connections
from app.connections.engine import create_readonly_engine


@dataclass
class ManagedConnection:
    config: ConnectionConfig
    url: URL
    engine: Engine
    statement_timeout: float

    @property
    def name(self) -> str:
        return self.config.name

    @property
    def dialect(self) -> str:
        return self.url.get_backend_name()

    @property
    def schema(self) -> str | None:
        return self.config.db_schema


class ConnectionRegistry:
    """Conexiones configuradas. Las credenciales nunca salen de aquí."""

    def __init__(self, connections: list[ManagedConnection]):
        self._by_name = {c.name: c for c in connections}

    @classmethod
    def from_settings(cls, settings: Settings, environ: Mapping[str, str]) -> "ConnectionRegistry":
        loaded = load_connections(settings.config_file, environ)
        return cls(
            [
                ManagedConnection(
                    config=cfg,
                    url=url,
                    engine=create_readonly_engine(url, settings.statement_timeout),
                    statement_timeout=settings.statement_timeout,
                )
                for cfg, url in loaded.values()
            ]
        )

    def all(self) -> list[ManagedConnection]:
        return list(self._by_name.values())

    def get(self, name: str) -> ManagedConnection | None:
        return self._by_name.get(name)

    def dispose(self) -> None:
        for conn in self._by_name.values():
            conn.engine.dispose()
