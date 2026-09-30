-- Usuario de solo lectura para Caronte (defensa en profundidad: aunque la app
-- ya es de solo lectura, la BD tampoco le deja escribir).
\c chinook

CREATE ROLE caronte_ro LOGIN PASSWORD 'caronte_ro';
GRANT CONNECT ON DATABASE chinook TO caronte_ro;
GRANT USAGE ON SCHEMA public TO caronte_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO caronte_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO caronte_ro;
ALTER ROLE caronte_ro SET default_transaction_read_only = on;

-- Rellena pg_class.reltuples para que el recuento aproximado funcione desde el inicio.
ANALYZE;
