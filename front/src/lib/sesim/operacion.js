/**
 * Tablas que «se llenan en operación» (periodo, medicion_indicador,
 * evidencia_medicion, bitacora, invitacion, usuario, hallazgo) y las reglas
 * de negocio que las mueven.
 *
 * ⚠ SUSTITUTO TEMPORAL DEL BACKEND. Mientras no existan PostgREST y las
 * funciones del esquema `api`, este módulo guarda esas tablas en
 * localStorage del navegador (por eso un mismo navegador puede representar el
 * flujo completo: el capturista envía, cierra sesión, entra el administrador
 * y valida). Cada función lleva el nombre de la función SQL que la
 * reemplazará y aplica las MISMAS reglas, para que el front no cambie de
 * comportamiento al conectarse:
 *
 *   guardarMedicion        → INSERT/UPDATE api.medicion_indicador (RLS: solo su autor, solo en borrador/rechazado)
 *   adjuntarEvidencia      → INSERT api.evidencia_medicion + Storage (hash_archivo = SHA-256)
 *   fnTransicionEstado     → F10 api.fn_transicion_estado
 *   fnVerificarEvidencia   → F11 api.fn_verificar_evidencia
 *   fnEmitirInvitacion     → F16 api.fn_emitir_invitacion
 *   registrarHallazgo      → INSERT api.hallazgo (tabla acordada el 20 oct; aún no está en el diccionario v2.2)
 *   (bitácora)             → la escriben los disparadores; aquí la escribe `registrar()`
 *
 * La forma de cada fila respeta el diccionario de datos (sección 2).
 */
import { useSyncExternalStore } from 'react';
import { uuid, PERFILES, perfilCanonico } from './sesion';

const CLAVE = 'sesim_operacion_v2';

/** false = mediciones, evidencias, dictámenes e invitaciones siguen en localStorage (Ciclos 4 a 8 las conectan). */
export const OPERACION_CONECTADA = false;

export const ESTADOS = ['borrador', 'revision', 'rechazado', 'vigente_admin', 'vigente_publico'];
export const ETIQUETA_ESTADO = {
  borrador: 'Borrador',
  revision: 'En revisión',
  rechazado: 'Rechazado',
  vigente_admin: 'Validado (uso interno)',
  vigente_publico: 'Publicado',
};
export const COLOR_ESTADO = {
  borrador: '#AB9470',
  revision: '#235B4E',
  rechazado: '#EF4444',
  vigente_admin: '#0E6EC5',
  vigente_publico: '#10B981',
};

const ADMINS = ['administrador', 'administrador_titular'];

/** Transiciones permitidas: estado actual → estado nuevo → perfiles que la pueden hacer. */
export const TRANSICIONES = {
  borrador: { revision: ['capturista'] },
  rechazado: { revision: ['capturista'] },
  revision: { vigente_admin: ADMINS, rechazado: ADMINS },
  vigente_admin: { vigente_publico: ADMINS, rechazado: ADMINS },
  vigente_publico: {},
};

export const TIPOS_DOCUMENTO = ['Oficio', 'Reporte', 'Base de datos', 'Fotografía', 'Publicación oficial', 'Otro'];

const VACIO = {
  periodo: [],
  medicion_indicador: [],
  evidencia_medicion: [],
  bitacora: [],
  invitacion: [],
  usuario: [],
  hallazgo: [],
  // Línea base fijada en operación (F04: la primera medición publicada).
  // En la base es UPDATE de indicador.linea_base / anio_linea_base.
  linea_base: {},
};

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) return { ...VACIO, ...JSON.parse(crudo) };
  } catch {
    /* sin almacenamiento */
  }
  return structuredClone(VACIO);
}

let estado = cargar();
const oyentes = new Set();

function persistir(nuevo) {
  estado = nuevo;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    /* cuota llena o modo privado: queda en memoria */
  }
  oyentes.forEach((fn) => fn());
}

export function useOperacion() {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    () => estado,
  );
}

export function operacionActual() {
  return estado;
}

const ahora = () => new Date().toISOString();

/** Simula el disparador de auditoría: una fila de bitácora por cambio. */
function registrar(s, { sesion, tabla_afectada, id_registro, accion, datos_previos = null, datos_nuevos = null }) {
  s.bitacora.push({
    id: uuid(),
    id_usuario: sesion?.id ?? null,
    perfil: sesion?.perfil ?? null, // columna de lectura (en la base sale del join con usuario/perfil)
    tabla_afectada,
    id_registro: String(id_registro),
    accion,
    datos_previos,
    datos_nuevos,
    ip_origen: null, // la llena el servidor
    fecha: ahora(),
  });
}

