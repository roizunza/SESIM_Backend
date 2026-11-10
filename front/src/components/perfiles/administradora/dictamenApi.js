import { backend } from '../../../lib/sesim/supabase';

/**
 * Funciones del backend que usa la administración al dictaminar capas (todas del servidor, ninguna simulada).
 *  · api.fn_dictaminar_capa      (migración 222): validar | publicar | rechazar (rechazar exige motivo; cuatro ojos).
 *  · api.fn_resolver_actualizacion_capa (233): aprobar | rechazar la propuesta de actualización de una capa vigente.
 *  · api.fn_definir_restriccion_capa     (233): «pública» | «interna»; publicar exige «pública» (D-17).
 */
export { dictaminarCapa } from '../../../lib/sesim/catalogoApi';
export const resolverActualizacionCapa = (id, decision, comentario = null) =>
  backend.rpc('fn_resolver_actualizacion_capa', { p_id: id, p_decision: decision, p_comentario: comentario });
export const definirRestriccionCapa = (id, restriccion) =>
  backend.rpc('fn_definir_restriccion_capa', { p_id: id, p_restriccion: restriccion });
