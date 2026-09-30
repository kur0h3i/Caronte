from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

MAX_LIMIT = 500


class Settings(BaseSettings):
    """Configuración global. Cada campo se lee de la variable CARONTE_<CAMPO>."""

    model_config = SettingsConfigDict(env_prefix="CARONTE_", env_file=".env", extra="ignore")

    config_file: Path | None = None

    admin_user: str = "admin"
    # Obligatoria: sin contraseña la app no arranca (fallo cerrado).
    admin_password: SecretStr = Field(min_length=8)

    statement_timeout: float = Field(default=5.0, gt=0, le=300)
    default_limit: int = Field(default=100, ge=1, le=MAX_LIMIT)
    schema_cache_ttl: int = Field(default=300, ge=0)

    session_ttl: int = Field(default=12 * 3600, ge=60)
    # Actívalo si sirves Caronte por HTTPS (p. ej. `tailscale serve`).
    cookie_secure: bool = False

    # Carpeta con el frontend compilado; si existe, FastAPI la sirve en "/".
    static_dir: Path | None = None
