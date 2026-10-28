/**
 * Árbol de capas del geovisor construido 100 % desde la tabla `capa`
 * (MICRO · catálogo ligero, sin geometría) + `simbologia.json`.
 *
 *   Mapa Base      → grupos por `nomenclatura` (LIM, LOC, INF, NAT)
 *   Diagnóstico    → grupos por `grupos` («Diagnóstico › EEMSV …», «Siniestralidad»)
 *   Estrategias    → grupos por eje («Estrategia › Eje N»)
 *
 * Una capa puede aparecer en más de un grupo (p. ej. DTp01 está en dos
 * subgrupos de Diagnóstico, E2Tpp09 en los ejes 2 y 5). Sigue siendo UNA
 * capa: se activa por su `id`, así que prenderla en un grupo la prende en
 * todos.
 *
 * Visibilidad por estatus (sección 1.6 del documento): el geovisor público
 * solo muestra `vigente_publico`; los perfiles internos ven también las
 * capas en `borrador` (marcadas como tales).
 */
import { tablas, simbologias } from './api';
import { construirSimbologia, COLOR_POR_GRUPO, PALETA_NATURAL, PALETA_CATEGORICA } from './simbologia';
import { EJES_ESTRATEGICOS } from '../ejesEstrategicos';

export const CATEGORIAS = [
  { id: 'mapa_base', etiqueta: 'Mapa Base' },
  { id: 'diagnostico', etiqueta: 'Diagnóstico' },
  { id: 'estrategia', etiqueta: 'Estrategias' },
];

const ORDEN_MAPA_BASE = ['Límites administrativos', 'Localidades y asentamientos', 'Red de transportes e infraestructura', 'Medio físico y conservación'];

/** Capas que siempre están encendidas (contexto administrativo mínimo). */
export const CAPAS_FIJAS = new Set(['Lim03', 'Lim04']);

/** Capas que llevan etiqueta de texto permanente con su `nombre`. */
export const CAPAS_CON_ETIQUETA = new Set(['Lim04']);

function limpiarGrupo(g) {
  return (g || '').replace(/^EEMSV\s+/i, '');
}

/**
 * @param {{ incluirBorrador?: boolean }} opciones
 * @returns {Promise<{ categorias: Array, capasPorId: Map, ejes: Array }>}
 */
export async function cargarArbolCapas({ incluirBorrador = false } = {}) {
  const [{ capa, instrumento_origen }, simb] = await Promise.all([
    tablas(['capa', 'instrumento_origen']),
    simbologias(),
  ]);
  const instrumentos = new Map(instrumento_origen.map((i) => [i.id, i]));
  const visibles = capa.filter((c) => incluirBorrador || c.estatus === 'vigente_publico');

  const capasPorId = new Map();
  const grupos = { mapa_base: new Map(), diagnostico: new Map(), estrategia: new Map() };

  for (const c of visibles) {
    let colorBase = COLOR_POR_GRUPO.diagnostico;
    const pertenencias = [];
    for (const g of c.grupos_lista ?? []) {
      if (c.categoria === 'estrategia') {
        const m = /Eje\s*(\d)/.exec(g.grupo || '');
        const eje = m ? EJES_ESTRATEGICOS.find((e) => e.numero === Number(m[1])) : null;
        if (eje) {
          pertenencias.push({ clave: eje.id, etiqueta: eje.tituloCorto, eje });
          colorBase = colorBase === COLOR_POR_GRUPO.diagnostico ? eje.color : colorBase;
        }
      } else if (c.categoria === 'mapa_base') {
        pertenencias.push({ clave: g.grupo, etiqueta: g.grupo });
        colorBase = COLOR_POR_GRUPO[g.grupo] ?? colorBase;
      } else {
        const etiqueta = limpiarGrupo(g.grupo);
        pertenencias.push({ clave: etiqueta, etiqueta });
      }
    }
    if (pertenencias.length === 0) pertenencias.push({ clave: 'otras', etiqueta: 'Otras capas' });

    const enriquecida = {
      ...c,
      instrumento: c.id_instrumento ? instrumentos.get(c.id_instrumento) ?? null : null,
      colorBase,
      simbologia: construirSimbologia(c, simb[c.id] ?? null, colorBase, c.nomenclatura === 'NAT' ? PALETA_NATURAL : PALETA_CATEGORICA),
    };
    capasPorId.set(c.id, enriquecida);

    for (const p of pertenencias) {
      const mapa = grupos[c.categoria];
      if (!mapa.has(p.clave)) mapa.set(p.clave, { id: `${c.categoria}:${p.clave}`, etiqueta: p.etiqueta, eje: p.eje ?? null, capas: [] });
      mapa.get(p.clave).capas.push(enriquecida);
    }
  }

  const ordenar = (catId, lista) => {
    if (catId === 'mapa_base') return lista.sort((a, b) => ORDEN_MAPA_BASE.indexOf(a.etiqueta) - ORDEN_MAPA_BASE.indexOf(b.etiqueta));
    if (catId === 'estrategia') return lista.sort((a, b) => (a.eje?.numero ?? 9) - (b.eje?.numero ?? 9));
    return lista.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
  };

  const categorias = CATEGORIAS.map((cat) => ({
    ...cat,
    grupos: ordenar(cat.id, Array.from(grupos[cat.id].values())).map((g) => ({
      ...g,
      capas: g.capas.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true })),
    })),
  }));

  return { categorias, capasPorId };
}
