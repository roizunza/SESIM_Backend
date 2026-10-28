#!/usr/bin/env bash
# Corre al FINAL del arranque inicial de Postgres (nombre 999_*, despues de las
# migraciones 099-12x): anota en core.schema_migraciones cada migracion que
# initdb acaba de aplicar, con su huella SHA-256. Asi scripts/migrar.sh sabe
# desde el primer dia cuales ya estan y solo aplica las nuevas.
(
  set -e
  cd /docker-entrypoint-initdb.d/init-scripts
  for f in [0-9][0-9][0-9]_*.sql; do
    [ -e "$f" ] || continue
    sha="$(sha256sum "$f" | cut -d' ' -f1)"
    psql -v ON_ERROR_STOP=1 -q -U postgres -d "${POSTGRES_DB:-postgres}" \
      -c "insert into core.schema_migraciones (nombre, sha256, origen) values ('$f', '$sha', 'initdb') on conflict (nombre) do nothing;"
  done
)
