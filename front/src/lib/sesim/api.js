/**
 * Cliente de datos del SESIM — ÚNICO punto por el que el front lee el modelo.
 *
 * Los catálogos de indicadores y su trazabilidad (indicador, eje_tematico, sector,
 * fuente_informacion, instrumento_origen, matriz_instrumento, indicador_instrumento,
 * capa_indicador) y el catálogo normativo (instrumento_normativo, relacion_normativa, fuente_documental: ER-6 y ER-7)
 * se leen en VIVO de Supabase: `GET /rest/v1/<tabla>` sobre el esquema
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

/**
 * Lecturas complementarias: si fallan (p. ej. un backend sin la migración que las crea) se tratan
 * como vacías para no bloquear la vista. `umbral_publico` vacío = umbral por omisión (90/70) del semáforo.
 */
const TABLAS_COMPLEMENTARIAS = new Set(['umbral_publico']);

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
  umbral_publico: 'order=id',
  // ER-6 (catálogo normativo en la base): con sesión la RLS deja ver también borradores; las pantallas públicas filtran por `publicable`.
  instrumento_normativo: 'order=id',
  relacion_normativa: 'order=id',
  // ER-7 (fuentes oficiales de la Consulta oficial): la vista pública trae `enlaces` (JSON, en orden) y `url_oficial`.
  fuente_documental: 'order=id',
  // Vista pública: el filtro es explícito porque con sesión la RLS deja ver también borradores.
  medicion_publica: 'estado=eq.vigente_publico&order=id',
};

/**
 * Tablas estáticas que aún no se conectan.
 */
const TABLAS_ESTATICAS = ['perfil', 'unidad_territorial', 'capa', 'v_capa_por_municipio', 'proceso_capa', 'indice'];

/**
 * Adaptadores API → forma que ya consumen las pantallas. En la base, `estatus` es el ciclo de publicación
 * (borrador … vigente_publico) y la verificación documental se llama `estatus_verificacion`; las pantallas
 * siguen leyendo `estatus` como verificación y `publicable` como «se muestra al público».
 * Tolera filas con la forma anterior (JSON estático / servidor de demostración).
 */
const ADAPTADORES = {
  instrumento_normativo: (f) => ('estatus_verificacion' in f
    ? { ...f, estatus_publicacion: f.estatus, estatus: f.estatus_verificacion, publicable: f.publicado === true && f.activo !== false }
    : f),
  relacion_normativa: (f) => ({ ...f, instrumento_origen: f.instrumento_origen ?? f.id_origen, instrumento_destino: f.instrumento_destino ?? f.id_destino }),
};

/**
 * Recursos que el modelo v2.2 todavía no publica. Su nombre en el esquema `api` se configura en
 * `.env`; sin variable, el front informa que el servicio no está disponible en vez de suponerlo.
 */
const env = import.meta.env ?? {};
export const RECURSOS_OPCIONALES = {
  proyectos: env.VITE_SESIM_RECURSO_PROYECTOS || '',
  puntoCritico: env.VITE_SESIM_RPC_PUNTO_CRITICO || '',
};

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
      if (nombre in ADAPTADORES) promesa = promesa.then((filas) => filas.map(ADAPTADORES[nombre]));
      if (TABLAS_COMPLEMENTARIAS.has(nombre)) promesa = promesa.catch(() => []);
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

/**
 * Enlace público al PDF principal vigente de una ficha normativa (bucket público `instrumentos`), o null si aún no tiene.
 * La ruta ya lleva la clave: instrumentos/DOC-E001/DOC-E001_v01_<huella16>.pdf
 */
