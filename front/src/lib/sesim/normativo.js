/**
 * Reglas de presentación del catálogo normativo (módulo puro).
 * Solo se presentan instrumentos con documento oficial (`publicable`) y relaciones con sustento
 * verificado; las fechas y números de publicación provienen exclusivamente del cotejo con la
 * fuente oficial (scripts/datos/banco_documental_verificacion.json).
 */
const MEDIOS = {
  DOF: 'Diario Oficial de la Federación',
  POE: 'Periódico Oficial del Estado de Campeche',
};

export const publicables = (lista) => lista.filter((d) => d.publicable !== false);

export const relacionesVerificadas = (relaciones) => relaciones.filter((r) => r.estatus === 'verificada');

export function fmtFecha(iso) {
  if (!iso) return null;
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «Diario Oficial de la Federación, 17 de mayo de 2022» · «Periódico Oficial del Estado de Campeche No. 1976, Segunda Sección, 28 de julio de 2023 (Decreto número 250)». */
export function fmtPublicacion(pub, { corto = false } = {}) {
  if (!pub?.fecha) return null;
  const medio = corto ? pub.medio : MEDIOS[pub.medio] ?? pub.medio;
  const partes = [medio + (pub.numero && !corto ? ` ${pub.numero}` : ''), fmtFecha(pub.fecha)];
  return `${partes.join(', ')}${pub.instrumento && !corto ? ` (${pub.instrumento})` : ''}`;
}

export const anioPublicacion = (d) => (d.fecha_publicacion ? d.fecha_publicacion.slice(0, 4) : '');
