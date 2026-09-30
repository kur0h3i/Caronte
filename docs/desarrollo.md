# Caronte · guía técnica

Para instalar y usar Caronte, mira el [README](../README.md). Aquí está lo necesario para
desarrollar: entorno local, calidad, variables, API, seguridad y arquitectura.

## Entorno de desarrollo

Requisitos: Docker, Python 3.12 y [uv](https://docs.astral.sh/uv/), Node 20+.

### 1. Bases de datos de ejemplo (Chinook)

```bash
# Postgres (puerto 5433) y MariaDB (puerto 3307) con Chinook + tabla demo
docker compose -f dev/docker-compose.yml up -d --wait

# SQLite con la misma base en dev/data/chinook.sqlite
python3 dev/build_sqlite.py
```

Además de Chinook, las tres BDs tienen una tabla demo (`track_review` / `TrackReview`) con
tipos que Chinook no tiene (enum, JSON, booleano, fecha-hora y nulos). En Postgres y MariaDB
hay un usuario **de solo lectura** `caronte_ro` / `caronte_ro`, que es el que usa
`dev/connections.toml`. Para empezar de cero: `docker compose -f dev/docker-compose.yml down -v`.

### 2. Backend (FastAPI)

```bash
cd backend
uv sync                                   # crea .venv con las dependencias
export CARONTE_ADMIN_PASSWORD='cambia-esto'
export CARONTE_CONFIG_FILE=../dev/connections.toml
uv run uvicorn app.main:create_app --factory --reload --port 8000
```

API en <http://localhost:8000/api> y documentación interactiva en
<http://localhost:8000/api/docs>.

### 3. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (reenvía /api al backend en :8000)
```

### Calidad

```bash
# backend
uv run ruff check . && uv run ruff format --check .
uv run pytest            # SQLite siempre; Postgres/MariaDB si están levantados

# frontend
npm run lint && npm run format:check && npm run typecheck
```

Los tests se ejecutan contra los tres motores (los de Postgres/MariaDB se saltan si
`dev/docker-compose.yml` no está levantado) e incluyen intentos de inyección SQL.

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
| `CARONTE_STATIC_DIR` | — (`/app/static` en Docker) | Carpeta del frontend compilado |
| `CARONTE_PORT` | `8000` | Puerto del contenedor (solo Docker) |

### Conexiones

En `connections.toml` (ver `connections.example.toml`):

```toml
[connections.mi_postgres]
url = "postgresql://usuario:clave@host:5432/bd"
schema = "public"                                  # opcional
display_columns = { employee = "last_name" }       # opcional: fuerza la etiqueta de una tabla

[connections.mi_sqlite]
url = "sqlite:///datos/app.sqlite"                 # relativa al propio TOML
```

O con variables de entorno: `CARONTE_DB_MI_POSTGRES=postgresql://...` (el nombre de la
conexión es el sufijo en minúsculas). Si existe en ambos sitios, gana la variable.

Motores y drivers: `postgresql` (psycopg 3), `mysql`/`mariadb` (PyMySQL) y `sqlite`.
Si la URL no indica driver se añade el correcto automáticamente. Las credenciales nunca
salen del backend: `/api/connections` solo devuelve nombre y motor.

## API

Todas las rutas cuelgan de `/api`, son `GET` (salvo login/logout) y exigen sesión
(salvo `/api/health` y el login).

| Ruta | Devuelve |
| --- | --- |
| `/connections` | Conexiones configuradas: nombre y motor |
| `/connections/{c}/tables` | Tablas y vistas: nombre, filas aproximadas, nº de FKs |
| `/connections/{c}/tables/{t}/meta` | Columnas (tipo normalizado y nativo), PK y FKs con su columna de display |
| `/connections/{c}/tables/{t}/rows` | Filas paginadas, ordenadas y filtradas |
| `/connections/{c}/graph` | Esquema como grafo: tablas (display, ¿explorable?, ¿pivote?) y relaciones |
| `/connections/{c}/tables/{t}/neighbors?id=` | Una fila, las filas a las que apunta y las que la referencian (`limit` por relación, máx. 50) |

Tipos normalizados: `int`, `numeric`, `text`, `bool`, `date`, `datetime`, `json`, `enum`.

Parámetros de `rows`:

- `limit` (1–500, por defecto 100) y `offset`.
- `sort=Columna` o `sort=-Columna` (descendente). Una FK se ordena por su etiqueta.
  Siempre se desempata por la PK para que la paginación sea estable.
- `filters`: JSON con una lista de `{"column", "op", "value"}`, combinados con AND.
  Operadores: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `contains` (sin distinguir mayúsculas;
  en una FK busca en la etiqueta), `is_null`, `not_null`.

  ```
  /rows?sort=-Milliseconds&filters=[{"column":"GenreId","op":"eq","value":1}]
  ```

Cada FK de una columna llega como `{"id": 1, "label": "Rock"}`. La etiqueta sale de un
`LEFT JOIN` a la columna de display de la tabla referenciada, elegida por prioridad:
`name`, `nombre`, `title`, `titulo`, `email`, `username` (sin distinguir mayúsculas ni
tildes); si no hay, la primera columna de texto; y si tampoco, la PK. Se puede forzar
por tabla con `display_columns`.

