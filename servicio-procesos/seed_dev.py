"""
Semilla del Ciclo 1 -- SOLO DESARROLLO. Nunca correr esto contra un ambiente
que vaya a produccion.

Por que esto es un script, y no un archivo .sql como antes (version
pre-Supabase): las cuentas ahora viven en auth.users, que administra GoTrue.
Insertar ahi a mano por SQL directo es fragil (el esquema exacto de
auth.users/auth.identities varia entre versiones de GoTrue, y no se pudo
verificar contra una corrida real en este entorno -- ver
docs/decisiones-pendientes.md). Pasar por la Admin API de GoTrue, en cambio,
es estable independientemente de la version.

Esto NO es un endpoint HTTP (a diferencia de POST /admin/alta-usuario en
main.py): es un script de una sola vez que se corre a mano, con el
service_role, precisamente para resolver el problema del "huevo y la
gallina" -- crear las primeras cuentas cuando todavia no existe ningun
administrador_vip que pueda llamar a /admin/alta-usuario.

Uso (con el entorno ya arriba -- ver README.md):

    docker compose ... exec -T servicio-procesos python seed_dev.py
"""

import os
import sys

import httpx
import psycopg2

DATABASE_URL = os.environ["DATABASE_URL"]
SERVICE_ROLE_KEY = os.environ["SERVICE_ROLE_KEY"]
GOTRUE_INTERNAL_URL = os.environ.get("GOTRUE_INTERNAL_URL", "http://auth:9999")

# Contrasena de las seis, SOLO para este entorno de desarrollo. Cambiar en
# cuanto haya credenciales reales; nunca reusar en produccion.
PASSWORD_DEV = "SesimDev2026!"

# Convencion de correo confirmada por Ismael (reemplaza la propuesta
# original con sufijos "+algo@gmail.com" -- ver docs/decisiones-pendientes.md).
# Nombres: son marcadores de prueba, no hay lista real de personas todavia.
# Dependencia: pendiente (no existe aun el catalogo real de areas), se deja
# en None a proposito.
CUENTAS = [
    {
        "correo": "sesimcapturista1@gmail.com",
        "nombre": "Capturista de prueba 1",
        "rol": "capturista",
    },
    {
        "correo": "sesimcapturista2@gmail.com",
        "nombre": "Capturista de prueba 2",
        "rol": "capturista",
    },
    {
        "correo": "sesimadmin@gmail.com",
        "nombre": "Administrador de prueba",
        "rol": "administrador",
    },
    {
        "correo": "sesimadminvip@gmail.com",
        "nombre": "Administrador vip de prueba",
        "rol": "administrador_vip",
    },
    {
        "correo": "sesimauditor1@gmail.com",
        "nombre": "Auditor de prueba 1",
        "rol": "auditor",
    },
    {
        "correo": "sesimauditor2@gmail.com",
        "nombre": "Auditor de prueba 2",
        "rol": "auditor",
    },
]


def _usuario_existente(cur, correo: str):
    cur.execute("select id from auth.users where email = %s", (correo,))
    fila = cur.fetchone()
    return fila[0] if fila else None


def _crear_en_auth_users(correo: str) -> str:
    respuesta = httpx.post(
        f"{GOTRUE_INTERNAL_URL}/admin/users",
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "apikey": SERVICE_ROLE_KEY,
        },
        json={
            "email": correo,
            "password": PASSWORD_DEV,
            "email_confirm": True,
        },
        timeout=10,
    )
    respuesta.raise_for_status()
    return respuesta.json()["id"]


def main():
    with psycopg2.connect(DATABASE_URL) as conn:
        for cuenta in CUENTAS:
            with conn.cursor() as cur:
                id_usuario = _usuario_existente(cur, cuenta["correo"])

            if id_usuario is None:
                print(f"==> creando en auth.users: {cuenta['correo']}")
                try:
                    id_usuario = _crear_en_auth_users(cuenta["correo"])
                except httpx.HTTPStatusError as exc:
                    print(
                        f"    ERROR creando {cuenta['correo']}: "
                        f"{exc.response.status_code} {exc.response.text}",
                        file=sys.stderr,
                    )
                    continue
            else:
                print(f"==> ya existia en auth.users: {cuenta['correo']}")

            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into core.perfil (id_usuario, nombre, rol, ambito, cve_mun, dependencia)
                    values (%s, %s, %s, 'estatal', null, null)
                    on conflict (id_usuario) do nothing
                    """,
                    (id_usuario, cuenta["nombre"], cuenta["rol"]),
                )
            conn.commit()

    print("==> semilla aplicada")


if __name__ == "__main__":
    main()