function clonar() {
  return structuredClone(estado);
}

/* --------------------------------------------------------------- usuario */

/** Registra (o actualiza) la fila `usuario` de la sesión simulada. */
export function registrarAcceso(sesion) {
  if (!sesion) return;
  const s = clonar();
  let u = s.usuario.find((x) => x.id === sesion.id);
  if (!u) {
    u = {
      id: sesion.id,
      id_perfil: PERFILES[sesion.perfil].id_perfil,
      nombre: sesion.nombre,
      correo: sesion.correo,
      activo: true,
      ultimo_acceso: ahora(),
      created_at: ahora(),
      updated_at: ahora(),
      fecha_baja: null,
      id_usuario_baja: null,
    };
    s.usuario.push(u);
    registrar(s, { sesion, tabla_afectada: 'usuario', id_registro: u.id, accion: 'INSERT', datos_nuevos: u });
  } else {
    u.ultimo_acceso = ahora();
  }
  persistir(s);
  return u;
}

export function usuarioActivo(idUsuario) {
  const u = estado.usuario.find((x) => x.id === idUsuario);
  return !u || u.activo !== false;
}

export function darDeBaja(sesion, idUsuario) {
  if (sesion?.perfil !== 'administrador_titular') throw new Error('Solo el Administrador Titular puede dar de baja usuarios.');
  if (idUsuario === sesion.id) throw new Error('No puede darse de baja a sí mismo.');
  const s = clonar();
  const u = s.usuario.find((x) => x.id === idUsuario);
  if (!u) throw new Error('Usuario no encontrado.');
  const previo = { ...u };
  Object.assign(u, { activo: false, fecha_baja: ahora(), id_usuario_baja: sesion.id, updated_at: ahora() });
  registrar(s, { sesion, tabla_afectada: 'usuario', id_registro: u.id, accion: 'UPDATE', datos_previos: previo, datos_nuevos: u });
  persistir(s);
}

/* --------------------------------------------------------------- periodo */

