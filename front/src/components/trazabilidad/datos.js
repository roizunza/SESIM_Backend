import { backend } from '../../lib/sesim/supabase';
import { cargarArbolCapas } from '../../lib/sesim/capas';

const ETIQUETA_ESTATUS = { borrador: 'Borrador', revision: 'En revisión', vigente_admin: 'Validada', vigente_publico: 'Publicada' };

/**
 * Datos de la Trazabilidad: todo sale del servidor (la RLS decide qué ve cada perfil).
 *  · api.bitacora_operativa → vida de capas e instrumentos.
 *  · api.bitacora_catalogos → vida de indicadores y de sus vínculos.
 *  · capa_indicador, indicador_instrumento, indicador_eje, eje_tematico → a qué está vinculado cada elemento.
 */
const leer = (t, query) => backend.leer(t, { query }).catch((e) => { throw new Error(`${t}: ${e.message}`); });

export async function cargarTrazabilidad() {
  const fallas = [];
  const seguro = async (t, query) => { try { return await leer(t, query); } catch (e) { fallas.push(e.message); return []; } };
  const [arbol, operativa, catalogos, instrumentos, indicadores, capaInd, indInst, indEje, ejes] = await Promise.all([
    cargarArbolCapas({ incluirBorrador: true }).catch((e) => { fallas.push(`capas: ${e.message}`); return null; }),
    seguro('bitacora_operativa', 'select=*&order=creado_en.asc&limit=5000'),
    seguro('bitacora_catalogos', 'select=*&order=creado_en.asc&limit=5000'),
    seguro('instrumento_origen', 'select=*&order=id'),
    seguro('indicador', 'select=*&order=id'),
    seguro('capa_indicador', 'select=*'),
    seguro('indicador_instrumento', 'select=*'),
    seguro('indicador_eje', 'select=*'),
    seguro('eje_tematico', 'select=*&order=id'),
  ]);
  const capas = arbol ? [...arbol.capasPorId.values()] : [];
  return { capas, operativa, catalogos, instrumentos, indicadores, capaInd, indInst, indEje, ejes, fallas };
}

/** Estado de un elemento hoy: etiqueta, si es público y en qué estación del recorrido va (0..n). */
export const ESTACIONES = {
  capa: ['Subida', 'En revisión', 'Uso interno', 'Pública'],
  instrumento: ['Subido', 'En revisión', 'Uso interno', 'Publicado'],
  indicador: ['Alta', 'Aprobado'],
};
const POS = { borrador: 0, revision: 1, vigente_admin: 2, vigente_publico: 3 };

export function estadoDe(tipo, e) {
  if (tipo === 'indicador') {
    const baja = e.activo === false;
    return { etiqueta: baja ? 'De baja' : e.estatus_aprobado ? 'Aprobado' : 'Sin aprobar', publico: !!e.estatus_aprobado && !baja, estacion: e.estatus_aprobado ? 1 : 0, baja };
  }
  const baja = e.activo === false;
  const est = tipo === 'instrumento' ? (e.estatus ?? (e.publicado ? 'vigente_publico' : 'borrador')) : e.estatus;
  const prop = tipo === 'capa' && e.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente';
  return {
    etiqueta: baja ? 'De baja' : prop ? 'Actualización propuesta' : (ETIQUETA_ESTATUS[est] ?? est),
    publico: est === 'vigente_publico' && !baja, estacion: POS[est] ?? 0, baja,
  };
}

const NOMBRE_ROL = { capturista: 'Capturista', administrador: 'Administrador', administrador_titular: 'Administrador Titular', auditor: 'Auditor' };
const quien = (r) => ({ nombre: r.actor_nombre || 'Sistema', rol: NOMBRE_ROL[r.rol] ?? null });

