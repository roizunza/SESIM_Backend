#!/usr/bin/env bash
# Prueba de humo del ambiente en marcha (Ciclo 2): confirma que responde el
# gateway, la autenticacion, la API y el servicio de procesos, que este ultimo
# dice estar en el ambiente que declara .env, y que no quedan migraciones
# pendientes. Sale con codigo 1 si algo falla.
#
# Uso:  ./scripts/verificar.sh
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

[ -f .env ] || { echo "Falta .env" >&2; exit 1; }
AMB="$(leer_env APP_ENV)"
GW="http://localhost:$(leer_env API_GW_HTTP_PORT)"
PROC="http://127.0.0.1:$(leer_env PROCESOS_PORT)"
ANON="$(leer_env ANON_KEY)"
FALLAS=0

chequeo() { # descripcion, comando...
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "  ok    $d"; else echo "  FALLA $d"; FALLAS=$((FALLAS + 1)); fi
}

echo "==> verificando ambiente: $AMB"
chequeo "GoTrue responde (/auth/v1/health)"        curl -fsS -H "apikey: $ANON" "$GW/auth/v1/health"
chequeo "PostgREST responde (/rest/v1/)"           curl -fsS -H "apikey: $ANON" "$GW/rest/v1/"
chequeo "servicio de procesos responde (/health)"  curl -fsS "$PROC/health"
chequeo "servicio de procesos dice ambiente=$AMB"  bash -c "curl -fsS '$PROC/health' | grep -q '\"ambiente\":\"$AMB\"'"
chequeo "sin migraciones pendientes"               bash -c "./scripts/migrar.sh --estado | grep -q 'Pendientes: 0'"
# La tabla de control no debe ser visible desde la API (sin sesion).
chequeo "anon NO lee core.schema_migraciones"      bash -c "! curl -fsS -H 'apikey: $ANON' '$GW/rest/v1/schema_migraciones' "
if [ "$AMB" = "produccion" ]; then
  chequeo "no hay Mailpit en produccion"           bash -c "! curl -fsS http://127.0.0.1:8025"
fi

echo ""
if [ "$FALLAS" -eq 0 ]; then echo "==> todo bien."; else echo "==> $FALLAS chequeo(s) fallaron."; exit 1; fi
