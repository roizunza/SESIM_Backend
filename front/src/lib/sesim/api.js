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
 * Ciclo 11: el catálogo de capas (api.capa + api.capa_clases), las unidades territoriales (api.unidad_territorial),
 * la cobertura por municipio (api.v_capa_por_municipio) y los polígonos oficiales (api.geojson_unidades) también salen
 * de la base. No hay archivos de respaldo: si el servidor no responde, el front lo dice.
 *
 * Las funciones `fn*` y `v*` replican las del esquema `api` (sección 7 del documento,
 * "Funciones derivadas"); hoy se calculan aquí con las tablas leídas.
 *
 * Módulo puro (sin React ni Leaflet).
 */

import { backend } from './supabase.js';

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
  // Ciclo 11: unidades territoriales (2,785 filas: municipios y localidades) y cobertura de las capas por municipio.
  unidad_territorial: 'order=id',
  v_capa_por_municipio: 'order=id_capa,id_unidad',
};

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

export const TABLAS = [...Object.keys(TABLAS_API), 'capa'];

const cache = new Map();
let cliente = backend;

// Al entrar o salir de la sesión cambia lo que la RLS deja ver: se descarta lo leído.
const olvidarLecturasApi = () => { for (const n of [...Object.keys(TABLAS_API), 'capa']) cache.delete(n); };
let desuscribir = cliente.suscribir(olvidarLecturasApi);

/** Solo para pruebas en Node: cambia el cliente (p. ej. uno apuntando al mock o al Supabase real). */
export function _usarCliente(otro) {
  desuscribir();
  cliente = otro;
  desuscribir = cliente.suscribir(olvidarLecturasApi);
  cache.clear();
}

const CATEGORIA_DE = { mapabase: 'mapa_base', mapa_base: 'mapa_base', diagnostico: 'diagnostico', estrategia: 'estrategia' };
const GEOM_DE_TIPO = { Punto: 'point', Línea: 'line', Polígono: 'polygon' };
const GRUPO_MAPA_BASE = {
  LIM: 'Límites administrativos',
  LOC: 'Localidades y asentamientos',
  INF: 'Red de transportes e infraestructura',
  NAT: 'Medio físico y conservación',
};

/** `grupos` de la base («Diagnóstico › EEMSV X | Estrategia › Eje 2») → [{ categoria, grupo }]. */
function gruposDe(texto) {
  return String(texto ?? '')
    .split('|')
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => {
      const [categoria, ...resto] = g.split('›');
      return resto.length ? { categoria: categoria.trim(), grupo: resto.join('›').trim() } : { categoria: '', grupo: g };
    });
}

/**
 * Fila de api.capa → forma que consumen las pantallas: `categoria` (mapa_base | diagnostico | estrategia, de
 * metadatos_extra), `geom` (point | line | polygon, de tipo_geometria), `grupos_lista` y `clases` (de api.capa_clases).
 * En el Mapa Base el subgrupo sale de la nomenclatura de la capa (LIM, LOC, INF, NAT).
 */
export function adaptarCapa(fila, clases = []) {
  const categoria = CATEGORIA_DE[String(fila.metadatos_extra?.categoria ?? '').toLowerCase()] ?? 'diagnostico';
  const grupos_lista = categoria === 'mapa_base'
    ? [{ categoria: 'Mapa Base', grupo: GRUPO_MAPA_BASE[fila.nomenclatura] ?? 'Otras capas' }]
    : gruposDe(fila.grupos);
  return { ...fila, categoria, geom: GEOM_DE_TIPO[fila.tipo_geometria] ?? 'polygon', grupos_lista, clases };
}

/**
 * Catálogo `capa` leído EN VIVO (sin caché): lo que la RLS deja ver al rol de la sesión. Las vistas de operación
 * (captura, dictamen) lo usan para ver el estado actual; el geovisor usa `tabla('capa')`, que lo memoiza.
 */
export async function capasVivas() {
  const [filas, clases] = await Promise.all([
    cliente.leer('capa', { query: 'select=*&order=id' }),
    cliente.leer('capa_clases', { query: 'select=*' }),
  ]);
  const porCapa = new Map(clases.map((c) => [c.id_capa, c.clases ?? []]));
  return filas.map((f) => adaptarCapa(f, porCapa.get(f.id) ?? []));
}

