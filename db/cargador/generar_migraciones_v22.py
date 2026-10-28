#!/usr/bin/env python3
"""Genera las migraciones de DATOS y de COMENTARIOS del modelo v2.2 a partir de SESIM_Interno.xlsx.

El Excel es la fuente de verdad del catalogo oficial; las migraciones generadas son SQL estatico
(209-212) y son lo que se aplica en cada ambiente: el Excel no hace falta en tiempo de ejecucion.

Uso:
    python3 generar_migraciones_v22.py --excel "<ruta>/SESIM_Interno.xlsx" \
        --migraciones ../migrations --reporte ../../docs/carga-v22-reporte.md

Reglas de transformacion (todas quedan en el reporte; no se inventa ningun dato):
  - vacio -> NULL; '2.0' -> 2; 'True'/'False' -> boolean.
  - sector.tipo se deriva del prefijo de la clave (SD-xx definitivo, SO-xx original).
  - indicador.nivel_mir pierde el parentesis explicativo ("Fin (Impacto)" -> "Fin").
  - Un indicador marcado aprobado que no pasa la compuerta (sin tendencia ni meta con cifra) se
    carga como NO aprobado y se lista en el reporte para confirmacion (D-13/D-18).
  - indicador_eje: eje principal (indicador.id_eje) + ejes adicionales tomados de la nota de
    transformacion del propio Excel (14 indicadores multi-eje, 127 vinculos).
  - capa.estatus: solo metadatos_uso = 'publica' pasa a vigente_publico; el resto queda borrador (D-17).
  - capa.id_instrumento = Eemsv01 para capas de Diagnostico y Estrategia; vacio para Mapa Base.
"""
import argparse, csv, json, os, re, sys, collections, datetime
import openpyxl

ap = argparse.ArgumentParser()
ap.add_argument("--excel", required=True)
ap.add_argument("--migraciones", required=True)
ap.add_argument("--reporte", required=True)
a = ap.parse_args()

wb = openpyxl.load_workbook(a.excel, read_only=True, data_only=True)

def hoja(nombre, limite=None):
    ws = wb[nombre]
    filas = []
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if limite and i > limite:
            break
        filas.append(r)
    h = [str(c).strip() if c is not None else "" for c in filas[0]]
    while h and not h[-1]:
        h.pop()
    out = []
    for r in filas[1:]:
        if not any(c not in (None, "") for c in r[:len(h)]):
            continue
        out.append({h[j]: (r[j] if j < len(r) else None) for j in range(len(h))})
    return out

def s(v):
    if v is None: return None
    if isinstance(v, float) and v == int(v): v = int(v)
    t = str(v).strip()
    return t if t != "" else None

def i(v):
    t = s(v)
    return None if t is None else int(float(t))

def n(v):
    t = s(v)
    return None if t is None else float(t)

def b(v):
    t = s(v)
    if t is None: return None
    return t.lower() in ("true", "1", "si", "sí", "verdadero")

def d(v):
    if v is None or s(v) is None: return None
    if isinstance(v, (datetime.date, datetime.datetime)): return v.strftime("%Y-%m-%d")
    return s(v)

