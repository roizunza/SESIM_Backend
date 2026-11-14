#!/usr/bin/env python3
"""ER-6 -- Inventario y carga de los PDF del catalogo de instrumentos normativos.

Une cada archivo con su clave DOC-xxxx (mapa_clave_archivo.json), calcula huella SHA-256, bytes, paginas y si tiene
texto seleccionable, comprueba la concordancia nombre <-> clave <-> ficha y, si se pide, sube el archivo al bucket
publico `instrumentos` con el nombre canonico  <clave>/<clave>_<v|c><NN>_<sha16>.pdf  y escribe el SQL que lo
registra en la base (core.registrar_documento_carga_inicial).

Solo usa la biblioteca estandar. Sin comandos de borrado: nunca elimina ni sobrescribe nada.

  1) Inventario (no toca el servidor):
       python3 scripts/instrumentos/cargar_pdfs.py inventario --carpeta "<ruta>/Catalogo_Instrumentos"
     genera  salida/manifiesto.json, salida/concordancia.txt, salida/registro.sql y salida/verificacion.sql
     (termina con error y NO genera los .sql si algo no concuerda).
  2) Subida (en la VM, con la llave de servicio en el entorno):
       export SUPABASE_URL=http://localhost:8000     # la URL del API del stack
       export SERVICE_ROLE_KEY=...                   # NO se guarda en ningun archivo
       python3 scripts/instrumentos/cargar_pdfs.py cargar --carpeta "<ruta>"
     sube lo que falta (si el objeto ya esta con el mismo tamano, lo da por bueno) y escribe salida/registro.sql.
  3) Registro:  psql ... -v ON_ERROR_STOP=1 -f scripts/instrumentos/salida/registro.sql
  4) Verificacion:  python3 scripts/instrumentos/cargar_pdfs.py verificar   (genera salida/verificacion.sql para correr con psql)
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, unicodedata, urllib.request, urllib.error, urllib.parse

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, 'salida')
MAPA = os.path.join(AQUI, 'mapa_clave_archivo.json')
FICHAS = os.path.normpath(os.path.join(AQUI, '..', '..', 'front', 'public', 'sesim', 'catalogo', 'instrumento_normativo.json'))
MAX_BYTES = 209715200  # 200 MB, igual que core.instrumento_max_bytes()
CLAVE = re.compile(r'^DOC-[EFMN][0-9]{3}$')


def nfc(s):
    return unicodedata.normalize('NFC', s)


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, 'rb') as f:
        for bloque in iter(lambda: f.read(1 << 20), b''):
            h.update(bloque)
    return h.hexdigest()


def paginas_y_texto(ruta):
    """(paginas, texto_seleccionable) con pdfinfo/pdftotext si existen; None si no se puede saber."""
    pag = txt = None
    if shutil.which('pdfinfo'):
        try:
            out = subprocess.run(['pdfinfo', ruta], capture_output=True, text=True, timeout=120).stdout
            m = re.search(r'^Pages:\s+(\d+)', out, re.M)
            pag = int(m.group(1)) if m else None
        except Exception:
            pass
    if shutil.which('pdftotext'):
        try:
            out = subprocess.run(['pdftotext', '-l', '5', ruta, '-'], capture_output=True, text=True, timeout=120).stdout
            txt = len(re.sub(r'\s+', '', out)) > 200
        except Exception:
            pass
    return pag, txt


def nombre_canonico(clave, rol, version, h):
    return f"{clave}/{clave}_{'v' if rol == 'principal' else 'c'}{version:02d}_{h[:16]}.pdf"


def cargar_mapa():
    with open(MAPA, encoding='utf-8') as f:
        return json.load(f)


def cargar_fichas():
    if not os.path.exists(FICHAS):
        return None
    with open(FICHAS, encoding='utf-8') as f:
        return {x['id']: x for x in json.load(f)}


def indexar_carpeta(carpeta):
    """nombre normalizado (NFC) -> nombre real; evita fallas por acentos (Windows/macOS/Linux)."""
    return {nfc(n): n for n in os.listdir(carpeta) if n.lower().endswith('.pdf')}


def inventario(carpeta):
    mapa = cargar_mapa()
    fichas = cargar_fichas()
    idx = indexar_carpeta(carpeta)
    problemas, items, vistos = [], [], {}
    usados = set()
    for d in mapa['documentos']:
        clave, rol, archivo = d['clave'], d['rol'], nfc(d['archivo'])
        if not CLAVE.match(clave):
            problemas.append(f'{clave}: clave con formato invalido'); continue
        if fichas is not None and clave not in fichas:
            problemas.append(f'{clave}: no existe en el catalogo de fichas'); continue
        real = idx.get(archivo)
        if not real:
            problemas.append(f'{clave} ({rol}): no esta el archivo "{d["archivo"]}" en la carpeta'); continue
        usados.add(archivo)
        ruta = os.path.join(carpeta, real)
        with open(ruta, 'rb') as f:
            cab = f.read(5)
        if cab != b'%PDF-':
            problemas.append(f'{clave}: "{real}" no empieza con %PDF-'); continue
        tam = os.path.getsize(ruta)
        if tam < 1 or tam > MAX_BYTES:
            problemas.append(f'{clave}: "{real}" pesa {tam} bytes (limite {MAX_BYTES})'); continue
        h = sha256(ruta)
        if h in vistos:
            problemas.append(f'{clave}: "{real}" es identico (SHA-256) al de {vistos[h]}'); continue
        vistos[h] = f'{clave} ({rol})'
        pag, txt = paginas_y_texto(ruta)
        items.append({'clave': clave, 'nombre_ficha': fichas[clave]['nombre'] if fichas else None, 'rol': rol, 'archivo': real,
                      'sha256': h, 'bytes': tam, 'paginas': pag, 'texto_seleccionable': txt,
                      'objeto': nombre_canonico(clave, rol, 1, h)})
    # cada clave del catalogo debe tener su principal; cada PDF de la carpeta debe estar explicado
    claves_con_principal = {i['clave'] for i in items if i['rol'] == 'principal'}
    if fichas is not None:
        for c in sorted(fichas):
            if c not in claves_con_principal:
                problemas.append(f'{c}: la ficha no tiene PDF principal en la carpeta')
    explicados = usados | {nfc(x['archivo']) for x in mapa.get('duplicados_conocidos', [])} | {nfc(x) for x in mapa.get('no_son_instrumentos', [])}
    for n in sorted(idx):
        if n not in explicados:
            problemas.append(f'archivo sin clave: "{idx[n]}" (agregalo al mapa o a duplicados/no_son_instrumentos)')
    for dup in mapa.get('duplicados_conocidos', []):
        a, b = nfc(dup['archivo']), nfc(dup['mismo_que'])
        if a in idx and b in idx:
            if sha256(os.path.join(carpeta, idx[a])) != sha256(os.path.join(carpeta, idx[b])):
                problemas.append(f'duplicado declarado pero NO identico: "{dup["archivo"]}" vs "{dup["mismo_que"]}"')
    return items, problemas


def escribir_inventario(items, problemas):
    os.makedirs(SALIDA, exist_ok=True)
    with open(os.path.join(SALIDA, 'manifiesto.json'), 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    lineas = ['CONCORDANCIA clave <-> archivo <-> objeto en el bucket', '']
    for i in sorted(items, key=lambda x: (x['clave'], x['rol'])):
        lineas.append(f"{i['clave']} {i['rol']:<11} {i['bytes']:>12} B  {str(i['paginas'] or '?'):>5} pag  txt={i['texto_seleccionable']}  {i['archivo']}")
        lineas.append(f"    -> instrumentos/{i['objeto']}")
    lineas += ['', f'{len(items)} documentos; problemas: {len(problemas)}'] + [f'  ! {p}' for p in problemas]
    with open(os.path.join(SALIDA, 'concordancia.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lineas) + '\n')
    print('\n'.join(lineas[-(len(problemas) + 2):]))


def sql_texto(s):
    return "'" + s.replace("'", "''") + "'"


def subir(url_base, llave, item, carpeta):
    idx = indexar_carpeta(carpeta)
    ruta = os.path.join(carpeta, idx[nfc(item['archivo'])])
    destino = f"{url_base.rstrip('/')}/storage/v1/object/instrumentos/{urllib.parse.quote(item['objeto'])}"
    # primero: ¿ya esta? (HEAD al publico; el bucket es publico)
    try:
        req = urllib.request.Request(f"{url_base.rstrip('/')}/storage/v1/object/public/instrumentos/{urllib.parse.quote(item['objeto'])}", method='HEAD')
        with urllib.request.urlopen(req, timeout=60) as r:
            if int(r.headers.get('Content-Length', -1)) == item['bytes']:
                return 'ya estaba'
    except urllib.error.HTTPError:
        pass
    except Exception:
        pass
    with open(ruta, 'rb') as f:
        req = urllib.request.Request(destino, data=f, method='POST', headers={
            'Authorization': f'Bearer {llave}', 'apikey': llave, 'Content-Type': 'application/pdf',
            'Content-Length': str(item['bytes']), 'x-upsert': 'false'})
        try:
            with urllib.request.urlopen(req, timeout=3600) as r:
                r.read()
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode('utf-8', 'replace')[:300]
            if e.code in (400, 409) and 'exist' in cuerpo.lower():
                return 'ya estaba'
            raise SystemExit(f'ERROR {e.code} al subir {item["objeto"]}: {cuerpo}\n'
                             '  (413 = el limite global de Storage o nginx es menor al tamano del archivo; ver docs/er6-catalogo-instrumentos-cambios-er.md)')
    return 'subido'


def escribir_registro(items):
    ls = ['-- Generado por cargar_pdfs.py: registra los PDF ya subidos al bucket `instrumentos`.',
          '-- Se corre con el rol dueño (sin sesion de usuario). Es seguro repetirlo: lo ya registrado se omite.',
          'begin;']
    for i in sorted(items, key=lambda x: (x['clave'], 0 if x['rol'] == 'principal' else 1)):
        pag = 'null' if i['paginas'] is None else str(i['paginas'])
        txt = 'null' if i['texto_seleccionable'] is None else ('true' if i['texto_seleccionable'] else 'false')
        ls.append(f"select case when exists (select 1 from core.documento_instrumento where id_instrumento = {sql_texto(i['clave'])} and hash_archivo = {sql_texto(i['sha256'])})\n"
                  f"  then jsonb_build_object('omitido', {sql_texto(i['clave'])}) else core.registrar_documento_carga_inicial({sql_texto(i['clave'])}, {sql_texto(i['rol'])}, {sql_texto(i['sha256'])}, {i['bytes']}, {pag}, {txt}) end;")
    ls.append('commit;')
    with open(os.path.join(SALIDA, 'registro.sql'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(ls) + '\n')


def escribir_verificacion(items):
    vals = ',\n  '.join(f"({sql_texto(i['clave'])}, {sql_texto(i['rol'])}, {sql_texto(i['sha256'])}, {i['bytes']})" for i in items)
    sql = f"""-- Generado por cargar_pdfs.py: compara el manifiesto contra la base. Debe devolver 0 filas en las dos consultas de problemas.
