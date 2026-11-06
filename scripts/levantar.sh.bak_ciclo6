#!/usr/bin/env bash
# Levanta el ambiente declarado en .env (APP_ENV): infra/supabase
# (vendorizada, ver infra/VENDOR.md) + docker-compose.sesim.yml, arrancando
# SOLO los servicios que los ciclos actuales necesitan, y despues aplica las
# migraciones pendientes (scripts/migrar.sh).
#
# Deliberadamente NO se arrancan (existen en infra/supabase pero no hacen
# falta todavia): realtime, storage, imgproxy, functions, supavisor.
#
# Uso:
#   ./scripts/generar-claves.sh <ambiente>   # una sola vez por maquina
#   ./scripts/levantar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

if [ ! -f .env ]; then
  echo "Falta .env. Corre primero: ./scripts/generar-claves.sh <desarrollo|pruebas|produccion>" >&2
  exit 1
fi

AMB="$(leer_env APP_ENV)"
validar_ambiente "${AMB:-}" || { echo "Falta APP_ENV valido en .env" >&2; exit 1; }

# Candados de produccion y pruebas: nada con valores de ejemplo.
if [ "$AMB" != "desarrollo" ] && grep -q "cambia_esto" .env; then
  echo "ABORTADO: .env de $AMB todavia tiene valores 'cambia_esto'. Edita URLs/SMTP y corre generar-claves.sh en una carpeta sin .env." >&2
  grep -n "cambia_esto" .env | sed 's/=.*/=.../' >&2
  exit 1
fi
if [ "$AMB" = "produccion" ] && [ "$(leer_env DB_BIND_ADDR)" = "0.0.0.0" ]; then
  echo "ABORTADO: DB_BIND_ADDR=0.0.0.0 expone Postgres a toda la red en produccion." >&2
  exit 1
fi

SERVICIOS=(db auth rest api-gw studio meta servicio-procesos)
[ "$AMB" != "produccion" ] && SERVICIOS+=(mailpit)

echo "==> ambiente: $AMB"
compose up -d --build "${SERVICIOS[@]}"

./scripts/migrar.sh

PUERTO_GW="$(leer_env API_GW_HTTP_PORT)"
echo ""
echo "==> arriba (ambiente: $AMB)."
echo "    Gateway + Studio (/ es Studio; /rest/v1 y /auth/v1 son la API): http://localhost:${PUERTO_GW:-8000}"
echo "    Servicio de procesos (alta de usuarios):  http://127.0.0.1:$(leer_env PROCESOS_PORT)  (GET /health muestra el ambiente)"
[ "$AMB" != "produccion" ] && echo "    Buzon de correo de prueba (Mailpit):      http://127.0.0.1:8025"
echo "    Postgres (psql/DBeaver):                  $(leer_env DB_BIND_ADDR):$(leer_env POSTGRES_PORT)"
echo "    Verificar:  ./scripts/verificar.sh"
echo ""
