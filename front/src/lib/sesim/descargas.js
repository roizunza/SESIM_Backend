import { geojsonDeCapa } from './api';

/** Descargas del portal: CSV (UTF-8 con BOM para Excel) y GeoJSON. Módulo puro salvo `descargar`. */

const celda = (v) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function aCsv(filas, columnas = filas.length ? Object.keys(filas[0]) : []) {
  return [columnas.join(','), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(','))].join('\n');
}

/** FeatureCollection con los polígonos municipales y los valores del corte en `properties`. */
export function aGeojsonMunicipal(geojsonMunicipios, valores, extra = {}) {
  return {
    type: 'FeatureCollection',
    ...extra,
    features: geojsonMunicipios.features
      .filter((f) => valores.has(f.properties.id))
      .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { ...f.properties, ...valores.get(f.properties.id) } })),
  };
}

export function descargar(nombre, contenido, tipo) {
  const datos = tipo.startsWith('text/csv') ? `﻿${contenido}` : contenido;
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const sufijoFecha = () => new Date().toISOString().slice(0, 10);

/**
 * Únicos atributos que salen en una descarga de capa. Cualquier otro campo se descarta, incluido el
 * identificador interno de cada elemento (`id`) y las claves internas o el uuid legado.
 */
export const ATRIBUTOS_PUBLICOS = ['nombre', 'clasif', 'cve_mun', 'id_unidad'];

/** FeatureCollection de descarga: solo `titulo` en el encabezado y los atributos públicos en cada elemento. */
export function geojsonPublico(titulo, features) {
  return {
    type: 'FeatureCollection',
    titulo,
    features: features.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: Object.fromEntries(ATRIBUTOS_PUBLICOS.filter((k) => f.properties?.[k] !== undefined).map((k) => [k, f.properties[k]])),
    })),
  };
}

/** Capa lista para el GeoPackage: solo los atributos públicos de cada elemento. */
const capaParaGpkg = (capa, features) => ({
  id: capa.id,
  titulo: capa.titulo,
  atributos: ATRIBUTOS_PUBLICOS,
  features: features.map((f) => ({ geometry: f.geometry, properties: Object.fromEntries(ATRIBUTOS_PUBLICOS.map((k) => [k, f.properties?.[k]])) })),
});

const leerCapa = (capa) => geojsonDeCapa(capa).then((d) => d.features ?? []).catch((e) => { throw new Error(`No se pudo leer la capa ${capa.id}: ${e.message}`); });

/** Descarga una o varias capas en un solo GeoPackage (una tabla por capa), ya depuradas. */
export async function descargarCapasGpkg(capas, nombre) {
  const { construirGpkg } = await import('./gpkg');
  const listas = [];
  for (const capa of capas) listas.push(capaParaGpkg(capa, await leerCapa(capa)));
  descargar(nombre ?? (capas.length === 1 ? `${capas[0].id}.gpkg` : `capas_sesim_${sufijoFecha()}.gpkg`), await construirGpkg(listas), 'application/geopackage+sqlite3');
}

/** Descarga la capa completa ya depurada, en GeoPackage. */
export const descargarCapa = (capa, nombre) => descargarCapasGpkg([capa], nombre);

/** Descarga un subconjunto ya cargado (p. ej. los elementos filtrados de una capa) en GeoPackage. */
export async function descargarFeaturesGpkg(capa, features, nombre) {
  const { construirGpkg } = await import('./gpkg');
  descargar(nombre, await construirGpkg([capaParaGpkg(capa, features)]), 'application/geopackage+sqlite3');
}
