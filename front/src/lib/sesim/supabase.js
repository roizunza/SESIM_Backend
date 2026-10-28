/**
 * Cliente del backend SESIM (GoTrue + PostgREST + servicio-procesos).
 *
 * SIN simulación: toda sesión sale de un inicio de sesión real contra GoTrue
 * (`/auth/v1/token`) y el perfil/rol de la cuenta se lee de `api.mi_perfil`
 * (RLS, fuente de verdad). El claim `rol` del JWT es solo conveniencia.
 * Sin dependencias (solo `fetch`), por eso también corre en Node para las
 * pruebas (`scripts/prueba-login.mjs`).
 *
 * Variables (ver .env.example):
 *   VITE_SUPABASE_URL       base del gateway ("/supabase" con el proxy de Vite)
 *   VITE_SUPABASE_ANON_KEY  ANON_KEY del backend (clave pública, no secreta)
 *   VITE_PROCESOS_URL       base de servicio-procesos ("/procesos")
 */

export const ROLES = ['capturista', 'administrador', 'administrador_titular', 'auditor'];
const CLAVE = 'sesim_auth';
const MARGEN_SEG = 30;

export class ErrorSesim extends Error {
  constructor(mensaje, { status = null, codigo = null } = {}) {
    super(mensaje);
    this.name = 'ErrorSesim';
    this.status = status;
    this.codigo = codigo;
  }
}

function almacenPorDefecto() {
  return {
    get: (k) => {
      try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
    },
    set: (k, v) => {
      try { globalThis.localStorage?.setItem(k, v); } catch { /* sin almacenamiento: queda en memoria */ }
    },
    remove: (k) => {
      try { globalThis.localStorage?.removeItem(k); } catch { /* nada */ }
    },
  };
}

