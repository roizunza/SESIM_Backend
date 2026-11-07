import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { backend } from './supabase';

/**
 * Capa de datos REAL de mediciones (Ciclo 8). Reemplaza a `operacion.js` solo
 * para mediciones, periodos, evidencias y dictámenes; hallazgos, invitaciones
 * y bitácora siguen en operacion.js hasta sus ciclos.
 *
 * Lecturas: vistas api.* (security_invoker; la RLS decide qué ve cada perfil).
 * Escrituras: únicamente funciones api.fn_* (SECURITY DEFINER), que validan
 * permisos, cuatro ojos, evidencia vigente (R12) y dejan bitácora y dictamen.
 */

const rpc = (nombre, args) => backend.rpc(nombre, args);
const leer = (tabla, query) => backend.leer(tabla, { query });

// ---- Almacén reactivo mínimo (un solo lugar de verdad para todos los componentes) ----
let estado = { mediciones: [], periodos: [], evidencias: [], dictamenes: [], devueltas: [], cargado: false, cargando: false, error: null };
const oyentes = new Set();
const emitir = (parcial) => {
  estado = { ...estado, ...parcial };
  oyentes.forEach((f) => f());
};
const suscribir = (f) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};
const instantanea = () => estado;

let enVuelo = null;

/** Lee de la API todo lo necesario para mostrar mediciones. Reutiliza la carga en curso. */
export function recargarMediciones() {
  if (enVuelo) return enVuelo;
  emitir({ cargando: true });
  enVuelo = Promise.all([
    leer('medicion_indicador', 'select=*&order=updated_at.desc'),
    leer('periodo', 'select=*&order=id'),
    leer('evidencia_medicion', 'select=*&order=fecha_subida.desc'),
    leer('dictamen', 'select=*&objeto_tipo=eq.medicion&order=fecha.desc'),
  ])
    .then(([mediciones, periodos, evidencias, dictamenes]) => emitir({ mediciones, periodos, evidencias, dictamenes, cargado: true, cargando: false, error: null }))
    .catch((e) => emitir({ cargando: false, error: e.message || 'No se pudieron leer las mediciones.' }))
    .finally(() => {
      enVuelo = null;
    });
  return enVuelo;
}

// Al entrar o salir de la sesión cambia lo que la RLS deja ver: se descarta y se vuelve a leer.
backend.suscribir(() => {
  emitir({ mediciones: [], periodos: [], evidencias: [], dictamenes: [], devueltas: [], cargado: false, error: null });
});

/** Hook: `{ mediciones, periodos, evidencias, dictamenes, cargado, cargando, error, recargar }`. */
export function useMediciones() {
  const s = useSyncExternalStore(suscribir, instantanea, instantanea);
  useEffect(() => {
    if (!s.cargado && !s.cargando && !s.error) recargarMediciones();
  }, [s.cargado, s.cargando, s.error]);
  const recargar = useCallback(() => recargarMediciones(), []);
  return { ...s, recargar };
}

// ---- Escrituras (cada una refresca el almacén al terminar) ----

/**
 * Guarda como borrador (o corrige una borrador/rechazada). El servidor crea el periodo.
 * datos: { id?, id_indicador, id_unidad, tipo_periodo, anio, sub, valor, valor_texto, desagregaciones }
 */
export async function guardarMedicionApi(datos) {
  const limpio = {
    ...(datos.id ? { id: datos.id } : {}),
    id_indicador: datos.id_indicador,
    id_unidad: datos.id_unidad,
    tipo_periodo: datos.tipo_periodo,
    anio: datos.anio,
    sub: datos.tipo_periodo === 'anual' ? null : datos.sub,
    valor: datos.valor === '' || datos.valor === null || datos.valor === undefined ? null : Number(datos.valor),
    valor_texto: datos.valor_texto?.trim() ? datos.valor_texto.trim() : null,
    desagregaciones: datos.desagregaciones ?? {},
  };
  const fila = await rpc('fn_guardar_medicion', { p_datos: limpio });
  await recargarMediciones();
  return fila;
}

/** borrador | rechazado → revision. Exige evidencia vigente. */
export async function enviarMedicionApi(id) {
  const fila = await rpc('fn_enviar_medicion_revision', { p_id: id });
  await recargarMediciones();
  return fila;
}

/** Administrador: decision = 'validar' | 'publicar' | 'rechazar' (rechazar exige comentario). */
export async function dictaminarMedicionApi(id, decision, comentario = null) {
  const fila = await rpc('fn_dictaminar_medicion', { p_id: id, p_decision: decision, p_comentario: comentario });
  await recargarMediciones();
  return fila;
}

/** Mediciones que el administrador devolvió (el capturista ve solo las suyas). */
export async function medicionesDevueltas() {
  const r = await rpc('fn_mediciones_devueltas', {});
  const lista = Array.isArray(r) ? r : [];
  emitir({ devueltas: lista });
  return lista;
}

// ---- Derivados ----

/** Último dictamen de una medición (los dictámenes llegan ordenados del más reciente al más antiguo). */
export const ultimoDictamenDe = (idMedicion, dictamenes) => dictamenes.find((d) => d.objeto_id === idMedicion) ?? null;

/** Evidencia vigente de una medición (hay una sola). */
export const evidenciaVigenteDe = (idMedicion, evidencias) => evidencias.find((e) => e.id_medicion === idMedicion && e.vigente) ?? null;

/** Nombre legible del archivo: la ruta es <id_medicion>/<sha256>.<ext>, así que se muestra la huella corta. */
export function nombreEvidencia(ev) {
  const ext = /\.([a-z0-9]+)$/i.exec(ev?.url_archivo ?? '')?.[1] ?? '';
  return `${ev?.tipo_documento ?? 'Evidencia'}${ext ? ` (.${ext})` : ''} · ${String(ev?.hash_archivo ?? '').slice(0, 8)}`;
}
