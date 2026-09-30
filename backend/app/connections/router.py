from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.connections.deps import get_registry
from app.connections.registry import ConnectionRegistry

router = APIRouter(tags=["connections"])


class ConnectionOut(BaseModel):
    name: str
    dialect: Literal["postgresql", "mysql", "mariadb", "sqlite"]


@router.get("/connections", response_model=list[ConnectionOut])
def list_connections(registry: ConnectionRegistry = Depends(get_registry)) -> list[ConnectionOut]:
    # Solo nombre y motor: ni host, ni usuario, ni contraseña.
    return [ConnectionOut(name=c.name, dialect=c.dialect) for c in registry.all()]
