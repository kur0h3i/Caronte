from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.security.auth import (
    COOKIE_NAME,
    COOKIE_PATH,
    Session,
    require_session,
    verify_credentials,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(max_length=256)
    password: str = Field(max_length=1024)


class UserOut(BaseModel):
    username: str


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response) -> UserOut:
    state = request.app.state
    ip = request.client.host if request.client else "desconocida"
    state.login_throttle.check(ip)
    if not verify_credentials(state.settings, body.username, body.password):
        state.login_throttle.record_failure(ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")
    state.login_throttle.reset(ip)

    response.set_cookie(
        COOKIE_NAME,
        state.sessions.create(body.username),
        max_age=state.settings.session_ttl,
        path=COOKIE_PATH,
        httponly=True,  # JavaScript no puede leerla (mitiga robo de sesión por XSS)
        samesite="strict",  # no viaja en peticiones iniciadas desde otros sitios (CSRF)
        secure=state.settings.cookie_secure,
    )
    return UserOut(username=body.username)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        request.app.state.sessions.delete(token)
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH, httponly=True, samesite="strict")


@router.get("/me", response_model=UserOut)
def me(session: Session = Depends(require_session)) -> UserOut:
    return UserOut(username=session.username)
