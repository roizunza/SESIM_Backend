"""
Servicio de procesos del SESIM.

Con el cambio a Supabase autoalojado, este servicio DEJA de encargarse de
login y restablecimiento de contrasena -- eso ahora lo hace GoTrue (el
servicio de auth de Supabase) directamente, sin una sola linea de codigo
propia (ver README.md, seccion "Login y restablecimiento de contrasena").

Lo que SESIM si sigue necesitando resolver por su cuenta, y por lo que
existe este servicio, es todo lo que Postgres/PostgREST no pueden hacer
solos:

  Ciclo 1:
    POST /admin/alta-usuario   Unica forma de crear una cuenta + perfil.
                               Nadie se auto-registra. Solo lo puede llamar
                               alguien con perfil "administrador_vip" (ver
                               docs/decisiones-pendientes.md sobre por que
                               justo ese permiso y no "administrador").
                               Internamente: (1) valida el JWT de quien
                               llama y que su perfil sea administrador_vip;
                               (2) crea la cuenta en auth.users via la Admin
                               API de GoTrue (una funcion de SQL corriente
                               no puede hacer esa llamada HTTP sin sumar una
                               extension como pg_net, que no se agrego para
                               no meter una pieza mas sin probar); (3) crea
                               el perfil correspondiente en core.perfil.

  Ciclos futuros (Ciclo 4 y Ciclo 9): procesar cargas de XLSX y de capas
  geoespaciales (GeoJSON/Shapefile/GPKG) que suba alguien sin perfil
  tecnico, validarlas, y ser quien de verdad hable con PostGIS -- para que
  esa persona nunca tenga que tocar SQL ni PostGIS directamente (ver
  docs/decisiones-pendientes.md, seccion sobre subida de capas).
"""

import os

import httpx
import jwt
import psycopg2
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
SERVICE_ROLE_KEY = os.environ["SERVICE_ROLE_KEY"]

# URL interna de GoTrue DENTRO de la red de docker compose (no la publica:
# esta llamada nunca sale por el gateway/Envoy, va contenedor a contenedor).
GOTRUE_INTERNAL_URL = os.environ.get("GOTRUE_INTERNAL_URL", "http://auth:9999")

ROLES_VALIDOS = {"capturista", "administrador", "administrador_vip", "auditor"}

app = FastAPI(title="SESIM - servicio de procesos")


class AltaUsuarioIn(BaseModel):
    correo: EmailStr
    password: str
    nombre: str
    rol: str
    ambito: str = "estatal"
    cve_mun: str | None = None
    dependencia: str | None = None


def _conectar_db():
    return psycopg2.connect(DATABASE_URL)


def _exigir_administrador_vip(authorization: str | None) -> str:
    """Valida el JWT de quien llama y exige perfil administrador_vip activo.

    Devuelve el id_usuario (auth.uid()) de quien llama, para dejarlo en la
    bitacora mas adelante si hiciera falta.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="falta_autenticacion")

    token = authorization.split(" ", 1)[1].strip()
    try:
        # verify_aud=False: el "aud" que emite GoTrue puede variar de
        # version a version ("authenticated" es lo usual); lo que de
        # verdad nos importa aqui es la firma y el vencimiento, que pyjwt
        # si valida por default.
        claims = jwt.decode(
            token, JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False}
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="token_invalido") from exc

    id_usuario = claims.get("sub")
    if not id_usuario:
        raise HTTPException(status_code=401, detail="token_invalido")

    with _conectar_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select rol, activo from core.perfil where id_usuario = %s",
                (id_usuario,),
            )
            fila = cur.fetchone()

    if fila is None or fila[0] != "administrador_vip" or not fila[1]:
        raise HTTPException(
            status_code=403, detail="solo_administrador_vip_puede_dar_de_alta"
        )

    return id_usuario


def _crear_en_auth_users(correo: str, password: str, nombre: str) -> str:
    """Crea la cuenta en auth.users via la Admin API de GoTrue. Devuelve el
    id (uuid) del usuario creado."""
    respuesta = httpx.post(
        f"{GOTRUE_INTERNAL_URL}/admin/users",
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "apikey": SERVICE_ROLE_KEY,
        },
        json={
            "email": correo,
            "password": password,
            # Cuenta creada por un administrador: se confirma de una vez,
            # no hace falta que la persona confirme su correo para poder
            # entrar.
            "email_confirm": True,
            "user_metadata": {"nombre": nombre},
        },
        timeout=10,
    )

    if respuesta.status_code >= 400:
        detalle = respuesta.text
        if respuesta.status_code in (400, 409, 422):
            # Caso tipico: el correo ya existe.
            raise HTTPException(status_code=409, detail=f"gotrue_rechazo_alta: {detalle}")
        raise HTTPException(status_code=502, detail=f"gotrue_error: {detalle}")

    return respuesta.json()["id"]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/admin/alta-usuario", status_code=201)
def alta_usuario(payload: AltaUsuarioIn, authorization: str | None = Header(default=None)):
    _exigir_administrador_vip(authorization)

    if payload.rol not in ROLES_VALIDOS:
        raise HTTPException(status_code=422, detail="rol_invalido")

    if payload.ambito == "municipal" and not payload.cve_mun:
        raise HTTPException(status_code=422, detail="falta_cve_mun_para_ambito_municipal")
    if payload.ambito == "estatal" and payload.cve_mun:
        raise HTTPException(status_code=422, detail="cve_mun_no_aplica_a_ambito_estatal")

    id_usuario = _crear_en_auth_users(payload.correo, payload.password, payload.nombre)

    with _conectar_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into core.perfil (id_usuario, nombre, rol, ambito, cve_mun, dependencia)
                values (%s, %s, %s, %s, %s, %s)
                returning id
                """,
                (
                    id_usuario,
                    payload.nombre,
                    payload.rol,
                    payload.ambito,
                    payload.cve_mun,
                    payload.dependencia,
                ),
            )
            id_perfil = cur.fetchone()[0]
        conn.commit()

    return {"id_usuario": id_usuario, "id_perfil": id_perfil}
