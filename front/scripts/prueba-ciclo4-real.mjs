#!/usr/bin/env node
/**
 * Ciclo 4 · prueba contra el stack REAL (GoTrue + PostgREST + servicio-procesos), sin simulaciones.
 * Solo usa fetch (Node 18+). No toca el navegador: habla con las mismas rutas que usa el front.
 *
 * Variables (todas obligatorias salvo las marcadas):
 *   SESIM_URL        gateway de Supabase, p. ej. http://localhost:8000
 *   ANON_KEY         clave anon del backend
 *   PROCESOS_URL     servicio-procesos, p. ej. http://localhost:8010
 *   TIT_CORREO / TIT_PASS     Administrador Titular
 *   ADM_CORREO / ADM_PASS     Administrador (quien envía)
 *   ADM2_CORREO / ADM2_PASS   otro Administrador (quien dictamina; cuatro ojos)
 *   CAP_CORREO / CAP_PASS     Capturista
 *   DOMINIO_PRUEBA   (opcional) dominio del correo de la cuenta de prueba, por omisión "prueba.sesim.mx"
 *
 * Uso:  node front/scripts/prueba-ciclo4-real.mjs
 * Deja: una capa de prueba dada de baja y una cuenta de prueba dada de baja (la bitácora es inmutable, no se borran).
 */
const e = process.env;
for (const k of ['SESIM_URL', 'ANON_KEY', 'PROCESOS_URL', 'TIT_CORREO', 'TIT_PASS', 'ADM_CORREO', 'ADM_PASS', 'ADM2_CORREO', 'ADM2_PASS', 'CAP_CORREO', 'CAP_PASS']) {
  if (!e[k]) { console.error(`Falta la variable ${k}. Ver el encabezado del script.`); process.exit(2); }
}
const base = e.SESIM_URL.replace(/\/$/, ''); const proc = e.PROCESOS_URL.replace(/\/$/, '');
const res = [];
const ok = (n, c, d = '') => { res.push(c); console.log(`${c ? 'PASA ' : 'FALLA'} · ${n}${d ? ' · ' + String(d).slice(0, 140) : ''}`); };

async function login(correo, password) {
  const r = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: e.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: correo, password }) });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, token: d.access_token, d };
}
const rpc = async (token, fn, args = {}) => {
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: e.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Profile': 'api', 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const d = await r.json().catch(() => null);
  return { status: r.status, d, msg: d?.message ?? '' };
};
const filas = (d) => (Array.isArray(d) ? d : []);
const leer = async (token, vista, q = 'select=*') => {
  const r = await fetch(`${base}/rest/v1/${vista}?${q}`, { headers: { apikey: e.ANON_KEY, Authorization: `Bearer ${token ?? e.ANON_KEY}`, 'Accept-Profile': 'api' } });
  return { status: r.status, d: await r.json().catch(() => null) };
};

// ---- 1. GoTrue real: las cuatro cuentas entran y su perfil sale de api.mi_perfil ----
const cuentas = {};
for (const [rol, c, p] of [['tit', e.TIT_CORREO, e.TIT_PASS], ['adm', e.ADM_CORREO, e.ADM_PASS], ['adm2', e.ADM2_CORREO, e.ADM2_PASS], ['cap', e.CAP_CORREO, e.CAP_PASS]]) {
  const l = await login(c, p);
  cuentas[rol] = l.token;
  ok(`GoTrue: inicia sesión ${rol}`, !!l.token, l.token ? '' : JSON.stringify(l.d));
}
if (Object.values(cuentas).some((t) => !t)) { console.error('No se puede seguir sin las cuatro sesiones.'); process.exit(1); }
const mp = await leer(cuentas.tit, 'mi_perfil');
ok('PostgREST: api.mi_perfil del Titular responde con su rol', mp.d?.[0]?.rol === 'administrador_titular', JSON.stringify(mp.d?.[0]?.rol));
ok('PostgREST: sin sesión (anon) no se leen perfiles', filas((await leer(null, 'mi_perfil')).d).length === 0);

