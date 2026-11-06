/**
 * Análisis de campos, simbología por campo y filtros de una capa del geovisor (módulo puro).
 *
 * Trabaja sobre las `properties` reales de cada elemento: con los GeoJSON ligeros son las llaves
 * del modelo (id, nombre, clasif, cve_mun, id_unidad); cuando el backend sirva `capa_vector` con
 * sus columnas temáticas, los mismos controles las ofrecen sin cambios.
 */
import { PALETA_CATEGORICA } from './paletas.js';

/** Rampa secuencial (clara → oscura) para simbología graduada. */
export const RAMPA_GRADUADA = ['#f6e7ea', '#e3b3c0', '#c97a90', '#a3465f', '#6e1f37'];
export const COLOR_OTROS = '#9CA3AF';
export const COLOR_NEUTRO = '#8A8F96';
const MAX_CATEGORIAS = 12;
const MAX_VALORES = 200;
const CAMPOS_OCULTOS = new Set(['id']);

const esNumero = (v) => v !== null && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));
/** Un valor de texto con cero inicial («004», «04002») es un código, no una cantidad. */
const esCodigo = (v) => typeof v === 'string' && /^0\d/.test(v.trim());
const vacio = (v) => v === null || v === undefined || v === '';

/** Describe cada campo: tipo (numérico/texto), nulos, valores distintos con frecuencia, mínimo y máximo. */
export function analizarCampos(features) {
  const campos = new Map();
  for (const f of features) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (!campos.has(k)) campos.set(k, { campo: k, nulos: 0, numericos: 0, frecuencias: new Map(), min: Infinity, max: -Infinity });
      const c = campos.get(k);
      if (vacio(v)) {
        c.nulos++;
        continue;
      }
      if (esCodigo(v)) c.codigos = (c.codigos ?? 0) + 1;
      if (esNumero(v)) {
        c.numericos++;
        c.min = Math.min(c.min, Number(v));
        c.max = Math.max(c.max, Number(v));
      }
      const clave = String(v);
      if (c.frecuencias.size < MAX_VALORES || c.frecuencias.has(clave)) c.frecuencias.set(clave, (c.frecuencias.get(clave) ?? 0) + 1);
    }
  }
  const total = features.length;
  return [...campos.values()].map((c) => {
    const conValor = total - c.nulos;
    const tipo = conValor > 0 && c.numericos === conValor && !c.codigos ? 'numerico' : 'texto';
    const valores = [...c.frecuencias].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n);
    return {
      campo: c.campo,
      tipo,
      nulos: c.nulos,
      distintos: c.frecuencias.size,
      valores,
      min: tipo === 'numerico' ? c.min : null,
      max: tipo === 'numerico' ? c.max : null,
      oculto: CAMPOS_OCULTOS.has(c.campo),
      categorizable: c.frecuencias.size >= 1 && c.frecuencias.size <= MAX_VALORES,
    };
  });
}

/** Cortes de clase para un campo numérico: intervalos iguales o cuantiles. */
export function cortes(valores, metodo = 'cuantiles', clases = 5) {
  const nums = valores.filter(esNumero).map(Number).sort((a, b) => a - b);
  if (!nums.length) return [];
  const [min, max] = [nums[0], nums[nums.length - 1]];
  if (min === max) return [min, max];
  const limites = [min];
  for (let i = 1; i < clases; i++) {
    limites.push(metodo === 'intervalos' ? min + ((max - min) * i) / clases : nums[Math.min(nums.length - 1, Math.floor((nums.length * i) / clases))]);
  }
  limites.push(max);
  return [...new Set(limites)];
}

const fmt = (n) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });

/**
 * Simbología derivada de un campo. `config` = { modo: 'categorias'|'graduado'|'unico', campo, metodo, clases, color }.
 * Devuelve { colorDe(props), leyenda: [{ etiqueta, color, n? }] }.
 */
