/**
 * Backend de MENTIRA para probar el front sin Docker: imita lo mínimo de GoTrue
 * (/auth/v1/token, /logout), PostgREST (api.mi_perfil, api.perfil, api.bitacora con
 * filtro por rol) y servicio-procesos (/admin/alta-usuario). Verifica la firma HS256
 * de los JWT como el real. NO sustituye la prueba contra el Supabase real
 * (scripts/prueba-login.mjs con SESIM_URL); sirve para ejercitar el código del front.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const SECRETO = 'secreto-de-prueba-del-mock';
const b64u = (x) => Buffer.from(x).toString('base64url');
const firmar = (p) => {
  const c = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(p))}`;
  return `${c}.${crypto.createHmac('sha256', SECRETO).update(c).digest('base64url')}`;
};
function verificar(token) {
  const [h, p, f] = String(token).split('.');
  if (!f) return null;
  const esperado = crypto.createHmac('sha256', SECRETO).update(`${h}.${p}`).digest('base64url');
  if (esperado !== f) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url').toString());
  return c.exp > Math.floor(Date.now() / 1000) ? c : null;
}

export function iniciarMock({ port = 0, anonKey = 'anon-mock', expiraEn = 3600, claveAlta = 'ClaveNueva2026!', catalogo = {} } = {}) {
  const usuarios = new Map(); // correo -> {id, password, nombre, rol, activo, conPerfil}
  const refresh = new Map(); // refresh_token -> id
  const bitacora = [];
  const nuevoId = () => crypto.randomUUID();
  const agregar = (correo, password, nombre, rol, extra = {}) => {
    const u = { id: nuevoId(), password, nombre, rol, activo: true, conPerfil: true, ...extra };
    usuarios.set(correo, u);
    return u;
  };
  const porId = (id) => [...usuarios.entries()].find(([, u]) => u.id === id);
  const emitir = (u, correo) => {
    const ahora = Math.floor(Date.now() / 1000);
    const rt = crypto.randomBytes(12).toString('hex');
    refresh.set(rt, u.id);
    return { access_token: firmar({ sub: u.id, email: correo, role: 'authenticated', aud: 'authenticated', rol: u.rol, iat: ahora, exp: ahora + expiraEn }), refresh_token: rt, expires_in: expiraEn, expires_at: ahora + expiraEn, user: { id: u.id, email: correo } };
  };

  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const cuerpo = await new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });
    const json = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.apikey !== anonKey) return json(401, { message: 'No API key found in request' });
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = bearer ? verificar(bearer) : null;

    if (url.pathname === '/auth/v1/token') {
      const g = url.searchParams.get('grant_type');
      if (g === 'password') {
        const u = usuarios.get(String(cuerpo.email).toLowerCase());
        if (!u || u.password !== cuerpo.password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (!u.activo) return json(400, { code: 400, error_code: 'user_banned', msg: 'User is banned' });
        return json(200, emitir(u, String(cuerpo.email).toLowerCase()));
      }
      if (g === 'refresh_token') {
        const id = refresh.get(cuerpo.refresh_token);
        const par = id && porId(id);
        if (!par || !par[1].activo) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
        refresh.delete(cuerpo.refresh_token);
        return json(200, emitir(par[1], par[0]));
      }
    }
    if (url.pathname === '/auth/v1/logout') {
      if (!claims) return json(401, { message: 'invalid JWT' });
      for (const [rt, id] of refresh) if (id === claims.sub) refresh.delete(rt);
      res.writeHead(204); return res.end();
    }
    // Catálogos del esquema api (PostgREST): anon ve los indicadores activos, aprobados o no (migración 217, E-6);
    // una cuenta con perfil activo ve todo (migración 207). Soporta order=<col> y Range (paginación).
    const nombreTabla = url.pathname.split('/').pop();
    if (url.pathname.startsWith('/rest/v1/') && Object.hasOwn(catalogo, nombreTabla)) {
      if (req.headers['accept-profile'] !== 'api') return json(406, { code: 'PGRST106', message: 'Invalid schema' });
      const par = claims && porId(claims.sub);
      const esAnon = !claims && bearer === anonKey;
      if (!esAnon && !(par && par[1].activo && par[1].conPerfil)) return json(claims ? 200 : 401, claims ? [] : { code: 'PGRST301', message: 'JWT invalid' });
      let filas = catalogo[nombreTabla];
      if (esAnon && nombreTabla === 'indicador') filas = filas.filter((i) => i.activo);
      const orden = url.searchParams.get('order');
      if (orden) filas = [...filas].sort((a, b) => (a[orden] > b[orden] ? 1 : a[orden] < b[orden] ? -1 : 0));
      const m = /^(\d+)-(\d+)$/.exec(req.headers.range ?? '');
      const desde = m ? Number(m[1]) : 0;
      const hasta = Math.min(m ? Number(m[2]) : 999, desde + 999); // tope de PostgREST: 1000
      return json(200, filas.slice(desde, hasta + 1));
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      if (!claims) return json(401, { code: 'PGRST301', message: 'JWT invalid' });
      const par = porId(claims.sub);
      const yo = par?.[1];
      const tabla = url.pathname.split('/').pop();
      const fila = (u, correo) => ({ id: u.id.slice(0, 8), id_usuario: u.id, nombre: u.nombre, rol: u.rol, ambito: 'estatal', cve_mun: null, dependencia: null, activo: u.activo, correo });
      if (tabla === 'mi_perfil') return json(200, yo && yo.conPerfil ? [fila(yo, par[0])] : []);
      if (!yo || !yo.activo) return json(200, []);
      if (tabla === 'perfil' && req.method === 'GET') return json(200, yo.rol === 'capturista' ? [fila(yo, par[0])] : [...usuarios].map(([c, u]) => fila(u, c)));
      if (tabla === 'perfil' && req.method === 'PATCH') {
        if (!['administrador', 'administrador_titular'].includes(yo.rol)) return json(403, { code: '42501', message: 'permission denied' });
        const idp = url.searchParams.get('id').replace('eq.', '');
        const dest = [...usuarios].find(([, u]) => u.id.startsWith(idp));
        if (!dest) return json(200, []);
        dest[1].activo = cuerpo.activo;
        bitacora.push({ id: nuevoId(), creado_en: new Date().toISOString(), accion: cuerpo.activo ? 'reactivacion' : 'baja', detalle: {}, objetivo_id_usuario: dest[1].id, objetivo_rol: dest[1].rol, objetivo_nombre: dest[1].nombre, actor_id_usuario: yo.id, actor_rol: yo.rol, actor_nombre: yo.nombre });
        return json(200, [fila(dest[1], dest[0])]);
      }
      if (tabla === 'bitacora') return json(200, yo.rol === 'capturista' ? bitacora.filter((b) => b.objetivo_id_usuario === yo.id) : bitacora);
    }
    if (url.pathname === '/admin/alta-usuario') {
      const yo = claims && porId(claims.sub)?.[1];
      if (!yo) return json(401, { detail: 'token_invalido' });
      if (yo.rol !== 'administrador_titular') return json(403, { detail: 'solo_administrador_titular_puede_dar_de_alta' });
      if (usuarios.has(cuerpo.correo)) return json(409, { detail: 'gotrue_rechazo_alta' });
      const u = agregar(cuerpo.correo, cuerpo.password, cuerpo.nombre, cuerpo.rol);
      bitacora.push({ id: nuevoId(), creado_en: new Date().toISOString(), accion: 'alta', detalle: { rol: u.rol }, objetivo_id_usuario: u.id, objetivo_rol: u.rol, objetivo_nombre: u.nombre, actor_id_usuario: yo.id, actor_rol: yo.rol, actor_nombre: yo.nombre });
      return json(201, { id_usuario: u.id, id_perfil: u.id.slice(0, 8) });
    }
    return json(404, { message: 'no existe' });
  });

  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${srv.address().port}`, port: srv.address().port, anonKey, agregar, usuarios, refresh, cerrar: () => srv.close(), claveAlta,
  })));
}

// Ejecución directa: node scripts/mock-backend.mjs [puerto]
if (import.meta.url === `file://${process.argv[1]}`) {
  const m = await iniciarMock({ port: Number(process.argv[2] ?? 8000) });
  m.agregar('titular@prueba.mx', 'Prueba2026!', 'Titular Prueba', 'administrador_titular');
  m.agregar('admin@prueba.mx', 'Prueba2026!', 'Administrador Prueba', 'administrador');
  m.agregar('auditor@prueba.mx', 'Prueba2026!', 'Auditor Prueba', 'auditor');
  m.agregar('captura@prueba.mx', 'Prueba2026!', 'Capturista Prueba', 'capturista');
  console.log(`Mock SESIM en ${m.url} (apikey: ${m.anonKey}). Cuentas: titular@/admin@/auditor@/captura@prueba.mx, clave Prueba2026!`);
}
