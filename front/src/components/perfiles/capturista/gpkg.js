import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * Revisión de un archivo GeoPackage (.gpkg) en el navegador, sin enviarlo a ningún lado.
 * Un GeoPackage es una base SQLite (estándar OGC): aquí se abre con sql.js y se lee su contenido.
 *
 * Reglas de aceptación (las mismas del modelo de información de SESIM):
 *  · es un GeoPackage válido, con UNA capa de objetos (tabla de tipo «features»);
 *  · sistema de coordenadas EPSG:4326 (WGS 84);
 *  · con elementos, sin geometrías vacías, de un solo tipo (punto, línea o polígono);
 *  · todo dentro de la península de Yucatán (un archivo proyectado o de otra región se detecta aquí);
 *  · una columna identificadora con valor único en cada elemento.
 */
export const TOPE_MB = 50;
// Península de Yucatán con margen.
const CAJA = { oeste: -93.6, este: -85.5, sur: 16.4, norte: 23.2 };
const FAMILIA = { POINT: 'Punto', MULTIPOINT: 'Punto', LINESTRING: 'Línea', MULTILINESTRING: 'Línea', POLYGON: 'Polígono', MULTIPOLYGON: 'Polígono' };
const TIPO_WKB = { 1: 'POINT', 2: 'LINESTRING', 3: 'POLYGON', 4: 'MULTIPOINT', 5: 'MULTILINESTRING', 6: 'MULTIPOLYGON' };
const APP_ID = new Set([1196444487, 1196437808, 1196437809]); // GPKG, GP10, GP11
const MAX_VISTA_PREVIA = 20000;
export const MENSAJE_FORMATO = 'Revisa que tu archivo sea GeoPackage (.gpkg) y que esté en el sistema de coordenadas EPSG:4326 (WGS 84).';

let sqlListo = null;
const cargarSql = () => { sqlListo ??= initSqlJs({ locateFile: () => wasmUrl }); return sqlListo; };
const pausa = () => new Promise((r) => setTimeout(r, 30));
const comilla = (n) => `"${String(n).replace(/"/g, '""')}"`;

/** Decodifica el WKB de una geometría (puntos, líneas, polígonos y sus multi). Devuelve null si no es compatible. */
function leerWkb(v, pos) {
  const little = v.getUint8(pos) === 1;
  let tipo = v.getUint32(pos + 1, little);
  let p = pos + 5;
  let dims = 2;
  if (tipo & 0x80000000) dims += 1;
  if (tipo & 0x40000000) dims += 1;
  if (tipo & 0x20000000) p += 4; // SRID incrustado (EWKB)
  tipo &= 0x0fffffff;
  if (tipo >= 3000) { dims = 4; tipo -= 3000; } else if (tipo >= 2000) { dims = 3; tipo -= 2000; } else if (tipo >= 1000) { dims = 3; tipo -= 1000; }
  const nombre = TIPO_WKB[tipo];
  if (!nombre) return null;
  const punto = () => { const c = [v.getFloat64(p, little), v.getFloat64(p + 8, little)]; p += 8 * dims; return c; };
  const secuencia = () => { const n = v.getUint32(p, little); p += 4; const l = new Array(n); for (let i = 0; i < n; i++) l[i] = punto(); return l; };
  const anillos = () => { const n = v.getUint32(p, little); p += 4; const l = new Array(n); for (let i = 0; i < n; i++) l[i] = secuencia(); return l; };
  const hijas = (n, fn) => { const l = []; for (let i = 0; i < n; i++) { const r = fn(); if (!r) return null; l.push(r.coordinates); p = r.fin; } return l; };
  if (nombre === 'POINT') return { type: 'Point', coordinates: punto(), fin: p };
  if (nombre === 'LINESTRING') return { type: 'LineString', coordinates: secuencia(), fin: p };
  if (nombre === 'POLYGON') return { type: 'Polygon', coordinates: anillos(), fin: p };
  const n = v.getUint32(p, little); p += 4;
  const sub = (i) => { const r = leerWkb(v, p); return r; };
  const coords = hijas(n, () => sub());
  if (!coords) return null;
  return { type: { MULTIPOINT: 'MultiPoint', MULTILINESTRING: 'MultiLineString', MULTIPOLYGON: 'MultiPolygon' }[nombre], coordinates: coords, fin: p };
}

