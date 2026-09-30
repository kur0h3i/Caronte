import threading
import time
from collections import defaultdict

from app.connections.registry import ManagedConnection
from app.introspection.loader import load_schema
from app.introspection.models import SchemaInfo


class SchemaCache:
    """Guarda el esquema de cada conexión durante `ttl` segundos.

    La introspección hace varias consultas al catálogo; cachearla evita repetirlas en
    cada petición y, sobre todo, es la lista blanca contra la que validamos identificadores.
    """

    def __init__(self, ttl: float):
        self._ttl = ttl
        self._entries: dict[str, tuple[float, SchemaInfo]] = {}
        self._locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)
        self._guard = threading.Lock()

    def get(self, managed: ManagedConnection) -> SchemaInfo:
        with self._guard:
            lock = self._locks[managed.name]
        with lock:
            entry = self._entries.get(managed.name)
            if entry and time.monotonic() - entry[0] < self._ttl:
                return entry[1]
            schema = load_schema(managed)
            self._entries[managed.name] = (time.monotonic(), schema)
            return schema

    def invalidate(self, name: str | None = None) -> None:
        if name is None:
            self._entries.clear()
        else:
            self._entries.pop(name, None)
