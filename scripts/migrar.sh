#!/usr/bin/env bash
# Aplica a la base del ambiente en marcha las migraciones de db/migrations que
# todavia no estan en core.schema_migraciones (Ciclo 2).
#
# Uso:
#   ./scripts/migrar.sh                       # aplica las pendientes
#   ./scripts/migrar.sh --estado              # solo lista aplicadas/pendientes
#   ./scripts/migrar.sh --adoptar-hasta 120   # base creada ANTES del Ciclo 2:
#                                             # marca como aplicadas las <= 120
#                                             # y luego aplica el resto
#
# Reglas:
#   - Cada migracion corre en una sola transaccion (psql --single-transaction):
#     si falla, no queda a medias, y el script se detiene.
#   - Si una migracion YA aplicada cambio de contenido (otra huella), el script
#     se detiene: una migracion aplicada no se edita, se corrige con una nueva.
#   - Pruebas sin docker: PSQL_CMD="psql -h host -U usuario -d base" (sin
#     -v ON_ERROR_STOP ni -q: el script los agrega).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

MODO="aplicar"; ADOPTAR=""
case "${1:-}" in
  --estado) MODO="estado" ;;
  --adoptar-hasta) ADOPTAR="${2:?Falta el numero, por ejemplo: --adoptar-hasta 120}" ;;
  "") ;;
  *) echo "Argumento desconocido: $1" >&2; exit 2 ;;
esac

# Solo advertencias y errores: los NOTICE de "ya existe, se omite" ensucian.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

psql_() {
  if [ -n "${PSQL_CMD:-}" ]; then
    $PSQL_CMD -v ON_ERROR_STOP=1 -q -t -A "$@"
  else
    local db; db="$(leer_env POSTGRES_DB)"
    compose exec -T db psql -U postgres -d "${db:-postgres}" -v ON_ERROR_STOP=1 -q -t -A "$@"
  fi
}

sha_de() { sha256sum "$1" | cut -d' ' -f1; }

# 1. La tabla de control siempre existe antes de revisar nada.
psql_ < db/migrations/099_control_migraciones.sql >/dev/null

declare -A APLICADAS
N_APLICADAS=0
while IFS='|' read -r nombre sha; do
  if [ -n "$nombre" ]; then APLICADAS["$nombre"]="$sha"; N_APLICADAS=$((N_APLICADAS + 1)); fi
done < <(psql_ -c "select nombre, sha256 from core.schema_migraciones")

# Base creada antes del Ciclo 2: tiene tablas pero el control esta vacio. Aplicar
# todo de nuevo fallaria; hay que decir hasta donde llega lo ya aplicado.
if [ "$N_APLICADAS" -eq 0 ] && [ -z "$ADOPTAR" ]; then
  if [ -n "$(psql_ -c "select to_regclass('core.perfil')")" ]; then
    echo "ABORTADO: esta base ya tiene tablas pero core.schema_migraciones esta vacia" >&2
    echo "          (se creo antes del Ciclo 2). Corre una vez:  ./scripts/migrar.sh --adoptar-hasta 120" >&2
    exit 1
  fi
fi

PENDIENTES=()
for f in db/migrations/[0-9][0-9][0-9]_*.sql; do
  n="$(basename "$f")"; num="${n%%_*}"
  if [ -n "${APLICADAS[$n]+x}" ]; then
    if [ "${APLICADAS[$n]}" != "$(sha_de "$f")" ]; then
      echo "ABORTADO: $n ya estaba aplicada pero su contenido cambio." >&2
      echo "          Una migracion aplicada no se edita: crea una nueva con el cambio." >&2
      echo "          (Si es una base de desarrollo desechable: reconstruyela desde cero.)" >&2
      exit 1
    fi
    continue
  fi
  if [ -n "$ADOPTAR" ] && [ "$((10#$num))" -le "$((10#$ADOPTAR))" ]; then
    psql_ -c "insert into core.schema_migraciones (nombre, sha256, origen) values ('$n', '$(sha_de "$f")', 'adoptada') on conflict do nothing" >/dev/null
    echo "   adoptada  $n"
    continue
  fi
  PENDIENTES+=("$f")
done

if [ "$MODO" = "estado" ]; then
  echo "Aplicadas: $N_APLICADAS   Pendientes: ${#PENDIENTES[@]}"
  for f in "${PENDIENTES[@]:-}"; do [ -n "$f" ] && echo "   pendiente $(basename "$f")"; done
  exit 0
fi

if [ "${#PENDIENTES[@]}" -eq 0 ]; then
  echo "==> migraciones: nada pendiente ($N_APLICADAS aplicadas)."
  exit 0
fi

for f in "${PENDIENTES[@]}"; do
  n="$(basename "$f")"
  echo "   aplicando $n"
  # Las migraciones que traen su propio begin/commit (p. ej. la 121) manejan
  # su transaccion; al resto se les envuelve en una.
  if grep -qiE '^[[:space:]]*begin;' "$f"; then
    psql_ < "$f" >/dev/null
  else
    psql_ --single-transaction < "$f" >/dev/null
  fi
  psql_ -c "insert into core.schema_migraciones (nombre, sha256, origen) values ('$n', '$(sha_de "$f")', 'runner')" >/dev/null
done
# PostgREST guarda en cache la estructura de la base: sin esto, tablas, vistas y
# permisos nuevos no se ven en la API hasta reiniciarlo.
psql_ -c "notify pgrst, 'reload schema'" >/dev/null
echo "==> migraciones: ${#PENDIENTES[@]} aplicada(s); PostgREST recarga su cache."
