#!/usr/bin/env bash
# Pruebas TANGIBLES del Ciclo 1 contra el ambiente en marcha (no teoria):
# usa las cuentas semilla (./scripts/sembrar.sh) y pega a la API real.
# Cada caso imprime lo que respondio el servidor y termina en PASA / FALLA.
#
# Cubre los casos de demo que exigen los alcances:
#   1. Tres perfiles entran y el pase de sesion trae su rol.
#   2. Cada perfil ve cosas distintas (filas de perfiles).
#   3. Un capturista que intenta el alta de usuarios no puede.
#   4. Un pase manipulado se rechaza (firma alterada y rol falsificado).
#   5. El Administrador Titular da de alta una cuenta, entra con ella y
#      el alta queda en bitacora; luego la da de baja y queda en bitacora.
#
# Uso (con el ambiente arriba y sembrado):  ./scripts/pruebas-tangibles.sh
# NO corre en produccion.
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/_ambiente.sh

[ -f .env ] || { echo "Falta .env" >&2; exit 1; }
if [ "$(leer_env APP_ENV)" = "produccion" ]; then echo "ABORTADO: no corre en produccion." >&2; exit 1; fi

GW="http://localhost:$(leer_env API_GW_HTTP_PORT)"
PROC="http://127.0.0.1:$(leer_env PROCESOS_PORT)"
ANON="$(leer_env ANON_KEY)"
CLAVE='SesimDev2026!'
OK=0; MAL=0

pasa()  { echo "      => PASA";  OK=$((OK + 1)); }
falla() { echo "      => FALLA ($1)"; MAL=$((MAL + 1)); }

login() { # correo -> access_token (vacio si no hubo)
  curl -s "$GW/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"${2:-$CLAVE}\"}" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}
b64d() { local s="$1"; s="${s//-/+}"; s="${s//_//}"; while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done; printf '%s' "$s" | base64 -d 2>/dev/null; }
b64e() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
claim_rol() { b64d "$(echo "$1" | cut -d. -f2)" | sed -n 's/.*"rol":"\([^"]*\)".*/\1/p'; }
filas() { # token ruta -> numero de objetos en la respuesta
  curl -s "$GW/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" | grep -o '"id":' | wc -l
}
http() { # imprime solo el codigo HTTP
  curl -s -o /tmp/sesim_resp.json -w '%{http_code}' "$@"
}

echo "==> pruebas tangibles, ambiente: $(leer_env APP_ENV)  (API: $GW)"

echo ""; echo "[1] Inicio de sesion real y rol en el pase de sesion"
T_CAP="$(login sesimcapturista1@gmail.com)"
T_AUD="$(login sesimauditor1@gmail.com)"
T_ADM="$(login sesimadmin@gmail.com)"
T_TIT="$(login sesimadminvip@gmail.com)"
for par in "capturista:$T_CAP" "auditor:$T_AUD" "administrador:$T_ADM" "administrador_titular:$T_TIT"; do
  esperado="${par%%:*}"; tok="${par#*:}"
  if [ -z "$tok" ]; then echo "    $esperado: no se obtuvo token"; falla "login de $esperado (¿corriste sembrar.sh?)"; continue; fi
  got="$(claim_rol "$tok")"
  echo "    $esperado: token obtenido, claim rol = '$got'"
  [ "$got" = "$esperado" ] || echo "      payload del pase: $(b64d "$(echo "$tok" | cut -d. -f2)")"
  [ "$got" = "$esperado" ] && pasa || falla "rol esperado $esperado"
done
if [ -z "$T_CAP" ] || [ -z "$T_TIT" ]; then echo "==> Sin sesion no se puede seguir. Revisa docs/PRUEBAS-TANGIBLES.md, seccion 'Si algo falla'."; exit 1; fi

echo ""; echo "[2] Cada perfil ve cosas distintas (filas de GET /rest/v1/perfil)"
n_cap="$(filas "$T_CAP" perfil)"; n_aud="$(filas "$T_AUD" perfil)"; n_adm="$(filas "$T_ADM" perfil)"; n_tit="$(filas "$T_TIT" perfil)"
echo "    capturista=$n_cap  auditor=$n_aud  administrador=$n_adm  titular=$n_tit   (esperado: 1, 6, 6, 6)"
[ "$n_cap" = 1 ] && [ "$n_aud" -ge 6 ] && [ "$n_adm" -ge 6 ] && [ "$n_tit" -ge 6 ] && pasa || falla "conteos"

