/**
 * Escrituras del Ciclo 4 (CRUD de catálogos, capas, instrumentos, usuarios e invitaciones).
 *
 * Todo va por las funciones `api.fn_*` del backend (migraciones 221-224). Nadie escribe directo en las tablas:
 * la función decide por rol, aplica las compuertas (D-16, D-17, D-20), exige los cuatro ojos y deja su huella
 * en la bitácora (Ciclo 5). Los mensajes de error vienen del servidor y ya están en español.
 */
import { backend } from './supabase';

const rpc = (nombre, args) => backend.rpc(nombre, args);

/* ---------- Catálogos ---------- */
export const guardarEje = (datos) => rpc('fn_guardar_eje', { p_datos: datos });
export const guardarSector = (datos) => rpc('fn_guardar_sector', { p_datos: datos });
export const guardarFuente = (datos) => rpc('fn_guardar_fuente', { p_datos: datos });
export const guardarIndicador = (datos) => rpc('fn_guardar_indicador', { p_datos: datos });
export const asignarIndicadorEje = (indicador, eje) => rpc('fn_asignar_indicador_eje', { p_indicador: indicador, p_eje: eje });
export const quitarIndicadorEje = (indicador, eje) => rpc('fn_quitar_indicador_eje', { p_indicador: indicador, p_eje: eje });
export const guardarMatrizInstrumento = (datos) => rpc('fn_guardar_matriz_instrumento', { p_datos: datos });
export const vincularIndicadorInstrumento = (indicador, instrumento, correspondencia, matriz = null) =>
  rpc('fn_vincular_indicador_instrumento', { p_indicador: indicador, p_instrumento: instrumento, p_correspondencia: correspondencia, p_matriz: matriz });
export const quitarIndicadorInstrumento = (id) => rpc('fn_quitar_indicador_instrumento', { p_id: id });
/** Solo el Administrador Titular (D-16). `indicador` null = umbral global. */
export const guardarUmbral = (indicador, verde, amarillo, desde = null) =>
  rpc('fn_guardar_umbral', { p_indicador: indicador, p_verde: verde, p_amarillo: amarillo, ...(desde ? { p_desde: desde } : {}) });

/* ---------- Capas ---------- */
export const guardarCapa = (datos) => rpc('fn_guardar_capa', { p_datos: datos });
export const enviarCapaARevision = (id) => rpc('fn_enviar_capa_revision', { p_id: id });
/** decision: 'validar' | 'publicar' | 'rechazar' (rechazar exige comentario). Administrador y Titular; cuatro ojos. */
export const dictaminarCapa = (id, decision, comentario = null) =>
  rpc('fn_dictaminar_capa', { p_id: id, p_decision: decision, p_comentario: comentario });
export const vincularCapaIndicador = (capa, indicador) => rpc('fn_vincular_capa_indicador', { p_capa: capa, p_indicador: indicador });
export const quitarCapaIndicador = (capa, indicador) => rpc('fn_quitar_capa_indicador', { p_capa: capa, p_indicador: indicador });
export const bajaCapa = (id, activo = false) => rpc('fn_baja_capa', { p_id: id, p_activo: activo });

/* ---------- Instrumentos (D-20) ---------- */
export const guardarInstrumento = (datos) => rpc('fn_guardar_instrumento', { p_datos: datos });
export const enviarInstrumentoARevision = (id) => rpc('fn_enviar_instrumento_revision', { p_id: id });
/** Solo el Administrador Titular (D-16). */
export const dictaminarInstrumento = (id, decision, comentario = null) =>
  rpc('fn_dictaminar_instrumento', { p_id: id, p_decision: decision, p_comentario: comentario });
export const bajaInstrumento = (id, activo = false) => rpc('fn_baja_instrumento', { p_id: id, p_activo: activo });

/* ---------- Usuarios e invitaciones (Administrador Titular) ---------- */
export const listarUsuarios = () => rpc('fn_usuarios', {});
export const listarInvitaciones = () => rpc('fn_invitaciones', {});
/** Devuelve { id, correo_destino, rol, expira_en, token }: el token se muestra UNA vez; la base solo guarda su huella. */
export const emitirInvitacion = (correo, rol) => rpc('fn_emitir_invitacion', { p_correo: correo, p_rol: rol });
export const revocarInvitacion = (id) => rpc('fn_revocar_invitacion', { p_id: id });
export const darDeBajaUsuario = (id) => rpc('fn_dar_de_baja_usuario', { p_id: id });
export const reactivarUsuario = (id) => rpc('fn_reactivar_usuario', { p_id: id });

/** Enlace que se envía a la persona invitada (la ruta /invitacion la atiende AceptarInvitacion). */
export const enlaceInvitacion = (token, origen = globalThis.location?.origin ?? '') => `${origen}/invitacion?token=${encodeURIComponent(token)}`;

/** Servicio de procesos, sin sesión: ¿sigue vigente el token? y canje. */
export const invitacionVigente = (token) => backend.procesosPublico(`/invitacion/${encodeURIComponent(token)}`);
export const canjearInvitacion = ({ token, password, nombre, ambito = 'estatal', cve_mun = null, dependencia = null }) =>
  backend.procesosPublico('/invitacion/canjear', { metodo: 'POST', cuerpo: { token, password, nombre, ambito, cve_mun, dependencia } });

// ---- Rechazos con plazo (ER-4) ----
export const pendientesRechazo = (incluirCerrados = false) => rpc('fn_pendientes_rechazo', { p_incluir_cerrados: incluirCerrados });
export const decidirRechazo = (idDictamen, decision) => rpc('fn_decidir_rechazo', { p_id_dictamen: idDictamen, p_decision: decision });
export const reabrirRechazo = (idDictamen) => rpc('fn_reabrir_rechazo', { p_id_dictamen: idDictamen });
export const guardarDiaInhabil = (fecha, descripcion) => rpc('fn_guardar_dia_inhabil', { p_fecha: fecha, p_descripcion: descripcion });
export const quitarDiaInhabil = (fecha) => rpc('fn_quitar_dia_inhabil', { p_fecha: fecha });
export const listarDiasInhabiles = () => backend.leer('dia_inhabil', { query: 'select=*&order=fecha' });
