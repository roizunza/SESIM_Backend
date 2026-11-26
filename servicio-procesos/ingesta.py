"""
Ingesta de capas vectoriales del SESIM (Bloque A, flujos 1, 2 y 3).

El navegador NUNCA escribe geometrias en la base: sube el archivo a este servicio, que
  1. verifica el JWT de quien llama (misma firma que usa GoTrue) y su perfil activo;
  2. lee el GeoPackage con sqlite3 (sin GDAL: el GPKG es una base SQLite y su geometria viaja como WKB con un encabezado);
  3. abre UNA transaccion, se hace pasar por esa persona (set_config de request.jwt.claim.sub) y llama a las funciones de la base
     (core.ingestar_capa_lote / core.cerrar_ingesta_capa / api.fn_resolver_actualizacion_capa). Es la base la que decide
     quien puede, valida el tipo de geometria, deriva el municipio y reemplaza (no duplica) las geometrias previas. Este servicio
     no se salta ninguna regla: si la base dice que no, el servicio devuelve ese mensaje y no queda nada a medias.

Rutas:
  POST /capas/{id}/geometrias                   Capturista dueno del borrador. Carga o REEMPLAZA las geometrias del borrador.
                                                 ?solo_validar=true corre todo y revierte (para el boton "Revisar archivo").
  POST /capas/{id}/actualizacion/archivo        Capturista. Guarda el archivo de una actualizacion de capa vigente (aun sin tocar la base).
  POST /capas/{id}/actualizacion/resolver       Administrador / Titular. Aprobar = ingerir el archivo guardado + aprobar + cerrar, todo en
                                                 una transaccion; rechazar = rechazar y descartar el archivo.

Formato aceptado hoy: GeoPackage (.gpkg). Shapefile y GeoJSON quedan pendientes (no se supone nada).
"""

import hashlib
from contextlib import closing
import json
import os
import re
import shutil
import sqlite3
import struct
import tempfile
from pathlib import Path

import jwt
import psycopg2
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
STAGING_DIR = Path(os.environ.get("STAGING_DIR", "/data/staging"))
TAM_LOTE = int(os.environ.get("INGESTA_TAM_LOTE", "2000"))
MAX_MB = int(os.environ.get("INGESTA_MAX_MB", "500"))

router = APIRouter()

# codigo de error de la base -> codigo HTTP
_HTTP_POR_SQLSTATE = {"42501": 403, "55000": 409, "P0002": 404, "23514": 422, "22023": 422, "23505": 422}
_ID_CAPA = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,11}$")


# ----------------------------------------------------------------------------------------------------------------------------
# Identidad
# ----------------------------------------------------------------------------------------------------------------------------
def _uid_desde_jwt(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="falta_autenticacion")
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False})
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="token_invalido") from exc
    uid = claims.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="token_invalido")
    return uid


def _actuar_como(cur, uid: str) -> None:
    """Solo dentro de la transaccion actual (is_local = true): la base ve a la persona, no al servicio."""
    cur.execute(
        "select set_config('request.jwt.claim.sub', %s, true),"
        "       set_config('request.jwt.claim.role', 'authenticated', true),"
        "       set_config('request.jwt.claims', %s, true)",
        (uid, json.dumps({"sub": uid, "role": "authenticated"})),
    )


def _error_http(exc: psycopg2.Error) -> HTTPException:
    codigo = _HTTP_POR_SQLSTATE.get(exc.pgcode or "", 500)
    mensaje = (exc.diag.message_primary if exc.diag and exc.diag.message_primary else str(exc)).strip()
    return HTTPException(status_code=codigo, detail=mensaje)


def _validar_id(id_capa: str) -> None:
    if not _ID_CAPA.match(id_capa):
        raise HTTPException(status_code=422, detail="id_de_capa_no_valido")


# ----------------------------------------------------------------------------------------------------------------------------
# Lectura de GeoPackage
# ----------------------------------------------------------------------------------------------------------------------------
class ErrorArchivo(Exception):
    pass


def _wkb_de_blob_gpkg(blob: bytes) -> str | None:
    """Quita el encabezado GPKG y devuelve el WKB en hexadecimal; None si la geometria esta marcada vacia."""
    if blob is None or len(blob) < 8 or blob[:2] != b"GP":
        raise ErrorArchivo("una geometria no tiene el formato GeoPackage (encabezado 'GP' ausente)")
    flags = blob[3]
    if flags & 0b00010000:        # bit 4: geometria vacia
        return None
    env = (flags >> 1) & 0b111
    tam_env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get(env)
    if tam_env is None:
        raise ErrorArchivo("una geometria trae un indicador de envolvente no valido")
    return blob[8 + tam_env:].hex()