/** Una fila de bitácora operativa (capa o instrumento) → paso del recorrido. */
function pasoOperativo(r, tipo) {
  const q = quien(r);
  const nuevos = r.datos_nuevos?.metadatos_extra ?? {};
  const previos = r.datos_previos?.metadatos_extra ?? {};
  const base = { id: `o-${r.id}`, cuando: r.creado_en, quien: q };
  if (tipo === 'capa' && nuevos.actualizacion_pendiente && !previos.actualizacion_pendiente) {
    const p = nuevos.actualizacion_pendiente;
    return { ...base, clave: 'propuesta', titulo: 'Actualización propuesta', tono: 'info', detalle: p.motivo, nota: p.justificacion, notaDe: 'Justificación' };
  }
  if (tipo === 'capa' && nuevos.ultima_actualizacion_rechazada && !previos.ultima_actualizacion_rechazada) {
    return { ...base, clave: 'devuelta', titulo: 'Actualización rechazada', tono: 'bad', nota: nuevos.ultima_actualizacion_rechazada.motivo_rechazo, notaDe: 'Motivo', retorno: true };
  }
  if (tipo === 'capa' && nuevos.ultima_actualizacion && JSON.stringify(nuevos.ultima_actualizacion) !== JSON.stringify(previos.ultima_actualizacion)) {
    return { ...base, clave: 'actualizada', titulo: 'Actualización aprobada', tono: 'ok', detalle: `${nuevos.ultima_actualizacion.n_elementos} elementos` };
  }
  switch (r.operacion) {
    case 'nuevo': return { ...base, clave: 'nuevo', titulo: tipo === 'capa' ? 'Subida' : 'Subido', tono: 'info' };
    case 'envio': return { ...base, clave: 'envio', titulo: 'Enviada a revisión', tono: 'warn' };
    case 'aprobacion': return { ...base, clave: 'aprobacion', titulo: 'Validada · uso interno', tono: 'ok', nota: r.comentario_admin, notaDe: 'Comentario' };
    case 'publicacion': return { ...base, clave: 'publicacion', titulo: 'Publicada', tono: 'publico', nota: r.comentario_admin, notaDe: 'Comentario' };
    case 'rechazo': return { ...base, clave: 'devuelta', titulo: 'Devuelta', tono: 'bad', nota: r.comentario_admin, notaDe: 'Motivo', retorno: true };
    case 'despublicacion': return { ...base, clave: 'despublicacion', titulo: 'Retirada del público · pasa a interno', tono: 'warn', nota: r.comentario_admin, notaDe: 'Motivo', retorno: true };
    case 'baja': return { ...base, clave: 'baja', titulo: 'Dada de baja', tono: 'bad' };
    default: return { ...base, clave: 'edicion', titulo: 'Ficha editada', tono: 'neutro', menor: true };
  }
}

/** Una fila de bitácora de catálogos (indicador o vínculo) → paso del recorrido. */
function pasoCatalogo(r, idElemento) {
  const q = quien(r);
  const base = { id: `k-${r.id}`, cuando: r.creado_en, quien: q };
  if (r.tabla === 'indicador') {
    const a = r.datos_previos ?? {}; const n = r.datos_nuevos ?? {};
    if (r.accion === 'INSERT') return { ...base, clave: 'nuevo', titulo: 'Dado de alta · sin aprobar', tono: 'info' };
    if (!!a.estatus_aprobado !== !!n.estatus_aprobado) {
      return n.estatus_aprobado
        ? { ...base, clave: 'aprobacion', titulo: 'Aprobado por el Titular', tono: 'publico' }
        : { ...base, clave: 'desaprobado', titulo: 'Aprobación retirada', tono: 'warn', retorno: true };
    }
    if (a.activo !== n.activo) return n.activo === false ? { ...base, clave: 'baja', titulo: 'Dado de baja', tono: 'bad' } : { ...base, clave: 'reactivado', titulo: 'Reactivado', tono: 'ok' };
    return { ...base, clave: 'edicion', titulo: 'Ficha editada', tono: 'neutro', menor: true };
  }
  const par = String(r.recurso_id).split('|');
  const otro = par.find((x) => x !== idElemento) ?? par.join(' ↔ ');
  const etiqueta = { capa_indicador: 'capa–indicador', indicador_instrumento: 'indicador–instrumento', indicador_eje: 'indicador–eje' }[r.tabla] ?? r.tabla;
  if (r.accion === 'DELETE') return { ...base, clave: 'desvinculo', titulo: 'Vínculo quitado', tono: 'neutro', detalle: `${etiqueta} · ${otro}`, menor: true };
  return { ...base, clave: 'vinculo', titulo: 'Vínculo creado', tono: 'neutro', detalle: `${etiqueta} · ${otro}`, menor: true };
}

