<p align="center">
  <img src="frontend/src/assets/caronte-logo.svg" alt="Logo de Caronte: la barca de Caronte cruza el Aqueronte cargada con una base de datos" width="128">
</p>

<h1 align="center">Caronte</h1>

Explorador web de bases de datos **PostgreSQL**, **MariaDB/MySQL** y **SQLite**.
Sirve para **ver** tus tablas, sus datos y cómo se relacionan. Es de **solo lectura**: no
puede modificar nada.

> Caronte es el barquero que cruza las almas por el Aqueronte; aquí cruza los datos, de la
> base de datos hasta ti ([por qué el nombre](#el-nombre-y-el-logo)).

Pensado para un servidor casero con Docker, accesible por la red local o Tailscale.

**Índice:** [Instalación](#instalación-en-4-pasos) ·
[Añadir bases de datos](#añadir-bases-de-datos) · [Cómo se usa](#cómo-se-usa) ·
[Problemas frecuentes](#problemas-frecuentes) · [Actualizar](#actualizar) ·
[Desarrollo](docs/desarrollo.md) · [El nombre y el logo](#el-nombre-y-el-logo)

---

## Instalación en 4 pasos

Solo necesitas **Docker** con **Docker Compose** en el servidor.

### 1. Descarga el proyecto

```bash
git clone https://github.com/kur0h3i/Caronte.git
cd Caronte
```

### 2. Crea el fichero `.env` (contraseña y puerto)

```bash
cp .env.example .env
nano .env
```

Rellena al menos estas líneas:

```ini
CARONTE_ADMIN_PASSWORD=una-contraseña-de-8-o-más
CARONTE_PORT=8000
```

- La contraseña es la que usarás para entrar en Caronte (usuario `admin`). **Mínimo 8
  caracteres**; si no, el contenedor no arranca.
- `CARONTE_PORT` es el puerto en el que se abrirá. Pon el que quieras si el 8000 está ocupado.
- **¿Tus bases de datos están en este mismo servidor (`localhost`)?** Quita la `#` de la línea
  `COMPOSE_FILE=...` del `.env`. Explicación en [Añadir bases de datos](#añadir-bases-de-datos).

### 3. Crea el fichero `connections.toml` (tus bases de datos)

```bash
cp connections.example.toml connections.toml
nano connections.toml
```

Deja un bloque por cada base de datos, cambiando lo que está en MAYÚSCULAS:

```toml
[connections.mi_bd]
url = "postgresql://USUARIO:CONTRASEÑA@SERVIDOR:5432/BASE_DE_DATOS"
```

### 4. Arranca

```bash
docker compose up -d --build
```

La primera vez tarda unos minutos (compila la aplicación). Cuando termine, abre
**`http://IP-DEL-SERVIDOR:PUERTO`** (por ejemplo `http://192.168.1.10:8000`) y entra con
`admin` y tu contraseña.

Para ver si ha arrancado bien:

```bash
docker compose ps        # debe poner "healthy"
docker compose logs -f   # Ctrl+C para salir
```

---

## Añadir bases de datos

Cada base de datos es un bloque en `connections.toml`. El nombre tras `connections.` es el que
verás en el desplegable de Caronte:

```toml
[connections.tienda]
url = "postgresql://lector:secreto@localhost:5432/tienda"

[connections.blog]
url = "mysql://lector:secreto@192.168.1.20:3306/blog"
```

Formato de la URL:

| Motor | URL |
| --- | --- |
| PostgreSQL | `postgresql://USUARIO:CONTRASEÑA@SERVIDOR:5432/BASE` |
| MariaDB / MySQL | `mysql://USUARIO:CONTRASEÑA@SERVIDOR:3306/BASE` |
| SQLite | `sqlite:///data/fichero.sqlite` (ver más abajo) |

### ¿Qué pongo en `SERVIDOR`?

| Dónde está tu base de datos | En `SERVIDOR` pones | Además |
| --- | --- | --- |
| En **el mismo servidor** que Caronte (Linux) | `localhost` | En `.env`, quita la `#` de `COMPOSE_FILE=docker-compose.yml:docker-compose.host.yml` |
| En **otro equipo** de tu red | su IP, p. ej. `192.168.1.20` | Nada |
| En el mismo equipo con **Docker Desktop** (Mac/Windows) | `host.docker.internal` | Nada |

> ¿Por qué lo de `COMPOSE_FILE`? Dentro de un contenedor, `localhost` es el propio contenedor,
> no tu servidor. Esa línea hace que Caronte use la red del servidor y así `localhost` apunta
> a tu base de datos, sin tocar la configuración de Postgres ni de MariaDB.

### Más opciones por conexión

```toml
[connections.tienda]
url = "postgresql://lector:secreto@localhost:5432/tienda"
schema = "ventas"                              # si las tablas no están en "public"
display_columns = { clientes = "razon_social" } # qué columna se muestra al enlazar a "clientes"
```

- **Contraseña con símbolos**: si tiene `@ : / # %`, escríbelos así en la URL:
  `@`→`%40`, `:`→`%3A`, `/`→`%2F`, `#`→`%23`, `%`→`%25`.
- **SQLite**: en `docker-compose.yml`, en `volumes:`, añade la carpeta del fichero
  (`- /ruta/a/mis/datos:/config/data:ro`) y usa `url = "sqlite:///data/fichero.sqlite"`.
- **Recomendado**: usa un usuario de base de datos que solo tenga permiso de lectura.
  Para Postgres:

  ```sql
  CREATE ROLE lector LOGIN PASSWORD 'secreto';
  GRANT CONNECT ON DATABASE tienda TO lector;
  GRANT USAGE ON SCHEMA public TO lector;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO lector;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO lector;
  ```

Después de cambiar `connections.toml` o `.env`, aplica los cambios con:

```bash
docker compose up -d
```

---

## Cómo se usa

### Tablas

- A la izquierda, la lista de tablas con su nº aproximado de filas. Arriba, el buscador.
- **Ordenar**: clic en el nombre de una columna (ascendente → descendente → sin orden).
- **Filtrar**: escribe en la casilla bajo cada columna.

  | Escribes | Busca |
  | --- | --- |
  | `rock` | contiene "rock" (sin distinguir mayúsculas) |
  | `=Rock` / `!=Rock` | exactamente "Rock" / distinto de "Rock" |
  | `>5`, `>=5`, `<5`, `<=5` | comparaciones en números y fechas |
  | `10..20` | entre 10 y 20 |
  | `2024-03-01` | ese día completo (en columnas de fecha) |
  | `null` / `!null` | vacíos / no vacíos |
  | `#12` | en una columna que enlaza a otra tabla: el registro con id 12 |

- **Enlaces entre tablas**: las columnas que apuntan a otra tabla se ven como `nombre #id`.
  Haz clic para ir a ese registro; con el botón "atrás" del navegador vuelves.
- La URL guarda el orden, los filtros y la página: puedes guardarla o compartirla.

### ✦ Estigia (mapa de datos)

Pestaña **estigia** en la cabecera. Es un mapa, al estilo del grafo de Obsidian, de cómo se
relacionan tus datos:

- Cada **tabla** es un astro y cada **relación** entre tablas, un hilo.
- **Doble clic en una tabla**: aparecen algunas de sus filas alrededor.
- **Doble clic en una fila**: aparecen las filas con las que está relacionada.
- **✦ todas las filas**: despliega filas de todas las tablas a la vez y las une entre sí.
  Elige cuántas por tabla (con 50–100 va fluido). Se recuerda para la próxima vez.
- **Clic** en cualquier punto: sus datos en el panel de la derecha.
- Rueda del ratón para el zoom, arrastrar para moverte, buscador arriba a la izquierda.
- Desde una tabla, el **número de fila** abre esa fila directamente en el mapa.

---

## Problemas frecuentes

| Qué ves | Qué pasa | Solución |
| --- | --- | --- |
| El contenedor se reinicia sin parar y en los logs sale `admin_password ... at least 8` | La contraseña del `.env` es corta | Pon 8 caracteres o más y `docker compose up -d` |
| `failed to resolve host 'SERVIDOR'` (u otro nombre) | En `connections.toml` quedó un texto de ejemplo | Cambia `SERVIDOR` por `localhost` o la IP |
| `connection refused` con `localhost` | El contenedor no usa la red del servidor | Quita la `#` de `COMPOSE_FILE=...` en `.env` y `docker compose up -d` |
| `password authentication failed` | Usuario o contraseña de la BD incorrectos | Revísalos; escapa los símbolos (`@`→`%40`…) |
| `no pg_hba.conf entry` | Postgres no deja entrar a ese usuario desde ahí | Añade una regla en `pg_hba.conf` o conecta por `localhost` |
| La conexión aparece pero **sin tablas** | Las tablas están en otro esquema | Añade `schema = "nombre"` a la conexión |
| `permission denied for table …` | El usuario no puede leer esa tabla | `GRANT SELECT ON ...` a ese usuario |
| `La consulta superó el tiempo límite` | Consulta lenta (tabla enorme) | Filtra más, o sube `CARONTE_STATEMENT_TIMEOUT` en `.env` |
| No se abre la web | Puerto ocupado o firewall | Cambia `CARONTE_PORT` en `.env`; abre el puerto en el firewall |

Los errores de base de datos aparecen en la propia web, en rojo, con el motivo.

---

## Actualizar

```bash
cd Caronte
git pull
docker compose up -d --build
```

Tus ficheros `.env` y `connections.toml` no se tocan al actualizar.

---

## Seguridad en breve

- **Solo lectura** en tres niveles: la aplicación no tiene ninguna función de escritura, cada
  conexión se abre en modo lectura y se recomienda un usuario de BD de solo lectura.
- Acceso con usuario y contraseña; tras 10 intentos fallidos se bloquea 5 minutos.
- Las credenciales de las bases de datos nunca llegan al navegador.
- **Solo por Tailscale**: en `docker-compose.yml` cambia la línea de `ports:` por
  `"100.x.y.z:${CARONTE_PORT:-8000}:${CARONTE_PORT:-8000}"` (la IP Tailscale del servidor).
  Si usas `tailscale serve` (HTTPS), pon `CARONTE_COOKIE_SECURE=true` en `.env`.

Detalles técnicos, API y cómo desarrollar: [docs/desarrollo.md](docs/desarrollo.md).

---

## El nombre y el logo

> *Ed ecco verso noi venir per nave*
> *un vecchio, bianco per antico pelo,*
> *gridando: «Guai a voi, anime prave!»*
>
> — Dante, *Infierno*, III, 82-84

Caronte es el barquero del *Infierno* de Dante: cruza a las almas por el Aqueronte, el río que
separa el mundo de los vivos del Infierno. Aquí cruza los datos: baja a la base de datos y te
trae las filas, sin tocar nada por el camino. El logo, en la misma paleta que
[Dis](https://github.com/kur0h3i/Dis) y [Cerbero](https://github.com/kur0h3i/Cerbero), dibuja
el Canto III con lo que lleva esta barca:

- **La barca** que llega «per nave» (v. 82), en el violeta de Dis y con el borde al rojo vivo.
- **La carga: una base de datos**, de hierro al rojo como las murallas de Dis, encendida por
  dentro como «lo fioco lume» (v. 75) con el que Dante ve la orilla.
- **El Aqueronte**, «la trista riviera» (v. 78), en el lila de la Estigia de Dis.

`frontend/src/assets/caronte-logo.svg` es el logo y `frontend/public/favicon.svg`, el mismo
como icono de la pestaña. Dis lo muestra en su tarjeta y en su mapa: lo encuentra en
`/favicon.svg`.

---

## Créditos

La base de datos de ejemplo (`dev/chinook/`) es
[Chinook](https://github.com/lerocha/chinook-database) v1.4.5, licencia MIT.
