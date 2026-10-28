#!/usr/bin/env bash
# Funciones comunes de los scripts de ambiente (Ciclo 2). Se carga con
# "source", no se ejecuta solo.
#
# Un ambiente es uno de: desarrollo | pruebas | produccion. El .env de la raiz
# de Back declara APP_ENV; los scripts lo leen de ahi para no depender de que
# la persona recuerde en que ambiente esta.

AMBIENTES_VALIDOS="desarrollo pruebas produccion"

validar_ambiente() {
  case " $AMBIENTES_VALIDOS " in
    *" $1 "*) return 0 ;;
    *) echo "Ambiente invalido: '$1'. Usa uno de: $AMBIENTES_VALIDOS" >&2; return 1 ;;
  esac
}

# Valor de una variable en .env (sin comillas ni espacios finales).
leer_env() {
  grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e 's/[[:space:]]*$//'
}

# Compose con todo lo comun. El perfil del buzon de prueba solo existe fuera
# de produccion.
compose() {
  local amb
  amb="$(leer_env APP_ENV)"
  local perfil=()
  if [ "$amb" != "produccion" ]; then perfil=(--profile correo-prueba); fi
  docker compose -f docker-compose.sesim.yml --env-file .env "${perfil[@]}" "$@"
}