const VINCULOS = new Set(['capa_indicador', 'indicador_instrumento', 'indicador_eje']);
export function recorridoDe(tipo, id, d) {
  let pasos = [];
  if (tipo === 'capa') {
    pasos = d.operativa.filter((r) => r.tabla === 'capa' && r.recurso_id === id).map((r) => pasoOperativo(r, 'capa'));
    pasos.push(...d.catalogos.filter((r) => r.tabla === 'capa_indicador' && String(r.recurso_id).split('|').includes(id)).map((r) => pasoCatalogo(r, id)));
  } else if (tipo === 'instrumento') {
    pasos = d.operativa.filter((r) => r.tabla === 'instrumento_origen' && r.recurso_id === id).map((r) => pasoOperativo(r, 'instrumento'));
    pasos.push(...d.catalogos.filter((r) => r.tabla === 'indicador_instrumento' && String(r.recurso_id).split('|').includes(id)).map((r) => pasoCatalogo(r, id)));
  } else {
    pasos = d.catalogos.filter((r) => (r.tabla === 'indicador' && r.recurso_id === id) || (VINCULOS.has(r.tabla) && String(r.recurso_id).split('|').includes(id))).map((r) => pasoCatalogo(r, id));
  }
  return pasos.sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));
}

/** A qué está vinculado el elemento: columnas Instrumento → Indicador → Capa. */
export function vinculosDe(tipo, id, d) {
  const ind = new Map(d.indicadores.map((i) => [i.id, i]));
  const ins = new Map(d.instrumentos.map((i) => [i.id, i]));
  const cap = new Map(d.capas.map((c) => [c.id, c]));
  const eje = new Map(d.ejes.map((e) => [e.id, e]));
  const indDeCapa = (c) => d.capaInd.filter((r) => r.id_capa === c).map((r) => r.id_indicador);
  const capDeInd = (i) => d.capaInd.filter((r) => r.id_indicador === i).map((r) => r.id_capa);
  const insDeInd = (i) => d.indInst.filter((r) => r.id_indicador === i).map((r) => r.id_instrumento);
  const indDeIns = (s) => d.indInst.filter((r) => r.id_instrumento === s).map((r) => r.id_indicador);
  let indicadores; let instrumentos; let capas;
  if (tipo === 'capa') { indicadores = indDeCapa(id); instrumentos = indicadores.flatMap(insDeInd); capas = [id]; }
  else if (tipo === 'indicador') { indicadores = [id]; instrumentos = insDeInd(id); capas = capDeInd(id); }
  else { instrumentos = [id]; indicadores = indDeIns(id); capas = indicadores.flatMap(capDeInd); }
  const uniq = (a) => [...new Set(a)];
  const ejeDe = (i) => d.indEje.filter((r) => r.id_indicador === i).map((r) => eje.get(r.id_eje)?.nombre).filter(Boolean);
  return {
    instrumentos: uniq(instrumentos).map((x) => ({ id: x, titulo: ins.get(x)?.nombre ?? x, clave: ins.get(x)?.clave ?? x, estado: ins.get(x) ? estadoDe('instrumento', ins.get(x)) : null })),
    indicadores: uniq(indicadores).map((x) => ({ id: x, titulo: ind.get(x)?.nombre ?? x, ejes: ejeDe(x), estado: ind.get(x) ? estadoDe('indicador', ind.get(x)) : null })),
    capas: uniq(capas).map((x) => ({ id: x, titulo: cap.get(x)?.titulo ?? x, estado: cap.get(x) ? estadoDe('capa', cap.get(x)) : null })),
  };
}
