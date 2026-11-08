#!/usr/bin/env python3
"""
Ciclo 9 · Paridad entre la base (core.capa_vector) y los GeoJSON que sirve hoy el front.

Por cada capa compara, elemento por elemento (llave `id`):
  · que estén los mismos elementos (faltantes y sobrantes);
  · que id, nombre, clasif, cve_mun e id_unidad sean iguales a los del front;
  · que el tipo de geometria sea el mismo (Polygon = MultiPolygon, etc.);
  · que el cuadro delimitador no difiera mas de --tol grados (el front simplifica hasta 160 m ≈ 0.0015°).
Solo lectura. Uso en la VM:
  python3 paridad_capas_front.py --capas ~/datos/capas_front
"""
import argparse, glob, json, os, subprocess, sys, collections

PSQL = ['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-At', '-F', '\t']
SQL = (
    "copy (select id_capa, id::text, coalesce(nombre,''), coalesce(clasif,''), coalesce(cve_mun,''), "
    "case when cve_mun='000' then '' else '04'||cve_mun end, "
    "replace(geometrytype(geom),'MULTI',''), st_xmin(geom), st_ymin(geom), st_xmax(geom), st_ymax(geom) "
    "from core.capa_vector) to stdout"
)


def bbox(g):
    xs, ys = [], []

    def rec(c):
        if c and isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for k in c:
                rec(k)

    if g.get('type') == 'GeometryCollection':
        for k in g.get('geometries', []):
            rec(k.get('coordinates', []))
    else:
        rec(g.get('coordinates', []))
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def tipo(g):
    return (g.get('type') or '').upper().replace('MULTI', '')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--capas', required=True)
    ap.add_argument('--tol', type=float, default=0.004)
    a = ap.parse_args()

    print('Leyendo la base...')
    r = subprocess.run(PSQL + ['-c', SQL], capture_output=True, text=True)
    if r.returncode:
        sys.exit('psql: ' + r.stderr)
    db = collections.defaultdict(dict)
    for ln in r.stdout.split('\n'):
        if not ln:
            continue
        p = ln.split('\t')
        db[p[0]][p[1]] = p[2:]
    print(f'  {sum(len(v) for v in db.values()):,} elementos en {len(db)} capas')

    total_mal = 0
    print(f"\n{'capa':<12}{'front':>8}{'base':>8}{'faltan':>8}{'sobran':>8}{'props':>7}{'tipo':>6}{'bbox':>6}  veredicto")
    for ruta in sorted(glob.glob(os.path.join(os.path.expanduser(a.capas), '*.geojson'))):
        with open(ruta, encoding='utf-8') as f:
            d = json.load(f)
        idc = d.get('id_capa') or os.path.basename(ruta)[:-8]
        feats = d.get('features', [])
        base = db.get(idc)
        if base is None:
            print(f'{idc:<12}{len(feats):>8}{0:>8}  (la capa no esta en la base)')
            total_mal += 1
            continue
        vistos, mp, mt, mb, maxd, nulos = set(), 0, 0, 0, 0.0, 0
        for ft in feats:
            pr = ft.get('properties') or {}
            fid = pr.get('id')
            vistos.add(fid)
            fila = base.get(fid)
            if fila is None:
                continue
            nombre, clasif, mun, idu, gt, x0, y0, x1, y1 = fila
            if ((pr.get('nombre') or '') != nombre or (pr.get('clasif') or '') != clasif or (pr.get('cve_mun') or '') != mun
                    or (pr.get('id_unidad') or '') != idu):
                mp += 1
            g = ft.get('geometry') or {}
            if not g:
                nulos += 1          # el simplificador del front los dejo sin geometria: caso conocido
            elif tipo(g) != gt and gt and not (g.get('type') == 'GeometryCollection'):
                mt += 1
            b = bbox(g)
            if b and x0:
                dd = max(abs(b[0] - float(x0)), abs(b[1] - float(y0)), abs(b[2] - float(x1)), abs(b[3] - float(y1)))
                maxd = max(maxd, dd)
                if dd > a.tol:
                    mb += 1
        faltan = len(vistos - set(base))
        sobran = len(set(base) - vistos)
        ok = (faltan == 0 and sobran == 0 and mp == 0 and mt == 0 and mb == 0 and len(feats) == len(base))
        if not ok:
            total_mal += 1
        print(f"{idc:<12}{len(feats):>8}{len(base):>8}{faltan:>8}{sobran:>8}{mp:>7}{mt:>6}{mb:>6}  {'OK' if ok else 'REVISAR'} (desv. max {maxd:.5f}°, front sin geometria: {nulos})")
    print(f'\nCapas con diferencias: {total_mal}')
    sys.exit(1 if total_mal else 0)


if __name__ == '__main__':
    main()
