/**
 * Cliente de datos del SESIM — ÚNICO punto por el que el front lee el modelo.
 *
 * Los catálogos de indicadores y su trazabilidad (indicador, eje_tematico, sector,
 * fuente_informacion, instrumento_origen, matriz_instrumento, indicador_instrumento,
 * capa_indicador) se leen en VIVO de Supabase: `GET /rest/v1/<tabla>` sobre el esquema
 * `api` (vistas security_invoker, así que la RLS decide qué ve cada quien):
 *   · sin sesión (portal público): rol `anon`, solo indicadores aprobados y activos,
 *     instrumentos publicados, etc. (migración 215);
 *   · con sesión: el rol de la cuenta (capturista, administrador, titular, auditor).
 * Ya NO existen JSON estáticos de esas tablas: si el backend no está configurado o no
 * responde, el front lo dice, no inventa datos.
 *
 * Siguen estáticos (se conectan en su ciclo): capa y v_capa_por_municipio (Ciclo 9),
 * unidad_territorial (2,785 filas, Ciclo 9) y perfil. Se generan con
 * `scripts/datos/01_exportar_catalogos.py` en `public/sesim/catalogo/`.
 *
 * Las funciones `fn*` y `v*` replican las del esquema `api` (sección 7 del documento,
 * "Funciones derivadas"); hoy se calculan aquí con las tablas leídas.
 *
 * Módulo puro (sin React ni Leaflet).
 */

import { backend } from './supabase.js';

const BASE_ESTATICA = '/sesim/catalogo';

/** Tablas que se leen de la API de Supabase (con su orden de lectura). */
const TABLAS_API = {
  indicador: 'order=id',
  eje_tematico: 'order=id',
  sector: 'order=id',
  fuente_informacion: 'order=id',
  instrumento_origen: 'order=id',
  matriz_instrumento: 'order=id',
  indicador_eje: '',
  indicador_instrumento: '',
  capa_indicador: '',
  periodo: 'order=id',
  // Vista pública: el filtro es explícito porque con sesión la RLS deja ver también borradores.
  medicion_publica: 'estado=eq.vigente_publico&order=id',
};

/** Tablas estáticas que aún no se conectan. */
const TABLAS_ESTATICAS = ['perfil', 'unidad_territorial', 'capa', 'v_capa_por_municipio'];

export const TABLAS = [...Object.keys(TABLAS_API), ...TABLAS_ESTATICAS];

const cache = new Map();
let cliente = backend;

// Al entrar o salir de la sesión cambia lo que la RLS deja ver: se descarta lo leído.
const olvidarLecturasApi = () => { for (const n of Object.keys(TABLAS_API)) cache.delete(n); };
let desuscribir = cliente.suscribir(olvidarLecturasApi);

/** Solo para pruebas en Node: cambia el cliente (p. ej. uno apuntando al mock o al Supabase real). */
export function _usarCliente(otro) {
  desuscribir();
  cliente = otro;
  desuscribir = cliente.suscribir(olvidarLecturasApi);
  cache.clear();
}

/** Lee una tabla completa (memoizada hasta que cambie la sesión). */
export function tabla(nombre) {
  if (!cache.has(nombre)) {
    let promesa;
    if (nombre in TABLAS_API) {
      promesa = cliente.leer(nombre, { query: ['select=*', TABLAS_API[nombre]].filter(Boolean).join('&') });
    } else {
      promesa = fetch(`${BASE_ESTATICA}/${nombre}.json`).then((r) => {
        if (!r.ok) throw new Error(`${nombre}: HTTP ${r.status}`);
        return r.json();
      });
    }
    cache.set(nombre, promesa.catch((err) => {
      cache.delete(nombre); // permite reintentar
      throw err;
    }));
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
