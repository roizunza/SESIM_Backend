#!/usr/bin/env python3
"""
Ciclo 9 · Carga de los 490,224 elementos geograficos (core.capa_vector) y de la geometria
de las unidades territoriales (core.unidad_territorial_geom).

Fuentes (las mismas que dieron origen al catalogo ya cargado, nada se inventa):
  · Atributos: hoja `capa_vector` de SESIM_Interno.xlsx, convertida a capa_vector_atributos.csv.gz
    (id, id_capa, id_unidad, id_origen, cve_*, nombre, vigencias y propiedades tematicas en jsonb).
  · Geometria, nombre y `clasif`: los GeoJSON de `data/GEOJSON` (encabezado con `id_capa`).
  El vinculo es el UUID `id` del elemento, que coincide en ambas fuentes.

Uso (en la VM, solo libreria estandar; psql se invoca dentro del contenedor supabase-db):
  python3 cargar_geometrias_ciclo9.py --geojson ~/datos/GEOJSON --atributos ~/datos/capa_vector_atributos.csv.gz --seco
  python3 cargar_geometrias_ciclo9.py ... --capas DIt03          # prueba con una capa
  python3 cargar_geometrias_ciclo9.py ...                         # todas
  python3 cargar_geometrias_ciclo9.py ... --unidades              # geometria de municipios y localidades

Es repetible: cada capa se borra y se vuelve a cargar dentro de su propia transaccion, y se
verifica que el conteo cargado sea igual a core.capa.n_elementos; si no coincide, revierte.
"""
import argparse, csv, gzip, json, os, subprocess, sys, time, collections