def _json_seguro(v):
    if isinstance(v, (bytes, bytearray, memoryview)):
        return None
    if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
        return None
    return v


def leer_gpkg(ruta: Path, columna_id: str | None = None, nombre_capa: str | None = None):
    """Devuelve (info, generador de lotes). Cada lote es una lista de dicts listos para core.ingestar_capa_lote."""
    try:
        con = sqlite3.connect(f"file:{ruta}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        capas = con.execute(
            "select c.table_name, g.column_name, g.geometry_type_name, g.srs_id from gpkg_contents c "
            "join gpkg_geometry_columns g on g.table_name = c.table_name where c.data_type = 'features'"
        ).fetchall()
    except sqlite3.Error as exc:
        raise ErrorArchivo(f"el archivo no es un GeoPackage valido ({exc})") from exc
    if not capas:
        raise ErrorArchivo("el GeoPackage no trae ninguna capa vectorial")
    if nombre_capa:
        sel = [c for c in capas if c["table_name"] == nombre_capa]
        if not sel:
            raise ErrorArchivo(f"el GeoPackage no tiene la capa '{nombre_capa}' (trae: {', '.join(c['table_name'] for c in capas)})")
        capa = sel[0]
    elif len(capas) > 1:
        raise ErrorArchivo(
            "el GeoPackage trae varias capas (" + ", ".join(c["table_name"] for c in capas) + "): indica cual cargar"
        )
    else:
        capa = capas[0]

    tabla, col_geom, srs_id = capa["table_name"], capa["column_name"], capa["srs_id"]
    epsg = None
    if srs_id is not None and srs_id > 0:
        fila = con.execute(
            "select organization, organization_coordsys_id from gpkg_spatial_ref_sys where srs_id = ?", (srs_id,)
        ).fetchone()
        if fila is None:
            raise ErrorArchivo(f"el sistema de coordenadas {srs_id} no esta definido en el archivo")
        if str(fila["organization"]).upper() != "EPSG":
            raise ErrorArchivo(f"el sistema de coordenadas ({fila['organization']}:{fila['organization_coordsys_id']}) no es EPSG: conviertelo a un EPSG")
        epsg = int(fila["organization_coordsys_id"])

    columnas = [r["name"] for r in con.execute(f'pragma table_info("{tabla}")')]
    pk = next((r["name"] for r in con.execute(f'pragma table_info("{tabla}")') if r["pk"] == 1), None)
    atributos = [c for c in columnas if c != col_geom]
    if columna_id:
        if columna_id not in columnas or columna_id == col_geom:
            raise ErrorArchivo(f"la columna de identificador '{columna_id}' no existe en la capa '{tabla}' (columnas: {', '.join(atributos)})")
        col_id = columna_id
    else:
        col_id = pk
    if col_id is None:
        raise ErrorArchivo("la capa no tiene llave primaria: indica la columna de identificador")
    col_nombre = next((c for c in atributos if c.lower() == "nombre"), None)

    total = con.execute(f'select count(*) from "{tabla}"').fetchone()[0]
    if total == 0:
        raise ErrorArchivo("la capa del archivo no tiene elementos")
    info = {"capa_gpkg": tabla, "columna_id_origen": col_id, "srid": epsg, "n_elementos_archivo": total,
            "tipo_geometria_archivo": capa["geometry_type_name"], "columnas": atributos, "capas_en_archivo": [c["table_name"] for c in capas]}

    def lotes():
        cur = con.execute(f'select * from "{tabla}"')
        while True:
            filas = cur.fetchmany(TAM_LOTE)
            if not filas:
                break
            lote = []
            for f in filas:
                wkb = _wkb_de_blob_gpkg(f[col_geom]) if f[col_geom] is not None else None
                props = {c: _json_seguro(f[c]) for c in atributos if c != col_geom}
                elem = {"id_origen": None if f[col_id] is None else str(f[col_id]), "wkb": wkb,
                        "nombre": None if col_nombre is None or f[col_nombre] is None else str(f[col_nombre]),
                        "propiedades": props}
                if epsg:
                    elem["srid"] = epsg
                lote.append(elem)
            yield lote
        con.close()

    return info, lotes()