Los números `NUMERIC`/`DECIMAL` se envían como texto para no perder precisión, y los
enteros mayores de 2^53 también.

## Seguridad

- **Solo lectura en tres capas**: la API no tiene endpoints de escritura (hay un test que lo
  comprueba); cada conexión se abre en modo solo lectura (`default_transaction_read_only` en
  Postgres, `SET SESSION TRANSACTION READ ONLY` en MariaDB/MySQL, `mode=ro` + `query_only` en
  SQLite); y se recomienda un usuario de BD que solo tenga `SELECT`.
- **Identificadores** (tablas y columnas, también en `sort` y `filters`): se validan contra
  la lista obtenida por introspección y los entrecomilla SQLAlchemy. Si no existen → `400`.
- **Valores**: siempre como parámetros enlazados, convertidos antes al tipo de la columna;
  en `contains` se escapan `%` y `_`.
- **Límites**: `limit` ≤ 500, como mucho 20 filtros y timeout por sentencia
  (`CARONTE_STATEMENT_TIMEOUT`). Si se agota → `504`. Si solo se agota el recuento total,
  las filas se devuelven igualmente con `total: null`.
- **Autenticación**: un único usuario por variables de entorno. `POST /api/auth/login` crea
  una sesión en memoria y devuelve una cookie `HttpOnly`, `SameSite=Strict` y limitada a
  `/api` (con `Secure` si `CARONTE_COOKIE_SECURE=true`). `POST /api/auth/logout` la invalida
  en el servidor. Tras 10 intentos fallidos desde una IP en 5 minutos, el login responde `429`.
  Al reiniciar el servidor hay que volver a entrar.
- **Cabeceras**: `Content-Security-Policy` sin scripts inline ni recursos externos (la fuente
  va empaquetada), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` y
  `Cache-Control: no-store` en la API.
- Tests de inyección: `backend/tests/test_injection.py` y `backend/tests/test_graph.py`.

## Arquitectura y decisiones

```
caronte/
├── backend/
│   ├── app/
│   │   ├── main.py            # create_app(): routers, middleware, frontend estático
│   │   ├── config.py          # Settings (variables CARONTE_*)
│   │   ├── connections/       # carga de conexiones, engines de solo lectura, errores
│   │   ├── introspection/     # inspect(), tipos normalizados, columna de display, caché
│   │   ├── data/              # consulta de filas: filtros, orden, JOIN de FKs, serialización
│   │   ├── graph/             # Estigia: esquema como grafo y vecinos de una fila
│   │   ├── security/          # validación de identificadores, auth, cabeceras
│   │   └── frontend.py        # sirve el build de React con fallback de SPA
│   └── tests/
├── frontend/src/
│   ├── api/                   # cliente fetch, tipos y hooks de TanStack Query
│   ├── grid/                  # DataGrid (TanStack Table + Virtual), filtros, paginación
│   ├── cells/                 # renderizado de celdas por tipo
│   ├── map/                   # Estigia: modelo, motor (d3-force + canvas) y panel
│   ├── pages/ · layout/ · auth/ · theme/
├── dev/                       # docker-compose con Chinook en Postgres/MariaDB + SQLite
├── Dockerfile · docker-compose.yml
```

Decisiones principales (y por qué):

- **SQLAlchemy Core síncrono** con endpoints `def`: FastAPI los ejecuta en un threadpool.
  PyMySQL y sqlite3 son síncronos, así que async no aportaría nada y complicaría el código.
- **La introspección es la lista blanca**: se cachea (TTL) y toda tabla/columna que llega
  del usuario se busca en ella antes de construir la consulta.
- **Columnas sin tipo en las consultas** (`table()`/`column()`): recibimos los valores tal
  cual del driver y los serializamos nosotros; así un formato raro de fecha en SQLite no
  rompe la consulta. Los valores de filtros se convierten en Python al tipo de la columna.
- **LEFT JOIN solo contra la PK** de la tabla referenciada: garantiza que no se duplican filas.
- **Sesiones en memoria** en vez de cookies firmadas: el logout invalida de verdad y no hay
  clave que custodiar; a cambio, reiniciar obliga a volver a entrar.
- **Estado del grid en la URL**: enlaces de FK, botón atrás y recarga funcionan sin más.
- **Estigia con d3-force + canvas propio** en lugar del grafo de ECharts: permite desplegar
  nodos de forma incremental sin recolocar todo, y controlar el aspecto (halos, partículas,
  resaltado de vecinos). ECharts se usa para las gráficas clásicas.
- **Estadísticas de celda en el navegador** (máximo para las barras, cardinalidad para las
  pastillas) sobre la página visible: cero consultas extra.

## Hoja de ruta

Fuera del MVP, pero la arquitectura lo deja preparado:

- Histogramas en las cabeceras (endpoint de estadísticas en `data/` + ECharts).
- Panel de detalle de fila con relaciones inversas en el grid (ya existe `neighbors`).
- Vistas alternativas: kanban (enums), timeline (fechas), galería (URLs de imágenes).
- Editor SQL de solo lectura, diagrama ER y, más adelante, escritura de datos.
- Conexiones gestionadas desde la UI.

