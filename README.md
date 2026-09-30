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

Los scripts de Chinook (`dev/chinook/`) son de
[lerocha/chinook-database](https://github.com/lerocha/chinook-database) v1.4.5, licencia MIT.