# ----------------------------------------------------------------------------------------------------------------------------
# Archivos
# ----------------------------------------------------------------------------------------------------------------------------
async def _guardar_subida(archivo: UploadFile, destino: Path) -> tuple[str, int]:
    nombre = (archivo.filename or "").lower()
    if not nombre.endswith(".gpkg"):
        raise HTTPException(status_code=422, detail="formato_no_soportado: por ahora solo se acepta .gpkg (GeoPackage)")
    h = hashlib.sha256()
    n = 0
    destino.parent.mkdir(parents=True, exist_ok=True)
    with open(destino, "wb") as out:
        while True:
            trozo = await archivo.read(1024 * 1024)
            if not trozo:
                break
            n += len(trozo)
            if n > MAX_MB * 1024 * 1024:
                out.close()
                destino.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"archivo_demasiado_grande: maximo {MAX_MB} MB")
            h.update(trozo)
            out.write(trozo)
    return h.hexdigest(), n


def _ingerir(cur, id_capa: str, modo: str, ruta: Path, columna_id: str | None, nombre_capa: str | None) -> dict:
    try:
        info, lotes = leer_gpkg(ruta, columna_id, nombre_capa)
    except ErrorArchivo as exc:
        raise HTTPException(status_code=422, detail=f"archivo_no_valido: {exc}") from exc
    primero = True
    insertados = 0
    try:
        for lote in lotes:
            cur.execute("select core.ingestar_capa_lote(%s, %s, %s::jsonb, %s)", (id_capa, modo, json.dumps(lote), primero))
            res = cur.fetchone()[0]
            insertados += res["insertados"]
            primero = False
    except ErrorArchivo as exc:
        raise HTTPException(status_code=422, detail=f"archivo_no_valido: {exc}") from exc
    return {**info, "insertados": insertados}


# ----------------------------------------------------------------------------------------------------------------------------
# Rutas
# ----------------------------------------------------------------------------------------------------------------------------
@router.post("/capas/{id_capa}/geometrias")
async def cargar_geometrias(
    id_capa: str,
    archivo: UploadFile = File(...),
    columna_id_origen: str | None = Form(default=None),
    capa_gpkg: str | None = Form(default=None),
    solo_validar: bool = False,
    authorization: str | None = Header(default=None),
):
    _validar_id(id_capa)
    uid = _uid_desde_jwt(authorization)
    with tempfile.TemporaryDirectory(prefix="sesim_ingesta_") as tmp:
        ruta = Path(tmp) / "subida.gpkg"
        sha, tam = await _guardar_subida(archivo, ruta)
        conn = psycopg2.connect(DATABASE_URL)
        try:
            with conn.cursor() as cur:
                _actuar_como(cur, uid)
                resultado = _ingerir(cur, id_capa, "borrador", ruta, columna_id_origen, capa_gpkg)
                cur.execute("select core.cerrar_ingesta_capa(%s, 'borrador', %s)", (id_capa, archivo.filename))
                cierre = cur.fetchone()[0]
            if solo_validar:
                conn.rollback()
            else:
                conn.commit()
        except psycopg2.Error as exc:
            conn.rollback()
            raise _error_http(exc) from exc
        except HTTPException:
            conn.rollback()
            raise
        finally:
            conn.close()
    return {"guardado": not solo_validar, "sha256": sha, "bytes": tam, **resultado, **cierre}


