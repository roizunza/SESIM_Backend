/** Rutas del portal público en un solo lugar (navegación, enlaces de trazabilidad y redirecciones). */
export const RUTAS = {
  inicio: '/',
  geovisor: '/geovisor',
  catalogo: '/catalogo',
  tableroPublico: '/tablero-de-seguimiento',
  seguimiento: '/seguimiento',
  indicadores: '/seguimiento/indicadores',
  tablero: '/seguimiento/tablero',
  proyectos: '/seguimiento/proyectos',
  acceso: '/admin',
};

export const SECCIONES_INICIO = { vision: 'vision', marco: 'marco-juridico' };

export const enlace = {
  fichaIndicador: (id) => `${RUTAS.indicadores}?indicador=${encodeURIComponent(id)}`,
  indicadoresDeInstrumento: (idInstrumento, relacion) => `${RUTAS.indicadores}?instrumento=${encodeURIComponent(idInstrumento)}${relacion ? `&relacion=${encodeURIComponent(relacion)}` : ''}`,
  tableroDeIndicador: (id) => `${RUTAS.tablero}?ind=${encodeURIComponent(id)}`,
  fichaInstrumento: (id) => `${RUTAS.catalogo}?ficha=${encodeURIComponent(id)}`,
  capasDeIndicador: (id) => `${RUTAS.geovisor}?indicador=${encodeURIComponent(id)}`,
  seccionInicio: (seccion) => `${RUTAS.inicio}#${seccion}`,
};