echo ""; echo "[3] Un capturista (y un administrador normal) no pueden dar de alta usuarios"
CUERPO='{"correo":"intruso@example.com","password":"ClaveTemporal123!","nombre":"Intruso","rol":"capturista"}'
for par in "capturista:$T_CAP" "administrador:$T_ADM"; do
  c="$(http -X POST "$PROC/admin/alta-usuario" -H "Authorization: Bearer ${par#*:}" -H "Content-Type: application/json" -d "$CUERPO")"
  echo "    ${par%%:*} -> HTTP $c (esperado 403)"; [ "$c" = 403 ] && pasa || falla "HTTP $c"
done
c="$(http -X POST "$PROC/admin/alta-usuario" -H "Content-Type: application/json" -d "$CUERPO")"
echo "    sin pase de sesion -> HTTP $c (esperado 401 o 403)"; { [ "$c" = 401 ] || [ "$c" = 403 ]; } && pasa || falla "HTTP $c"

echo ""; echo "[4] Un pase de sesion manipulado se rechaza"
H="$(echo "$T_CAP" | cut -d. -f1)"; P="$(echo "$T_CAP" | cut -d. -f2)"; S="$(echo "$T_CAP" | cut -d. -f3)"
# 4a. firma alterada
[ "${S:0:1}" = "A" ] && S2="B${S:1}" || S2="A${S:1}"
T_FIRMA="$H.$P.$S2"
c="$(http "$GW/rest/v1/perfil" -H "apikey: $ANON" -H "Authorization: Bearer $T_FIRMA")"
echo "    firma alterada, API REST -> HTTP $c (esperado 401)  $(head -c 160 /tmp/sesim_resp.json)"; [ "$c" = 401 ] && pasa || falla "HTTP $c"
# 4b. rol falsificado (capturista se disfraza de titular, conserva la firma vieja)
P2="$(b64d "$P" | sed 's/"rol":"capturista"/"rol":"administrador_titular"/' | b64e)"
T_FALSO="$H.$P2.$S"
c="$(http "$GW/rest/v1/perfil" -H "apikey: $ANON" -H "Authorization: Bearer $T_FALSO")"
echo "    rol falsificado, API REST -> HTTP $c (esperado 401)  $(head -c 160 /tmp/sesim_resp.json)"; [ "$c" = 401 ] && pasa || falla "HTTP $c"
c="$(http -X POST "$PROC/admin/alta-usuario" -H "Authorization: Bearer $T_FALSO" -H "Content-Type: application/json" -d "$CUERPO")"
echo "    rol falsificado, alta de usuarios -> HTTP $c (esperado 401 o 403)"; { [ "$c" = 401 ] || [ "$c" = 403 ]; } && pasa || falla "HTTP $c"

echo ""; echo "[5] El Titular da de alta una cuenta; entra con ella; el alta y la baja quedan en bitacora"
CORREO="prueba.$(date +%s)@example.com"
c="$(http -X POST "$PROC/admin/alta-usuario" -H "Authorization: Bearer $T_TIT" -H "Content-Type: application/json" \
  -d "{\"correo\":\"$CORREO\",\"password\":\"ClaveTemporal123!\",\"nombre\":\"Cuenta de prueba\",\"rol\":\"capturista\"}")"
echo "    alta de $CORREO -> HTTP $c (esperado 201)"; cat /tmp/sesim_resp.json; echo
[ "$c" = 201 ] && pasa || falla "HTTP $c"
ID_PERFIL="$(sed -n 's/.*"id_perfil":"\([^"]*\)".*/\1/p' /tmp/sesim_resp.json)"
T_NUEVO="$(login "$CORREO" 'ClaveTemporal123!')"
[ -n "$T_NUEVO" ] && { echo "    la cuenta nueva inicia sesion, rol = '$(claim_rol "$T_NUEVO")'"; pasa; } || falla "la cuenta nueva no pudo iniciar sesion"
curl -s "$GW/rest/v1/bitacora?select=creado_en,accion,objetivo_nombre,actor_nombre,actor_rol&order=creado_en.desc&limit=3" \
  -H "apikey: $ANON" -H "Authorization: Bearer $T_TIT" | tee /tmp/sesim_bit.json; echo
grep -q '"accion":"alta"' /tmp/sesim_bit.json && grep -q 'administrador_titular' /tmp/sesim_bit.json && pasa || falla "no aparece el alta en bitacora con su actor"
if [ -n "$ID_PERFIL" ]; then
  c="$(http -X PATCH "$GW/rest/v1/perfil?id=eq.$ID_PERFIL" -H "apikey: $ANON" -H "Authorization: Bearer $T_TIT" -H "Content-Type: application/json" -d '{"activo":false}')"
  echo "    baja logica -> HTTP $c (esperado 204)"; [ "$c" = 204 ] && pasa || falla "HTTP $c"
  curl -s "$GW/rest/v1/bitacora?select=accion,objetivo_nombre&order=creado_en.desc&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $T_TIT" | tee /tmp/sesim_bit.json; echo
  grep -q '"accion":"baja"' /tmp/sesim_bit.json && pasa || falla "no aparece la baja en bitacora"
  T_BAJA="$(login "$CORREO" 'ClaveTemporal123!')"
  echo "    INFO: tras la baja, GoTrue ${T_BAJA:+TODAVIA emite token (la baja aun no bloquea el login; los permisos de negocio si se pierden, pero falta bloquear la cuenta en GoTrue)}${T_BAJA:-ya no emite token}"
fi

echo ""
echo "==> resultado: $OK pasan, $MAL fallan."
[ "$MAL" -ne 0 ] && echo "    Si algo fallo: ./scripts/diagnostico.sh > diagnostico.txt 2>&1   y mandame el archivo."
[ "$MAL" -eq 0 ]
