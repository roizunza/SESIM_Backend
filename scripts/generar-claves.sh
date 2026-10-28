#!/usr/bin/env bash
# Crea .env para un ambiente y genera sus claves (POSTGRES_PASSWORD,
# JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, DASHBOARD_PASSWORD y
# PG_META_CRYPTO_KEY).
#
# Usa el generador OFICIAL de Supabase (infra/supabase/utils/generate-keys.sh
# -- no se reimplementa nada a mano aqui, ver infra/VENDOR.md).
#
# Uso:
#   ./scripts/generar-claves.sh [desarrollo|pruebas|produccion]   # por defecto: desarrollo
#
# Cada ambiente debe tener claves propias: corre este script en la maquina de
# cada ambiente, nunca copies el .env de uno a otro.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

AMB="${1:-desarrollo}"
validar_ambiente "$AMB"

if [ -f .env ]; then
  echo "Ya existe .env (ambiente: $(leer_env APP_ENV)). Respaldalo o borralo a mano si quieres regenerar." >&2
  exit 1
fi

cp "env/${AMB}.env.example" .env
echo "==> .env creado a partir de env/${AMB}.env.example"

sh infra/supabase/utils/generate-keys.sh --update-env

echo "==> listo. Ambiente: $AMB. Claves generadas en .env (.env.old es el respaldo anterior)."
if [ "$AMB" != "desarrollo" ]; then
  echo "==> Falta editar a mano en .env: URLs (SUPABASE_PUBLIC_URL, API_EXTERNAL_URL, SITE_URL)"
  [ "$AMB" = "produccion" ] && echo "    y el SMTP institucional (SMTP_HOST/PORT/USER/PASS)."
fi