/** Decodifica el payload de un JWT (solo lectura: NO verifica la firma; eso lo hace el servidor). */
export function decodificarJwt(token) {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = globalThis.atob(p + '='.repeat((4 - (p.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

export function crearCliente({
  url = '',
  anonKey = '',
  procesosUrl = '',
  almacen = almacenPorDefecto(),
  fetchImpl = (...a) => globalThis.fetch(...a),
  ahora = () => Math.floor(Date.now() / 1000),
} = {}) {
  const base = url.replace(/\/$/, '');
  const baseProcesos = procesosUrl.replace(/\/$/, '');
  const oyentes = new Set();
  let sesion = null;
  let refrescando = null;

  const emitir = () => oyentes.forEach((fn) => fn());

  function leerAlmacen() {
    const crudo = almacen.get(CLAVE);
    if (!crudo) return null;
    try {
      const s = JSON.parse(crudo);
      if (s?.access_token && s?.refresh_token && s?.perfil?.rol && ROLES.includes(s.perfil.rol)) return s;
    } catch { /* corrupto */ }
    almacen.remove(CLAVE);
    return null;
  }
  sesion = leerAlmacen();

  function fijar(s) {
    sesion = s;
    if (s) almacen.set(CLAVE, JSON.stringify(s)); else almacen.remove(CLAVE);
    emitir();
  }

  const configurado = () => !!base && !!anonKey;
  function exigirConfig() {
    if (!configurado()) {
      throw new ErrorSesim(
        'El front no está conectado al backend: faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).',
        { codigo: 'sin_config' },
      );
    }
  }

  async function pedir(ruta, { metodo = 'GET', cuerpo, token, esquema, extra = {}, raiz = base } = {}) {
    const h = { apikey: anonKey, ...extra };
    if (token) h.Authorization = `Bearer ${token}`;
    if (esquema) h[metodo === 'GET' || metodo === 'HEAD' ? 'Accept-Profile' : 'Content-Profile'] = esquema;
    if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
    let r;
    try {
      r = await fetchImpl(raiz + ruta, { method: metodo, headers: h, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
    } catch {
      throw new ErrorSesim('No se pudo conectar con el servidor. Verifique que el backend esté en marcha.', { codigo: 'red' });
    }
    const texto = await r.text();
    let datos = null;
    if (texto) { try { datos = JSON.parse(texto); } catch { datos = texto; } }
    return { ok: r.ok, status: r.status, datos };
  }

  function errorAuth(r) {
    const d = r.datos && typeof r.datos === 'object' ? r.datos : {};
    const codigo = d.error_code || d.code || '';
    const msg = String(d.msg || d.message || d.error_description || d.error || '');
    if (/banned/i.test(codigo) || /banned/i.test(msg)) return new ErrorSesim('Esta cuenta fue dada de baja por el Administrador Titular.', { status: r.status, codigo: 'baja' });
    if (codigo === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return new ErrorSesim('Correo o contraseña incorrectos.', { status: r.status, codigo: 'credenciales' });
    if (r.status === 429 || codigo === 'over_request_rate_limit') return new ErrorSesim('Demasiados intentos. Espere un momento e intente de nuevo.', { status: r.status, codigo: 'limite' });
    if (r.status >= 500) return new ErrorSesim('El servicio de acceso no está disponible en este momento.', { status: r.status, codigo: 'servidor' });
    return new ErrorSesim(`No se pudo iniciar sesión (${r.status}).`, { status: r.status, codigo: 'auth' });
  }

  async function leerMiPerfil(token) {
    const r = await pedir('/rest/v1/mi_perfil?select=id,id_usuario,nombre,rol,ambito,cve_mun,dependencia,activo', { token, esquema: 'api' });
    if (!r.ok) {
      if (r.status === 404 || r.datos?.code === 'PGRST205') throw new ErrorSesim('El backend no tiene api.mi_perfil (falta aplicar la migración 127).', { status: r.status, codigo: 'sin_mi_perfil' });
      throw new ErrorSesim(`No se pudo leer el perfil de la cuenta (${r.status}).`, { status: r.status, codigo: 'perfil' });
    }
    const p = Array.isArray(r.datos) ? r.datos[0] : null;
    if (!p) throw new ErrorSesim('La cuenta no tiene un perfil asignado en SESIM. Solicite el alta al Administrador Titular.', { codigo: 'sin_perfil' });
    if (!p.activo) throw new ErrorSesim('Esta cuenta fue dada de baja por el Administrador Titular.', { codigo: 'baja' });
    if (!ROLES.includes(p.rol)) throw new ErrorSesim('La cuenta tiene un rol no reconocido.', { codigo: 'rol' });
    return p;
  }

  /** Valida credenciales y perfil SIN guardar la sesión (el front la activa al aceptar las políticas). */
  async function autenticar(correo, password) {
    exigirConfig();
    const r = await pedir('/auth/v1/token?grant_type=password', { metodo: 'POST', cuerpo: { email: String(correo).trim(), password } });
    if (!r.ok) throw errorAuth(r);
    const t = r.datos;
    const candidata = {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: t.expires_at ?? ahora() + (t.expires_in ?? 3600),
      usuario: { id: t.user?.id, correo: t.user?.email ?? String(correo).trim().toLowerCase() },
      inicio: new Date().toISOString(),
    };
    try {
      candidata.perfil = await leerMiPerfil(candidata.access_token);
    } catch (e) {
      await cerrarToken(candidata.access_token);
      throw e;
    }
    return candidata;
  }

  const activar = (s) => { fijar(s); return s; };
  async function iniciarSesion(correo, password) { return activar(await autenticar(correo, password)); }

  async function cerrarToken(token) {
    try { await pedir('/auth/v1/logout?scope=local', { metodo: 'POST', token }); } catch { /* el token local ya se descartó */ }
  }

  /** Cierra la sesión: descarta lo local de inmediato y revoca el refresh token en GoTrue. */
  async function cerrarSesion() {
    const previa = sesion;
    fijar(null);
    if (previa) await cerrarToken(previa.access_token);
  }

  async function refrescar() {
    if (!sesion) throw new ErrorSesim('No hay sesión.', { codigo: 'sin_sesion' });
    if (refrescando) return refrescando;
    const rt = sesion.refresh_token;
    refrescando = (async () => {
      const r = await pedir('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', cuerpo: { refresh_token: rt } });
      if (!r.ok) {
        fijar(null);
        throw new ErrorSesim('Su sesión expiró. Inicie sesión de nuevo.', { status: r.status, codigo: 'sesion_expirada' });
      }
      const t = r.datos;
      fijar({ ...sesion, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at ?? ahora() + (t.expires_in ?? 3600) });
      return sesion;
    })().finally(() => { refrescando = null; });
    return refrescando;
  }

  async function tokenVigente() {
    if (!sesion) throw new ErrorSesim('Inicie sesión para continuar.', { codigo: 'sin_sesion' });
    if (sesion.expires_at - ahora() < MARGEN_SEG) await refrescar();
    return sesion.access_token;
  }

  /**
   * Revalida una sesión guardada contra el servidor (token vigente + perfil actual).
   * Lo que haya en localStorage NO se confía: rol y estado salen de api.mi_perfil.
   * Devuelve la sesión o null; si el servidor la rechaza (expirada, baja, sin perfil) la descarta;
   * si no hay conexión, la conserva sin activarla.
   */
  async function restaurar() {
    if (!sesion) return null;
    try {
      const token = await tokenVigente();
      const perfil = await leerMiPerfil(token);
      fijar({ ...sesion, perfil });
      return sesion;
    } catch (e) {
      if (e.codigo !== 'red' && e.codigo !== 'sin_config') fijar(null);
      return null;
    }
  }

  async function llamar(ruta, opts = {}) {
    exigirConfig();
    let token = await tokenVigente();
    let r = await pedir(ruta, { ...opts, token });
    if (r.status === 401 && sesion) {
      token = (await refrescar()).access_token;
      r = await pedir(ruta, { ...opts, token });
      if (r.status === 401) {
        fijar(null);
        throw new ErrorSesim('Su sesión expiró. Inicie sesión de nuevo.', { status: 401, codigo: 'sesion_expirada' });
      }
    }
    if (!r.ok) {
      const d = r.datos && typeof r.datos === 'object' ? r.datos : {};
      const det = Array.isArray(d.detail) ? d.detail.map((x) => x?.msg ?? JSON.stringify(x)).join('; ') : d.detail;
      const msg = d.message || det || (typeof r.datos === 'string' ? r.datos : '') || `Error ${r.status}`;
      throw new ErrorSesim(r.status === 403 ? 'No tiene permiso para esta operación.' : msg, { status: r.status, codigo: d.code || (typeof d.detail === 'string' ? d.detail : null) });
    }
    return r.datos;
  }

  /** Lectura/escritura sobre las vistas del esquema `api` (RLS decide qué ve y qué puede). */
  const rest = (tabla, { query = '', metodo = 'GET', cuerpo, extra } = {}) =>
    llamar(`/rest/v1/${tabla}${query ? `?${query}` : ''}`, { metodo, cuerpo, esquema: 'api', extra });

  /** Llamada a servicio-procesos (alta de usuarios, cargas). */
  const procesos = (ruta, { metodo = 'POST', cuerpo } = {}) => llamar(ruta, { metodo, cuerpo, raiz: baseProcesos });

  /** Alta DIRECTA de cuenta (solo Administrador Titular; la valida servicio-procesos). */
  const altaUsuario = ({ correo, password, nombre, rol, ambito = 'estatal', cve_mun = null, dependencia = null }) =>
    procesos('/admin/alta-usuario', { cuerpo: { correo, password, nombre, rol, ambito, cve_mun, dependencia } });

  /** Baja/reactivación lógica (UPDATE de api.perfil.activo; la RLS exige Administrador/Titular y el trigger bloquea la cuenta en GoTrue). */
  const cambiarActivo = async (idPerfil, activo) => {
    const filas = await rest('perfil', { query: `id=eq.${encodeURIComponent(idPerfil)}`, metodo: 'PATCH', cuerpo: { activo }, extra: { Prefer: 'return=representation' } });
    // PostgREST responde 200 con [] cuando la RLS filtra la fila: para el usuario eso es "sin permiso".
    if (!Array.isArray(filas) || filas.length === 0) {
      throw new ErrorSesim('No tiene permiso para esta operación (o el perfil no existe).', { status: 403, codigo: 'sin_filas' });
    }
    return filas;
  };

  return {
    configurado,
    autenticar,
    activar,
    iniciarSesion,
    cerrarSesion,
    cerrarToken,
    refrescar,
    restaurar,
    rest,
    procesos,
    altaUsuario,
    cambiarActivo,
    sesionGuardada: () => sesion,
    suscribir: (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); },
    releer: () => { sesion = leerAlmacen(); },
  };
}

const env = import.meta.env ?? {};
export const backend = crearCliente({
  url: env.VITE_SUPABASE_URL ?? '',
  anonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
  procesosUrl: env.VITE_PROCESOS_URL ?? '',
});
