# Caronte

Explorador web de bases de datos relacionales (PostgreSQL, MariaDB/MySQL y SQLite).
Sustituto de Adminer centrado en **visualizar** tablas y su contenido, no en administrarlas.
Es de **solo lectura**.

> Estado: en construcción (MVP).

## Entorno de desarrollo

Requisitos: Docker, Python 3.12 y [uv](https://docs.astral.sh/uv/), Node 20+.

### Bases de datos de ejemplo (Chinook)

```bash
# Postgres (puerto 5433) y MariaDB (puerto 3307) con Chinook + tabla demo `track_review`
docker compose -f dev/docker-compose.yml up -d --wait

# SQLite con la misma base en dev/data/chinook.sqlite
python3 dev/build_sqlite.py
```

Las tres BDs incluyen, además de Chinook, una tabla demo (`track_review` / `TrackReview`)
con tipos que Chinook no tiene (enum, JSON, booleano, fecha-hora y nulos) para probar
el renderizado de celdas.

En Postgres y MariaDB existe un usuario **de solo lectura** `caronte_ro` / `caronte_ro`,
que es el que usa `dev/connections.toml`.

Para empezar de cero: `docker compose -f dev/docker-compose.yml down -v`.

### Backend (FastAPI)

```bash
cd backend
uv sync                                   # crea .venv con las dependencias
export CARONTE_ADMIN_PASSWORD='cambia-esto'
export CARONTE_CONFIG_FILE=../dev/connections.toml
uv run uvicorn app.main:create_app --factory --reload --port 8000
```

La API queda en <http://localhost:8000/api> y la documentación interactiva en
<http://localhost:8000/api/docs>.

Calidad:

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest            # SQLite siempre; Postgres/MariaDB si están levantados
```

## Configuración

Todas las variables llevan el prefijo `CARONTE_`:

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `CARONTE_ADMIN_USER` | `admin` | Usuario de acceso |
| `CARONTE_ADMIN_PASSWORD` | — (obligatoria, ≥ 8 caracteres) | Contraseña de acceso |
| `CARONTE_CONFIG_FILE` | — | Ruta a `connections.toml` |
| `CARONTE_DB_<NOMBRE>` | — | URL de una conexión (alternativa al TOML) |
| `CARONTE_STATEMENT_TIMEOUT` | `5` | Timeout por sentencia, en segundos |
| `CARONTE_SCHEMA_CACHE_TTL` | `300` | Segundos que se cachea la introspección |
| `CARONTE_SESSION_TTL` | `43200` | Duración de la sesión, en segundos |
| `CARONTE_COOKIE_SECURE` | `false` | Marca la cookie como `Secure` (actívalo con HTTPS) |

### Conexiones

En `connections.toml`:

```toml
[connections.mi_postgres]
url = "postgresql://usuario:clave@host:5432/bd"
schema = "public"                                  # opcional
display_columns = { employee = "last_name" }       # opcional, ver más abajo

[connections.mi_sqlite]
url = "sqlite:///datos/app.sqlite"                 # relativa al propio TOML
```

O con variables de entorno: `CARONTE_DB_MI_POSTGRES=postgresql://...` (el nombre de la
conexión es el sufijo en minúsculas). Si existe en ambos sitios, gana la variable.

Motores y drivers: `postgresql` (psycopg 3), `mysql`/`mariadb` (PyMySQL) y `sqlite`.
Si la URL no indica driver se añade el correcto automáticamente.

**Solo lectura en tres capas**: la API no tiene endpoints de escritura; cada conexión se abre
en modo solo lectura (`default_transaction_read_only` en Postgres,
`SET SESSION TRANSACTION READ ONLY` en MariaDB/MySQL, `mode=ro` + `query_only` en SQLite);
y se recomienda usar un usuario de BD que solo tenga `SELECT`.

## Créditos

Los scripts de Chinook (`dev/chinook/`) son de
[lerocha/chinook-database](https://github.com/lerocha/chinook-database) v1.4.5, licencia MIT.
