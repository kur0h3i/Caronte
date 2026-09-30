"""Autenticación: un único usuario admin (variables de entorno) y sesiones en memoria.

Las sesiones viven en el proceso: al reiniciar hay que volver a entrar, pero a cambio el
logout invalida la sesión de verdad y no hay que custodiar ninguna clave de firma. El
navegador solo guarda un token aleatorio en una cookie HttpOnly (inaccesible desde JS).
"""

import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.config import Settings

COOKIE_NAME = "caronte_session"
COOKIE_PATH = "/api"


@dataclass(frozen=True)
class Session:
    username: str
    expires_at: float


class SessionStore:
    def __init__(self, ttl: int):
        self._ttl = ttl
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def create(self, username: str) -> str:
        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        with self._lock:
            self._sessions = {t: s for t, s in self._sessions.items() if s.expires_at > now}
            self._sessions[token] = Session(username, now + self._ttl)
        return token

    def get(self, token: str) -> Session | None:
        with self._lock:
            session = self._sessions.get(token)
            if session is None:
                return None
            if session.expires_at <= time.monotonic():
                del self._sessions[token]
                return None
            return session

    def delete(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)


class LoginThrottle:
    """Como mucho `max_failures` intentos fallidos por IP cada `window` segundos."""

    def __init__(self, max_failures: int = 10, window: float = 300):
        self._max = max_failures
        self._window = window
        self._failures: defaultdict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, ip: str) -> deque[float]:
        attempts = self._failures[ip]
        limit = time.monotonic() - self._window
        while attempts and attempts[0] < limit:
            attempts.popleft()
        return attempts

    def check(self, ip: str) -> None:
        with self._lock:
            if len(self._recent(ip)) >= self._max:
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Demasiados intentos fallidos; espera unos minutos",
                )

    def record_failure(self, ip: str) -> None:
        with self._lock:
            self._recent(ip).append(time.monotonic())

    def reset(self, ip: str) -> None:
        with self._lock:
            self._failures.pop(ip, None)


def verify_credentials(settings: Settings, username: str, password: str) -> bool:
    # compare_digest tarda lo mismo acierte o falle: no filtra información por tiempos.
    # Se evalúan ambas comparaciones siempre, sin cortocircuito.
    user_ok = secrets.compare_digest(username.encode(), settings.admin_user.encode())
    password_ok = secrets.compare_digest(
        password.encode(), settings.admin_password.get_secret_value().encode()
    )
    return user_ok & password_ok


def require_session(request: Request) -> Session:
    """Dependencia que protege todas las rutas de datos."""
    token = request.cookies.get(COOKIE_NAME)
    session = request.app.state.sessions.get(token) if token else None
    if session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    return session
