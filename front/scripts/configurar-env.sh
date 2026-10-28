#!/usr/bin/env bash
# Escribe front/.env.local con el ANON_KEY del backend (clave PUBLICA, la misma que usa la API).
# Uso (desde front/):  ./scripts/configurar-env.sh [ruta/al/.env-del-backend]   (por omision ../.env)
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_BACK="${1:-../.env}"
[ -f "$ENV_BACK" ] || { echo "No encuentro $ENV_BACK (el .env del backend)." >&2; exit 1; }
ANON="$(grep -E '^ANON_KEY=' "$ENV_BACK" | head -1 | cut -d= -f2-)"
[ -n "$ANON" ] && [ "$ANON" != "cambia_esto_con_generar-claves.sh" ] || { echo "ANON_KEY vacia o sin generar en $ENV_BACK" >&2; exit 1; }
cat > .env.local <<EOT
VITE_SUPABASE_URL=/supabase
VITE_SUPABASE_ANON_KEY=$ANON
VITE_PROCESOS_URL=/procesos
EOT
echo "Listo: .env.local escrito (ANON_KEY copiada; no se sube a git)."
