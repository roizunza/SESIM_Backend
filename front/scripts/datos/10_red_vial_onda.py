#!/usr/bin/env python3
"""
Calcula CUÁNDO «llega la luz» a cada tramo de la red vial de la portada, para la animación en la que las vialidades se encienden
desde las localidades urbanas mayores hasta encontrarse (MapaHeroVivo.jsx). Se hornea una vez; el navegador solo avanza un reloj.

Entradas : public/sesim/hero/red_vial.json  (a = primaria, b = secundaria, c = local)
           public/sesim/hero/localidades.json (scripts/datos/09_hornear_relieve_hero.py)
Salida   : public/sesim/hero/red_vial_onda.json
           FeatureCollection de tramos de 2 puntos: id numérico, c = categoría, s = km de recorrido (por la red) desde la localidad
           semilla más cercana en el que se enciende ese tramo. «tmax» = el mayor s.

Método: grafo con los vértices (redondeados a ~11 m); se unen los nodos a menos de 0.8 km (la red de origen viene en piezas sueltas) y las
piezas que aun así quedan aisladas se puentean a la más cercana con coste 1.5x la distancia; Dijkstra multifuente desde las SEMILLAS
localidades urbanas de mayor área.
Requiere: numpy, scipy.   Uso: python3 scripts/datos/10_red_vial_onda.py
"""
import json, math, heapq
import numpy as np
from scipy.spatial import cKDTree

HERO = 'public/sesim/hero/'
SEMILLAS = 13        # localidades urbanas de mayor área
TOL_UNIR_KM = 0.8
def km(a, b):
    dx = (b[0] - a[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2)); dy = (b[1] - a[1]) * 110.57
    return math.hypot(dx, dy)

red = json.load(open(HERO + 'red_vial.json'))
loc = json.load(open(HERO + 'localidades.json'))['features']
nodos, xy, adj, segs = {}, [], [], []
def nid(p):
    k = (round(p[0], 4), round(p[1], 4))
    if k not in nodos: nodos[k] = len(xy); xy.append(k); adj.append([])
    return nodos[k]
for cat in 'abc':
    for ln in red[cat]:
        prev = None
        for p in ln:
            n = nid(p)
            if prev is not None and prev != n:
                d = km(xy[prev], xy[n]); adj[prev].append((n, d)); adj[n].append((prev, d)); segs.append((prev, n, cat))
            prev = n
XY = np.array(xy)
arbol = cKDTree(np.c_[XY[:, 0] * 0.94, XY[:, 1]])
for u, v in arbol.query_pairs(TOL_UNIR_KM / 111.0):
    d = km(xy[u], xy[v]); adj[u].append((v, d)); adj[v].append((u, d))

def dijkstra(srcs):
    dist = [math.inf] * len(xy); h = []
    for s, d0 in srcs: dist[s] = d0; heapq.heappush(h, (d0, s))
    while h:
        d, u = heapq.heappop(h)
        if d > dist[u]: continue
        for v, w in adj[u]:
            if d + w < dist[v]: dist[v] = d + w; heapq.heappush(h, (d + w, v))
    return dist

urb = sorted([f for f in loc if f['properties']['t'] == 'u'], key=lambda f: -f['properties']['a'])[:SEMILLAS]
semillas = []
for f in urb:
    c = f['geometry']['coordinates']
    semillas.append((int(np.hypot((XY[:, 0] - c[0]) * 0.94, XY[:, 1] - c[1]).argmin()), 0.0))
dist = dijkstra(semillas)
alcanzado = np.array([d < math.inf for d in dist])
comp = [-1] * len(xy); nc = 0
for s in range(len(xy)):
    if comp[s] >= 0: continue
    st = [s]; comp[s] = nc
    while st:
        u = st.pop()
        for v, _ in adj[u]:
            if comp[v] < 0: comp[v] = nc; st.append(v)
    nc += 1
comp = np.array(comp)
arbol_alc = cKDTree(np.c_[XY[alcanzado, 0] * 0.94, XY[alcanzado, 1]]); idx_alc = np.where(alcanzado)[0]
puentes = []
for c in range(nc):
    ids = np.where(comp == c)[0]
    if alcanzado[ids[0]]: continue
    dd, jj = arbol_alc.query(np.c_[XY[ids, 0] * 0.94, XY[ids, 1]])
    k = int(dd.argmin()); puentes.append((int(ids[k]), dist[int(idx_alc[jj[k]])] + float(dd[k]) * 111 * 1.5))
D = np.array(dijkstra(semillas + puentes))
D[~np.isfinite(D)] = D[np.isfinite(D)].max()
feats = []
for i, (u, v, cat) in enumerate(segs):
    s = float(min(D[u], D[v]))
    feats.append({'type': 'Feature', 'id': i, 'properties': {'c': cat, 's': round(s, 1)},
                  'geometry': {'type': 'LineString', 'coordinates': [list(xy[u]), list(xy[v])]}})
feats.sort(key=lambda f: f['properties']['s'])
for i, f in enumerate(feats): f['id'] = i   # el id sigue el orden de encendido
json.dump({'type': 'FeatureCollection', 'tmax': round(float(D.max()), 1), 'features': feats}, open(HERO + 'red_vial_onda.json', 'w'), separators=(',', ':'))
print(f'{len(feats)} tramos, {len(semillas)} semillas, {len(puentes)} puentes, tmax {D.max():.1f} km')
