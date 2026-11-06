/**
 * Pesos espaciales de las localidades puntuales (Loc02) según su población total (censo en
 * `unidad_territorial.pob_tot`). Rangos fijados por SEDUMOP; cada uno tiene radio y opacidad propios.
 */
export const RANGOS_POBLACION = [
  { min: 1, max: 10, etiqueta: '1 a 10 habitantes', radio: 2, opacidad: 0.35 },
  { min: 11, max: 50, etiqueta: '11 a 50', radio: 2.6, opacidad: 0.45 },
  { min: 51, max: 100, etiqueta: '51 a 100', radio: 3.3, opacidad: 0.55 },
  { min: 101, max: 250, etiqueta: '101 a 250', radio: 4.1, opacidad: 0.65 },
  { min: 251, max: 500, etiqueta: '251 a 500', radio: 5, opacidad: 0.75 },
  { min: 501, max: 1000, etiqueta: '501 a 1,000', radio: 6, opacidad: 0.85 },
  { min: 1001, max: Infinity, etiqueta: 'Más de 1,000', radio: 7.5, opacidad: 0.95 },
];
export const SIN_POBLACION = { etiqueta: 'Sin población registrada', radio: 1.6, opacidad: 0.25 };
export const COLOR_POBLACION = '#691C32';

export const rangoPoblacion = (pob) => (pob > 0 ? RANGOS_POBLACION.find((r) => pob >= r.min && pob <= r.max) : SIN_POBLACION);

const normalizar = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function puntoDe(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  const anillo = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
  const [x, y] = anillo.reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0]);
  return [x / anillo.length, y / anillo.length];
}

const distancia2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/**
 * Liga cada punto de Loc02 con su localidad censal: misma localidad por nombre dentro del municipio
 * y, si hay homónimas o ninguna, la más cercana del municipio. Devuelve Map(id del elemento → { cvegeo, pob }).
 */
export function poblacionPorElemento(elementos, localidades, unidades) {
  const pob = new Map(unidades.map((u) => [u.id, Number(u.pob_tot) || 0]));
  const porMunicipio = new Map();
  for (const f of localidades) {
    const p = puntoDe(f.geometry);
    if (!p) continue;
    const lista = porMunicipio.get(f.properties.id_unidad) ?? [];
    lista.push({ id: f.properties.id, nombre: normalizar(f.properties.nombre), p });
    porMunicipio.set(f.properties.id_unidad, lista);
  }
  const resultado = new Map();
  for (const e of elementos) {
    const p = puntoDe(e.geometry);
    const candidatas = porMunicipio.get(e.properties?.id_unidad);
    if (!p || !candidatas?.length) continue;
    const nombre = normalizar(e.properties.nombre);
    const homonimas = candidatas.filter((c) => c.nombre === nombre);
    const universo = homonimas.length ? homonimas : candidatas;
    const mejor = universo.reduce((a, c) => (distancia2(c.p, p) < distancia2(a.p, p) ? c : a));
    resultado.set(e.properties.id, { cvegeo: mejor.id, pob: pob.get(mejor.id) ?? 0 });
  }
  return resultado;
}