/** Geometría de un GeoPackage (cabecera «GP» + WKB) → { geometry|null, vacia }. */
function leerGeometriaGpkg(blob) {
  if (!blob || blob.length < 9 || blob[0] !== 0x47 || blob[1] !== 0x50) return { geometry: null, vacia: true };
  const flags = blob[3];
  if ((flags >> 4) & 1) return { geometry: null, vacia: true };
  const env = [0, 32, 48, 48, 64][(flags >> 1) & 7] ?? 0;
  const v = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  try {
    const g = leerWkb(v, 8 + env);
    if (!g) return { geometry: null, vacia: true, noSoportada: true };
    return { geometry: { type: g.type, coordinates: g.coordinates }, vacia: !g.coordinates.length };
  } catch {
    return { geometry: null, vacia: true };
  }
}

const extremos = (c, acc) => {
  if (typeof c[0] === 'number') {
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) { acc.noNum += 1; return; }
    acc.minx = Math.min(acc.minx, c[0]); acc.maxx = Math.max(acc.maxx, c[0]);
    acc.miny = Math.min(acc.miny, c[1]); acc.maxy = Math.max(acc.maxy, c[1]);
    return;
  }
  c.forEach((x) => extremos(x, acc));
};
const anilloAbierto = (g) => {
  const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  return rings.some((r) => r.length < 4 || r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]);
};

/**
 * Revisa el archivo. Devuelve:
 *  { filas: [{ que, encontrado, bien, ayuda }], valido, n, tipo, columnas, identificadores: { columna: { bien, texto } },
 *    tabla, geojson (vista previa, hasta 20,000 elementos), vistaParcial }
 * Nunca lanza: si el archivo no sirve, `valido` es false y `filas` dice por qué.
 */
