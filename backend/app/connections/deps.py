from fastapi import HTTPException, Request, status

from app.connections.registry import ConnectionRegistry, ManagedConnection


def get_registry(request: Request) -> ConnectionRegistry:
    return request.app.state.registry


def get_connection(conn_name: str, request: Request) -> ManagedConnection:
    conn = get_registry(request).get(conn_name)
    if conn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Conexión desconocida: {conn_name!r}")
    return conn
