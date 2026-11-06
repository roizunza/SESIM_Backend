# Imagen de base de datos del SESIM, sobre la imagen oficial de Supabase
# (la misma que usa infra/supabase/docker-compose.yml para el servicio "db").
#
# Ya trae preinstalados: los roles anon/authenticated/service_role/
# authenticator, las funciones auth.uid()/auth.role()/auth.jwt(), pgcrypto,
# y PostGIS disponible para activarse con CREATE EXTENSION (ver
# db/migrations/100_extensions.sql). No se compila nada aqui: solo se copian
# las migraciones propias de SESIM para que corran como parte del arranque
# inicial de Postgres (docker-entrypoint-initdb.d), despues de las que trae
# Supabase de fabrica.
#
# Version pineada para que coincida con la que usa infra/supabase
# (ver infra/supabase/docker-compose.yml, servicio "db"). Si se actualiza
# infra/supabase (ver infra/VENDOR.md), actualizar tambien este tag.
FROM supabase/postgres:17.6.1.136

# Los scripts de infra/supabase se montan en tiempo de ejecucion en
# /docker-entrypoint-initdb.d/init-scripts/ con numeros 97-99 (ver
# infra/supabase/docker-compose.yml, servicio "db", bloque "volumes").
# Los nuestros usan 100+ para correr despues, en el mismo directorio.
# Solo 099-125 corren en el arranque inicial: desde la 126 dependen de objetos que GoTrue
# crea al arrancar (p. ej. auth.users.banned_until). El resto lo aplica scripts/migrar.sh.
COPY migrations/099_*.sql migrations/1[01][0-9]_*.sql migrations/12[0-5]_*.sql /docker-entrypoint-initdb.d/init-scripts/

# Ciclo 2: al terminar el arranque inicial, anota las migraciones aplicadas en
# core.schema_migraciones (nombre 999_ para que corra despues de las .sql).
COPY registrar_migraciones.sh /docker-entrypoint-initdb.d/zz_registrar_migraciones.sh
