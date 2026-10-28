/**
 * Simbología de una capa a partir del catálogo `capa` + `simbologia.json`.
 *
 * Las capas higienizadas solo traen 4 atributos por elemento (id, nombre,
 * clasif, cve_mun). `clasif` es la clase de simbología que el pipeline
 * calculó con el .qml de la capa (la etiqueta de la categoría o regla), así
 * que toda la simbología se resuelve sobre `clasif`:
 *
 *  1. QGIS · si la capa tiene simbología convertida y ésta cubre ≥ 50 % de los
 *     elementos con una clase con nombre (o es de símbolo único), se usa tal
 *     cual (arte original del .qml).
 *  2. Categórica · si no, y la capa tiene entre 2 y 12 clases, se genera una
 *     paleta cualitativa por `clasif` (accesible, sin rojo/verde juntos).
 *  3. Única · en cualquier otro caso, un color por categoría/grupo.
 *
 * En los tres casos un elemento sin símbolo resuelto se dibuja con el estilo
 * de respaldo (nunca se oculta: el conteo del mapa debe coincidir con
 * `capa.n_elementos`).
 *
 * Módulo puro (no importa Leaflet ni React).
 */
import { createSymbolResolver, resolveLegend } from '../qgisSymbology';

/** Paleta cualitativa (12) — legible sobre mapa claro y satelital. */
export const PALETA_CATEGORICA = [
  '#9F2241', '#235B4E', '#BC955C', '#1F77B4', '#E07A1F', '#6F4E9C',
  '#2CA6A4', '#D4A017', '#7A5230', '#C2185B', '#4C7A2E', '#5B6B7F',
];
/** Para hidrografía y vegetación (Medio físico y conservación). */
export const PALETA_NATURAL = ['#1F77B4', '#2CA6A4', '#4C7A2E', '#6BAED6', '#8C6D31', '#08519C', '#74C476', '#5B6B7F'];
const GRIS_SIN_CATEGORIA = '#9CA3AF';

/** Color de respaldo por categoría / grupo / eje. */
export const COLOR_POR_GRUPO = {
  'Límites administrativos': '#1F2937',
  'Localidades y asentamientos': '#E07A1F',
  'Red de transportes e infraestructura': '#78716C',
  'Medio físico y conservación': '#16A34A',
  diagnostico: '#64748B',
};

export function estiloPorGeometria(color, geom, opacidad = 1) {
  switch (geom) {
    case 'polygon':
      return { fillColor: color, fillOpacity: 0.35 * opacidad, color, weight: 1.2, opacity: 0.9 * opacidad };
    case 'point':
      return { radius: 5, fillColor: color, fillOpacity: 0.85 * opacidad, color: '#ffffff', weight: 1, opacity: opacidad };
    case 'line':
    default:
      return { color, weight: 2.2, opacity: 0.85 * opacidad };
  }
}

const UMBRAL_COBERTURA_QGIS = 0.5;

/**
 * @param {object} capa      fila de `capa` (con `clases`, `geom`)
 * @param {object|null} qgis entrada de simbologia.json para esa capa
 * @param {string} colorBase color de respaldo
 * @param {string[]} paleta  paleta categórica (por grupo temático)
 * @returns {{ modo: 'qgis'|'categorica'|'unica', qgis?: object, simboloDe?: Function,
 *             colorDe: (props) => string, leyenda: Array }}
 */
export function construirSimbologia(capa, qgis, colorBase, paleta = PALETA_CATEGORICA) {
  const clases = (capa.clases ?? []).filter((c) => c !== null && c !== undefined);
  const exacta = qgis?.cobertura_exacta ?? qgis?.cobertura_clasif ?? 0;
  const usarQgis = qgis && (qgis.tipo === 'singleSymbol' || exacta >= UMBRAL_COBERTURA_QGIS || clases.length < 2 || clases.length > 12);

  if (usarQgis) {
    return {
      modo: 'qgis',
      qgis,
      simboloDe: createSymbolResolver(qgis),
      colorDe: () => colorBase,
      leyenda: resolveLegend(qgis).map((m) => ({ etiqueta: m.label ?? capa.titulo, simbolo: m.symbol })),
    };
  }

  if (clases.length >= 2 && clases.length <= 12) {
    const colores = new Map();
    let i = 0;
    for (const c of clases) {
      colores.set(c, c === 'Sin categoría' ? GRIS_SIN_CATEGORIA : paleta[i++ % paleta.length]);
    }
    return {
      modo: 'categorica',
      colorDe: (props) => colores.get(props?.clasif) ?? colorBase,
      leyenda: clases.map((c) => ({ etiqueta: c, color: colores.get(c) })),
    };
  }

  return {
    modo: 'unica',
    colorDe: () => colorBase,
    leyenda: [{ etiqueta: clases[0] ?? capa.titulo, color: colorBase }],
  };
}