def q(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

def insertar(tabla, cols, filas, conflicto="on conflict do nothing", trozo=400):
    out = []
    for k in range(0, len(filas), trozo):
        bloque = filas[k:k + trozo]
        vals = ",\n".join("  (" + ", ".join(q(x) for x in f) + ")" for f in bloque)
        out.append(f"insert into {tabla} ({', '.join(cols)}) values\n{vals}\n{conflicto};\n")
    return "\n".join(out)

reporte = []
def rep(t): reporte.append(t)

CAB = "-- GENERADO por db/cargador/generar_migraciones_v22.py desde SESIM_Interno.xlsx. No editar a mano:\n-- si cambia el catalogo se regenera y se emite una migracion nueva.\n\n"

# ---------------------------------------------------------------- catalogos macro + territorio
ejes = hoja("eje_tematico")
sectores = hoja("sector")
fuentes = hoja("fuente_informacion")
unidades = hoja("unidad_territorial")
instrumentos = hoja("instrumento_origen")
matriz = hoja("matriz_instrumento")

sql = CAB + "-- Ciclo 3 -- Carga oficial: ejes, sectores, fuentes, territorio, instrumentos y matriz de los PIMUS.\n\nbegin;\n\n"
sql += insertar("core.eje_tematico", ["id", "numero_eje", "nombre"], [(i(r["id"]), i(r["numero_eje"]), s(r["nombre"])) for r in ejes])
fs = []
for r in sectores:
    tipo = "definitivo" if r["id"].startswith("SD-") else "original"
    fs.append((s(r["id"]), s(r["nombre"]), tipo))
sql += insertar("core.sector", ["id", "nombre", "tipo"], fs)
sql += insertar("core.fuente_informacion", ["id", "nombre", "siglas"], [(i(r["id"]), s(r["nombre"]), s(r["siglas"])) for r in fuentes])
um = sorted(unidades, key=lambda r: (0 if s(r["nivel"]) == "municipio" else 1, s(r["id"])))
sql += insertar("core.unidad_territorial",
    ["id", "id_padre", "nivel", "cve_ent", "nom_ent", "cve_mun", "nom_mun", "cve_loc", "nom_loc", "pob_tot", "cvegeo"],
    [(s(r["id"]), s(r["id_padre"]), s(r["nivel"]), s(r["cve_ent"]), s(r["nom_ent"]), s(r["cve_mun"]), s(r["nom_mun"]),
      s(r["cve_loc"]), s(r["nom_loc"]), i(r["pob_tot"]), s(r["cvegeo"])) for r in um])
sql += insertar("core.instrumento_origen",
    ["id", "uuid_legado", "clave", "nombre", "ambito", "id_unidad_ambito", "competencia", "vigencia_desde", "vigencia_hasta"],
    [(s(r["id"]), s(r["uuid_legado"]), s(r["clave"]), s(r["nombre"]), s(r["ambito"]), s(r["id_unidad_ambito"]),
      s(r["competencia"]), d(r.get("vigencia_desde")), d(r.get("vigencia_hasta"))) for r in instrumentos])
sql += insertar("core.matriz_instrumento",
    ["id", "id_instrumento", "clave_oe", "objetivo", "meta", "indicador_origen", "tendencia"],
    [(s(r["id"]), s(r["id_instrumento"]), s(r["clave_oe"]), s(r["objetivo"]), s(r["meta"]), s(r["indicador_origen"]), s(r["tendencia"])) for r in matriz])
sql += "\ncommit;\n"
open(os.path.join(a.migraciones, "210_datos_catalogos_territorio.sql"), "w", encoding="utf8").write(sql)
rep(f"| eje_tematico | {len(ejes)} |\n| sector | {len(sectores)} ({sum(1 for r in sectores if r['id'].startswith('SD-'))} SD, {sum(1 for r in sectores if r['id'].startswith('SO-'))} SO) |\n"
    f"| fuente_informacion | {len(fuentes)} |\n| unidad_territorial | {len(unidades)} ({sum(1 for r in unidades if s(r['nivel'])=='municipio')} municipios, {sum(1 for r in unidades if s(r['nivel'])=='localidad')} localidades; {sum(1 for r in unidades if s(r['id'])!=s(r['cvegeo']))} reubicadas) |\n"
    f"| instrumento_origen | {len(instrumentos)} |\n| matriz_instrumento | {len(matriz)} |")

# ---------------------------------------------------------------- indicadores
indic = hoja("indicador")
notas = hoja("qa_nota_transformacion")
ind_instr = hoja("indicador_instrumento")
clave_a_id = {s(r["clave"]): s(r["id"]) for r in indic}
extra_ejes = {}
for r in notas:
    if s(r["tabla"]) == "core.indicador" and s(r["columna"]) == "id_eje":
        iid = clave_a_id[s(r["id_registro"])]
        extra_ejes[iid] = [int(x) for x in re.findall(r"\d+", s(r["valor_origen"]))]

filas, no_aprobados, aprobados_ok = [], [], []
for r in indic:
    nivel = re.sub(r"\s*\(.*\)\s*$", "", s(r["nivel_mir"]))
    aprob = bool(b(r["estatus_aprobado"]))
    tend, vmeta = s(r["tendencia"]), n(r["valor_meta"])
    if aprob and tend is None and vmeta is None:
        no_aprobados.append((s(r["id"]), s(r["clave"]), s(r["nombre"]), s(r["meta"])))
        aprob = False
    elif aprob:
        aprobados_ok.append(s(r["id"]))
    filas.append((s(r["id"]), s(r["uuid_legado"]), i(r["id_eje"]), s(r["id_sector"]), i(r["id_fuente"]), s(r["clave"]),
                  s(r["nombre"]), s(r["variable"]), s(r["meta"]), tend, vmeta, n(r["linea_base"]), i(r["anio_linea_base"]),
                  nivel, bool(b(r["smart_medible"])), bool(b(r["smart_alcanzable"])), bool(b(r["smart_temporal"])), aprob))
sql = CAB + "-- Ciclo 3 -- Carga oficial: 113 indicadores, sus ejes, su alineacion a instrumentos y el umbral global del semaforo.\n\nbegin;\n\n"
sql += insertar("core.indicador",
    ["id", "uuid_legado", "id_eje", "id_sector", "id_fuente", "clave", "nombre", "variable", "meta", "tendencia", "valor_meta",
     "linea_base", "anio_linea_base", "nivel_mir", "smart_medible", "smart_alcanzable", "smart_temporal", "estatus_aprobado"], filas)
ie = []
for r in indic:
    iid, principal = s(r["id"]), i(r["id_eje"])
    todos = {principal, *extra_ejes.get(iid, [])}
    for e in sorted(todos):
        ie.append((iid, e, e == principal))
sql += insertar("core.indicador_eje", ["id_indicador", "id_eje", "principal"], ie)
sql += insertar("core.indicador_instrumento", ["id", "id_indicador", "id_instrumento", "id_matriz", "correspondencia"],
    [(i(r["id"]), s(r["id_indicador"]), s(r["id_instrumento"]), s(r["id_matriz"]), s(r["correspondencia"])) for r in ind_instr])
sql += ("insert into core.umbral_semaforo (id_indicador, verde_desde, amarillo_desde)\n"
        "select null, 90, 70 where not exists (select 1 from core.umbral_semaforo where id_indicador is null and vigente_hasta is null);\n")
sql += "\ncommit;\n"
open(os.path.join(a.migraciones, "211_datos_indicadores.sql"), "w", encoding="utf8").write(sql)

# ---------------------------------------------------------------- capas
capas = hoja("capa")
capa_ind = hoja("capa_indicador")
filas, cv, cats = [], [], collections.Counter()
for r in capas:
    cat = s(r["categoria"]); cats[cat] += 1
    srid = re.search(r"EPSG:(\d+)", s(r["metadatos_extra.sistema_coordenadas"]) or "")
    uso = s(r["metadatos_uso"])
    meta = {k: v for k, v in {
        "titulo": s(r["titulo"]), "tipo_geometria": s(r["tipo_geometria"]), "categoria": cat,
        "custodio": s(r["responsable"]), "contacto_custodio": s(r["Contacto_custodio"]),
        "fuente_origen": s(r["Fuente"]), "linaje": s(r["Linaje"]),
        "escala": s(r["metadatos_extra.escala_nominal"]), "denominador_escala": s(r["metadatos_extra.denominador_escala"]),
        "sistema_coordenadas": s(r["metadatos_extra.sistema_coordenadas"]), "fecha_corte": d(r["metadatos_extra.fecha_corte"]),
        "periodicidad": s(r["metadatos_extra.periodicidad"]), "restriccion_uso": uso}.items() if v is not None}
    publica = (uso or "").lower() in ("pública", "publica")
    estatus = "vigente_publico" if publica else "borrador"
    instr = "Eemsv01" if cat in ("diagnostico", "estrategia") else None
    filas.append((s(r["id"]), s(r["uuid_legado"]), s(r["titulo"]), None, s(r["tipo_geometria"]), int(srid.group(1)) if srid else None,
                  estatus, s(r["responsable"]), s(r["conjunto_datos"]), instr, json.dumps(meta, ensure_ascii=False),
                  s(r["archivo"]), s(r["grupos"]), s(r["nomenclatura"]), i(r["n_elementos"])))
    cv.append((s(r["id"]), 1, estatus, json.dumps(meta, ensure_ascii=False), "Versión inicial (carga oficial v2.2)"))
sql = CAB + "-- Ciclo 3 -- Carga oficial: 87 capas (metadatos), su version inicial y su vinculo con indicadores.\n-- Los 490,224 elementos geograficos y las geometrias son del Ciclo 9.\n\nbegin;\n\n"
sql += insertar("core.capa",
    ["id", "uuid_legado", "titulo", "proposito", "tipo_geometria", "srid_origen", "estatus", "responsable", "conjunto_datos",
     "id_instrumento", "metadatos_extra", "archivo", "grupos", "nomenclatura", "n_elementos"],
    [f[:10] + (f[10],) + f[11:] for f in filas]).replace("'{", "'{")
sql += insertar("core.capa_version", ["id_capa", "version", "estatus", "metadatos", "nota"], cv)
sql += insertar("core.capa_indicador", ["id_capa", "id_indicador"], [(s(r["id_capa"]), s(r["id_indicador"])) for r in capa_ind])
sql += "\ncommit;\n"
open(os.path.join(a.migraciones, "212_datos_capas.sql"), "w", encoding="utf8").write(sql)

# ---------------------------------------------------------------- comentarios desde el diccionario
dic = hoja("diccionario")
cmt = collections.defaultdict(dict)
renombre = {"bitacora": "bitacora_cambio"}
for r in dic:
    t = renombre.get(s(r["Tabla"]), s(r["Tabla"])); campo = s(r["Campo"]); desc = s(r["Descripción"])
    if not (t and campo and desc) or t in ("perfil", "usuario"):
        continue
    desc = re.sub(r"(\s*\.)+\s*$", ".", desc.strip()).strip()
    if not desc.endswith((".", ")", "»")): desc += "."
    for c in re.split(r"\s*[,/]\s*", campo):
        c = c.strip()
        if c.endswith(".*") or " " in c or "…" in c: continue
        cmt[t][c] = desc
json.dump(cmt, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "comentarios_diccionario.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)

rep("")
rep(f"| indicador | {len(indic)} ({len(aprobados_ok)} aprobados que pasan la compuerta, {len(no_aprobados)} cargados como no aprobados) |")
rep(f"| indicador_eje | {len(ie)} vinculos ({len(extra_ejes)} indicadores con mas de un eje) |")
rep(f"| indicador_instrumento | {len(ind_instr)} ({dict(collections.Counter(s(r['correspondencia']) for r in ind_instr))}) |")
rep(f"| capa | {len(capas)} ({sum(1 for f in filas if f[6]=='vigente_publico')} vigente_publico, {sum(1 for f in filas if f[6]=='borrador')} borrador; categorias {dict(cats)}; {sum(1 for f in filas if f[9])} con instrumento Eemsv01) |")
rep(f"| capa_indicador | {len(capa_ind)} |")
res = "# Reporte de carga oficial v2.2 (generado)\n\nFuente: SESIM_Interno.xlsx. Migraciones 210, 211, 212.\n\n| Tabla | Filas |\n|---|---|\n" + "\n".join(x for x in reporte if x) + "\n\n## Indicadores marcados aprobados que no pasan la compuerta (se cargan como NO aprobados)\n\nPor la regla D-13 (sin tendencia ni meta con cifra no hay con que comparar). Requieren confirmacion de Ismael (D-18); no se corrigio nada por cuenta propia.\n\n| id | clave | nombre | meta |\n|---|---|---|---|\n" + "\n".join(f"| {x[0]} | {x[1]} | {x[2]} | {x[3]} |" for x in no_aprobados) + "\n"
open(a.reporte, "w", encoding="utf8").write(res)
print(res)
