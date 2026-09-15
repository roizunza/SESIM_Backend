#!/usr/bin/env bash
# Levanta el entorno de Ciclo 1: infra/supabase (vendorizada, ver
# infra/VENDOR.md) + docker-compose.sesim.yml (lo propio de SESIM),
# arrancando SOLO los servicios que Ciclo 1 necesita.
#
# Deliberadamente NO se arrancan (existen en infra/supabase pero no hacen
# falta todavia): realtime, storage, imgproxy, functions, supavisor. Nada
# de Ciclo 1 los usa; se pueden sumar cuando algun ciclo futuro los necesite
# (por ejemplo, si mas adelante se decide usar Supabase Storage para las
# capas -- ver docs/decisiones-pendientes.md sobre subida de capas).
#
# Uso:
#   ./scripts/generar-claves.sh   # una sola vez, si .env no existe o no
#                                  # tiene claves reales todavia
#   ./scripts/levantar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Falta .env. Corre primero: ./scripts/generar-claves.sh" >&2
  exit 1
fi

# Solo se pasa docker-compose.sesim.yml: ese archivo "include"-ea a
# infra/supabase/docker-compose.yml el solo (ver el comentario al inicio
# de docker-compose.sesim.yml sobre por que NO se usa "-f archivoA -f
# archivoB" aqui).
docker compose \
  -f docker-compose.sesim.yml \
  --env-file .env \
  up -d --build \
  db auth rest api-gw studio meta servicio-procesos mailpit

echo ""
echo "==> arriba. Con eso:"
echo "    Gateway + Studio (mismo puerto: / es Studio, /rest/v1 y /auth/v1 son la API): http://localhost:8000"
echo "    Servicio de procesos (alta de usuarios):     http://localhost:8001"
echo "    Buzon de correo de prueba (Mailpit):         http://localhost:8025"
echo "    Postgres (psql/DBeaver):                     localhost:5432"
echo ""
