#!/usr/bin/env bash
# Ciclo 4 -- pruebas del CRUD de catalogos, capas, instrumentos, usuarios e invitaciones contra la base REAL.
# Cada caso actua con la identidad de un perfil (Capturista, Administrador, Titular, Auditor, ciudadano) y comprueba
# permisos, compuertas (D-16, D-17, D-20), cuatro ojos, ausencia de borrado y la huella de cada escritura en la bitacora. No deja huella (todo corre dentro de una transaccion que termina en ROLLBACK).
#
# Uso:  ./scripts/pruebas-ciclo4.sh          (con el ambiente arriba y migrado hasta la 225)
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

db="postgres"; [ -n "${PSQL_CMD:-}" ] || { db="$(leer_env POSTGRES_DB)"; db="${db:-postgres}"; }

echo "== Casos contra la base (ver db/pruebas/ciclo4_pruebas.sql) =="
if [ -n "${PSQL_CMD:-}" ]; then
  salida=$($PSQL_CMD -X -v ON_ERROR_STOP=1 -f db/pruebas/ciclo4_pruebas.sql 2>&1) || { echo "$salida"; exit 1; }
else
  salida=$(compose exec -T db psql -U postgres -d "$db" -X -v ON_ERROR_STOP=1 < db/pruebas/ciclo4_pruebas.sql 2>&1) || { echo "$salida"; exit 1; }
fi
echo "$salida" | sed -n '/^+--/,$p'
fallan=$(echo "$salida" | grep -c '| FALLA ' || true)

echo
if [ "$fallan" = "0" ]; then
  echo "RESULTADO: todo en verde."
else
  echo "RESULTADO: HAY FALLAS ($fallan casos)." >&2; exit 1
fi