CONT = os.environ.get('SESIM_DB_CONTENEDOR', 'supabase-db')
PSQL = ['docker', 'exec', '-i', CONT, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-X']


def psql_sql(sql):
    r = subprocess.run(PSQL + ['-At', '-F', '\t', '-c', sql], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit('psql: ' + r.stderr.strip())
    return [l.split('\t') for l in r.stdout.strip().split('\n') if l]


def esc(v):
    if v is None or v == '':
        return r'\N'
    return str(v).replace('\\', '\\\\').replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')


def leer_atributos(ruta):
    d = {}
    with gzip.open(ruta, 'rt', encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            d[r['id']] = r
    return d


def archivos_geojson(raiz):
    for base, dirs, files in os.walk(raiz):
        if os.path.basename(base) == 'unidad_territorial':
            continue
        for n in sorted(files):
            if n.lower().endswith('.geojson'):
                yield os.path.join(base, n)


def leer_capa(ruta):
    with open(ruta, 'r', encoding='utf-8') as f:
        d = json.load(f)
    return d.get('id_capa'), d.get('features', [])


def indexar(raiz, n_esperado):
    """id_capa -> archivo. Si una capa aparece en varios archivos, se queda el que cuadra con n_elementos."""
    idx, avisos = collections.defaultdict(list), []
    for ruta in archivos_geojson(raiz):
        idc, feats = leer_capa(ruta)
        if not idc:
            avisos.append(f'SIN id_capa en el encabezado: {ruta}')
            continue
        idx[idc].append((ruta, len(feats)))
    elegido = {}
    for idc, lst in idx.items():
        buenos = [x for x in lst if x[1] == n_esperado.get(idc)]
        if len(lst) > 1:
            avisos.append(f'{idc} aparece en {len(lst)} archivos: ' + '; '.join(f'{os.path.basename(a)}={n}' for a, n in lst))
        elegido[idc] = (buenos or lst)[0][0]
    return elegido, avisos


COLS = ('id', 'id_capa', 'id_unidad', 'id_origen', 'cve_ent', 'cve_mun', 'cve_loc', 'nombre', 'clasif', 'vig_desde', 'vig_hasta', 'propiedades', 'geom_json')


def tsv_capa(idc, ruta, attrs):
    """Devuelve (lineas, faltantes, otros) para una capa."""
    _, feats = leer_capa(ruta)
    out, falt, otra = [], [], []
    for ft in feats:
        p = ft.get('properties') or {}
        fid = p.get('id')
        a = attrs.get(fid)
        if a is None:
            falt.append(fid)
            continue
        if a['id_capa'] != idc:
            otra.append((fid, a['id_capa']))
            continue
        geom = ft.get('geometry')
        out.append('\t'.join([
            esc(fid), esc(idc), esc(a['id_unidad']), esc(a['id_origen']), esc(a['cve_ent']), esc(a['cve_mun']), esc(a['cve_loc']),
            esc(a['nombre'] or p.get('nombre')), esc(p.get('clasif')), esc(a['vig_desde']), esc(a['vig_hasta']),
            esc(a['propiedades'] or '{}'), esc(json.dumps(geom, separators=(',', ':')) if geom else None),
        ]))
    return out, falt, otra


def sql_capa(idc, lineas, n_esperado):
    return (
        'begin;\n'
        f"delete from core.capa_vector where id_capa = '{idc}';\n"
        'create function pg_temp.reparar(g geometry, d int) returns geometry language sql as $f$ '
        'select case when geometrytype(v) = \'GEOMETRYCOLLECTION\' then st_collectionextract(v, d) else v end '
        'from (select case when st_isvalid(g) then g else st_makevalid(g) end v) s $f$;\n'
        'create temp table _cv (id uuid, id_capa text, id_unidad text, id_origen text, cve_ent text, cve_mun text, cve_loc text, '
        'nombre text, clasif text, vig_desde date, vig_hasta date, propiedades jsonb, geom_json text) on commit drop;\n'
        'copy _cv from stdin;\n' + '\n'.join(lineas) + '\n\\.\n'
        'insert into core.capa_vector (id, id_capa, id_unidad, id_origen, cve_ent, cve_mun, cve_loc, nombre, clasif, vig_desde, vig_hasta, propiedades, geom)\n'
        'select id, id_capa, id_unidad, id_origen, cve_ent, cve_mun, cve_loc, nombre, clasif, vig_desde, vig_hasta, propiedades,\n'
        "  case when geom_json is null then null else pg_temp.reparar(st_setsrid(st_geomfromgeojson(geom_json), 4326), "
        f"(select case tipo_geometria when 'Punto' then 1 when 'Línea' then 2 else 3 end from core.capa where id = '{idc}')) end\n"
        'from _cv;\n'
        'do $$ declare n int; begin\n'
        f"  select count(*) into n from core.capa_vector where id_capa = '{idc}';\n"
        f"  if n <> {n_esperado} then raise exception 'Conteo de {idc}: % cargados, % esperados', n, {n_esperado}; end if;\n"
        'end $$;\n'
        'commit;\n'
    )


def cargar_capas(args):
    n_esperado = {i: int(n) for i, n in psql_sql('select id, n_elementos from core.capa order by id')}
    print(f'Catalogo: {len(n_esperado)} capas, {sum(n_esperado.values()):,} elementos esperados')
    attrs = leer_atributos(args.atributos)
    print(f'Atributos: {len(attrs):,} filas')
    elegido, avisos = indexar(os.path.expanduser(args.geojson), n_esperado)
    for a in avisos:
        print('AVISO', a)
    sin_archivo = sorted(set(n_esperado) - set(elegido))
    if sin_archivo:
        print('ERROR capas del catalogo SIN archivo GeoJSON:', ', '.join(sin_archivo))
    extra = sorted(set(elegido) - set(n_esperado))
    if extra:
        print('AVISO archivos de capas que no estan en el catalogo (se omiten):', ', '.join(extra))
    objetivo = args.capas or sorted(set(n_esperado) & set(elegido))
    total, errores = 0, 0
    t0 = time.time()
    for idc in objetivo:
        if idc not in elegido:
            print(f'  {idc}: sin archivo'); errores += 1; continue
        lineas, falt, otra = tsv_capa(idc, elegido[idc], attrs)
        estado = 'OK'
        if falt or otra or len(lineas) != n_esperado[idc]:
            estado = f'REVISAR (sin atributos: {len(falt)}, de otra capa: {len(otra)}, listos {len(lineas)} de {n_esperado[idc]})'
            errores += 1
        print(f'  {idc:<12} {len(lineas):>7,} / {n_esperado[idc]:>7,}  {estado}')
        if estado != 'OK' or args.seco:
            continue
        r = subprocess.run(PSQL, input=sql_capa(idc, lineas, n_esperado[idc]), capture_output=True, text=True)
        if r.returncode:
            print('    ERROR al cargar:', r.stderr.strip()[:400]); errores += 1
        else:
            total += len(lineas)
    print(f'\nCargados {total:,} elementos en {time.time() - t0:.0f} s; capas con problema: {errores}')
    if not args.seco and total:
        subprocess.run(PSQL + ['-c', 'analyze core.capa_vector'])
    return errores


def cargar_unidades(args):
    """Municipios (MultiPolygon) y localidades con poligono. Las localidades puntuales no caben en
    unidad_territorial_geom (MultiPolygon) y se omiten; el catalogo de localidades no cambia."""
    carpeta = None
    for base, _, files in os.walk(os.path.expanduser(args.geojson)):
        if os.path.basename(base) == 'unidad_territorial':
            carpeta = base
    if not carpeta:
        raise SystemExit('No encontre la carpeta unidad_territorial dentro de --geojson')
    filas, omitidas = [], 0
    for n in sorted(os.listdir(carpeta)):
        if not n.lower().endswith('.geojson'):
            continue
        with open(os.path.join(carpeta, n), encoding='utf-8') as f:
            for ft in json.load(f)['features']:
                g = ft.get('geometry')
                if g and g['type'] in ('Polygon', 'MultiPolygon'):
                    filas.append(esc(ft['properties']['id']) + '\t' + esc(json.dumps(g, separators=(',', ':'))))
                else:
                    omitidas += 1
    print(f'Unidades con poligono: {len(filas):,}; omitidas por ser puntos: {omitidas:,}')
    if args.seco:
        return 0
    sql = (
        'begin;\ncreate temp table _ug (id text, geom_json text) on commit drop;\ncopy _ug from stdin;\n' + '\n'.join(filas) + '\n\\.\n'
        'delete from core.unidad_territorial_geom;\n'
        'insert into core.unidad_territorial_geom (id_unidad, geom)\n'
        'select u.id, st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(_ug.geom_json), 4326)), 3))\n'
        'from _ug join core.unidad_territorial u on u.id = _ug.id;\ncommit;\n'
    )
    r = subprocess.run(PSQL, input=sql, capture_output=True, text=True)
    if r.returncode:
        print('ERROR:', r.stderr.strip()[:500]); return 1
    print('unidad_territorial_geom:', psql_sql('select count(*) from core.unidad_territorial_geom')[0][0], 'filas')
    return 0


def verificar(capas=None):
    print('\nVerificacion en la base')
    filtro = ('where c.id in (' + ','.join("'" + x + "'" for x in capas) + ') ') if capas else ''
    for fila in psql_sql(
        "select c.id, c.n_elementos, count(v.id), count(*) filter (where v.geom is null), "
        "count(*) filter (where v.geom is not null and not st_isvalid(v.geom)), "
        "string_agg(distinct st_geometrytype(v.geom), ',') "
        "from core.capa c left join core.capa_vector v on v.id_capa = c.id " + filtro + "group by c.id, c.n_elementos "
        "having count(v.id) <> c.n_elementos or count(*) filter (where v.geom is null) > 0 order by 1"):
        print('  DIFERENCIA', fila)
    print('  total:', psql_sql('select count(*) from core.capa_vector')[0][0], 'elementos')
    print('  extension (lon/lat):', psql_sql('select st_extent(geom)::text from core.capa_vector')[0][0])


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--geojson', required=True)
    ap.add_argument('--atributos', default='capa_vector_atributos.csv.gz')
    ap.add_argument('--capas', nargs='*')
    ap.add_argument('--seco', action='store_true', help='solo revisa, no escribe en la base')
    ap.add_argument('--unidades', action='store_true')
    a = ap.parse_args()
    if a.unidades:
        sys.exit(cargar_unidades(a))
    e = cargar_capas(a)
    if not a.seco:
        verificar(a.capas)
    sys.exit(1 if e else 0)