/** Periodo por etiqueta («2026», «2026-S1», «2026-T3», «2026-M07»); lo crea si no existe. */
export function obtenerOCrearPeriodo({ tipo_periodo, anio, sub = null }) {
  const a = Number(anio);
  let etiqueta = String(a);
  let ini = `${a}-01-01`;
  let fin = `${a}-12-31`;
  const pad = (n) => String(n).padStart(2, '0');
  if (tipo_periodo === 'semestral') {
    etiqueta = `${a}-S${sub}`;
    ini = sub === 1 ? `${a}-01-01` : `${a}-07-01`;
    fin = sub === 1 ? `${a}-06-30` : `${a}-12-31`;
  } else if (tipo_periodo === 'trimestral') {
    etiqueta = `${a}-T${sub}`;
    const m = (sub - 1) * 3 + 1;
    ini = `${a}-${pad(m)}-01`;
    fin = new Date(Date.UTC(a, m + 2, 0)).toISOString().slice(0, 10);
  } else if (tipo_periodo === 'mensual') {
    etiqueta = `${a}-M${pad(sub)}`;
    ini = `${a}-${pad(sub)}-01`;
    fin = new Date(Date.UTC(a, sub, 0)).toISOString().slice(0, 10);
  }
  const existente = estado.periodo.find((p) => p.etiqueta === etiqueta);
  if (existente) return existente;
  const s = clonar();
  const p = { id: (s.periodo.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1, anio: a, etiqueta, tipo_periodo, fecha_inicio: ini, fecha_fin: fin };
  s.periodo.push(p);
  registrar(s, { sesion: null, tabla_afectada: 'periodo', id_registro: p.id, accion: 'INSERT', datos_nuevos: p });
  persistir(s);
  return p;
}

/* ---------------------------------------------------- medicion_indicador */

/**
 * Crea o actualiza una medición. Reglas:
 *  · solo el perfil capturista escribe mediciones;
 *  · solo se edita en borrador o rechazado, y solo su autor (usuario_captura);
 *  · llave única (id_indicador, id_unidad, id_periodo) — R09.
 */
export function guardarMedicion(sesion, datos) {
  if (perfilCanonico(sesion?.perfil) !== 'capturista') throw new Error('Solo el perfil Capturista registra mediciones.');
  if (!usuarioActivo(sesion.id)) throw new Error('Su cuenta está dada de baja.');
  const { id, id_indicador, id_unidad, id_periodo, valor, valor_texto, desagregaciones } = datos;
  if (!id_indicador || !id_unidad || !id_periodo) throw new Error('Indicador, unidad territorial y periodo son obligatorios.');
  if ((valor === null || valor === '' || valor === undefined) && !valor_texto) throw new Error('Capture un valor cuantitativo o cualitativo.');

  const s = clonar();
  const duplicada = s.medicion_indicador.find(
    (m) => m.id !== id && m.id_indicador === id_indicador && m.id_unidad === id_unidad && m.id_periodo === Number(id_periodo),
  );
  if (duplicada) throw new Error(`Ya existe una medición de ${id_indicador} para esa unidad territorial y periodo (estado: ${ETIQUETA_ESTADO[duplicada.estado]}).`);

  const fila = {
    id_indicador,
    id_unidad,
    id_periodo: Number(id_periodo),
    valor: valor === '' || valor === null || valor === undefined ? null : Number(valor),
    valor_texto: valor_texto || null,
    desagregaciones: desagregaciones && Object.keys(desagregaciones).length ? desagregaciones : null,
    updated_at: ahora(),
  };

  if (id) {
    const m = s.medicion_indicador.find((x) => x.id === id);
    if (!m) throw new Error('Medición no encontrada.');
    if (m.usuario_captura !== sesion.id) throw new Error('Solo quien capturó la medición puede editarla.');
    if (!['borrador', 'rechazado'].includes(m.estado)) throw new Error('Solo se editan mediciones en borrador o rechazadas.');
    const previo = { ...m };
    Object.assign(m, fila);
    registrar(s, { sesion, tabla_afectada: 'medicion_indicador', id_registro: m.id, accion: 'UPDATE', datos_previos: previo, datos_nuevos: m });
    persistir(s);
    return m;
  }

  const nueva = {
    id: uuid(),
    ...fila,
    usuario_captura: sesion.id,
    usuario_validacion: null,
    estado: 'borrador',
    fecha_captura: ahora(),
    fecha_validacion: null,
    created_at: ahora(),
  };
  s.medicion_indicador.push(nueva);
  registrar(s, { sesion, tabla_afectada: 'medicion_indicador', id_registro: nueva.id, accion: 'INSERT', datos_nuevos: nueva });
  persistir(s);
  return nueva;
}

export function eliminarBorrador(sesion, idMedicion) {
  const s = clonar();
  const m = s.medicion_indicador.find((x) => x.id === idMedicion);
  if (!m || m.usuario_captura !== sesion?.id || m.estado !== 'borrador') throw new Error('Solo se eliminan borradores propios.');
  s.medicion_indicador = s.medicion_indicador.filter((x) => x.id !== idMedicion);
  s.evidencia_medicion = s.evidencia_medicion.filter((e) => e.id_medicion !== idMedicion);
  registrar(s, { sesion, tabla_afectada: 'medicion_indicador', id_registro: idMedicion, accion: 'DELETE', datos_previos: m });
  persistir(s);
}

/* ---------------------------------------------------- evidencia_medicion */

export async function sha256Hex(archivo) {
  const buf = await archivo.arrayBuffer();
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Adjunta un documento de respaldo. Calcula su SHA-256 (64 hex) en el
 * navegador; en el servidor el mismo cálculo se repite al guardar el archivo.
 * `hash_archivo` es UNIQUE: un mismo archivo no puede respaldar dos mediciones.
 */
export async function adjuntarEvidencia(sesion, idMedicion, archivo, tipo_documento) {
  const m = estado.medicion_indicador.find((x) => x.id === idMedicion);
  if (!m) throw new Error('Guarde la medición antes de adjuntar evidencia.');
  if (m.usuario_captura !== sesion?.id) throw new Error('Solo quien capturó la medición sube su evidencia.');
  if (!['borrador', 'rechazado'].includes(m.estado)) throw new Error('La evidencia solo se modifica en borrador o rechazado.');
  const hash = await sha256Hex(archivo);
  if (estado.evidencia_medicion.some((e) => e.hash_archivo === hash)) throw new Error('Ese archivo ya está registrado como evidencia (hash duplicado).');
  const s = clonar();
  const ev = {
    id: uuid(),
    id_medicion: idMedicion,
    id_usuario: sesion.id,
    url_archivo: `evidencias/${idMedicion}/${archivo.name}`, // ruta que tendrá en Supabase Storage
    nombre_archivo: archivo.name,
    bytes: archivo.size,
    tipo_documento: tipo_documento || 'Otro',
    hash_archivo: hash,
    fecha_subida: ahora(),
  };
  s.evidencia_medicion.push(ev);
  registrar(s, { sesion, tabla_afectada: 'evidencia_medicion', id_registro: ev.id, accion: 'INSERT', datos_nuevos: ev });
  persistir(s);
  return ev;
}

export function quitarEvidencia(sesion, idEvidencia) {
  const s = clonar();
  const ev = s.evidencia_medicion.find((e) => e.id === idEvidencia);
  const m = ev && s.medicion_indicador.find((x) => x.id === ev.id_medicion);
  if (!ev || !m || m.usuario_captura !== sesion?.id || !['borrador', 'rechazado'].includes(m.estado)) {
    throw new Error('Solo se retira evidencia propia de una medición en borrador o rechazada.');
  }
  s.evidencia_medicion = s.evidencia_medicion.filter((e) => e.id !== idEvidencia);
  registrar(s, { sesion, tabla_afectada: 'evidencia_medicion', id_registro: idEvidencia, accion: 'DELETE', datos_previos: ev });
  persistir(s);
}

/** F11 · fn_verificar_evidencia: TRUE si el archivo entregado tiene el mismo SHA-256. */
export async function fnVerificarEvidencia(idEvidencia, archivo) {
  const ev = estado.evidencia_medicion.find((e) => e.id === idEvidencia);
  if (!ev) throw new Error('Evidencia no encontrada.');
  const hash = await sha256Hex(archivo);
  return { coincide: hash === ev.hash_archivo, hash_calculado: hash, hash_registrado: ev.hash_archivo };
}

/* ------------------------------------------------------- F10 transición */

/**
 * F10 · fn_transicion_estado(id_medicion, estado_nuevo, comentario)
 *  · verifica que el perfil pueda hacer esa transición (TRANSICIONES);
 *  · el capturista solo mueve mediciones propias;
 *  · exige ≥ 1 evidencia para enviar a revisión y para validar (R12);
 *  · el rechazo exige comentario;
 *  · al validar firma usuario_validacion y fecha_validacion;
 *  · la primera publicación de un indicador sin línea base la fija (F04);
 *  · deja el cambio en bitácora (accion = 'cambio de estado').
 */
export function fnTransicionEstado(sesion, idMedicion, estadoNuevo, comentario = '') {
  const perfil = perfilCanonico(sesion?.perfil);
  if (!usuarioActivo(sesion?.id)) throw new Error('Su cuenta está dada de baja.');
  const s = clonar();
  const m = s.medicion_indicador.find((x) => x.id === idMedicion);
  if (!m) throw new Error('Medición no encontrada.');
  const permitidos = TRANSICIONES[m.estado]?.[estadoNuevo];
  if (!permitidos) throw new Error(`Transición no permitida: ${m.estado} → ${estadoNuevo}.`);
  if (!permitidos.includes(perfil)) throw new Error(`El perfil ${PERFILES[perfil]?.nombre ?? perfil} no puede pasar una medición de ${ETIQUETA_ESTADO[m.estado]} a ${ETIQUETA_ESTADO[estadoNuevo]}.`);
  if (perfil === 'capturista' && m.usuario_captura !== sesion.id) throw new Error('Solo quien capturó la medición puede enviarla.');
  const evidencias = s.evidencia_medicion.filter((e) => e.id_medicion === m.id).length;
  if ((estadoNuevo === 'revision' || estadoNuevo === 'vigente_admin') && evidencias < 1) {
    throw new Error('Se requiere al menos una evidencia documental.');
  }
  if (estadoNuevo === 'rechazado' && !String(comentario).trim()) throw new Error('El rechazo requiere un comentario.');

  const previo = { ...m };
  m.estado = estadoNuevo;
  m.updated_at = ahora();
  if (estadoNuevo === 'vigente_admin') {
    m.usuario_validacion = sesion.id;
    m.fecha_validacion = ahora();
  }
  if (estadoNuevo === 'rechazado') {
    m.usuario_validacion = null;
    m.fecha_validacion = null;
  }
  registrar(s, {
    sesion,
    tabla_afectada: 'medicion_indicador',
    id_registro: m.id,
    accion: 'cambio de estado',
    datos_previos: { estado: previo.estado },
    datos_nuevos: { estado: estadoNuevo, comentario: String(comentario).trim() || null },
  });

  if (estadoNuevo === 'vigente_publico' && m.valor !== null && !s.linea_base[m.id_indicador]) {
    const periodo = s.periodo.find((p) => p.id === m.id_periodo);
    s.linea_base[m.id_indicador] = { linea_base: m.valor, anio_linea_base: periodo?.anio ?? null, id_medicion: m.id };
    registrar(s, {
      sesion,
      tabla_afectada: 'indicador',
      id_registro: m.id_indicador,
      accion: 'UPDATE',
      datos_previos: { linea_base: null },
      datos_nuevos: s.linea_base[m.id_indicador],
    });
  }
  persistir(s);
  return m;
}

/** Último comentario de dictamen (rechazo) de una medición. */
export function ultimoDictamen(idMedicion, op = estado) {
  const eventos = op.bitacora.filter((b) => b.tabla_afectada === 'medicion_indicador' && b.id_registro === idMedicion && b.accion === 'cambio de estado');
  return eventos[eventos.length - 1] ?? null;
}

/** F12 · v_historial_registro: línea de tiempo de un registro. */
export function vHistorialRegistro(tablaAfectada, idRegistro, op = estado) {
  return op.bitacora
    .filter((b) => (b.tabla_afectada === tablaAfectada && b.id_registro === String(idRegistro)) || (tablaAfectada === 'medicion_indicador' && b.tabla_afectada === 'evidencia_medicion' && (b.datos_nuevos?.id_medicion === idRegistro || b.datos_previos?.id_medicion === idRegistro)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/* ------------------------------------------------- consultas derivadas */

/** F02 · v_serie_indicador: serie publicada (solo vigente_publico). */
export function vSerieIndicador(idIndicador, op = estado) {
  const periodos = new Map(op.periodo.map((p) => [p.id, p]));
  return op.medicion_indicador
    .filter((m) => m.id_indicador === idIndicador && m.estado === 'vigente_publico')
    .map((m) => ({ ...m, periodo: periodos.get(m.id_periodo) }))
    .sort((a, b) => (a.periodo?.fecha_inicio ?? '').localeCompare(b.periodo?.fecha_inicio ?? ''));
}

/** Línea base efectiva de un indicador (la del catálogo o la fijada en operación). */
export function lineaBaseDe(indicador, op = estado) {
  if (indicador?.linea_base !== null && indicador?.linea_base !== undefined) {
    return { linea_base: indicador.linea_base, anio_linea_base: indicador.anio_linea_base };
  }
  return op.linea_base[indicador?.id] ?? { linea_base: null, anio_linea_base: null };
}

/**
 * F09 · fn_completitud_captura: % de municipios con dato para un indicador y
 * periodo (cuenta mediciones validadas o publicadas).
 */
export function fnCompletitudCaptura(idIndicador, idPeriodo, municipios, op = estado) {
  const con = new Set(
    op.medicion_indicador
      .filter((m) => m.id_indicador === idIndicador && (!idPeriodo || m.id_periodo === Number(idPeriodo)) && ['vigente_admin', 'vigente_publico'].includes(m.estado))
      .map((m) => (m.id_unidad.length > 5 ? m.id_unidad.slice(0, 5) : m.id_unidad)),
  );
  const faltantes = municipios.filter((u) => !con.has(u.id));
  return { porcentaje: municipios.length ? (100 * (municipios.length - faltantes.length)) / municipios.length : 0, faltantes };
}

/* ---------------------------------------------------- F16 invitaciones */

const DIAS_VIGENCIA_INVITACION = 7;

async function sha256Texto(texto) {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * F16 · fn_emitir_invitacion: solo el Administrador Titular. Devuelve el token
 * UNA vez; se guarda solo su hash (token_hash).
 */
export async function fnEmitirInvitacion(sesion, { correo_destino, id_perfil }) {
  if (sesion?.perfil !== 'administrador_titular') throw new Error('Solo el Administrador Titular emite invitaciones.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo_destino || '')) throw new Error('Correo institucional no válido.');
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const token_hash = await sha256Texto(token);
  const s = clonar();
  const inv = {
    id: uuid(),
    token_hash,
    id_perfil: Number(id_perfil),
    correo_destino: correo_destino.toLowerCase(),
    id_usuario_emisor: sesion.id,
    expira_en: new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 86400000).toISOString(),
    usada_en: null,
    id_usuario_creado: null,
    revocada: false,
    created_at: ahora(),
  };
  s.invitacion.push(inv);
  registrar(s, { sesion, tabla_afectada: 'invitacion', id_registro: inv.id, accion: 'INSERT', datos_nuevos: { ...inv, token_hash: `${token_hash.slice(0, 8)}…` } });
  persistir(s);
  return { token, invitacion: inv };
}

export function revocarInvitacion(sesion, idInvitacion) {
  if (sesion?.perfil !== 'administrador_titular') throw new Error('Solo el Administrador Titular revoca invitaciones.');
  const s = clonar();
  const inv = s.invitacion.find((i) => i.id === idInvitacion);
  if (!inv || inv.usada_en) throw new Error('La invitación no existe o ya fue usada.');
  inv.revocada = true;
  registrar(s, { sesion, tabla_afectada: 'invitacion', id_registro: inv.id, accion: 'UPDATE', datos_nuevos: { revocada: true } });
  persistir(s);
}

export function estadoInvitacion(inv) {
  if (inv.revocada) return 'revocada';
  if (inv.usada_en) return 'usada';
  if (new Date(inv.expira_en) < new Date()) return 'expirada';
  return 'vigente';
}

/**
 * Canje de invitación (pantalla de alta): valida token, caducidad y correo,
 * y devuelve el perfil con el que se crea la cuenta. Marca la invitación como
 * usada y liga id_usuario_creado.
 */
export async function canjearInvitacion({ token, correo, idUsuarioNuevo }) {
  const token_hash = await sha256Texto(String(token).trim());
  const s = clonar();
  const inv = s.invitacion.find((i) => i.token_hash === token_hash);
  if (!inv) throw new Error('Token de invitación no válido.');
  const st = estadoInvitacion(inv);
  if (st !== 'vigente') throw new Error(`La invitación está ${st}.`);
  if (inv.correo_destino !== String(correo).toLowerCase()) throw new Error('El correo no coincide con el de la invitación.');
  inv.usada_en = ahora();
  inv.id_usuario_creado = idUsuarioNuevo;
  registrar(s, { sesion: { id: idUsuarioNuevo }, tabla_afectada: 'invitacion', id_registro: inv.id, accion: 'UPDATE', datos_nuevos: { usada_en: inv.usada_en, id_usuario_creado: idUsuarioNuevo } });
  persistir(s);
  const perfil = Object.values(PERFILES).find((p) => p.id_perfil === inv.id_perfil);
  return perfil.clave;
}

/* ----------------------------------------------------------- hallazgos */

export function registrarHallazgo(sesion, { tabla_afectada, id_registro, descripcion, severidad = 'media' }) {
  if (perfilCanonico(sesion?.perfil) !== 'auditor') throw new Error('Solo el Auditor registra hallazgos.');
  if (!String(descripcion).trim()) throw new Error('Describa el hallazgo.');
  const s = clonar();
  const h = { id: uuid(), id_usuario: sesion.id, tabla_afectada, id_registro: String(id_registro), descripcion: descripcion.trim(), severidad, fecha: ahora() };
  s.hallazgo.push(h);
  registrar(s, { sesion, tabla_afectada: 'hallazgo', id_registro: h.id, accion: 'INSERT', datos_nuevos: h });
  persistir(s);
  return h;
}

/** Visibilidad de mediciones según perfil (lo que hará RLS). */
export function medicionesVisibles(sesion, op = estado) {
  const perfil = perfilCanonico(sesion?.perfil);
  if (perfil === 'capturista') return op.medicion_indicador.filter((m) => m.usuario_captura === sesion.id);
  // Tabla 4: el borrador solo lo ve el capturista; desde «revision» lo ven
  // administradores y auditor.
  if (ADMINS.includes(perfil) || perfil === 'auditor') return op.medicion_indicador.filter((m) => m.estado !== 'borrador');
  return op.medicion_indicador.filter((m) => m.estado === 'vigente_publico');
}

/** Bitácora visible: capturista la propia; administradores y auditor completa. */
export function bitacoraVisible(sesion, op = estado) {
  const perfil = perfilCanonico(sesion?.perfil);
  if (perfil === 'capturista') return op.bitacora.filter((b) => b.id_usuario === sesion.id);
  return op.bitacora;
}
