/** Utilidades de presentación compartidas (sin React). */

export function fechaCorta(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** Nombre legible de una unidad territorial (municipio o localidad). */
export function nombreUnidad(unidadesPorId, id) {
  const u = unidadesPorId?.get(id);
  if (!u) return id ?? '—';
  return u.nivel === 'municipio' ? `${u.nom_mun}` : `${u.nom_loc}, ${u.nom_mun}`;
}

export function valorLegible(m) {
  if (m.valor !== null && m.valor !== undefined) return Number(m.valor).toLocaleString('es-MX', { maximumFractionDigits: 4 });
  return m.valor_texto ?? '—';
}

export const ACCION_LEGIBLE = {
  INSERT: 'Alta',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  'cambio de estado': 'Cambio de estado',
};

export function bytesLegibles(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
