import { backend } from '../../../lib/sesim/supabase';

/**
 * Propone la actualización de una capa VIGENTE (migración 233, api.fn_proponer_actualizacion_capa).
 * La capa sigue vigente hasta que la administración apruebe o rechace; un rechazo abre el plazo de 10 días hábiles.
 * datos: { archivo, n_elementos, fecha_corte, motivo, justificacion, columna_id_origen, variacion_elementos, indicadores_agregar }
 */
export const proponerActualizacionCapa = (id, datos) => backend.rpc('fn_proponer_actualizacion_capa', { p_id: id, p_datos: datos });
