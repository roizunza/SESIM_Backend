/**
 * Cliente de datos del SESIM — ÚNICO punto por el que el front lee el modelo.
 *
 * Hoy lee los JSON estáticos que genera `scripts/datos/01_exportar_catalogos.py`
 * (`public/sesim/catalogo/<tabla>.json`), que tienen los MISMOS nombres de
 * tabla y columna que el esquema de PostgreSQL de la arquitectura de datos
 * v2.2. Cuando el backend exponga PostgREST, basta con definir
 * `VITE_SESIM_API_URL` (p. ej. `https://sesim.campeche.gob.mx/api`) y cada
 * `tabla('indicador')` pasa a ser `GET {API}/indicador` sin tocar ningún
 * componente.
 *
 * Las funciones `fn*` y `v*` replican, con el mismo nombre y el mismo cruce,
 * las funciones y vistas del esquema `api` (sección 7 del documento,
 * "Funciones derivadas"). Mientras no exista el backend se calculan aquí con
 * los catálogos estáticos; después se sustituyen por la llamada RPC
 * (`POST {API}/rpc/fn_capas_de_indicador`) o la vista
 * (`GET {API}/v_capa_por_municipio?id_capa=eq.Inf09`). Ver
 * docs/FRONT_ARQUITECTURA_DATOS_V2.md, tabla "Funciones derivadas → front".
 *
 * Módulo puro (sin React ni Leaflet).
 */

const API_URL = import.meta.env?.VITE_SESIM_API_URL || null;
const BASE_ESTATICA = '/sesim/catalogo';

/** Tablas que el front lee del catálogo (todas sin geometría). */
export const TABLAS = [
  'perfil', 'eje_tematico', 'sector', 'fuente_informacion', 'instrumento_origen',
  'matriz_instrumento', 'indicador_instrumento', 'indicador', 'unidad_territorial',
  'capa', 'capa_indicador', 'v_capa_por_municipio',
];

const cache = new Map();

/** Lee una tabla completa (memoizada por sesión de navegador). */
export function tabla(nombre) {
  if (!cache.has(nombre)) {
    const url = API_URL ? `${API_URL}/${nombre}` : `${BASE_ESTATICA}/${nombre}.json`;
    const promesa = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${nombre}: HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        cache.delete(nombre); // permite reintentar
        throw err;
      });
    cache.set(nombre, promesa);
  }
  return cache.get(nombre);
}

/** Lee varias tablas a la vez → objeto { nombre: filas }. */
export async function tablas(nombres) {
  const filas = await Promise.all(nombres.map(tabla));
  return Object.fromEntries(nombres.map((n, i) => [n, filas[i]]));
}

/** Índice por llave primaria (o la columna que se indique). */
export function indexar(filas, llave = 'id') {
  return new Map(filas.map((f) => [f[llave], f]));
}

/* ------------------------------------------------------------------ capas */

const cacheGeojson = new Map();

/**
 * GeoJSON de una capa (MICRO · capa_vector serializado). La ruta viene de
 * `capa.geojson` (`/sesim/capas/<id_capa>.geojson`). Con backend será una
 * vista MVT (`/tiles/capa_vector/{z}/{x}/{y}?id_capa=Inf09`) o
 * `GET {API}/capa_vector?id_capa=eq.Inf09` en GeoJSON.
 */
export function geojsonDeCapa(capa) {
  const url = typeof capa === 'string' ? `/sesim/capas/${capa}.geojson` : capa.geojson;
  if (!cacheGeojson.has(url)) {
    cacheGeojson.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.json();
      }),
    );
  }
  return cacheGeojson.get(url);
}

/** Polígonos oficiales (unidad_territorial_geom) por nivel. */
export function geojsonUnidades(nivel = 'municipios') {
  return geojsonDeCapa({ geojson: `/sesim/capas/unidad_territorial/${nivel}.geojson` });
}

