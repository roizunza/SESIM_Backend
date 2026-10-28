/**
 * Prueba del cliente de autenticación del front (sin navegador).
 *  - Sin variables: levanta el mock (scripts/mock-backend.mjs) y prueba contra él.
 *  - Contra el Supabase REAL (stack de Back/):
 *      SESIM_URL=http://localhost:8000 SESIM_ANON_KEY=<ANON_KEY del .env> \
 *      SESIM_PROCESOS=http://localhost:8001 node scripts/prueba-cliente.mjs
 *    Usa las cuentas semilla (clave SesimDev2026!). La prueba de alta/baja crea una cuenta
 *    temporal y la da de baja (queda inactiva en bitácora; es lo esperado).
 */
import { crearCliente } from '../src/lib/sesim/supabase.js';
import { iniciarMock } from './mock-backend.mjs';

const REAL = !!process.env.SESIM_URL;
let mock = null;
let URL_, KEY, PROC, C;
if (REAL) {
  URL_ = process.env.SESIM_URL; KEY = process.env.SESIM_ANON_KEY; PROC = process.env.SESIM_PROCESOS ?? 'http://localhost:8001';
  C = {
    titular: ['sesimadminvip@gmail.com', 'SesimDev2026!'], admin: ['sesimadmin@gmail.com', 'SesimDev2026!'],
    auditor: ['sesimauditor1@gmail.com', 'SesimDev2026!'], capt: ['sesimcapturista1@gmail.com', 'SesimDev2026!'],
  };
  if (!KEY) { console.error('Falta SESIM_ANON_KEY'); process.exit(2); }
} else {
  mock = await iniciarMock({ expiraEn: 3600 });
  URL_ = mock.url; KEY = mock.anonKey; PROC = mock.url;
  mock.agregar('titular@p.mx', 'Clave2026!', 'Titular', 'administrador_titular');
  mock.agregar('admin@p.mx', 'Clave2026!', 'Admin', 'administrador');
  mock.agregar('aud@p.mx', 'Clave2026!', 'Auditor', 'auditor');
  mock.agregar('cap@p.mx', 'Clave2026!', 'Capturista', 'capturista');
  mock.agregar('huerfano@p.mx', 'Clave2026!', 'Sin perfil', 'capturista', { conPerfil: false });
  mock.agregar('baja@p.mx', 'Clave2026!', 'Dada de baja', 'capturista', { activo: false });
  C = { titular: ['titular@p.mx', 'Clave2026!'], admin: ['admin@p.mx', 'Clave2026!'], auditor: ['aud@p.mx', 'Clave2026!'], capt: ['cap@p.mx', 'Clave2026!'] };
}
const mem = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k), _m: m }; };
const nuevo = (almacen = mem(), extra = {}) => crearCliente({ url: URL_, anonKey: KEY, procesosUrl: PROC, almacen, ...extra });

