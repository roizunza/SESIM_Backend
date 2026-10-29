#!/usr/bin/env python3
"""
SESIM · Exportación de catálogos y simbología para el front.

Lee el libro operativo del dataset oficial (arquitectura de datos v2.2) y
escribe en `public/sesim/catalogo/` un JSON por tabla, con los MISMOS nombres
de tabla y de columna que tendrá el esquema `core`/`api` de PostgreSQL. Así,
cuando exista PostgREST, el front solo cambia la URL base
(`/datos/catalogo/indicador.json` → `/api/indicador`) y no la forma de los
datos. Ver `docs/FRONT_ARQUITECTURA_DATOS_V2.md`.

Fuentes (en 09_BASE_DATOS_SESIM/tablas/):
  · SESIM_operativo.xlsx  — tablas v2.2 sin geometría (catálogos, puentes,
                            indicador, unidad_territorial, capa, cruces).
  · SESIM_tablas.xlsx     — solo la hoja `capa`, para `estatus` y `proposito`
                            (el operativo no los trae); se cruza por uuid_legado.

Además convierte la simbología QGIS que usaba el geovisor (llaves viejas por
nombre de archivo) a `public/sesim/simbologia.json`, con llave = id_capa y
clasificación por el atributo `clasif` (que el pipeline llenó con la
etiqueta de la clase del .qml). Necesita `scripts/datos/salida/clasif_por_capa.json`,
que produce 02_aligerar_capas.py: correr primero el 02.

Uso (desde la raíz del repo del front):
    python3 scripts/datos/01_exportar_catalogos.py [ruta_09_BASE_DATOS_SESIM]
"""
import copy
import json
import math
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
ORIGEN = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ.parent / 'CARTOGRAFIA' / 'EEMSV_CAMPECHE' / '09_BASE_DATOS_SESIM'
OPERATIVO = ORIGEN / 'tablas' / 'SESIM_operativo.xlsx'
TABLAS = ORIGEN / 'tablas' / 'SESIM_tablas.xlsx'
DESTINO = RAIZ / 'public' / 'sesim' / 'catalogo'
LEGADO = RAIZ / 'scripts' / 'datos' / 'legado'
SALIDA = RAIZ / 'scripts' / 'datos' / 'salida'
URL_CAPAS = '/sesim/capas'

GEOM = {'Punto': 'point', 'Línea': 'line', 'Polígono': 'polygon'}
CATEGORIA = {'mapabase': 'mapa_base', 'mapa_base': 'mapa_base', 'diagnostico': 'diagnostico', 'estrategia': 'estrategia'}
GRUPO_MAPA_BASE = {
    'LIM': 'Límites administrativos',
    'LOC': 'Localidades y asentamientos',
    'INF': 'Red de transportes e infraestructura',
    'NAT': 'Medio físico y conservación',
}