export function urlPdfInstrumento(doc) {
  if (!doc?.pdf_ruta || !cliente.urlPublica) return null;
  const [bucket, ...resto] = doc.pdf_ruta.split('/');
  return cliente.urlPublica(bucket, resto.join('/'));
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

const cacheContenido = new Map();

/** Contenido editorial versionado (`public/sesim/contenido/<nombre>.json`): textos y estructuras de presentación. */
export function contenido(nombre) {
  if (!cacheContenido.has(nombre)) {
    cacheContenido.set(
      nombre,
      fetch(`/sesim/contenido/${nombre}.json`, { cache: 'no-cache' })
        .then((r) => {
          if (!r.ok) throw new Error(`${nombre}: HTTP ${r.status}`);
          return r.json();
        })
        .catch((err) => {
          cacheContenido.delete(nombre);
          throw err;
        }),
    );
  }
  return cacheContenido.get(nombre);
}

/** Lee un recurso opcional del esquema `api`; rechaza con `codigo: 'sin_servicio'` si no está configurado. */
export async function recursoOpcional(clave, query = 'select=*') {
  const nombre = RECURSOS_OPCIONALES[clave];
  if (!nombre) {
    const err = new Error('El backend aún no publica este servicio.');
    err.codigo = 'sin_servicio';
    throw err;
  }
  return cliente.leer(nombre, { query });
}

/** Llama una función opcional del esquema `api`; rechaza con `codigo: 'sin_servicio'` si no está configurada. */
export async function rpcOpcional(clave, args) {
  const nombre = RECURSOS_OPCIONALES[clave];
  if (!nombre) {
    const err = new Error('El backend aún no publica este servicio.');
    err.codigo = 'sin_servicio';
    throw err;
  }
  return cliente.rpc(nombre, args);
}

/* ------------------------------------------------------------------ capas */

const cacheGeojson = new Map();

/**
 * Origen de las capas vectoriales (Ciclo 9). Por omisión salen de la base (`api.geojson_capa`, PostGIS);
 * `VITE_SESIM_CAPAS_ORIGEN=estatico` fuerza los archivos de `public/sesim/capas/` (respaldo).
 * Las capas de más de 25,000 elementos (la base responde 54000) y cualquier falla de la lectura caen a
 * los archivos estáticos con un aviso en consola: el mapa se ve igual que antes.
 */
const LIMITE_GEOJSON_BASE = 25000; // mismo tope que api.geojson_capa
const ORIGEN_CAPAS = (env.VITE_SESIM_CAPAS_ORIGEN || 'base').toLowerCase();

// Al entrar o salir de la sesión cambia qué capas deja ver la RLS: se descarta lo leído de la base.
cliente.suscribir(() => { for (const k of [...cacheGeojson.keys()]) if (k.startsWith('base:')) cacheGeojson.delete(k); });

function leerEstatico(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  });
}

/**
 * GeoJSON de una capa (MICRO · capa_vector serializado), con las propiedades id, nombre, clasif, cve_mun
 * e id_unidad. Con `capa.id` y backend sale de `api.geojson_capa`; el archivo `capa.geojson`
 * (`/sesim/capas/<id_capa>.geojson`) queda como respaldo y para las capas sin id (unidades territoriales).
 */
export function geojsonDeCapa(capa) {
  const id = typeof capa === 'string' ? capa : capa.id;
  const url = typeof capa === 'string' ? `/sesim/capas/${capa}.geojson` : capa.geojson;
  // Más de 25,000 elementos: la base no las sirve como GeoJSON (irán por teselas); se evita la petición que fallaría.
  const pesada = typeof capa === 'object' && Number(capa.n_elementos) > LIMITE_GEOJSON_BASE;
  const deBase = ORIGEN_CAPAS !== 'estatico' && !!id && !pesada && typeof cliente.leerRpc === 'function' && cliente.configurado?.() !== false;
  if (pesada && ORIGEN_CAPAS !== 'estatico' && cliente.configurado?.() !== false) {
    return Promise.reject(new Error('Capa servida por teselas: no se carga completa en el navegador.'));
  }
  const llave = deBase ? `base:${id}` : url;
  if (!cacheGeojson.has(llave)) {
    const promesa = deBase
      ? cliente.leerRpc('geojson_capa', { p_capa: id }).then((d) => (d?.type === 'FeatureCollection' ? d : leerEstatico(url ?? `/sesim/capas/${id}.geojson`))).catch((err) => {
          if (err?.codigo !== '54000') console.warn(`Capa ${id}: no se pudo leer de la base (${err?.message}); se usa el archivo estático.`);
          return leerEstatico(url ?? `/sesim/capas/${id}.geojson`);
        })
      : leerEstatico(url);
    cacheGeojson.set(llave, promesa.catch((err) => { cacheGeojson.delete(llave); throw err; }));
  }
  return cacheGeojson.get(llave);
}