export function simbologiaPorCampo(features, config, colorBase) {
  if (config.modo === 'unico' || !config.campo) {
    return { colorDe: () => config.color ?? colorBase, leyenda: [{ etiqueta: 'Todos los elementos', color: config.color ?? colorBase }] };
  }
  const valores = features.map((f) => f.properties?.[config.campo]);
  if (config.modo === 'graduado') {
    const lim = cortes(valores, config.metodo, config.clases ?? 5);
    if (lim.length < 2) return { colorDe: () => colorBase, leyenda: [{ etiqueta: 'Sin valores numéricos', color: colorBase }] };
    const n = lim.length - 1;
    const rampa = Array.from({ length: n }, (_, i) => RAMPA_GRADUADA[Math.round((i * (RAMPA_GRADUADA.length - 1)) / Math.max(1, n - 1))]);
    const claseDe = (v) => {
      if (!esNumero(v)) return -1;
      const x = Number(v);
      for (let i = 0; i < n; i++) if (x <= lim[i + 1]) return i;
      return n - 1;
    };
    return {
      colorDe: (p) => {
        const k = claseDe(p?.[config.campo]);
        return k < 0 ? COLOR_OTROS : rampa[k];
      },
      leyenda: [
        ...rampa.map((color, i) => ({ etiqueta: `${fmt(lim[i])} – ${fmt(lim[i + 1])}`, color })),
        ...(valores.some((v) => !esNumero(v)) ? [{ etiqueta: 'Sin dato', color: COLOR_OTROS }] : []),
      ],
    };
  }
  const frec = new Map();
  for (const v of valores) {
    const k = vacio(v) ? null : String(v);
    frec.set(k, (frec.get(k) ?? 0) + 1);
  }
  const ordenadas = [...frec].filter(([k]) => k !== null).sort((a, b) => b[1] - a[1]);
  const principales = ordenadas.slice(0, MAX_CATEGORIAS);
  const colores = new Map(principales.map(([k], i) => [k, PALETA_CATEGORICA[i % PALETA_CATEGORICA.length]]));
  const resto = ordenadas.slice(MAX_CATEGORIAS).reduce((s, [, n]) => s + n, 0) + (frec.get(null) ?? 0);
  return {
    colorDe: (p) => colores.get(vacio(p?.[config.campo]) ? null : String(p[config.campo])) ?? COLOR_OTROS,
    leyenda: [
      ...principales.map(([k, n]) => ({ etiqueta: k, color: colores.get(k), n })),
      ...(resto ? [{ etiqueta: ordenadas.length > MAX_CATEGORIAS ? 'Otros valores / sin dato' : 'Sin dato', color: COLOR_OTROS, n: resto }] : []),
    ],
  };
}

/**
 * Filtros por atributo (se combinan con Y). Cada filtro:
 *   { campo, tipo: 'valores', valores: string[] }  — el valor está en la lista
 *   { campo, tipo: 'rango', min, max }              — numérico dentro del rango (extremos opcionales)
 *   { campo, tipo: 'texto', texto }                 — contiene el texto (sin distinguir mayúsculas)
 */
export function cumpleFiltros(props, filtros = []) {
  for (const f of filtros) {
    const v = props?.[f.campo];
    if (f.tipo === 'valores' && f.valores?.length && !f.valores.includes(vacio(v) ? '' : String(v))) return false;
    if (f.tipo === 'rango') {
      if (!esNumero(v)) return false;
      if (f.min !== '' && f.min !== undefined && f.min !== null && Number(v) < Number(f.min)) return false;
      if (f.max !== '' && f.max !== undefined && f.max !== null && Number(v) > Number(f.max)) return false;
    }
    if (f.tipo === 'texto' && f.texto && !String(v ?? '').toLowerCase().includes(String(f.texto).toLowerCase())) return false;
  }
  return true;
}

export const filtrosActivosCapa = (filtros = []) =>
  filtros.filter((f) => (f.tipo === 'valores' && f.valores?.length) || (f.tipo === 'rango' && (f.min !== '' || f.max !== '')) || (f.tipo === 'texto' && f.texto)).length;

/** Estado inicial de la configuración visual de una capa. */
export const CONFIG_INICIAL = Object.freeze({ simbologia: true, estilo: { modo: 'original' }, filtros: [] });

/**
 * Estilo efectivo de una capa según su configuración:
 *   simbologia = false → trazo neutro (la capa sigue visible como contexto, sin leyenda)
 *   estilo.modo = 'original' → simbología del catálogo (QGIS / categórica / única)
 *   otro modo → simbología por campo
 * Devuelve { tipo: 'neutro'|'original'|'campo', colorDe?, leyenda }.
 */
export function resolverEstilo(capa, config, features) {
  if (!config.simbologia) return { tipo: 'neutro', colorDe: () => COLOR_NEUTRO, leyenda: [] };
  if (config.estilo.modo === 'original' || !features) return { tipo: 'original', leyenda: capa.simbologia.leyenda };
  const s = simbologiaPorCampo(features, config.estilo, capa.colorBase);
  return { tipo: 'campo', ...s };
}
