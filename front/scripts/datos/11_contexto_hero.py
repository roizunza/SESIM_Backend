"""Mapa de contexto del hero: tierra plana (México + Guatemala/Belice) bajo el relieve horneado,
para que Campeche no quede aislado. Usa Lim01 (países vecinos) y Lim02 (estados). Sin DEM, sin límites internos.
Salida: public/sesim/hero/contexto.json (una sola geometría de tierra, EPSG:4326)."""
import json, os
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union
RAIZ = os.path.join(os.path.dirname(__file__), '..', '..')
CAP = os.path.join(RAIZ, 'public', 'sesim', 'capas')
OUT = os.path.join(RAIZ, 'public', 'sesim', 'hero', 'contexto.json')
geoms = []
for n in ('Lim01', 'Lim02'):
    for f in json.load(open(os.path.join(CAP, n + '.geojson'), encoding='utf-8'))['features']:
        g = shape(f['geometry']).buffer(0)
        geoms.append(g)
tierra = unary_union(geoms).intersection(box(-100, 12, -82, 26))
tierra = tierra.buffer(0.004).buffer(-0.004).simplify(0.006, preserve_topology=True)  # cierra costuras entre polígonos
json.dump({'type': 'Feature', 'properties': {}, 'geometry': mapping(tierra)}, open(OUT, 'w'), separators=(',', ':'))
print('contexto.json', round(os.path.getsize(OUT) / 1024), 'KB')
