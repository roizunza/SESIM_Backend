/**
 * F04 · fn_semaforo — misma lógica que la función SQL del documento (7.2).
 *
 *   sin dato         → no hay medición vigente_publico para ese corte
 *   sin línea base   → el indicador todavía no tiene línea base
 *   con meta numérica (valor_meta ≠ linea_base):
 *        avance = (valor − linea_base) / (valor_meta − linea_base)
 *        verde ≥ verde_desde · amarillo ≥ amarillo_desde · rojo debajo
 *        (umbral vigente de api.umbral_publico: el del indicador o el global; 90/70 si no hay)
 *   sin meta numérica: compara contra la línea base según la tendencia
 *        mejora · estable · retrocede
 *
 * Módulo puro.
 */
export const COLORES_SEMAFORO = {
  verde: '#10B981',
  amarillo: '#F59E0B',
  rojo: '#EF4444',
  mejora: '#10B981',
  estable: '#9CA3AF',
  retrocede: '#EF4444',
  'sin línea base': '#BCA986',
  'sin dato': '#D1D5DB',
};

/** Umbral por omisión: mismo default que core.umbral_semaforo (verde_desde 90, amarillo_desde 70). */
export const UMBRAL_BASE = Object.freeze({ verde_desde: 90, amarillo_desde: 70 });

/**
 * Umbral vigente a una fecha para un indicador: primero el suyo, luego el global (id_indicador null).
 * `umbrales` son filas de api.umbral_publico.
 */
export function umbralVigente(umbrales, idIndicador, fecha = new Date().toISOString().slice(0, 10)) {
  const vigentes = (umbrales ?? []).filter((u) => String(u.vigente_desde) <= fecha && (!u.vigente_hasta || String(u.vigente_hasta) >= fecha));
  return vigentes.find((u) => u.id_indicador === idIndicador) ?? vigentes.find((u) => u.id_indicador == null) ?? UMBRAL_BASE;
}

export function fnSemaforo({ valor, linea_base, valor_meta, tendencia, umbral = UMBRAL_BASE }) {
  if (valor === null || valor === undefined || valor === '' || Number.isNaN(Number(valor))) return 'sin dato';
  if (linea_base === null || linea_base === undefined || linea_base === '') return 'sin línea base';
  const v = Number(valor);
  const lb = Number(linea_base);
  const s = tendencia === 'Descendente' ? -1 : 1;
  if (valor_meta !== null && valor_meta !== undefined && valor_meta !== '' && Number(valor_meta) !== lb) {
    const avance = (v - lb) / (Number(valor_meta) - lb);
    if (avance * 100 >= Number(umbral.verde_desde)) return 'verde';
    if (avance * 100 >= Number(umbral.amarillo_desde)) return 'amarillo';
    return 'rojo';
  }
  if (s * (v - lb) > 0) return 'mejora';
  if (s * (v - lb) < 0) return 'retrocede';
  return 'estable';
}

export function avancePct({ valor, linea_base, valor_meta }) {
  if ([valor, linea_base, valor_meta].some((x) => x === null || x === undefined || x === '')) return null;
  const den = Number(valor_meta) - Number(linea_base);
  if (!den) return null;
  return ((Number(valor) - Number(linea_base)) / den) * 100;
}