export async function revisarGeoPackage(archivo, tipoEsperado = null) {
  const filas = [];
  const fila = (que, encontrado, bien, ayuda) => filas.push({ que, encontrado, bien, ayuda });
  const fallo = (que, encontrado, ayuda) => { fila(que, encontrado, false, ayuda); return { filas, valido: false, n: 0, tipo: null, columnas: [], identificadores: {}, geojson: null }; };

  if (!/\.gpkg$/i.test(archivo.name)) return fallo('Formato', `.${(archivo.name.split('.').pop() || '').toLowerCase()}`, 'Solo se acepta un archivo GeoPackage (.gpkg).');
  if (archivo.size > TOPE_MB * 1024 * 1024) return fallo('Tamaño', `${(archivo.size / 1048576).toFixed(0)} MB`, `El máximo es ${TOPE_MB} MB.`);

  let db;
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const cabecera = new TextDecoder().decode(bytes.slice(0, 15));
    if (cabecera !== 'SQLite format 3') return fallo('Formato', 'No es un GeoPackage', 'El archivo no tiene estructura de GeoPackage (¿es un .gpkg renombrado?).');
    await pausa();
    const SQL = await cargarSql();
    db = new SQL.Database(bytes);
    const q = (sql, par = []) => { const r = db.exec(sql, par)[0]; return r ? r.values : []; };

    const appId = Number(q('PRAGMA application_id')[0]?.[0] ?? 0);
    const tablas = new Set(q("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r[0]));
    if (!APP_ID.has(appId) || !tablas.has('gpkg_contents') || !tablas.has('gpkg_geometry_columns')) {
      return fallo('Formato', 'No es un GeoPackage', 'Exporta la capa desde tu SIG como «GeoPackage (.gpkg)».');
    }
    fila('Formato', 'GeoPackage', true);

    const capas = q("SELECT c.table_name, g.column_name, g.geometry_type_name, g.srs_id FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name WHERE c.data_type = 'features'");
    if (capas.length !== 1) {
      fila('Capas dentro del archivo', capas.length ? `${capas.length} capas` : 'Ninguna', false, 'El archivo debe traer una sola capa de objetos. Exporta cada capa por separado.');
      return { filas, valido: false, n: 0, tipo: null, columnas: [], identificadores: {}, geojson: null };
    }
    const [tabla, colGeom, tipoDeclarado, srsId] = capas[0];
    fila('Capas dentro del archivo', `1 (${tabla})`, true);

    const srs = q('SELECT organization, organization_coordsys_id FROM gpkg_spatial_ref_sys WHERE srs_id = ?', [srsId])[0];
    const esWgs = srs ? String(srs[0]).toUpperCase() === 'EPSG' && Number(srs[1]) === 4326 : Number(srsId) === 4326;
    fila('Sistema de coordenadas', srs ? `${srs[0]}:${srs[1]}` : `srs_id ${srsId}`, esWgs, 'Reproyecta la capa a EPSG:4326 (WGS 84) antes de exportarla.');

    const n = Number(q(`SELECT COUNT(*) FROM ${comilla(tabla)}`)[0][0]);
    fila('Elementos', String(n), n > 0, 'La capa no puede estar vacía.');
    const columnas = q(`PRAGMA table_info(${comilla(tabla)})`).map((r) => r[1]).filter((c) => c !== colGeom);

    // Recorre las geometrías una sola vez.
    await pausa();
    const familias = new Set();
    const acc = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, noNum: 0 };
    let vacias = 0; let noSoportadas = 0; let abiertos = 0; let fuera = 0;
    const vista = [];
    const st = db.prepare(`SELECT ${comilla(colGeom)} FROM ${comilla(tabla)}`);
    while (st.step()) {
      const { geometry, vacia, noSoportada } = leerGeometriaGpkg(st.get()[0]);
      if (noSoportada) noSoportadas += 1;
      if (!geometry || vacia) { vacias += 1; continue; }
      const f = FAMILIA[geometry.type.toUpperCase()];
      if (f) familias.add(f);
      const e = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, noNum: 0 };
      extremos(geometry.coordinates, e);
      acc.noNum += e.noNum;
      acc.minx = Math.min(acc.minx, e.minx); acc.maxx = Math.max(acc.maxx, e.maxx); acc.miny = Math.min(acc.miny, e.miny); acc.maxy = Math.max(acc.maxy, e.maxy);
      if (e.minx < CAJA.oeste || e.maxx > CAJA.este || e.miny < CAJA.sur || e.maxy > CAJA.norte) fuera += 1;
      if (anilloAbierto(geometry)) abiertos += 1;
      if (vista.length < MAX_VISTA_PREVIA) vista.push({ type: 'Feature', properties: {}, geometry });
    }
    st.free();

    fila('Geometrías con contenido', vacias ? `${vacias} vacías o no legibles${noSoportadas ? ' (tipo no compatible)' : ''}` : 'Todas con contenido', vacias === 0, 'Elimina o repara los registros sin geometría.');
    const tipo = familias.size === 1 ? [...familias][0] : null;
    fila('Tipo de geometría', [...familias].join(' + ') || tipoDeclarado || '—', familias.size === 1, 'Una capa solo puede tener puntos, líneas o polígonos, no mezclados.');
    if (tipoEsperado) fila('Coincide con la capa que actualizas', tipo ? `${tipo} (actual: ${tipoEsperado})` : '—', tipo === tipoEsperado, 'Para cambiar el tipo de geometría se debe dar de alta una capa nueva.');
    fila('Coordenadas numéricas', acc.noNum ? `${acc.noNum} inválidas` : 'Correctas', acc.noNum === 0, 'Hay coordenadas vacías o con valores no numéricos.');
    fila('Ubicación (península de Yucatán)', fuera ? `${fuera} de ${n} elementos fuera del territorio` : 'Dentro del territorio', fuera === 0, 'Parece estar en otro sistema de coordenadas (metros, UTM) o fuera de la península. Reproyecta a EPSG:4326.');
    fila('Polígonos cerrados', abiertos ? `${abiertos} elementos con anillos abiertos` : 'Todos cerrados', abiertos === 0, 'Repara las geometrías en tu SIG (Reparar geometrías).');

    // Columna identificadora: valor único y presente en todos los elementos.
    const identificadores = {};
    for (const c of columnas) {
      const [tot, dist, nulos] = q(`SELECT COUNT(*), COUNT(DISTINCT ${comilla(c)}), SUM(${comilla(c)} IS NULL OR TRIM(CAST(${comilla(c)} AS TEXT)) = '') FROM ${comilla(tabla)}`)[0];
      const vacios = Number(nulos ?? 0);
      const repetidos = Number(tot) - vacios - Number(dist);
      identificadores[c] = vacios ? { bien: false, texto: `${vacios} elementos sin valor en «${c}».` }
        : repetidos > 0 ? { bien: false, texto: `${repetidos} valores repetidos en «${c}»: cada elemento necesita uno único.` }
          : { bien: true, texto: `«${c}» identifica a los ${tot} elementos sin repetirse.` };
    }

    const valido = filas.every((x) => x.bien) && n > 0;
    return { filas, valido, n, tipo, columnas, identificadores, tabla, geojson: { type: 'FeatureCollection', features: vista }, vistaParcial: n > vista.length };
  } catch (e) {
    return fallo('Lectura del archivo', 'No se pudo leer', `${MENSAJE_FORMATO} (${e.message})`);
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}
