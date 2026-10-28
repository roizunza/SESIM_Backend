#!/usr/bin/env bash
# Diagnostico de autenticacion (JWT, hook de rol, PostgREST). No cambia nada;
# solo muestra datos para ubicar la causa cuando pruebas-tangibles.sh falla.
# Los secretos NO se imprimen: se compara su huella (primeros 8 caracteres de
# SHA-256) y su longitud.
#
# Uso:  ./scripts/diagnostico.sh  > diagnostico.txt 2>&1     y me mandas el archivo
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh
[ -f .env ] || { echo "Falta .env" >&2; exit 1; }

huella() { printf '%s' "$1" | sha256sum | cut -c1-8; }
env_de() { # contenedor VARIABLE
  docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E "^$2=" | head -n1 | cut -d= -f2-
}
fila() { printf '  %-34s longitud=%-4s huella=%s\n' "$1" "${#2}" "$(huella "$2")"; }

JS="$(leer_env JWT_SECRET)"
echo "== 1. Secreto JWT: .env contra lo que ven los contenedores (deben coincidir)"
fila ".env JWT_SECRET" "$JS"
fila "supabase-rest PGRST_JWT_SECRET" "$(env_de supabase-rest PGRST_JWT_SECRET)"
fila "supabase-auth GOTRUE_JWT_SECRET" "$(env_de supabase-auth GOTRUE_JWT_SECRET)"
fila "servicio-procesos JWT_SECRET" "$(compose exec -T servicio-procesos printenv JWT_SECRET 2>/dev/null | tr -d '\r\n')"
echo "  (.env tiene JWT_JWKS? $(grep -qE '^JWT_JWKS=.+' .env && echo SI || echo no))"

echo ""; echo "== 2. Hook del rol (GoTrue)"
echo "  GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED = $(env_de supabase-auth GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED)"
echo "  GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI     = $(env_de supabase-auth GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI)"
DB="$(leer_env POSTGRES_DB)"
echo "  El hook, ejecutado como supabase_auth_admin con un usuario real (debe traer rol distinto de null):"
compose exec -T db psql -U supabase_admin -d "${DB:-postgres}" -tA -c "
  set role supabase_auth_admin;
  select core.custom_access_token_hook(jsonb_build_object('user_id', (select id_usuario from core.perfil limit 1), 'claims', '{}'::jsonb)) -> 'claims';" 2>&1 | grep -v 'level=warning' | sed 's/^/    /'

echo ""; echo "== 3. Migraciones"
./scripts/migrar.sh --estado 2>&1 | grep -v 'level=warning' | sed 's/^/  /'

echo ""; echo "== 4. Respuesta cruda de la API con un pase de sesion alterado"
GW="http://localhost:$(leer_env API_GW_HTTP_PORT)"; ANON="$(leer_env ANON_KEY)"
TOK="$(curl -s "$GW/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"sesimcapturista1@gmail.com","password":"SesimDev2026!"}' | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
if [ -z "$TOK" ]; then echo "  no se pudo iniciar sesion (¿sembrar.sh?)"; else
  echo "  payload del pase: $(echo "$TOK" | cut -d. -f2 | tr '_-' '/+' | awk '{while(length($0)%4)$0=$0"=";print}' | base64 -d 2>/dev/null)"
  H="$(echo "$TOK" | cut -d. -f1)"; P="$(echo "$TOK" | cut -d. -f2)"; S="$(echo "$TOK" | cut -d. -f3)"
  [ "${S:0:1}" = "A" ] && S2="B${S:1}" || S2="A${S:1}"
  echo "  -- pase valido:";   curl -s -i "$GW/rest/v1/perfil?select=nombre" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" | sed -n '1p;$p' | cut -c1-200 | sed 's/^/    /'
  echo "  -- firma alterada:"; curl -s -i "$GW/rest/v1/perfil?select=nombre" -H "apikey: $ANON" -H "Authorization: Bearer $H.$P.$S2" | sed -n '1p;$p' | cut -c1-200 | sed 's/^/    /'
  echo "  -- sin Authorization (solo apikey anon):"; curl -s -i "$GW/rest/v1/perfil?select=nombre" -H "apikey: $ANON" | sed -n '1p;$p' | cut -c1-200 | sed 's/^/    /'
fi

echo ""; echo "== 5. Ultimas lineas de PostgREST y GoTrue"
docker logs supabase-rest --tail 15 2>&1 | cut -c1-220 | sed 's/^/  rest: /'
docker logs supabase-auth --tail 15 2>&1 | grep -i -E "hook|error|banned|fatal" | cut -c1-220 | sed 's/^/  auth: /'
