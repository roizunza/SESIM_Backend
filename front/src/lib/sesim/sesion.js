/**
 * Sesión y perfiles institucionales (bloque TRANSVERSAL · perfil / usuario).
 *
 * Perfiles canónicos = filas de la tabla `perfil` (id 1..4). El front usa la
 * clave en minúsculas como identificador de código; `id_perfil` es la llave
 * real que tendrá `usuario.id_perfil`.
 *
 * Matriz de permisos = Tabla 3 del documento de arquitectura de datos v2.2:
 *
 *   Perfil                 Escribe en                                   Lee
 *   capturista             medicion_indicador (borrador),               catálogos, sus mediciones
 *                          evidencia_medicion
 *   administrador          catálogos Macro, indicador, capa,            todo
 *                          estado de medicion_indicador
 *   administrador_titular  lo mismo + invitacion; baja en usuario       todo
 *   auditor                solo hallazgos de auditoría                  todo, incluida bitácora
 *
 * La sesión es REAL (sin simulación): sale de un inicio de sesión contra GoTrue
 * y el perfil de `api.mi_perfil` (ver supabase.js). La autorización real la
 * hacen las políticas RLS del backend y, desde el Ciclo 8, `fn_transicion_estado`
 * (F10); esta matriz solo decide qué ve y qué botones muestra la interfaz.
 */
import { useSyncExternalStore } from 'react';
import { backend } from './supabase';

export const PERFILES = {
  capturista: { id_perfil: 1, clave: 'capturista', nombre: 'Capturista' },
  auditor: { id_perfil: 2, clave: 'auditor', nombre: 'Auditor' },
  administrador: { id_perfil: 3, clave: 'administrador', nombre: 'Administrador' },
  administrador_titular: { id_perfil: 4, clave: 'administrador_titular', nombre: 'Administrador Titular' },
};

export const PERMISOS = {
  capturista: { capturarMedicion: true, subirEvidencia: true, verTodasLasMediciones: false },
  administrador: { validarMedicion: true, publicarMedicion: true, gestionarCapas: true, gestionarCatalogos: true, verTodasLasMediciones: true, verBitacora: true },
  administrador_titular: { validarMedicion: true, publicarMedicion: true, gestionarCapas: true, gestionarCatalogos: true, verTodasLasMediciones: true, verBitacora: true, emitirInvitacion: true, darDeBaja: true },
  auditor: { registrarHallazgo: true, verificarEvidencia: true, verTodasLasMediciones: true, verBitacora: true },
};

/** Normaliza nombres heredados (administradora, auditora, administrador_vip). */
export function perfilCanonico(valor) {
  const v = String(valor || '').toLowerCase().trim();
  if (v === 'administradora') return 'administrador';
  if (v === 'auditora') return 'auditor';
  if (v === 'administrador_vip' || v === 'titular' || v === 'administrador titular') return 'administrador_titular';
  return PERFILES[v] ? v : null;
}

export function puede(perfil, accion) {
  return !!PERMISOS[perfilCanonico(perfil)]?.[accion];
}

const oyentes = new Set();

// Restos de la sesión simulada anterior: se eliminan para que NADIE entre con ellos.
try {
  ['sesim_sesion', 'sim_role', 'sim_user_id'].forEach((k) => globalThis.localStorage?.removeItem(k));
} catch {
  /* almacenamiento no disponible */
}

/** Proyección de la sesión del backend a lo que consume la interfaz. */
function proyectar(s) {
  if (!s) return null;
  const p = s.perfil;
  const perfil = perfilCanonico(p.rol);
  if (!perfil) return null;
  return {
    id: s.usuario.id, // = auth.users.id = core.perfil.id_usuario
    correo: s.usuario.correo,
    nombre: p.nombre,
    perfil,
    id_perfil: PERFILES[perfil].id_perfil,
    // Ámbito del capturista: municipal -> '04'+cve_mun; estatal -> null (hoy todo es estatal).
    id_unidad: p.ambito === 'municipal' && p.cve_mun ? `04${p.cve_mun}` : null,
    dependencia: p.dependencia ?? null,
    inicio: s.inicio,
  };
}

// La sesión guardada NO se confía: hasta que el servidor la revalida (token y perfil
// actuales) `actual` es null y `verificando` es true (las rutas internas esperan).
let actual = null;
let verificando = !!backend.sesionGuardada();

function verificar() {
  verificando = !!backend.sesionGuardada();
  oyentes.forEach((fn) => fn());
  if (!verificando) return Promise.resolve();
  return backend.restaurar().finally(() => {
    verificando = false;
    actual = proyectar(backend.sesionGuardada());
    oyentes.forEach((fn) => fn());
  });
}

backend.suscribir(() => {
  if (verificando) return;
  actual = proyectar(backend.sesionGuardada());
  oyentes.forEach((fn) => fn());
});

verificar();

// Cierre/inicio de sesión en otra pestaña: se relee y se revalida.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'sesim_auth') return;
    actual = null;
    backend.releer();
    verificar();
  });
}

/** UUID v4 (crypto.randomUUID con respaldo). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Paso 1 del acceso: valida correo y contraseña contra GoTrue y el perfil contra la base. No activa la sesión. */
export const autenticar = (correo, password) => backend.autenticar(correo, password);

/** Paso 2: activa la sesión ya validada (tras aceptar las políticas de uso). */
export function activarSesion(candidata) {
  backend.activar(candidata);
  return actual;
}

/** Descarta y revoca una sesión validada pero no aceptada. */
export async function descartarCandidata(candidata) {
  try {
    await backend.cerrarToken?.(candidata.access_token);
  } catch {
    /* nada */
  }
}

export function cerrarSesion() {
  return backend.cerrarSesion();
}

export function sesionActual() {
  return actual;
}

/** true mientras el servidor revalida la sesión guardada (al abrir o recargar la página). */
export function useVerificandoSesion() {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    () => verificando,
  );
}

export function useSesion() {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    () => actual,
  );
}
