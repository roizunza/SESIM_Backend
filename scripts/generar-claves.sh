#!/usr/bin/env bash
# Genera POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
# DASHBOARD_PASSWORD y PG_META_CRYPTO_KEY, y los escribe en .env.
#
# Usa el generador OFICIAL de Supabase (infra/supabase/utils/generate-keys.sh
# -- no se reimplementa nada a mano aqui, ver infra/VENDOR.md). Ese script
# tambien genera claves para servicios que SESIM no levanta en Ciclo 1
# (SECRET_KEY_BASE, REALTIME_DB_ENC_KEY, etc.): como .env no tiene esas
# lineas, el script simplemente no las toca (no falla).
#
# Uso:
#   ./scripts/generar-claves.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> .env creado a partir de .env.example"
fi

sh infra/supabase/utils/generate-keys.sh --update-env

echo "==> listo. Revisa .env: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY,"
echo "    SERVICE_ROLE_KEY, DASHBOARD_PASSWORD y PG_META_CRYPTO_KEY ya"
echo "    quedaron con valores generados. .env.old es el respaldo anterior."
