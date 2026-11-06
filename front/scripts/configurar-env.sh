#!/usr/bin/env bash
# Genera .env.local para conectar el front con el backend local (../.env del backend).
set -euo pipefail
cd "$(dirname "$0")/.."
BACK_ENV="${1:-../.env}"
[ -f "$BACK_ENV" ] || { echo "No encuentro $BACK_ENV. Uso: scripts/configurar-env.sh [ruta/al/.env del backend]"; exit 1; }
ANON=$(grep -E '^ANON_KEY=' "$BACK_ENV" | head -1 | cut -d= -f2-)
[ -n "$ANON" ] || { echo "ANON_KEY no está en $BACK_ENV"; exit 1; }
cat > .env.local <<EOT
VITE_SUPABASE_URL=/supabase
VITE_SUPABASE_ANON_KEY=$ANON
VITE_PROCESOS_URL=/procesos
EOT
echo ".env.local generado (apunta al gateway :8000 y a procesos :8001 por el proxy de Vite)."