let ok = 0, mal = 0;
const caso = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  PASS  ${nombre}`); }
  catch (e) { mal++; console.log(`  FAIL  ${nombre}\n        ${e.message}`); }
};
const igual = (a, b, m = '') => { if (a !== b) throw new Error(`${m} esperado=${JSON.stringify(b)} obtenido=${JSON.stringify(a)}`); };
const falla = async (fn, pred = () => true) => { try { await fn(); } catch (e) { if (!pred(e)) throw new Error(`error inesperado: ${e.message}`); return e; } throw new Error('debía fallar y no falló'); };

console.log(`\nPrueba del cliente SESIM contra ${REAL ? 'Supabase REAL ' + URL_ : 'mock local'}\n`);

await caso('01 login válido devuelve sesión con rol de api.mi_perfil', async () => {
  const b = nuevo(); const s = await b.iniciarSesion(...C.admin);
  igual(s.perfil.rol, 'administrador'); if (!s.access_token) throw new Error('sin token');
});
await caso('02 los 4 roles inician sesión y llegan con su rol', async () => {
  for (const [k, rol] of [['titular', 'administrador_titular'], ['admin', 'administrador'], ['auditor', 'auditor'], ['capt', 'capturista']]) {
    igual((await nuevo().iniciarSesion(...C[k])).perfil.rol, rol, k);
  }
});
await caso('03 contraseña incorrecta se rechaza y no deja sesión', async () => {
  const b = nuevo(); await falla(() => b.iniciarSesion(C.admin[0], 'incorrecta'));
  igual(b.sesionGuardada(), null);
});
await caso('04 correo inexistente se rechaza', async () => { await falla(() => nuevo().iniciarSesion('nadie@nada.mx', 'x')); });
await caso('05 sin apikey correcta el gateway rechaza', async () => {
  await falla(() => crearCliente({ url: URL_, anonKey: 'falsa', procesosUrl: PROC, almacen: mem() }).iniciarSesion(...C.admin));
});
if (!REAL) {
  await caso('06 cuenta dada de baja no entra (user_banned)', async () => { await falla(() => nuevo().iniciarSesion('baja@p.mx', 'Clave2026!')); });
  await caso('07 usuario autenticado SIN perfil activo no entra', async () => {
    const b = nuevo(); await falla(() => b.iniciarSesion('huerfano@p.mx', 'Clave2026!')); igual(b.sesionGuardada(), null);
  });
}
await caso('08 autenticar NO activa la sesión hasta aceptar políticas', async () => {
  const b = nuevo(); const cand = await b.autenticar(...C.auditor);
  igual(b.sesionGuardada(), null, 'antes de activar'); b.activar(cand); igual(b.sesionGuardada().perfil.rol, 'auditor');
});
await caso('09 sesión persiste y restaurar() la revalida con el servidor', async () => {
  const al = mem(); await nuevo(al).iniciarSesion(...C.admin);
  const b2 = nuevo(al); b2.releer(); const s = await b2.restaurar(); igual(s.perfil.rol, 'administrador');
});
await caso('10 rol falsificado en localStorage NO se respeta (sale del servidor)', async () => {
  const al = mem(); await nuevo(al).iniciarSesion(...C.capt);
  const s = JSON.parse(al.get('sesim_auth')); s.perfil.rol = 'administrador_titular'; al.set('sesim_auth', JSON.stringify(s));
  const b2 = nuevo(al); b2.releer(); const r = await b2.restaurar(); igual(r.perfil.rol, 'capturista');
});
await caso('11 token manipulado en localStorage se descarta', async () => {
  const al = mem(); await nuevo(al).iniciarSesion(...C.admin);
  const s = JSON.parse(al.get('sesim_auth')); s.access_token = s.access_token.slice(0, -4) + 'AAAA'; s.refresh_token = 'inventado'; s.expires_at = 1;
  al.set('sesim_auth', JSON.stringify(s));
  const b2 = nuevo(al); b2.releer(); igual(await b2.restaurar(), null); igual(b2.sesionGuardada(), null);
});
await caso('12 cerrarSesion limpia el almacén y revoca el refresh token', async () => {
  const al = mem(); const b = nuevo(al); const s = await b.iniciarSesion(...C.auditor);
  const rt = s.refresh_token; await b.cerrarSesion();
  igual(al.get('sesim_auth'), null);
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) });
  if (r.ok) throw new Error('el refresh token sigue vivo tras cerrar sesión');
});
await caso('13 token vencido se renueva solo (refresh) y la llamada funciona', async () => {
  const b = nuevo(mem(), { ahora: () => Math.floor(Date.now() / 1000) });
  await b.iniciarSesion(...C.admin);
  const futuro = crearCliente({ url: URL_, anonKey: KEY, procesosUrl: PROC, almacen: mem(), ahora: () => Math.floor(Date.now() / 1000) + 10 * 3600 });
  await futuro.iniciarSesion(...C.admin); // en el reloj adelantado el token ya "venció": fuerza refresh
  const filas = await futuro.rest('mi_perfil'); igual(filas.length, 1);
});
await caso('14 capturista sólo ve su propio perfil; admin ve todos', async () => {
  const c = nuevo(); await c.iniciarSesion(...C.capt); const p = await c.rest('perfil'); igual(p.length, 1, 'capturista');
  const a = nuevo(); await a.iniciarSesion(...C.admin); const t = await a.rest('perfil'); if (t.length < 2) throw new Error('admin debía ver varios');
});
await caso('15 auditor lee la bitácora pero NO puede dar de baja (403)', async () => {
  const a = nuevo(); await a.iniciarSesion(...C.auditor); await a.rest('bitacora');
  const p = await a.rest('perfil'); const otro = p.find((x) => x.rol === 'capturista');
  const e = await falla(() => a.cambiarActivo(otro.id, false));
  igual(e.status, 403);
});
await caso('16 alta de usuario: sólo administrador_titular (admin recibe 403)', async () => {
  const a = nuevo(); await a.iniciarSesion(...C.admin);
  const e = await falla(() => a.altaUsuario({ correo: 'x@y.mx', password: 'Clave2026!aA', nombre: 'X', rol: 'capturista', ambito: 'estatal' }));
  igual(e.status, 403);
});
await caso('17 alta + baja lógica por el titular y la bitácora lo registra', async () => {
  const t = nuevo(); await t.iniciarSesion(...C.titular);
  const correo = `prueba.front.${Date.now()}@encajeterritorialurbano.mx`;
  const r = await t.altaUsuario({ correo, password: 'ClaveFront2026!', nombre: 'Prueba front', rol: 'capturista', ambito: 'estatal' });
  if (!r.id_usuario) throw new Error('sin id_usuario');
  const nuevoUsr = nuevo(); const s = await nuevoUsr.iniciarSesion(correo, 'ClaveFront2026!'); igual(s.perfil.rol, 'capturista');
  const idp = r.id_perfil ?? s.perfil.id; await t.cambiarActivo(idp, false);
  await falla(() => nuevo().iniciarSesion(correo, 'ClaveFront2026!'));
  const bit = await t.rest('bitacora', { query: 'order=creado_en.desc&limit=20' });
  if (!bit.some((x) => x.accion === 'alta') || !bit.some((x) => x.accion === 'baja')) throw new Error('bitácora sin alta/baja');
});
await caso('18 sin configuración (VITE_*) el cliente avisa y no simula', async () => {
  const e = await falla(() => crearCliente({ almacen: mem() }).iniciarSesion('a@b.c', 'x')); if (!/config|conex|backend/i.test(e.message)) throw new Error(e.message);
});

console.log(`\nResultado: ${ok} PASS, ${mal} FAIL`);
mock?.cerrar();
process.exit(mal ? 1 : 0);
