const num = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

export const fmtNumero = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : num.format(Number(v)));
export const fmtVariacion = (v) => (v === null || v === undefined ? null : `${pct.format(v)} %`);

/** Valor de un token CSS (los colores de canvas salen de la hoja de estilos, no del código). */
export function tokenCss(nombre, respaldo = '') {
  if (typeof window === 'undefined') return respaldo;
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || respaldo;
}
