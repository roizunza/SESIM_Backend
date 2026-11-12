/**
 * Escritura de GeoPackage (OGC GPKG 1.3) en el navegador, con sql.js. Solo geometrías simples en EPSG:4326 y
 * atributos de texto. Se carga bajo demanda: el motor SQLite (WASM) no pesa en la carga inicial del geovisor.
 */
const SRS = 4326;
const TIPO_WKB = { Point: 1, LineString: 2, Polygon: 3, MultiPoint: 4, MultiLineString: 5, MultiPolygon: 6, GeometryCollection: 7 };

function tamano(g) {
  switch (g.type) {
    case 'Point': return 21;
    case 'LineString': return 9 + g.coordinates.length * 16;
    case 'Polygon': return 9 + g.coordinates.reduce((s, a) => s + 4 + a.length * 16, 0);
    case 'MultiPoint': return 9 + g.coordinates.length * 21;
    case 'MultiLineString': return 9 + g.coordinates.reduce((s, l) => s + 9 + l.length * 16, 0);
    case 'MultiPolygon': return 9 + g.coordinates.reduce((s, p) => s + 9 + p.reduce((t, a) => t + 4 + a.length * 16, 0), 0);
    case 'GeometryCollection': return 9 + g.geometries.reduce((s, h) => s + tamano(h), 0);
    default: throw new Error(`Geometría no admitida: ${g.type}`);
  }
}

function escribirWkb(g, dv, o) {
  dv.setUint8(o, 1); dv.setUint32(o + 1, TIPO_WKB[g.type], true); o += 5;
  const punto = (c) => { dv.setFloat64(o, c[0], true); dv.setFloat64(o + 8, c[1], true); o += 16; };
  const anillo = (a) => { dv.setUint32(o, a.length, true); o += 4; a.forEach(punto); };
  switch (g.type) {
    case 'Point': punto(g.coordinates); break;
    case 'LineString': dv.setUint32(o, g.coordinates.length, true); o += 4; g.coordinates.forEach(punto); break;
    case 'Polygon': dv.setUint32(o, g.coordinates.length, true); o += 4; g.coordinates.forEach(anillo); break;
    case 'MultiPoint': dv.setUint32(o, g.coordinates.length, true); o += 4; g.coordinates.forEach((c) => { o = escribirWkb({ type: 'Point', coordinates: c }, dv, o); }); break;
    case 'MultiLineString': dv.setUint32(o, g.coordinates.length, true); o += 4; g.coordinates.forEach((c) => { o = escribirWkb({ type: 'LineString', coordinates: c }, dv, o); }); break;
    case 'MultiPolygon': dv.setUint32(o, g.coordinates.length, true); o += 4; g.coordinates.forEach((c) => { o = escribirWkb({ type: 'Polygon', coordinates: c }, dv, o); }); break;
    default: dv.setUint32(o, g.geometries.length, true); o += 4; g.geometries.forEach((h) => { o = escribirWkb(h, dv, o); });
  }
  return o;
}

/** Geometría GeoJSON → blob GeoPackage (encabezado «GP» + WKB little-endian, sin envolvente). */
export function geometriaGpkg(g) {
  if (!g) {
    const b = new Uint8Array(8); b[0] = 0x47; b[1] = 0x50; b[2] = 0; b[3] = 0b00010001; new DataView(b.buffer).setInt32(4, SRS, true); return b;
  }
  const buf = new Uint8Array(8 + tamano(g));
  buf[0] = 0x47; buf[1] = 0x50; buf[2] = 0; buf[3] = 0x01;
  const dv = new DataView(buf.buffer);
  dv.setInt32(4, SRS, true);
  escribirWkb(g, dv, 8);
  return buf;
}

const tipoCapa = (features) => {
  const t = new Set(features.map((f) => f.geometry?.type).filter(Boolean));
  if (t.size !== 1) return 'GEOMETRY';
  return [...t][0].toUpperCase();
};

function extender(g, e) {
  const rec = (c) => { if (typeof c[0] === 'number') { e[0] = Math.min(e[0], c[0]); e[1] = Math.min(e[1], c[1]); e[2] = Math.max(e[2], c[0]); e[3] = Math.max(e[3], c[1]); } else c.forEach(rec); };
  if (g?.type === 'GeometryCollection') g.geometries.forEach((h) => extender(h, e)); else if (g) rec(g.coordinates);
}

const nombreTabla = (id) => String(id).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');

/**
 * Construye un GeoPackage con una tabla por capa. `capas` = [{ id, titulo, atributos, features }].
 * Devuelve un Uint8Array listo para guardar como .gpkg.
 */
export async function construirGpkg(capas) {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  db.run('PRAGMA application_id = 1196444487; PRAGMA user_version = 10300;');
  db.run(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
    CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
    CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name), CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));`);
  const wgs84 = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';
  db.run('INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)', ['WGS 84', SRS, 'EPSG', SRS, wgs84, 'Sistema de referencia de publicación del SESIM']);
  db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined cartesian SRS',-1,'NONE',-1,'undefined','')");
  db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined geographic SRS',0,'NONE',0,'undefined','')");

  const usados = new Set();
  for (const capa of capas) {
    let tabla = nombreTabla(capa.id); let n = 2;
    while (usados.has(tabla)) tabla = `${nombreTabla(capa.id)}_${n++}`;
    usados.add(tabla);
    const attrs = capa.atributos;
    db.run(`CREATE TABLE "${tabla}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB${attrs.map((a) => `, "${a}" TEXT`).join('')})`);
    const ext = [Infinity, Infinity, -Infinity, -Infinity];
    db.run('BEGIN');
    const ins = db.prepare(`INSERT INTO "${tabla}" (geom${attrs.map((a) => `, "${a}"`).join('')}) VALUES (?${attrs.map(() => ',?').join('')})`);
    for (const f of capa.features) {
      extender(f.geometry, ext);
      ins.run([geometriaGpkg(f.geometry), ...attrs.map((a) => (f.properties?.[a] ?? null))]);
    }
    ins.free();
    db.run('COMMIT');
    const hayExt = Number.isFinite(ext[0]);
    db.run('INSERT INTO gpkg_contents (table_name,data_type,identifier,description,min_x,min_y,max_x,max_y,srs_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [tabla, 'features', `${capa.id} · ${capa.titulo}`, capa.titulo, hayExt ? ext[0] : null, hayExt ? ext[1] : null, hayExt ? ext[2] : null, hayExt ? ext[3] : null, SRS]);
    db.run('INSERT INTO gpkg_geometry_columns VALUES (?,?,?,?,0,0)', [tabla, 'geom', tipoCapa(capa.features), SRS]);
  }
  const bytes = db.export();
  db.close();
  return bytes;
}
