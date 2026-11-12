#!/usr/bin/env python3
"""
Estadística territorial del Tablero público (respaldo estático).

Calcula, desde los GeoJSON de las capas públicas, las MISMAS agregaciones que la función
`api.tablero_territorio()` (migración 238): por capa, municipio y clase, número de elementos
y kilómetros de línea. Escribe `public/sesim/catalogo/tablero_territorio.json`.

El front usa la base (api.tablero_territorio) y cae a este archivo si la base no responde
(igual que las capas con su GeoJSON de respaldo). Si cambian las capas, se vuelve a correr:

    python3 scripts/datos/05_exportar_tablero_territorio.py

Las capas pesadas (> 25,000 elementos) ya no viven en public/: se leen de
`_to_delete/capas_pesadas_geojson/` si existe (o de la ruta que se pase con --pesadas).
"""
import argparse, collections, datetime, json, math, os, sys

CAPAS = ['DIt06', 'DIt04', 'DTp01', 'DIt02', 'DTc05', 'E4SegVial01', 'E4SegVial02', 'E4SegVial07', 'E4SegVial08', 'E5Gen01', 'E5Gen02', 'E5Gen04']

def km_linea(g):
    if not g: return 0.0
    t = g['type']
    if t == 'LineString': lineas = [g['coordinates']]
    elif t == 'MultiLineString': lineas = g['coordinates']
    else: return 0.0
    s = 0.0
    for l in lineas:
        for (x1, y1), (x2, y2) in zip(l, l[1:]):
            p = math.pi / 180
            a = math.sin((y2 - y1) * p / 2) ** 2 + math.cos(y1 * p) * math.cos(y2 * p) * math.sin((x2 - x1) * p / 2) ** 2
            s += 12742.0176 * math.asin(math.sqrt(a))
    return s

def main():
    ap = argparse.ArgumentParser()
    base = os.path.join(os.path.dirname(__file__), '..', '..')
    ap.add_argument('--capas', default=os.path.join(base, 'public', 'sesim', 'capas'))
    ap.add_argument('--pesadas', default=os.path.join(base, '..', '_to_delete', 'capas_pesadas_geojson'))
    ap.add_argument('--salida', default=os.path.join(base, 'public', 'sesim', 'catalogo', 'tablero_territorio.json'))
    a = ap.parse_args()
    filas = []
    for capa in CAPAS:
        ruta = os.path.join(a.capas, capa + '.geojson')
        if not os.path.exists(ruta): ruta = os.path.join(a.pesadas, capa + '.geojson')
        if not os.path.exists(ruta): sys.exit(f'Falta la capa {capa}')
        acum = collections.defaultdict(lambda: [0, 0.0])
        for f in json.load(open(ruta, encoding='utf-8'))['features']:
            p = f['properties']
            k = (p.get('cve_mun') or '000', p.get('clasif') or '')
            acum[k][0] += 1
            acum[k][1] += km_linea(f['geometry'])
        for (mun, clasif), (n, km) in sorted(acum.items()):
            filas.append({'capa': capa, 'mun': mun, 'clasif': clasif, 'n': n, 'km': round(km, 2)})
    salida = {'generado': datetime.date.today().isoformat(), 'origen': 'archivos GeoJSON de las capas públicas', 'filas': filas}
    json.dump(salida, open(a.salida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(filas)} filas → {os.path.normpath(a.salida)}')

if __name__ == '__main__':
    main()