with m(clave, rol, sha256, bytes) as (values
  {vals})
select 'FALTA EN LA BASE' as problema, m.clave, m.rol from m
 where not exists (select 1 from core.documento_instrumento d where d.id_instrumento = m.clave and d.rol = m.rol and d.vigente
                     and d.hash_archivo = m.sha256 and d.bytes = m.bytes)
union all
select 'CLAVE Y RUTA NO CONCUERDAN', d.id_instrumento, d.ruta from core.documento_instrumento d
 where d.ruta <> 'instrumentos/' || core.nombre_documento_instrumento(d.id_instrumento, d.rol, d.version, d.hash_archivo)
union all
select 'FICHA SIN PDF PRINCIPAL', n.id, n.nombre from core.instrumento_normativo n
 where not exists (select 1 from core.documento_instrumento d where d.id_instrumento = n.id and d.rol = 'principal' and d.vigente);
select count(*) as documentos_vigentes, count(*) filter (where rol = 'principal') as principales from core.documento_instrumento where vigente;
"""
    with open(os.path.join(SALIDA, 'verificacion.sql'), 'w', encoding='utf-8') as f:
        f.write(sql)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('modo', choices=['inventario', 'cargar', 'verificar'])
    ap.add_argument('--carpeta', help='carpeta con los PDF (Catalogo_Instrumentos)')
    a = ap.parse_args()
    if a.modo == 'verificar':
        with open(os.path.join(SALIDA, 'manifiesto.json'), encoding='utf-8') as f:
            escribir_verificacion(json.load(f))
        print('Escrito salida/verificacion.sql'); return
    if not a.carpeta or not os.path.isdir(a.carpeta):
        sys.exit('Indica --carpeta con la ruta de Catalogo_Instrumentos')
    items, problemas = inventario(a.carpeta)
    escribir_inventario(items, problemas)
    if problemas:
        sys.exit('Hay problemas de concordancia: corrigelos antes de subir nada.')
    escribir_registro(items)
    escribir_verificacion(items)
    if a.modo == 'cargar':
        url, llave = os.environ.get('SUPABASE_URL'), os.environ.get('SERVICE_ROLE_KEY')
        if not url or not llave:
            sys.exit('Faltan SUPABASE_URL y SERVICE_ROLE_KEY en el entorno.')
        for n, i in enumerate(sorted(items, key=lambda x: (x['clave'], x['rol'])), 1):
            print(f"[{n}/{len(items)}] {i['objeto']} ... ", end='', flush=True)
            print(subir(url, llave, i, a.carpeta))
        print('Listo: subidos. Siguiente: psql ... -f scripts/instrumentos/salida/registro.sql y luego salida/verificacion.sql')


if __name__ == '__main__':
    main()
