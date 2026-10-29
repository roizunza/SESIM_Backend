#!/usr/bin/env bash
# Ciclo 5 -- pruebas de trazabilidad y control de cambios contra la base REAL del ambiente en marcha.
# Cada caso actua con la identidad de un perfil (Capturista, Administrador, Titular, Auditor, ciudadano) y
# comprueba que la bitacora registre lo que debe, que cada perfil vea solo lo suyo y que las compuertas
# D-16 / D-17 sigan firmes. No deja huella (todo corre dentro de una transaccion que termina en ROLLBACK).
#
# Uso:  ./scripts/pruebas-ciclo5.sh          (con el ambiente arriba y migrado hasta la 218)
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

db="postgres"; [ -n "${PSQL_CMD:-}" ] || { db="$(leer_env POSTGRES_DB)"; db="${db:-postgres}"; }

echo "== Casos contra la base (ver db/pruebas/ciclo5_pruebas.sql) =="
if [ -n "${PSQL_CMD:-}" ]; then
  salida=$($PSQL_CMD -X -v ON_ERROR_STOP=1 -f db/pruebas/ciclo5_pruebas.sql 2>&1) || { echo "$salida"; exit 1; }
else
  salida=$(compose exec -T db psql -U postgres -d "$db" -X -v ON_ERROR_STOP=1 < db/pruebas/ciclo5_pruebas.sql 2>&1) || { echo "$salida"; exit 1; }
fi
echo "$salida" | sed -n '/^+--/,$p'
fallan=$(echo "$salida" | grep -c '| FALLA ' || true)

echo
if [ "$fallan" = "0" ]; then
  echo "RESULTADO: todo en verde."
else
  echo "RESULTADO: HAY FALLAS ($fallan casos)." >&2; exit 1
fi
