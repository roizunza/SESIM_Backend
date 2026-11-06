import { EJES_ESTRATEGICOS } from '../ejesEstrategicos';

/** Niveles de la Matriz de Indicadores para Resultados, del más amplio al más concreto. */
export const NIVELES_MIR = [
  { clave: 'Fin', etiqueta: 'Fin (impacto)', texto: 'El cambio de fondo al que se contribuye.' },
  { clave: 'Propósito', etiqueta: 'Propósito (resultado)', texto: 'Lo que se busca lograr.' },
  { clave: 'Componentes', etiqueta: 'Componentes (productos y servicios)', texto: 'Lo que se entrega para lograrlo.' },
  { clave: 'Actividades', etiqueta: 'Actividades (insumos y procesos)', texto: 'Lo que se hace para entregarlo.' },
];

export const nivelDe = (i) => NIVELES_MIR.find((n) => String(i.nivel_mir ?? '').startsWith(n.clave))?.clave;

/**
 * Indicadores por Estrategia y por nivel MIR (puente indicador_eje; el eje principal si no hay vínculo).
 * `aprobados` cuenta los indicadores con `estatus_aprobado`, por estrategia y en total.
 * Necesita las tablas indicador, indicador_eje y eje_tematico.
 */
export function resumenEstrategias(datos) {
  if (!datos) return null;
  const numeroDe = new Map(datos.eje_tematico.map((e) => [e.id, e.numero_eje]));
  const ejesDe = new Map();
  for (const v of datos.indicador_eje) {
    if (!ejesDe.has(v.id_indicador)) ejesDe.set(v.id_indicador, new Set());
    ejesDe.get(v.id_indicador).add(numeroDe.get(v.id_eje));
  }
  const porEje = {};
  for (const e of EJES_ESTRATEGICOS) porEje[e.numero] = { total: 0, aprobados: 0, mir: Object.fromEntries(NIVELES_MIR.map((n) => [n.clave, 0])) };
  const mirTotal = Object.fromEntries(NIVELES_MIR.map((n) => [n.clave, 0]));
  let aprobados = 0;
  for (const i of datos.indicador) {
    const nivel = nivelDe(i);
    if (nivel) mirTotal[nivel] += 1;
    if (i.estatus_aprobado) aprobados += 1;
    const ejes = ejesDe.get(i.id) ?? new Set([numeroDe.get(i.id_eje)]);
    for (const n of ejes) {
      if (!porEje[n]) continue;
      porEje[n].total += 1;
      if (i.estatus_aprobado) porEje[n].aprobados += 1;
      if (nivel) porEje[n].mir[nivel] += 1;
    }
  }
  return { total: datos.indicador.length, aprobados, porEje, mirTotal };
}
