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

### Frontend (React + Vite)

Con el backend corriendo en el puerto 8000:

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (reenvía /api al backend)
```

Calidad:

```bash
npm run lint && npm run format:check && npm run typecheck
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

## Qué puedes hacer

- **Tablas**: barra lateral con buscador, filas aproximadas y nº de FKs.
- **Grid**: paginación, orden y filtros en servidor; columnas redimensionables; filas
  virtualizadas (páginas de hasta 500 sin que se resienta el navegador). Todo el estado va
  en la URL, así que se puede compartir o volver atrás.
  - Filtros por columna: `rock` (contiene), `=Rock`, `!=Rock`, `>5`, `<=5`, `10..20`,
    `2024-03-01` (todo el día en columnas fecha-hora), `null`, `!null`; en una FK el texto
    busca en la etiqueta y `#12` busca el id. Booleanos y enums tienen desplegable.
  - Celdas por tipo: barra proporcional en números, pastillas en enums y textos con pocos
    valores, fechas relativas (la absoluta en el tooltip), `NULL` diferenciado, JSON plegable
    y FKs como `etiqueta #id` que abren la fila referenciada.
- **Vista general** de la conexión con una gráfica de filas por tabla (ECharts).
- **Estigia** (mapa de datos, pestaña ✦ en la cabecera), inspirado en el grafo de Obsidian:
  - Cada tabla es un astro (su tamaño crece con el nº de filas) y cada FK un hilo entre astros.
  - Doble clic en una tabla **siembra filas** que orbitan a su alrededor; doble clic en una
    fila **despliega sus relaciones**: a qué filas apunta y cuáles la referencian. Así se
    puede seguir el hilo por toda la base de datos.
  - Las tablas pivote N:M (p. ej. `playlist_track`) se atraviesan: una pista enlaza
    directamente con sus playlists (línea discontinua).
  - Al pasar el ratón se iluminan los vecinos; zoom con la rueda, arrastrar para moverse,
    buscador de nodos, leyenda por colores y partículas que viajan en el sentido de cada FK.
  - El nº de fila del grid es un enlace que abre esa fila directamente en Estigia.

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
por tabla con `display_columns` en `connections.toml`.

Los números `NUMERIC`/`DECIMAL` se envían como texto para no perder precisión, y los
enteros mayores de 2^53 también.

### Seguridad

- **Autenticación**: un único usuario (`CARONTE_ADMIN_USER` / `CARONTE_ADMIN_PASSWORD`).
  `POST /api/auth/login` crea una sesión en memoria y devuelve una cookie `HttpOnly`,
  `SameSite=Strict` y limitada a `/api` (con `Secure` si `CARONTE_COOKIE_SECURE=true`).
  `POST /api/auth/logout` la invalida en el servidor. Tras 10 intentos fallidos desde una
  IP en 5 minutos, el login responde `429`. Al reiniciar el servidor hay que volver a entrar.
- **Cabeceras**: `Content-Security-Policy`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer` y `Cache-Control: no-store` en la API.
- **Identificadores** (tablas y columnas, también en `sort` y `filters`): se validan contra
  la lista obtenida por introspección y los entrecomilla SQLAlchemy. Si no existen → `400`.
- **Valores**: siempre como parámetros enlazados; en `contains` se escapan `%` y `_`.
- **Límites**: `limit` ≤ 500, como mucho 20 filtros y timeout por sentencia
  (`CARONTE_STATEMENT_TIMEOUT`). Si se agota → `504`. Si solo se agota el recuento total,
  las filas se devuelven igualmente con `total: null`.
- Tests de inyección en `backend/tests/test_injection.py`.

## Créditos

Los scripts de Chinook (`dev/chinook/`) son de
[lerocha/chinook-database](https://github.com/lerocha/chinook-database) v1.4.5, licencia MIT.
