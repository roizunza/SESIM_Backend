import { createContext, useContext } from 'react';

/**
 * Estado global de filtros del portal público.
 *
 * Una sola fuente de verdad para el tablero, el mapa, las gráficas, la vista tabular,
 * las exportaciones y el seguimiento de proyectos: cualquier componente que cambie un
 * filtro despacha aquí y todos los demás se recalculan con el mismo estado.
 *
 *   periodoDesde / periodoHasta  `periodo.id` (rango por `fecha_inicio`)
 *   municipio                    `unidad_territorial.id` de nivel municipio
 *   eje                          `eje_tematico.id`
 *   tipoUsuario                  id de la jerarquía de la movilidad (contenido/jerarquia_movilidad.json)
 *   jerarquiaVial                valor de `medicion_indicador.desagregaciones.jerarquia_vial`
 *   indicador                    `indicador.id` enfocado en mapa y gráficas
 *   vista                        'grafica' | 'tabla'
 *   comparar                     segundo corte: otro rango de periodos u otro municipio
 */
export const FILTROS_INICIALES = Object.freeze({
  periodoDesde: '',
  periodoHasta: '',
  municipio: '',
  eje: '',
  tipoUsuario: '',
  jerarquiaVial: '',
  indicador: '',
  vista: 'grafica',
  comparar: Object.freeze({ activo: false, modo: 'periodo', municipio: '', periodoDesde: '', periodoHasta: '' }),
});

export function reductor(estado, accion) {
  switch (accion.tipo) {
    case 'fijar':
      return { ...estado, [accion.campo]: accion.valor };
    case 'fijarVarios':
      return { ...estado, ...accion.valores };
    case 'comparar':
      return { ...estado, comparar: { ...estado.comparar, ...accion.valores } };
    case 'reiniciar':
      return FILTROS_INICIALES;
    case 'reemplazar':
      return accion.filtros;
    default:
      return estado;
  }
}

export const ContextoFiltros = createContext(null);

export function useFiltros() {
  const ctx = useContext(ContextoFiltros);
  if (!ctx) throw new Error('useFiltros debe usarse dentro de <FiltrosProvider>.');
  return ctx;
}

/** Cuenta los filtros que difieren del estado inicial (para el botón Reset y la accesibilidad). */
export function filtrosActivos(filtros) {
  const simples = ['periodoDesde', 'periodoHasta', 'municipio', 'eje', 'tipoUsuario', 'jerarquiaVial', 'indicador'];
  return simples.filter((k) => filtros[k]).length + (filtros.comparar.activo ? 1 : 0);
}

/* Parámetros de URL: el corte del tablero se puede compartir y recargar como enlace. */
const SIMPLES = { periodoDesde: 'desde', periodoHasta: 'hasta', municipio: 'mun', eje: 'eje', tipoUsuario: 'usuario', jerarquiaVial: 'vial', indicador: 'ind' };
const COMPARAR = { municipio: 'cmun', periodoDesde: 'cdesde', periodoHasta: 'chasta' };

export function filtrosAParametros(filtros) {
  const p = new URLSearchParams();
  for (const [campo, clave] of Object.entries(SIMPLES)) if (filtros[campo]) p.set(clave, filtros[campo]);
  if (filtros.vista !== FILTROS_INICIALES.vista) p.set('vista', filtros.vista);
  if (filtros.comparar.activo) {
    p.set('cmp', filtros.comparar.modo);
    for (const [campo, clave] of Object.entries(COMPARAR)) if (filtros.comparar[campo]) p.set(clave, filtros.comparar[campo]);
  }
  return p;
}

export function parametrosAFiltros(params) {
  const filtros = { ...FILTROS_INICIALES, comparar: { ...FILTROS_INICIALES.comparar } };
  for (const [campo, clave] of Object.entries(SIMPLES)) filtros[campo] = params.get(clave) ?? '';
  if (params.get('vista') === 'tabla') filtros.vista = 'tabla';
  const modo = params.get('cmp');
  if (modo === 'periodo' || modo === 'municipio') {
    filtros.comparar.activo = true;
    filtros.comparar.modo = modo;
    for (const [campo, clave] of Object.entries(COMPARAR)) filtros.comparar[campo] = params.get(clave) ?? '';
  }
  return filtros;
}

export const CLAVES_URL = [...Object.values(SIMPLES), ...Object.values(COMPARAR), 'vista', 'cmp'];

/** Hay al menos un parámetro de filtro en la URL. */
export function urlTraeFiltros(params) {
  return CLAVES_URL.some((k) => params.has(k));
}