// ---- 2. Permisos reales: RLS y funciones ----
let r = await rpc(cuentas.cap, 'fn_guardar_eje', { p_datos: { id: 5, nombre: 'x' } });
ok('El Capturista no escribe catálogos (403)', r.status === 403, `${r.status} ${r.msg}`);
r = await rpc(null ?? e.ANON_KEY, 'fn_guardar_eje', { p_datos: { id: 5, nombre: 'x' } });
ok('Sin sesión no se ejecuta ninguna función de escritura (401/403)', [401, 403].includes(r.status), `${r.status}`);
r = await rpc(cuentas.adm, 'fn_guardar_umbral', { p_indicador: null, p_verde: 80, p_amarillo: 50 });
ok('El Administrador no gestiona umbrales (D-16, 403)', r.status === 403, `${r.status} ${r.msg}`);

// ---- 3. Flujo de capa: Capturista sube, Administrador dictamina ----
const id = `T4-${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
const ficha = { custodio: 'SEDUMOP', fuente_origen: 'Prueba Ciclo 4', linaje: 'Registro de prueba automatizada', sistema_coordenadas: 'EPSG:4326', restriccion_uso: 'pública' };
r = await rpc(cuentas.cap, 'fn_guardar_capa', { p_datos: { id, titulo: 'Capa de prueba Ciclo 4', tipo_geometria: 'Punto', srid_origen: 4326 } });
ok('Capturista da de alta la capa en borrador', r.status === 200 && r.d?.estatus === 'borrador', `${r.status} ${r.msg}`);
r = await rpc(cuentas.cap, 'fn_enviar_capa_revision', { p_id: id });
ok('Con la ficha incompleta no se envía a revisión (400, nombra lo que falta)', r.status === 400 && /falta/i.test(r.msg), r.msg);
await rpc(cuentas.cap, 'fn_guardar_capa', { p_datos: { id, metadatos_extra: ficha } });
r = await rpc(cuentas.cap, 'fn_enviar_capa_revision', { p_id: id });
ok('Capturista la envía a revisión', r.d?.estatus === 'revision', `${r.status} ${r.msg}`);
r = await rpc(cuentas.cap, 'fn_dictaminar_capa', { p_id: id, p_decision: 'validar' });
ok('El Capturista no dictamina (403)', r.status === 403, r.msg);
r = await rpc(cuentas.adm, 'fn_dictaminar_capa', { p_id: id, p_decision: 'rechazar' });
ok('Rechazar sin motivo no pasa (400)', r.status === 400, r.msg);
r = await rpc(cuentas.adm, 'fn_dictaminar_capa', { p_id: id, p_decision: 'rechazar', p_comentario: 'Rechazo de prueba' });
ok('Administrador rechaza con motivo: vuelve a borrador', r.d?.estatus === 'borrador', `${r.status} ${r.msg}`);
const ver = await leer(cuentas.cap, 'bitacora_operativa', `select=*&recurso_id=eq.${id}`);
ok('El Capturista ve su capa y el rechazo en la bitácora operativa', (ver.d ?? []).some((f) => f.operacion === 'rechazo' && /Rechazo de prueba/.test(f.comentario_admin ?? '')), `${(ver.d ?? []).length} filas`);
await rpc(cuentas.adm, 'fn_enviar_capa_revision', { p_id: id });
r = await rpc(cuentas.adm, 'fn_dictaminar_capa', { p_id: id, p_decision: 'validar' });
ok('Cuatro ojos: quien envió no valida (403)', r.status === 403 && /Cuatro ojos/.test(r.msg), r.msg);
r = await rpc(cuentas.adm2, 'fn_dictaminar_capa', { p_id: id, p_decision: 'validar' });
ok('Otro Administrador valida', r.d?.estatus === 'vigente_admin', `${r.status} ${r.msg}`);
r = await rpc(cuentas.adm2, 'fn_dictaminar_capa', { p_id: id, p_decision: 'publicar' });
ok('Publica la capa', r.d?.estatus === 'vigente_publico', `${r.status} ${r.msg}`);
const pub = await leer(null, 'capa', `select=id&id=eq.${id}`);
ok('Un ciudadano sin sesión ya ve la capa publicada', filas(pub.d).length === 1);
r = await rpc(cuentas.adm2, 'fn_baja_capa', { p_id: id });
ok('Una capa publicada no se da de baja (400)', r.status === 400, r.msg);
await rpc(cuentas.adm2, 'fn_dictaminar_capa', { p_id: id, p_decision: 'rechazar', p_comentario: 'Retiro de prueba' });
const priv = await leer(null, 'capa', `select=id&id=eq.${id}`);
ok('Retirada del público: el ciudadano ya no la ve', filas(priv.d).length === 0);
r = await rpc(cuentas.adm2, 'fn_baja_capa', { p_id: id });
ok('Baja lógica de la capa de prueba', r.d?.activo === false, r.msg);
const aud = await leer(cuentas.tit, 'bitacora_operativa', `select=*&recurso_id=eq.${id}`);
ok('La bitácora registró el ciclo completo con actores reales', (aud.d ?? []).length >= 6, `${(aud.d ?? []).length} eventos`);

// ---- 4. Invitación real: emisión, canje por servicio-procesos + GoTrue, login, baja ----
const correo = `ciclo4.${Date.now().toString(36)}@${e.DOMINIO_PRUEBA ?? 'prueba.sesim.mx'}`;
r = await rpc(cuentas.adm, 'fn_emitir_invitacion', { p_correo: correo, p_rol: 'capturista' });
ok('El Administrador no emite invitaciones (403)', r.status === 403, r.msg);
r = await rpc(cuentas.tit, 'fn_emitir_invitacion', { p_correo: correo, p_rol: 'capturista' });
const token = r.d?.token;
ok('El Titular emite la invitación (token de 48 hex)', /^[0-9a-f]{48}$/.test(token ?? ''), r.msg);
let v = await fetch(`${proc}/invitacion/${token}`);
ok('servicio-procesos: el token vigente se reconoce', v.status === 200 && (await v.json()).correo === correo);
v = await fetch(`${proc}/invitacion/${'0'.repeat(48)}`);
ok('servicio-procesos: un token falso da 404', v.status === 404);
const clave = `Prueba-${Date.now()}-Ciclo4`;
v = await fetch(`${proc}/invitacion/canjear`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: clave, nombre: 'Cuenta de prueba Ciclo 4' }) });
const canje = await v.json().catch(() => ({}));
ok('Canje: servicio-procesos crea la cuenta en GoTrue y el perfil', v.status === 201 && !!canje.id_usuario, `${v.status} ${JSON.stringify(canje)}`);
v = await fetch(`${proc}/invitacion/canjear`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: clave, nombre: 'Otra vez' }) });
ok('El mismo token no se canjea dos veces (404)', v.status === 404, `${v.status}`);
const nueva = await login(correo, clave);
ok('GoTrue: la cuenta nueva inicia sesión con su contraseña', !!nueva.token, JSON.stringify(nueva.d).slice(0, 100));
const miNueva = nueva.token ? await leer(nueva.token, 'mi_perfil') : { d: [] };
ok('Su perfil nace con el rol de la invitación', miNueva.d?.[0]?.rol === 'capturista');
r = await rpc(cuentas.tit, 'fn_dar_de_baja_usuario', { p_id: canje.id_usuario });
ok('El Titular da de baja la cuenta', r.status === 200, r.msg);
const bloq = await login(correo, clave);
ok('GoTrue REAL: la cuenta dada de baja ya no puede iniciar sesión (disparador de la migración 126)', !bloq.token, `${bloq.status} ${JSON.stringify(bloq.d).slice(0, 100)}`);
if (nueva.token) {
  const lectura = await leer(nueva.token, 'capa', 'select=id');
  ok('Un token anterior a la baja ya no lee nada por RLS', filas(lectura.d).length === 0 || lectura.status >= 400, `${lectura.status}`);
}

const fallan = res.filter((x) => !x).length;
console.log(`\n${res.length - fallan} pasan, ${fallan} fallan.`);
process.exit(fallan ? 1 : 0);
