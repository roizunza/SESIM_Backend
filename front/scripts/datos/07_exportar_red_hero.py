"""Red vial jerarquizada para el hero de la landing (mapa en vivo).

Origen (todo real, sin simular): Inf09 (administración: Federal/Estatal/…) y DIt06 (recubrimiento) comparten
geometría por índice. Inf10 (vías de cuota) NO se usa: es nacional y se sale del estado; sus tramos de Campeche
ya vienen como «Federal» en Inf09.
  a = primaria  : Federal
  b = secundaria: Estatal
  c = local     : el resto (caminos de tierra/grava, municipal, particular, sin dato); se omiten tramos
                  urbanos menores a MIN_C_KM, que no se distinguen a escala estatal.
Salida: public/sesim/hero/red_vial.json = {"a":[línea,…],"b":[…],"c":[…]}, línea = [[lon,lat],…] (4 decimales).
Uso (PC local, desde front/):  python scripts/datos/07_exportar_red_hero.py <carpeta_capas_pesadas>
"""
import json, math, sys, os
PESADAS = sys.argv[1]
SALIDA = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'sesim', 'hero', 'red_vial.json')
TOL = {'a': 0.0004, 'b': 0.0006, 'c': 0.0010}   # grados (~45–110 m)
MIN_C_KM = 0.35

def km(cs): return sum(math.hypot((b[0]-a[0])*104, (b[1]-a[1])*111) for a, b in zip(cs, cs[1:]))

def rdp(p, e):
    if len(p) < 3: return p
    (x1, y1), (x2, y2) = p[0], p[-1]; dx, dy = x2-x1, y2-y1; n = math.hypot(dx, dy) or 1e-12
    i, dmax = 0, 0
    for k in range(1, len(p)-1):
        d = abs(dy*(p[k][0]-x1) - dx*(p[k][1]-y1)) / n
        if d > dmax: i, dmax = k, d
    if dmax <= e: return [p[0], p[-1]]
    return rdp(p[:i+1], e)[:-1] + rdp(p[i:], e)

def unir(lineas):
    """Encadena tramos que comparten extremo (reduce miles de segmentos sueltos a líneas largas)."""
    ext = {}
    for i, l in enumerate(lineas):
        ext.setdefault((round(l[0][0], 4), round(l[0][1], 4)), []).append((i, 0))
        ext.setdefault((round(l[-1][0], 4), round(l[-1][1], 4)), []).append((i, 1))
    usada, out = set(), []
    for i, l in enumerate(lineas):
        if i in usada: continue
        usada.add(i); cur = list(l)
        for lado in (1, 0):
            while True:
                fin = cur[-1] if lado == 1 else cur[0]
                sig = [(j, e) for j, e in ext.get((round(fin[0], 4), round(fin[1], 4)), []) if j not in usada]
                if len(sig) != 1: break
                j, e = sig[0]; usada.add(j); s = list(lineas[j])
                if lado == 1: cur += (s[1:] if e == 0 else s[::-1][1:])
                else: cur = (s[:-1] if e == 1 else s[::-1][:-1]) + cur
        out.append(cur)
    return out

A = json.load(open(os.path.join(PESADAS, 'Inf09.geojson')))['features']
D = json.load(open(os.path.join(PESADAS, 'DIt06.geojson')))['features']
cls = {'a': [], 'b': [], 'c': []}
for a, d in zip(A, D):
    g = a['geometry']['coordinates']; t = a['properties']['clasif']
    k = 'a' if t == 'Federal' else 'b' if t == 'Estatal' else 'c'
    if k == 'c' and d['properties']['clasif'] == 'N/A' and km(g) < MIN_C_KM: continue
    cls[k].append(g)
res = {}
for k, ls in cls.items():
    ls = [[[round(x, 4), round(y, 4)] for x, y in rdp(l, TOL[k])] for l in unir(ls)]
    res[k] = [l for l in ls if len(l) > 1]
    print(k, len(ls), sum(len(l) for l in res[k]))
os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
json.dump(res, open(SALIDA, 'w'), separators=(',', ':'))
print(os.path.getsize(SALIDA)//1024, 'KB')