@router.post("/capas/{id_capa}/actualizacion/archivo")
async def guardar_archivo_actualizacion(
    id_capa: str,
    archivo: UploadFile = File(...),
    columna_id_origen: str | None = Form(default=None),
    capa_gpkg: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    """Guarda (sin tocar la base) el archivo de una actualizacion y lo revisa: cuenta elementos y comprueba que se pueda leer."""
    _validar_id(id_capa)
    uid = _uid_desde_jwt(authorization)
    with closing(psycopg2.connect(DATABASE_URL)) as conn:
        with conn.cursor() as cur:
            _actuar_como(cur, uid)
            cur.execute("select core.rol_actual()")
            if cur.fetchone()[0] != "capturista":
                raise HTTPException(status_code=403, detail="Solo el Capturista sube el archivo de una actualizacion.")
            cur.execute(
                "select estatus, activo, coalesce(metadatos_extra -> 'actualizacion_pendiente' ->> 'estado', '') from core.capa where id = %s",
                (id_capa,),
            )
            fila = cur.fetchone()
    if fila is None:
        raise HTTPException(status_code=404, detail=f"La capa {id_capa} no existe o no puedes verla.")
    if not fila[1] or fila[0] not in ("vigente_admin", "vigente_publico"):
        raise HTTPException(status_code=409, detail=f"La capa {id_capa} esta en '{fila[0]}': la actualizacion aplica a capas vigentes.")
    if fila[2] == "pendiente":
        raise HTTPException(status_code=409, detail=f"La capa {id_capa} ya tiene una actualizacion esperando dictamen: no se cambia su archivo.")

    carpeta = STAGING_DIR / id_capa
    tmp_ruta = carpeta / "actualizacion.gpkg.parcial"
    sha, tam = await _guardar_subida(archivo, tmp_ruta)
    try:
        info, lotes = leer_gpkg(tmp_ruta, columna_id_origen, capa_gpkg)
        n = 0
        for lote in lotes:               # recorre todo para detectar geometrias o identificadores ilegibles antes de proponer
            n += len(lote)
            if any(not e["id_origen"] for e in lote):
                raise ErrorArchivo("hay elementos sin identificador en la columna elegida")
    except ErrorArchivo as exc:
        tmp_ruta.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"archivo_no_valido: {exc}") from exc
    final = carpeta / "actualizacion.gpkg"
    os.replace(tmp_ruta, final)
    meta = {"archivo": archivo.filename, "sha256": sha, "bytes": tam, "n_elementos": n, "columna_id_origen": info["columna_id_origen"],
            "capa_gpkg": info["capa_gpkg"], "subido_por": uid}
    (carpeta / "actualizacion.json").write_text(json.dumps(meta), encoding="utf-8")
    return meta


class ResolverIn(BaseModel):
    decision: str            # aprobar | rechazar
    comentario: str | None = None


@router.post("/capas/{id_capa}/actualizacion/resolver")
def resolver_actualizacion(id_capa: str, payload: ResolverIn, authorization: str | None = Header(default=None)):
    _validar_id(id_capa)
    uid = _uid_desde_jwt(authorization)
    if payload.decision not in ("aprobar", "rechazar"):
        raise HTTPException(status_code=422, detail="decision_no_valida: usa aprobar o rechazar")
    carpeta = STAGING_DIR / id_capa
    ruta, ficha = carpeta / "actualizacion.gpkg", carpeta / "actualizacion.json"
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            _actuar_como(cur, uid)
            resultado, cierre = None, None
            if payload.decision == "aprobar":
                cur.execute("select core.exigir_rol(array['administrador','administrador_titular'], 'aprobar la actualizacion de una capa')")
                cur.execute("select metadatos_extra -> 'actualizacion_pendiente' from core.capa where id = %s", (id_capa,))
                fila = cur.fetchone()
                prop = fila[0] if fila else None
                if not prop or prop.get("estado") != "pendiente":
                    raise HTTPException(status_code=409, detail=f"La capa {id_capa} no tiene una actualizacion pendiente.")
                if not ruta.exists() or not ficha.exists():
                    raise HTTPException(status_code=409, detail="No se encontro el archivo de la actualizacion en el servicio: el Capturista debe volver a subirlo y proponerla otra vez.")
                meta = json.loads(ficha.read_text(encoding="utf-8"))
                if meta.get("archivo") != prop.get("archivo") or int(meta.get("n_elementos", -1)) != int(prop.get("n_elementos", -2)):
                    raise HTTPException(status_code=409, detail="El archivo guardado no coincide con la propuesta (nombre o numero de elementos): el Capturista debe subirlo y proponerlo otra vez.")
                # 1) ingesta (reemplaza), 2) aprobacion (cuatro ojos y demas reglas de la base), 3) cierre. Si algo falla, nada queda.
                resultado = _ingerir(cur, id_capa, "actualizacion", ruta, meta.get("columna_id_origen"), meta.get("capa_gpkg"))
                cur.execute("select api.fn_resolver_actualizacion_capa(%s, 'aprobar', %s)", (id_capa, payload.comentario))
                cur.execute("select core.cerrar_ingesta_capa(%s, 'actualizacion', %s)", (id_capa, meta.get("archivo")))
                cierre = cur.fetchone()[0]
            else:
                cur.execute("select api.fn_resolver_actualizacion_capa(%s, 'rechazar', %s)", (id_capa, payload.comentario))
        conn.commit()
    except psycopg2.Error as exc:
        conn.rollback()
        raise _error_http(exc) from exc
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()
    shutil.rmtree(carpeta, ignore_errors=True)          # ya no hace falta el archivo guardado (aprobado o rechazado)
    return {"decision": payload.decision, "ingesta": resultado, "cierre": cierre}