# ----------------------------------------------------------------- utilidades
def limpio(v):
    """Celda de Excel → valor JSON (NaN→None, fórmulas booleanas→bool, fechas→ISO)."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (pd.Timestamp, datetime, date)):
        return v.date().isoformat() if hasattr(v, 'date') else v.isoformat()
    if isinstance(v, str):
        s = v.strip()
        if s.upper() in ('=TRUE()', 'TRUE', 'VERDADERO'):
            return True
        if s.upper() in ('=FALSE()', 'FALSE', 'FALSO'):
            return False
        return s or None
    if hasattr(v, 'item'):
        v = v.item()
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def hoja(nombre, archivo=OPERATIVO, llave='id'):
    df = pd.read_excel(archivo, sheet_name=nombre, dtype=object)
    if llave in df.columns:
        df = df[df[llave].notna()]
    return [{k: limpio(v) for k, v in fila.items()} for fila in df.to_dict('records')]


def escribir(nombre, filas):
    DESTINO.mkdir(parents=True, exist_ok=True)
    with open(DESTINO / f'{nombre}.json', 'w', encoding='utf-8') as f:
        json.dump(filas, f, ensure_ascii=False, separators=(',', ':'))
    print(f'  {nombre:<26} {len(filas):>5} filas')
    return len(filas)


def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return s.replace('-', '_').replace('.geojson', '').strip()


# ------------------------------------------------------------------ catálogos
def estatus_d17(c):
    """D-17 (misma regla que la migración 216 del backend): metadato mínimo completo
    (custodio, fuente, linaje, sistema de coordenadas) + restricción pública -> vigente_publico;
    completo + interna/reservada -> vigente_admin; incompleto -> borrador."""
    completo = all(str(v or '').strip() for v in (
        c.get('responsable'), c.get('Fuente'), c.get('Linaje'), c.get('metadatos_extra.sistema_coordenadas')))
    if not completo:
        return 'borrador'
    return 'vigente_publico' if str(c.get('metadatos_uso') or '').strip().lower() in ('pública', 'publica') else 'vigente_admin'


def capas(clasif_por_capa):
    base = {c['id']: c for c in hoja('capa', TABLAS)}  # en SESIM_tablas el id de capa es el UUID (= uuid_legado)
    filas = []
    for c in hoja('capa'):
        b = base.get(c['uuid_legado'], {})
        categoria = CATEGORIA[c['categoria']]
        grupos = []
        for g in (c.get('grupos') or '').split('|'):
            partes = [p.strip() for p in g.split('›')]
            if not partes[0]:
                continue
            grupos.append({'categoria': partes[0], 'grupo': partes[1] if len(partes) > 1 else GRUPO_MAPA_BASE.get(c['nomenclatura'])})
        filas.append({
            'id': c['id'],
            'uuid_legado': c['uuid_legado'],
            'titulo': c['titulo'],
            'proposito': b.get('proposito'),
            'categoria': categoria,
            'tipo_geometria': c['tipo_geometria'],
            'geom': GEOM.get(c['tipo_geometria'], 'unknown'),
            'estatus': estatus_d17(c),
            # R05: las capas de Diagnóstico y Estrategia se sustentan en la EEMSV;
            # las de Mapa Base no tienen instrumento (decisión del documento v2.2).
            'id_instrumento': 'Eemsv01' if categoria in ('diagnostico', 'estrategia') else None,
            'responsable': c.get('responsable'),
            'conjunto_datos': c.get('conjunto_datos'),
            'archivo': c['archivo'],
            'nomenclatura': c['nomenclatura'],
            'grupos': c.get('grupos'),
            'grupos_lista': grupos,
            'n_elementos': c['n_elementos'],
            'geojson': f"{URL_CAPAS}/{c['id']}.geojson",
            'clases': list((clasif_por_capa.get(c['id']) or {}).keys())[:60],
            'metadatos_extra': {
                'contacto_custodio': c.get('Contacto_custodio'),
                'fuente_origen': c.get('Fuente'),
                'linaje': c.get('Linaje'),
                'escala_nominal': c.get('metadatos_extra.escala_nominal'),
                'denominador_escala': c.get('metadatos_extra.denominador_escala'),
                'sistema_coordenadas': c.get('metadatos_extra.sistema_coordenadas'),
                'fecha_corte': c.get('metadatos_extra.fecha_corte'),
                'periodicidad': c.get('metadatos_extra.periodicidad'),
                'restriccion_uso': c.get('metadatos_uso'),
            },
        })
    return filas


def cruce_capa_municipio(unidades):
    """F08 · v_capa_por_municipio precalculada: elementos de cada capa por municipio."""
    df = pd.read_excel(OPERATIVO, sheet_name='cruce_capa_municipio', dtype=object)
    df = df[df['ID capa'].notna()]
    por_nombre = {f"{u['nom_mun']} ({u['id']})": u['id'] for u in unidades if u['nivel'] == 'municipio'}
    filas = []
    for r in df.to_dict('records'):
        for col, id_unidad in por_nombre.items():
            n = limpio(r.get(col))
            if isinstance(n, (int, float)) and n:
                filas.append({'id_capa': r['ID capa'], 'id_unidad': id_unidad, 'n_elementos': int(n)})
        fuera = limpio(r.get('Fuera de Campeche'))
        if isinstance(fuera, (int, float)) and fuera:
            filas.append({'id_capa': r['ID capa'], 'id_unidad': None, 'n_elementos': int(fuera)})
    return filas


# ----------------------------------------------------------------- simbología
def simbologia_legado():
    """Todas las entradas viejas: (categoria, eje, id_viejo, archivo, simbologia|None)."""
    out = []
    pares = [('mapa_base', None, LEGADO / 'MapaBase' / 'manifest.json', LEGADO / 'MapaBase' / 'simbologia.json'),
             ('diagnostico', None, LEGADO / 'Diagnostico' / 'manifest.json', LEGADO / 'Diagnostico' / 'simbologia.json')]
    pares += [('estrategia', n, LEGADO / 'EjesEstrategicos' / f'Eje_{n}_manifest.json',
               LEGADO / 'EjesEstrategicos' / f'Eje_{n}_simbologia.json') for n in range(1, 6)]
    for cat, eje, man, sim in pares:
        manifest = json.load(open(man, encoding='utf-8'))
        simbs = json.load(open(sim, encoding='utf-8')) if sim.exists() else {}
        for m in manifest:
            out.append({'categoria': cat, 'eje': eje, 'id': m['id'], 'archivo': m['archivo'],
                        'simbologia': simbs.get(m['id']) if m.get('tieneSimbologia', True) else None})
        # Simbologías que existían en el volcado pero cuya capa no estaba en el
        # árbol del geovisor anterior (p. ej. corrientes de agua): también sirven.
        en_manifest = {m['id'] for m in manifest}
        for llave, s in simbs.items():
            if llave not in en_manifest:
                out.append({'categoria': cat, 'eje': eje, 'id': llave, 'archivo': llave, 'simbologia': s})
    return out


def llaves_legado(archivo):
    k = norm(archivo)
    k = re.sub(r'^(1det|2tpp|3movact|4segvial|5gen)_', '', k)
    k = re.sub(r'_sesim_\d{4}$', '', k)
    k2 = re.sub(r'^c\d\d_(?=(c\d|0|1))', '', k)
    return {k, k2}


def a_clasif(simb):
    """Reescribe la simbología para que clasifique por `clasif` (= etiqueta de la clase)."""
    s = copy.deepcopy(simb)
    if s.get('tipo') == 'categorizedSymbol':
        s['campo'] = 'clasif'
        for c in s.get('categorias', []):
            et = str(c.get('etiqueta') or '').strip()
            if et in ('', '<all other values>'):
                c['etiqueta'], c['valor'] = '', ''
            else:
                c['valor'] = et
    elif s.get('tipo') == 'ruleRenderer':
        for r in s.get('reglas', []):
            if r.get('catch_all'):
                continue
            r['campo'] = 'clasif'
            r['valor'] = str(r.get('etiqueta') or '').strip()
    return s


def clases_de(s):
    if s.get('tipo') == 'categorizedSymbol':
        return {c['valor'] for c in s['categorias'] if c.get('etiqueta')}, any(not c.get('etiqueta') for c in s['categorias'])
    if s.get('tipo') == 'ruleRenderer':
        return {r['valor'] for r in s['reglas'] if not r.get('catch_all')}, any(r.get('catch_all') for r in s['reglas'])
    return None, True


def cobertura(s, conteo):
    total = sum(conteo.values()) or 1
    clases, catch_all = clases_de(s)
    if clases is None:
        return 1.0, 1.0
    exactos = sum(n for v, n in conteo.items() if v in clases)
    return round((total if catch_all else exactos) / total, 3), round(exactos / total, 3)


def simbologia(lista_capas, clasif_por_capa):
    legado = simbologia_legado()
    salida, reporte = {}, []
    for c in lista_capas:
        eje = None
        for g in c['grupos_lista']:
            m = re.match(r'Eje (\d)', g.get('grupo') or '')
            if m:
                eje = int(m.group(1))
                break
        llave = norm(c['archivo'])
        cands = [l for l in legado if llave in llaves_legado(l['archivo']) and l['simbologia']]
        mismos = [l for l in cands if l['categoria'] == c['categoria'] and (eje is None or l['eje'] in (None, eje))]
        cands = mismos or cands
        conteo = clasif_por_capa.get(c['id'], {})
        mejor, mejor_cob = None, (-1, -1)
        for l in cands:
            s = a_clasif(l['simbologia'])
            cob = cobertura(s, conteo)
            if cob[1] > mejor_cob[1]:
                mejor, mejor_cob, origen = s, cob, l['id']
        if mejor is not None:
            mejor['origen_legado'] = origen
            # cobertura_clasif: fracción de elementos que reciben símbolo (incluye la
            # clase «todos los otros valores»); cobertura_exacta: los que caen en
            # una clase con nombre. El front usa la primera para decidir.
            mejor['cobertura_clasif'] = mejor_cob[0]
            mejor['cobertura_exacta'] = mejor_cob[1]
            salida[c['id']] = mejor
        reporte.append({'id_capa': c['id'], 'archivo': c['archivo'], 'origen_legado': mejor and origen,
                        'tipo': mejor and mejor.get('tipo'), 'cobertura_exacta': mejor_cob[1] if mejor else None,
                        'clases_sin_simbolo': [v for v in conteo if mejor and clases_de(mejor)[0] is not None and v not in clases_de(mejor)[0]][:10]})
        c['tiene_simbologia'] = mejor is not None
    return salida, reporte


# ----------------------------------------------------------------------- main
def main():
    clasif_por_capa = {}
    ruta_clasif = SALIDA / 'clasif_por_capa.json'
    if ruta_clasif.exists():
        clasif_por_capa = json.load(open(ruta_clasif, encoding='utf-8'))
    else:
        print('Aviso: falta salida/clasif_por_capa.json (correr 02_aligerar_capas.py primero).')

    print(f'Origen: {ORIGEN}')
    conteos = {}
    unidades = hoja('unidad_territorial')
    # Los catálogos de indicadores (indicador, eje_tematico, sector, fuente_informacion,
    # instrumento_origen, matriz_instrumento, indicador_instrumento, capa_indicador) YA NO se exportan:
    # el front los lee en vivo de Supabase (api.*). Aquí solo quedan las tablas aún estáticas.
    conteos['perfil'] = escribir('perfil', hoja('perfil'))
    conteos['unidad_territorial'] = escribir('unidad_territorial', unidades)
    conteos['v_capa_por_municipio'] = escribir('v_capa_por_municipio', cruce_capa_municipio(unidades))

    lista = capas(clasif_por_capa)
    simb, reporte = simbologia(lista, clasif_por_capa)
    conteos['capa'] = escribir('capa', lista)
    with open(RAIZ / 'public' / 'sesim' / 'simbologia.json', 'w', encoding='utf-8') as f:
        json.dump(simb, f, ensure_ascii=False, separators=(',', ':'))
    SALIDA.mkdir(parents=True, exist_ok=True)
    with open(SALIDA / 'simbologia_reporte.json', 'w', encoding='utf-8') as f:
        json.dump(reporte, f, ensure_ascii=False, indent=1)
    print(f'  simbologia.json            {len(simb):>5} capas con simbología QGIS')

    with open(DESTINO / 'indice.json', 'w', encoding='utf-8') as f:
        json.dump({'generado': datetime.now().isoformat(timespec='seconds'),
                   'origen': 'SESIM_operativo.xlsx (arquitectura de datos v2.2) + SESIM_tablas.xlsx (capa.estatus/proposito)',
                   'conteos': conteos}, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