/** Lee una tabla completa (memoizada hasta que cambie la sesión). */
export function tabla(nombre) {
  if (!cache.has(nombre)) {
    if (nombre !== 'capa' && !(nombre in TABLAS_API)) return Promise.reject(new Error(`Tabla desconocida: ${nombre}`));
    let promesa;
    if (nombre === 'capa') {
      promesa = capasVivas();
    } else {
      promesa = cliente.leer(nombre, { query: ['select=*', TABLAS_API[nombre]].filter(Boolean).join('&') });
      if (nombre in ADAPTADORES) promesa = promesa.then((filas) => filas.map(ADAPTADORES[nombre]));
      if (TABLAS_COMPLEMENTARIAS.has(nombre)) promesa = promesa.catch(() => []);
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
 * Las capas vectoriales salen SIEMPRE de la base (`api.geojson_capa`, PostGIS), bajo la RLS del rol de la sesión.
 * No hay archivos de respaldo: si la lectura falla, el error llega a la pantalla (nada se inventa ni se lee de disco).
 * Las capas de más de 25,000 elementos no se sirven como GeoJSON: se dibujan por teselas (ver teselas.js).
 */
const LIMITE_GEOJSON_BASE = 25000; // mismo tope que api.geojson_capa

// Al entrar o salir de la sesión cambia qué capas deja ver la RLS: se descarta lo leído de la base.
cliente.suscribir(() => { for (const k of [...cacheGeojson.keys()]) if (k.startsWith('base:')) cacheGeojson.delete(k); });

function sinServidor() {
  return typeof cliente.leerRpc !== 'function' || cliente.configurado?.() === false;
}

/**
 * GeoJSON de una capa (MICRO · capa_vector serializado), con las propiedades id, nombre, clasif, cve_mun e id_unidad.
 * Acepta la fila de la capa o su id.
 */
export function geojsonDeCapa(capa) {
  const id = typeof capa === 'string' ? capa : capa?.id;
  if (!id) return Promise.reject(new Error('Capa sin identificador.'));
  // Más de 25,000 elementos: la base no las sirve como GeoJSON (van por teselas); se evita la petición que fallaría.
  if (typeof capa === 'object' && Number(capa.n_elementos) > LIMITE_GEOJSON_BASE) {
    return Promise.reject(new Error('Capa servida por teselas: no se carga completa en el navegador.'));
  }
  if (sinServidor()) return Promise.reject(new Error('Sin conexión con el servidor del portal.'));
  const llave = `base:${id}`;
  if (!cacheGeojson.has(llave)) {
    const promesa = cliente.leerRpc('geojson_capa', { p_capa: id }).then((d) => {
      if (d?.type === 'FeatureCollection') return d;
      throw new Error(`La capa ${id} no se sirve como GeoJSON (va por teselas o no está disponible para su perfil).`);
    });
    cacheGeojson.set(llave, promesa.catch((err) => { cacheGeojson.delete(llave); throw err; }));
  }
  return cacheGeojson.get(llave);
}

/**
 * GeoJSON completo de una capa pesada (más de 25,000 elementos, las que el mapa dibuja por teselas): se pide por
 * páginas a `api.geojson_capa_pagina` y se junta. Solo para descargas; el mapa nunca lo usa. `alProgreso(hechos, total)`.
 */
export async function geojsonPaginado(capa, alProgreso, tamano = 5000) {
  if (sinServidor()) throw new Error('Sin conexión con el servidor del portal.');
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

/** Polígonos oficiales por nivel (`municipios` | `localidades`), de `api.geojson_unidades` (core.unidad_territorial_geom). */
export function geojsonUnidades(nivel = 'municipios') {
  if (sinServidor()) return Promise.reject(new Error('Sin conexión con el servidor del portal.'));
  const llave = `unidades:${nivel}`;
  if (!cacheGeojson.has(llave)) {
    const promesa = cliente.leerRpc('geojson_unidades', { p_nivel: nivel }).then((d) => {
      if (d?.type === 'FeatureCollection' && d.features?.length) return d;
      throw new Error(`La base aún no tiene los polígonos de ${nivel} (core.unidad_territorial_geom): cárguelos con db/cargador/cargar_geometrias_ciclo9.py.`);
    });
    cacheGeojson.set(llave, promesa.catch((err) => { cacheGeojson.delete(llave); throw err; }));
  }
  return cacheGeojson.get(llave);
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
  return capa.filter((c) => ids.has(c.id) && (!soloPublicas || (c.estatus === 'vigente_publico' && c.activo !== false)));
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
 * Elementos de una capa por municipio (api.v_capa_por_municipio, bajo la RLS del rol).
 */
export async function vCapaPorMunicipio(idCapa) {
  const [filas, unidad_territorial] = await Promise.all([
    cliente.leer('v_capa_por_municipio', { query: `select=*&id_capa=eq.${encodeURIComponent(idCapa)}` }),
    tabla('unidad_territorial'),
  ]);
  const unidades = indexar(unidad_territorial);
  return filas
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
 * Sale de `api.tablero_territorio()` (PostGIS) bajo la RLS del rol. Sin archivo de respaldo: si falla, el error llega a la pantalla.
 */
let cacheTablero = null;
export function tableroTerritorio() {
  if (!cacheTablero) {
    const p = sinServidor()
      ? Promise.reject(new Error('Sin conexión con el servidor del portal.'))
      : cliente.leerRpc('tablero_territorio', {}).then((d) => (Array.isArray(d?.filas) ? d : { filas: [] }));
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
