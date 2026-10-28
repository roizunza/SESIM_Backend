#!/usr/bin/env python3
"""
SESIM · Aligerado de capas GeoJSON para el front (publicables en GitHub).

Toma las capas higienizadas del dataset oficial
(09_BASE_DATOS_SESIM/geojson, una por capa, ya identificadas con `id_capa`)
y escribe una copia ligera por capa en `public/sesim/capas/<id_capa>.geojson`.

Qué se conserva SIEMPRE (las llaves que relacionan la capa con el resto del
modelo; no se simplifican ni se eliminan):
  · Encabezado de la colección: id_capa, uuid_legado, titulo, categoria,
    n_elementos (→ tabla `capa`).
  · Por elemento: id (UUID de `capa_vector.id`), nombre, clasif (clase de
    simbología), cve_mun, y se agrega id_unidad (→ `unidad_territorial.id`,
    CVEGEO municipal '04' + cve_mun; null fuera de Campeche).
  · Todos los elementos: `keep-shapes` impide que un polígono o línea pequeña
    desaparezca al simplificar, así n_elementos del archivo = n_elementos de
    la tabla `capa`.

Qué se reduce:
  · Precisión de coordenadas a 5 decimales (≈1.1 m en Campeche).
  · Vértices de líneas y polígonos (Douglas-Peucker con resolución en metros).
    Se empieza en 5 m y, si la capa pasa de LIMITE_MB, se duplica la
    resolución hasta que entre o se llegue a RESOLUCION_MAX_M. Los puntos no
    se simplifican.

Uso (desde la raíz del repo del front):
    python3 scripts/datos/02_aligerar_capas.py [ruta_09_BASE_DATOS_SESIM]
    REHACER=1 python3 ...   # ignora los fragmentos y reprocesa todas las capas

Requiere mapshaper (npm i -g mapshaper, o MAPSHAPER=/ruta/al/binario).
Escribe además `scripts/datos/salida/aligerado.json` (bitácora por capa) y
`scripts/datos/salida/clasif_por_capa.json` (clases presentes en cada capa,
lo usa 01_exportar_catalogos.py para validar la simbología).
"""
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ORIGEN = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ.parent / 'CARTOGRAFIA' / 'EEMSV_CAMPECHE' / '09_BASE_DATOS_SESIM'
DESTINO = RAIZ / 'public' / 'sesim' / 'capas'
SALIDA = RAIZ / 'scripts' / 'datos' / 'salida'
MAPSHAPER = os.environ.get('MAPSHAPER') or shutil.which('mapshaper') or 'mapshaper'

LIMITE_MB = 5.0
RESOLUCION_INICIAL_M = 5
RESOLUCION_MAX_M = 160
PRECISION = '0.00001'

ENCABEZADO = ('id_capa', 'uuid_legado', 'titulo', 'categoria', 'n_elementos')


_POR_ID = None


def localizar(id_capa: str, geojson_rel: str) -> Path:
    """`indice_geojson.csv` trae rutas de una versión previa de carpetas
    (03_siniestralidad, 04_unidad_territorial) y algunos nombres con acento
    llegan con otra codificación. Por eso la búsqueda confiable es por el
    `id_capa` que cada GeoJSON trae en su encabezado; la ruta del índice solo
    se usa para las dos capas de unidad territorial (sin id_capa propio)."""
    global _POR_ID
    if _POR_ID is None:
        _POR_ID = {}
        for p in (ORIGEN / 'geojson').rglob('*.geojson'):
            enc = leer_encabezado(p)
            if enc.get('id_capa'):
                _POR_ID[enc['id_capa']] = p
    if id_capa in _POR_ID:
        return _POR_ID[id_capa]
    candidatos = list((ORIGEN / 'geojson').rglob(Path(geojson_rel).name))
    if len(candidatos) != 1:
        raise FileNotFoundError(f'{id_capa} ({geojson_rel}): {len(candidatos)} coincidencias')
    return candidatos[0]


def leer_encabezado(ruta: Path) -> dict:
    with open(ruta, encoding='utf-8') as f:
        cabeza = f.read(4096)
    corte = cabeza.find('"features"')
    texto = cabeza[:corte].rstrip().rstrip(',') + '}'
    return json.loads(texto)


def tipo_geometria(ruta: Path) -> str:
    with open(ruta, encoding='utf-8') as f:
        cabeza = f.read(20000)
    for g in ('Point', 'LineString', 'Polygon'):
        if f'"type":"Multi{g}"' in cabeza or f'"type":"{g}"' in cabeza or f'"type": "{g}"' in cabeza:
            return {'Point': 'point', 'LineString': 'line', 'Polygon': 'polygon'}[g]
    return 'unknown'


