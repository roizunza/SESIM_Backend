/**
 * Trazabilidad de los indicadores con base en el instrumento (indicador_instrumento.correspondencia).
 * Módulo puro: lo usan la lista de indicadores, la pirámide de Inicio y las pruebas.
 */
export const RELACIONES = [
  { clave: 'origen', etiqueta: 'De origen', ayuda: 'El indicador nace del instrumento' },
  { clave: 'directa', etiqueta: 'Correspondencia directa', ayuda: 'El instrumento mide lo mismo' },
  { clave: 'parcial', etiqueta: 'Correspondencia parcial', ayuda: 'El instrumento mide un aspecto del indicador' },
];
export const SIN_ORIGEN = 'sin_origen';

/** ¿El indicador cumple el filtro de instrumento y relación? `vinculos` = filas de indicador_instrumento del indicador. */
export function cumpleTrazabilidad(vinculos = [], instrumento, relacion) {
  if (relacion === SIN_ORIGEN) return !vinculos.some((v) => v.correspondencia === 'origen') && (!instrumento || vinculos.some((v) => v.id_instrumento === instrumento));
  return !(instrumento || relacion) || vinculos.some((v) => (!instrumento || v.id_instrumento === instrumento) && (!relacion || v.correspondencia === relacion));
}

/** Conteos de indicadores (distintos) por instrumento y tipo de correspondencia. */
export function resumirTrazabilidad(indicadores, vinculosDe, instrumentos) {
  const total = indicadores.length;
  const filas = instrumentos.map((ins) => {
    const conteo = Object.fromEntries(RELACIONES.map((r) => [r.clave, 0]));
    for (const ind of indicadores) {
      const tipos = new Set((vinculosDe.get(ind.id) ?? []).filter((v) => v.id_instrumento === ins.id).map((v) => v.correspondencia));
      for (const r of RELACIONES) if (tipos.has(r.clave)) conteo[r.clave]++;
    }
    return { instrumento: ins, conteo, vinculados: RELACIONES.reduce((s, r) => s + conteo[r.clave], 0) };
  }).sort((a, b) => b.conteo.origen - a.conteo.origen || b.vinculados - a.vinculados);
  const sinOrigen = indicadores.filter((i) => !(vinculosDe.get(i.id) ?? []).some((v) => v.correspondencia === 'origen'));
  const sinVinculo = sinOrigen.filter((i) => !(vinculosDe.get(i.id) ?? []).length).length;
  return { total, filas, sinOrigen: sinOrigen.length, sinVinculo, principal: filas[0]?.conteo.origen ? filas[0] : null };
}