/** Simbología QGIS convertida, con llave id_capa. */
let promesaSimbologia = null;
export function simbologias() {
  if (!promesaSimbologia) {
    promesaSimbologia = fetch('/sesim/simbologia.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return promesaSimbologia;
}

/* ------------------------------------------------- funciones derivadas */

/**
 * F01 · fn_trazabilidad_normativa(id_indicador)
 * Eje, sector, fuente e instrumento(s) del indicador en una fila.
 */
export async function fnTrazabilidadNormativa(idIndicador) {
  const t = await tablas(['indicador', 'eje_tematico', 'sector', 'fuente_informacion', 'indicador_instrumento', 'instrumento_origen']);
  const ind = t.indicador.find((i) => i.id === idIndicador);
  if (!ind) return null;
  const instrumentos = indexar(t.instrumento_origen);
  return {
    indicador: ind,
    eje: t.eje_tematico.find((e) => e.id === ind.id_eje) ?? null,
    sector: t.sector.find((s) => s.id === ind.id_sector) ?? null,
    fuente: t.fuente_informacion.find((f) => f.id === ind.id_fuente) ?? null,
    instrumentos: t.indicador_instrumento
      .filter((v) => v.id_indicador === idIndicador)
      .map((v) => ({ ...v, instrumento: instrumentos.get(v.id_instrumento) ?? null })),
  };
}

/**
 * F06 · fn_capas_de_indicador(id_indicador)
 * Capas que ilustran el indicador (botón «Ver en mapa»). `soloPublicas`
 * replica el filtro de la vista pública (estatus = vigente_publico).
 */
export async function fnCapasDeIndicador(idIndicador, { soloPublicas = true } = {}) {
  const { capa, capa_indicador } = await tablas(['capa', 'capa_indicador']);
  const ids = new Set(capa_indicador.filter((v) => v.id_indicador === idIndicador).map((v) => v.id_capa));
  return capa.filter((c) => ids.has(c.id) && (!soloPublicas || c.estatus === 'vigente_publico'));
}

/**
 * F07 · fn_indicadores_de_capa(id_capa)
 * Indicadores asociados a una capa (ficha de la capa en el geovisor).
 */
export async function fnIndicadoresDeCapa(idCapa) {
  const { indicador, capa_indicador } = await tablas(['indicador', 'capa_indicador']);
  const ids = new Set(capa_indicador.filter((v) => v.id_capa === idCapa).map((v) => v.id_indicador));
  return indicador.filter((i) => ids.has(i.id));
}

/**
 * F08 · v_capa_por_municipio
 * Elementos de una capa por municipio (precalculado por el pipeline; con
 * PostGIS agregará km de línea y km² de polígono).
 */
export async function vCapaPorMunicipio(idCapa) {
  const { v_capa_por_municipio, unidad_territorial } = await tablas(['v_capa_por_municipio', 'unidad_territorial']);
  const unidades = indexar(unidad_territorial);
  return v_capa_por_municipio
    .filter((r) => r.id_capa === idCapa)
    .map((r) => ({ ...r, nom_mun: r.id_unidad ? unidades.get(r.id_unidad)?.nom_mun : 'Fuera de Campeche' }))
    .sort((a, b) => b.n_elementos - a.n_elementos);
}

/**
 * F15 · v_equivalencia_pimus
 * Para un indicador, cómo lo nombra cada PIMUS (renglón de su matriz) y el
 * tipo de correspondencia (origen | directa | parcial).
 */
export async function vEquivalenciaPimus(idIndicador) {
  const t = await tablas(['indicador_instrumento', 'matriz_instrumento', 'instrumento_origen']);
  const matriz = indexar(t.matriz_instrumento);
  const instrumentos = indexar(t.instrumento_origen);
  return t.indicador_instrumento
    .filter((v) => v.id_indicador === idIndicador)
    .map((v) => ({
      id_instrumento: v.id_instrumento,
      instrumento: instrumentos.get(v.id_instrumento) ?? null,
      correspondencia: v.correspondencia,
      matriz: v.id_matriz ? matriz.get(v.id_matriz) ?? null : null,
    }));
}

/**
 * F14 · v_cobertura_instrumento
 * Indicadores (por tipo de vínculo) y capas por instrumento.
 */
export async function vCoberturaInstrumento() {
  const t = await tablas(['instrumento_origen', 'indicador_instrumento', 'capa']);
  return t.instrumento_origen.map((ins) => {
    const v = t.indicador_instrumento.filter((x) => x.id_instrumento === ins.id);
    return {
      ...ins,
      vinculos_origen: v.filter((x) => x.correspondencia === 'origen').length,
      vinculos_directos: v.filter((x) => x.correspondencia === 'directa').length,
      vinculos_parciales: v.filter((x) => x.correspondencia === 'parcial').length,
      capas: t.capa.filter((c) => c.id_instrumento === ins.id).length,
    };
  });
}

/** Municipios (nivel = municipio) ordenados por clave. */
export async function municipios() {
  const ut = await tabla('unidad_territorial');
  return ut.filter((u) => u.nivel === 'municipio').sort((a, b) => a.id.localeCompare(b.id));
}

/** Localidades de un municipio (jerarquía explícita por id_padre, R10). */
export async function localidadesDe(idMunicipio) {
  const ut = await tabla('unidad_territorial');
  return ut.filter((u) => u.id_padre === idMunicipio).sort((a, b) => a.nom_loc.localeCompare(b.nom_loc, 'es'));
}
