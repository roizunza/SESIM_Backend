#!/usr/bin/env bash
# Aplica la semilla de Ciclo 1 (6 cuentas de prueba) -- SOLO DESARROLLO.
# Requiere que el entorno ya este arriba (./scripts/levantar.sh).
#
# Uso:
#   ./scripts/sembrar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose \
  -f docker-compose.sesim.yml \
  --env-file .env \
  exec -T servicio-procesos python seed_dev.py
