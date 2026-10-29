/**
 * Bitácora de cambios de cartografía e instrumentos (Ciclo 5, trazabilidad).
 *
 * Lee `api.bitacora_operativa` (migración 218), que traduce core.bitacora_cambio (solo inserción) a eventos
 * legibles: quién, qué hizo, cuándo, en qué estatus quedó y con qué motivo. Lo que ve cada perfil lo decide la RLS:
 * el Capturista solo sus cambios; Administrador, Titular y Auditor todo.
 *
 * Vocabulario. El backend usa el estatus propio de SESIM (borrador | revision | vigente_admin | vigente_publico).
 * La pantalla agrupa cada evento en cuatro estados visuales, sin perder el estatus real (`estatusSesim`):
 *   rechazado   -> el evento es un rechazo del Administrador (la capa regresó a borrador con motivo)
 *   en_revision -> la capa quedó en revisión (esperando dictamen)
 *   aprobado    -> la capa quedó vigente para uso interno (vigente_admin) o publicada (vigente_publico)
 *   borrador    -> cualquier otro (alta o ajuste en borrador)
 */
import { backend } from './supabase.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const ETIQUETA_ESTATUS_SESIM = {
  borrador: 'Borrador',
  revision: 'En revisión',
  vigente_admin: 'Vigente (uso interno)',
  vigente_publico: 'Publicada',
};

export function formatearFechaBitacora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  const dia = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dia} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

export function estadoVisual(fila) {
  if (fila.operacion === 'rechazo') return 'rechazado';
  if (fila.estatus === 'revision') return 'en_revision';
  if (fila.estatus === 'vigente_admin' || fila.estatus === 'vigente_publico') return 'aprobado';
  return 'borrador';
}

/** Fila de api.bitacora_operativa -> el objeto que pinta <BitacoraLogs>. */
export function filaALog(r) {
  const f = r.ficha_tecnica ?? {};
  return {
    id: r.id,
    recursoId: r.recurso_id,
    userId: r.codigo_usuario || 'SISTEMA',
    actorNombre: r.actor_nombre ?? 'Sistema',
    title: r.titulo,
    tipo: r.tipo,
    operacion: r.operacion,
    rol: r.rol ?? 'sistema',
    date: formatearFechaBitacora(r.creado_en),
    creadoEn: r.creado_en,
    status: estadoVisual(r),
    estatusSesim: r.estatus,
    comentarioAdmin: r.comentario_admin ?? null,
    fichaTecnica: {
      fuente: f.fuente || 'No especificada',
      responsable: f.responsable || 'Gobierno de Campeche',
      escala: f.escala || 'No especificada',
      periodicidad: f.periodicidad || 'No especificada',
      monitor: f.monitor || 'sin_asignar',
      instrumentoOrigen: f.instrumentoOrigen || '—',
      fecha: f.fecha || '—',
      horizonte: f.horizonte || '—',
      ejeEvaluacion: f.ejeEvaluacion || '—',
      restriccionUso: f.restriccionUso || null,
    },
    archivos: r.archivos ?? {},
  };
}

export async function cargarBitacoraOperativa() {
  const filas = await backend.leer('bitacora_operativa', { query: 'select=*&order=creado_en.desc' });
  return filas.map(filaALog);
}
