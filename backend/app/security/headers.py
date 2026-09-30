from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# El frontend compilado no usa scripts inline ni recursos externos.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/"):
            # Los datos de la BD no deben quedarse en cachés intermedias ni del navegador.
            headers.setdefault("Cache-Control", "no-store")
        elif request.url.path.startswith("/assets/") and response.status_code == 200:
            headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        if not request.url.path.startswith("/api/docs"):
            headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        return response
