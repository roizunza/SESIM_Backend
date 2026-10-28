#!/usr/bin/env bash
# Aplica la semilla de desarrollo (cuentas de prueba) -- NUNCA en produccion.
# Requiere que el ambiente ya este arriba (./scripts/levantar.sh).
#
# Uso:
#   ./scripts/sembrar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

if [ "$(leer_env APP_ENV)" = "produccion" ]; then
  echo "ABORTADO: la semilla de desarrollo no corre en produccion." >&2
  exit 1
fi

compose exec -T servicio-procesos python seed_dev.py
