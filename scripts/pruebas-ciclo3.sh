#!/usr/bin/env bash
# Ciclo 3 -- pruebas del modelo de datos v2.2 contra la base REAL del ambiente en marcha.
# Intenta operaciones desde la identidad de cada perfil y comprueba que la base acepte lo valido
# y rechace lo que viola una regla. No deja huella (todo corre dentro de una transaccion que
# termina en ROLLBACK).
#
# Uso:  ./scripts/pruebas-ciclo3.sh          (con el ambiente arriba y migrado)
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

db="postgres"; [ -n "${PSQL_CMD:-}" ] || { db="$(leer_env POSTGRES_DB)"; db="${db:-postgres}"; }
psql_() {
  if [ -n "${PSQL_CMD:-}" ]; then $PSQL_CMD -X "$@"; else compose exec -T db psql -U postgres -d "$db" -X "$@"; fi
}

echo "== 1. Integridad del modelo =="
psql_ -c "select chequeo, case when ok then 'PASA' else 'FALLA' end as resultado, detalle from core.verificar_integridad()"
fallas_int=$(psql_ -tA -c "select count(*) from core.verificar_integridad() where not ok")

echo
echo "== 2. Casos contra la base (ver db/pruebas/ciclo3_pruebas.sql) =="
if [ -n "${PSQL_CMD:-}" ]; then
  salida=$(psql_ -v ON_ERROR_STOP=1 -f db/pruebas/ciclo3_pruebas.sql 2>&1) || { echo "$salida"; exit 1; }
else
  salida=$(compose exec -T db psql -U postgres -d "$db" -X -v ON_ERROR_STOP=1 < db/pruebas/ciclo3_pruebas.sql 2>&1) || { echo "$salida"; exit 1; }
fi
echo "$salida" | sed -n '/^+--/,$p'
fallan=$(echo "$salida" | grep -c '| FALLA ' || true)

echo
if [ "$fallas_int" = "0" ] && [ "$fallan" = "0" ]; then
  echo "RESULTADO: todo en verde."
else
  echo "RESULTADO: HAY FALLAS (integridad: $fallas_int, casos: $fallan)." >&2; exit 1
fi