def correr_mapshaper(entrada: Path, salida: Path, resolucion_m):
    cmd = [MAPSHAPER, '-i', str(entrada), 'encoding=utf8']
    if resolucion_m:
        cmd += ['-simplify', 'dp', f'interval={resolucion_m}', 'keep-shapes']
    cmd += [
        '-each', "id_unidad = (cve_mun && cve_mun !== '000') ? '04' + cve_mun : null",
        '-o', str(salida), 'format=geojson', 'combine-layers', f'precision={PRECISION}', 'force',
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def escribir_con_encabezado(tmp: Path, destino: Path, encabezado: dict) -> tuple[int, Counter]:
    with open(tmp, encoding='utf-8') as f:
        datos = json.load(f)
    feats = datos['features']
    clases = Counter((ft.get('properties') or {}).get('clasif') for ft in feats)
    salida = {'type': 'FeatureCollection', **{k: encabezado.get(k) for k in ENCABEZADO if k in encabezado}}
    salida['features'] = feats
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))
    return len(feats), clases


def main():
    if not (ORIGEN / 'geojson').exists():
        sys.exit(f'No encuentro {ORIGEN / "geojson"}')
    DESTINO.mkdir(parents=True, exist_ok=True)
    SALIDA.mkdir(parents=True, exist_ok=True)

    with open(ORIGEN / 'geojson' / 'indice_geojson.csv', encoding='utf-8') as f:
        indice = list(csv.DictReader(f))

    bitacora, clasif_por_capa = [], {}
    for fila in indice:
        id_capa = fila['id_capa']
        fragmento = SALIDA / 'fragmentos' / f'{id_capa}.json'
        if fragmento.exists() and not os.environ.get('REHACER'):
            # Reanudación: cada capa deja su resultado en un fragmento, así el
            # proceso se puede cortar y volver a correr sin repetir capas.
            previo = json.load(open(fragmento, encoding='utf-8'))
            bitacora.append(previo['registro'])
            clasif_por_capa[id_capa] = previo['clases']
            continue
        origen = localizar(id_capa, fila['geojson'])
        encabezado = leer_encabezado(origen)
        if id_capa.startswith('unidad_territorial'):
            encabezado = {'id_capa': id_capa, 'titulo': id_capa.replace('_', ' ').capitalize(),
                          'categoria': 'unidad_territorial', 'n_elementos': int(fila['n_elementos'])}
            destino = DESTINO / 'unidad_territorial' / f'{id_capa.replace("unidad_territorial_", "")}.geojson'
            destino.parent.mkdir(exist_ok=True)
        else:
            destino = DESTINO / f'{id_capa}.geojson'
        geom = tipo_geometria(origen)
        mb_origen = origen.stat().st_size / 1e6

        resolucion = None if geom == 'point' else RESOLUCION_INICIAL_M
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td) / 'capa.json'
            mb_previo = None
            while True:
                correr_mapshaper(origen, tmp, resolucion)
                n, clases = escribir_con_encabezado(tmp, destino, encabezado)
                mb = destino.stat().st_size / 1e6
                if mb <= LIMITE_MB or resolucion is None or resolucion >= RESOLUCION_MAX_M:
                    break
                # Si simplificar más ya casi no reduce el peso, lo que pesa son
                # los atributos (UUID + nombre + clasif por elemento), que no se
                # tocan: se regresa a la resolución anterior para no perder
                # detalle geométrico a cambio de nada.
                if mb_previo is not None and (mb_previo - mb) / mb_previo < 0.15:
                    resolucion //= 2
                    correr_mapshaper(origen, tmp, resolucion)
                    n, clases = escribir_con_encabezado(tmp, destino, encabezado)
                    mb = destino.stat().st_size / 1e6
                    break
                mb_previo = mb
                resolucion *= 2

        esperado = int(fila['n_elementos'])
        registro = {
            'id_capa': id_capa, 'origen': str(origen.relative_to(ORIGEN)).replace('\\', '/'),
            'destino': str(destino.relative_to(RAIZ / 'public')).replace('\\', '/'),
            'geometria': geom, 'mb_origen': round(mb_origen, 2), 'mb_final': round(mb, 2),
            'resolucion_m': resolucion, 'n_elementos': n, 'n_esperado': esperado, 'ok': n == esperado,
        }
        bitacora.append(registro)
        clasif_por_capa[id_capa] = dict(clases.most_common())
        fragmento.parent.mkdir(parents=True, exist_ok=True)
        with open(fragmento, 'w', encoding='utf-8') as f:
            json.dump({'registro': registro, 'clases': clasif_por_capa[id_capa]}, f, ensure_ascii=False)
        print(f"{id_capa:<34} {geom:<8} {mb_origen:8.2f} MB → {mb:6.2f} MB  res={resolucion}  n={n}/{esperado}", flush=True)

    with open(SALIDA / 'aligerado.json', 'w', encoding='utf-8') as f:
        json.dump(bitacora, f, ensure_ascii=False, indent=1)
    with open(SALIDA / 'clasif_por_capa.json', 'w', encoding='utf-8') as f:
        json.dump(clasif_por_capa, f, ensure_ascii=False, indent=1)
    total = sum(r['mb_final'] for r in bitacora)
    malos = [r['id_capa'] for r in bitacora if not r['ok']]
    print(f'\nTotal: {total:.1f} MB en {len(bitacora)} archivos. Conteo distinto al esperado: {malos or "ninguno"}')


if __name__ == '__main__':
    main()