/**
 * GeoJSON completo de una capa pesada (más de 25,000 elementos, las que el mapa dibuja por teselas): se pide por
 * páginas a `api.geojson_capa_pagina` y se junta. Solo para descargas; el mapa nunca lo usa. `alProgreso(hechos, total)`.
 */
export async function geojsonPaginado(capa, alProgreso, tamano = 5000) {
  if (typeof cliente.leerRpc !== 'function' || cliente.configurado?.() === false) throw new Error('Sin conexión con el servidor del portal.');
  const features = [];
  let total = Number(capa.n_elementos) || Infinity;
  for (let desde = 0; desde < total; desde += tamano) {
    const pag = await cliente.leerRpc('geojson_capa_pagina', { p_capa: capa.id, p_desde: desde, p_limite: tamano });
    if (pag?.type !== 'FeatureCollection') throw new Error('El servidor no devolvió la capa por páginas (¿falta la migración 237?).');
    total = Number(pag.n_elementos) || total;
    features.push(...pag.features);
    alProgreso?.(features.length, total);
    if (pag.features.length < tamano) break;
  }
  return { type: 'FeatureCollection', id_capa: capa.id, titulo: capa.titulo, features };
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

/**
 * Estadística territorial del tablero público (Ciclo 9): km y elementos por capa, municipio y clasificación.
 * Sale de `api.tablero_territorio()` (PostGIS); si el RPC no existe aún o falla, se lee el archivo estático
 * `public/sesim/catalogo/tablero_territorio.json` (generado de las mismas capas por scripts/datos/05_exportar_tablero_territorio.py).
 */
let cacheTablero = null;
export function tableroTerritorio() {
  if (!cacheTablero) {
    const estatico = () => leerEstatico(`${BASE_ESTATICA}/tablero_territorio.json`);
    const deBase = ORIGEN_CAPAS !== 'estatico' && typeof cliente.leerRpc === 'function' && cliente.configurado?.() !== false;
    const p = deBase
      ? cliente.leerRpc('tablero_territorio', {}).then((d) => (Array.isArray(d?.filas) && d.filas.length ? d : estatico())).catch((err) => {
          console.warn(`Tablero: no se pudo leer de la base (${err?.message}); se usa el archivo estático.`);
          return estatico();
        })
      : estatico();
    cacheTablero = p.catch((err) => { cacheTablero = null; throw err; });
  }
  return cacheTablero;
}
cliente.suscribir(() => { cacheTablero = null; });

/**
 * Cifras del territorio de Campeche para la portada (Ciclo 9): extensión, habitantes, municipios y red vial.
 * Salen de `api.estadisticas_portada()` (migración 239; solo agregados). No hay archivo de respaldo: si el RPC
 * no existe aún o falla, devuelve null y la portada muestra «—» en lo que no pueda calcular (nada se inventa).
 */
let cacheEstadisticas = null;
export function estadisticasPortada() {
  if (!cacheEstadisticas) {
    const posible = typeof cliente.leerRpc === 'function' && cliente.configurado?.() !== false;
    const p = posible
      ? cliente.leerRpc('estadisticas_portada', {}).then((d) => (d && typeof d === 'object' ? d : null)).catch((err) => {
          console.warn(`Portada: no se pudieron leer las estadísticas de la base (${err?.message}).`);
          return null;
        })
      : Promise.resolve(null);
    cacheEstadisticas = p;
  }
  return cacheEstadisticas;
}
cliente.suscribir(() => { cacheEstadisticas = null; });
