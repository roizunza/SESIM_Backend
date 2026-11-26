import { backend } from '../../../lib/sesim/supabase';

/**
 * Funciones del backend que usa la administración al dictaminar capas (todas del servidor, ninguna simulada).
 *  · api.fn_dictaminar_capa      (migración 222): validar | publicar | rechazar (rechazar exige motivo; cuatro ojos).
 *  · api.fn_resolver_actualizacion_capa (233): aprobar | rechazar la propuesta de actualización de una capa vigente.
 *  · api.fn_definir_restriccion_capa     (233): «pública» | «interna»; publicar exige «pública» (D-17).
 */
export { dictaminarCapa, bajaCapa } from '../../../lib/sesim/catalogoApi';
/**
 * Bloque A: aprobar o rechazar una actualización pasa por servicio-procesos (no directo por PostgREST), porque al APROBAR el servicio
 * ingiere las geometrías del archivo guardado, aprueba (api.fn_resolver_actualizacion_capa, con sus cuatro ojos) y cierra el conteo, todo en
 * una sola transacción: si algo falla, no queda nada a medias. Rechazar llama a la misma función de la base y descarta el archivo.
 */
export const resolverActualizacionCapa = (id, decision, comentario = null) =>
  backend.procesos(`/capas/${encodeURIComponent(id)}/actualizacion/resolver`, { cuerpo: { decision, comentario }, mensajeServidor: true });
export const definirRestriccionCapa = (id, restriccion) =>
  backend.rpc('fn_definir_restriccion_capa', { p_id: id, p_restriccion: restriccion });
