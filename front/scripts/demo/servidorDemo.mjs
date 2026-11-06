/**
 * Backend de demostración en memoria: imita el contrato que el front consume del backend SESIM
 * (GoTrue, PostgREST del esquema `api`, funciones `api.fn_*` y servicio-procesos) sin Docker.
 *
 * Lo usan:
 *  · `npm run demo` / `npm run demo:preview` (vite.config.js lo monta en /supabase y /procesos);
 *  · las pruebas del cliente (scripts/mock-backend.mjs).
 *
 * Los catálogos salen de scripts/demo/datos_demo.json (generado de las migraciones de datos del
 * backend con scripts/datos/07_exportar_datos_demostracion.py). Todo lo que se escribe vive en la
 * memoria del proceso y se pierde al detenerlo. Verifica la firma HS256 de los JWT como el real.
 */
import crypto from 'node:crypto';

const ROLES = ['capturista', 'administrador', 'administrador_titular', 'auditor'];
const VIGENCIA_INVITACION_DIAS = 7;

const b64u = (x) => Buffer.from(x).toString('base64url');
const ahoraIso = () => new Date().toISOString();

export function crearServidorDemo({ anonKey, datos = {}, expiraEn = 3600, secreto = crypto.randomBytes(24).toString('hex') } = {}) {
  const firmar = (p) => {
    const c = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(p))}`;
    return `${c}.${crypto.createHmac('sha256', secreto).update(c).digest('base64url')}`;
  };
  const verificar = (token) => {
    const [h, p, f] = String(token).split('.');
    if (!f) return null;
    if (crypto.createHmac('sha256', secreto).update(`${h}.${p}`).digest('base64url') !== f) return null;
    const c = JSON.parse(Buffer.from(p, 'base64url').toString());
    return c.exp > Math.floor(Date.now() / 1000) ? c : null;
  };

  const catalogo = structuredClone(datos);
  const usuarios = new Map(); // correo -> { id, password, nombre, rol, activo, conPerfil, ultimo_acceso, creado_en }
  const refresh = new Map();
  const bitacora = [];
  const invitaciones = [];
  const diasInhabiles = [];
  const dictamenes = [];
  const bitacoraOperativa = [];
  const registrarOperacion = (yo, capa, operacion) => bitacoraOperativa.unshift({
    id: crypto.randomUUID(), recurso_id: capa.id, codigo_usuario: yo.id.slice(0, 8), actor_nombre: yo.nombre, rol: yo.rol,
    titulo: capa.titulo ?? capa.id, tipo: 'capa', operacion, estatus: capa.estatus, creado_en: ahoraIso(),
    ficha_tecnica: { fuente: capa.metadatos_extra?.fuente_origen, responsable: capa.responsable }, archivos: {},
  });

  const agregar = (correo, password, nombre, rol, extra = {}) => {
    const u = { id: crypto.randomUUID(), password, nombre, rol, activo: true, conPerfil: true, ultimo_acceso: null, creado_en: ahoraIso(), ...extra };
    usuarios.set(String(correo).toLowerCase(), u);
    return u;
  };
  const porId = (id) => [...usuarios.entries()].find(([, u]) => u.id === id);
  const registrar = (accion, actor, objetivo, detalle = {}) => bitacora.push({
    id: crypto.randomUUID(), creado_en: ahoraIso(), accion, detalle,
    objetivo_id_usuario: objetivo?.id ?? null, objetivo_rol: objetivo?.rol ?? null, objetivo_nombre: objetivo?.nombre ?? null,
    actor_id_usuario: actor?.id ?? null, actor_rol: actor?.rol ?? null, actor_nombre: actor?.nombre ?? null,
  });
  const emitir = (u, correo) => {
    const ahora = Math.floor(Date.now() / 1000);
    const rt = crypto.randomBytes(12).toString('hex');
    refresh.set(rt, u.id);
    return {
      access_token: firmar({ sub: u.id, email: correo, role: 'authenticated', aud: 'authenticated', rol: u.rol, iat: ahora, exp: ahora + expiraEn }),
      refresh_token: rt, expires_in: expiraEn, expires_at: ahora + expiraEn, user: { id: u.id, email: correo },
    };
  };
  const filaPerfil = (u, correo) => ({ id: u.id.slice(0, 8), id_usuario: u.id, nombre: u.nombre, rol: u.rol, ambito: 'estatal', cve_mun: null, dependencia: null, activo: u.activo, correo });
  const estadoInvitacion = (i) => (i.usada_en ? 'usada' : i.revocada ? 'revocada' : new Date(i.expira_en) < new Date() ? 'vencida' : 'vigente');
  const huella = (token) => crypto.createHash('sha256').update(token).digest('hex');
  const invitacionVigente = (token) => invitaciones.find((i) => i.token_hash === huella(String(token)) && estadoInvitacion(i) === 'vigente');

  /** Filtros de PostgREST que usa el front: `col=eq.valor` y `order=col[.desc]`. */
  function filtrar(filas, params) {
    let r = filas;
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(k) || !v.startsWith('eq.')) continue;
      const valor = v.slice(3);
      r = r.filter((f) => String(f[k]) === valor);
    }
    const orden = params.get('order');
    if (orden) {
      const [col, dir] = orden.split('.');
      const s = dir === 'desc' ? -1 : 1;
      r = [...r].sort((a, b) => (a[col] > b[col] ? s : a[col] < b[col] ? -s : 0));
    }
    return r;
  }

  const ERROR_ROL = (accion) => ({ status: 403, cuerpo: { code: '42501', message: `Su perfil no puede ${accion}.` } });

  /** Funciones api.fn_* que usa la interfaz. Cada una recibe (args, yo) y devuelve { status?, cuerpo }. */
  const funciones = {
    fn_usuarios: (_, yo) => (yo.rol !== 'administrador_titular' ? ERROR_ROL('listar usuarios')
      : { cuerpo: [...usuarios].filter(([, u]) => u.conPerfil).map(([correo, u]) => ({ ...filaPerfil(u, correo), creado_en: u.creado_en, ultimo_acceso: u.ultimo_acceso })) }),
    fn_invitaciones: (_, yo) => (yo.rol !== 'administrador_titular' ? ERROR_ROL('consultar invitaciones')
      : { cuerpo: invitaciones.map(({ token_hash: _h, ...i }) => ({ ...i, estado: estadoInvitacion(i) })).reverse() }),
    fn_emitir_invitacion: ({ p_correo, p_rol }, yo) => {
      if (yo.rol !== 'administrador_titular') return ERROR_ROL('emitir invitaciones');
      const correo = String(p_correo ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { status: 400, cuerpo: { code: '22023', message: `El correo "${p_correo}" no es válido.` } };
      if (!ROLES.includes(p_rol)) return { status: 400, cuerpo: { code: '22023', message: 'El perfil no es válido.' } };
      if (usuarios.has(correo)) return { status: 400, cuerpo: { code: '23505', message: 'Ya existe una cuenta con ese correo.' } };
      const token = crypto.randomBytes(24).toString('base64url');
      const inv = {
        id: crypto.randomUUID(), rol: p_rol, correo_destino: correo, id_usuario_emisor: yo.id,
        expira_en: new Date(Date.now() + VIGENCIA_INVITACION_DIAS * 864e5).toISOString(), usada_en: null, id_usuario_creado: null,
        revocada: false, created_at: ahoraIso(), token_hash: huella(token),
      };
      invitaciones.push(inv);
      return { cuerpo: { id: inv.id, correo_destino: correo, rol: p_rol, expira_en: inv.expira_en, token } };
    },
    fn_revocar_invitacion: ({ p_id }, yo) => {
      if (yo.rol !== 'administrador_titular') return ERROR_ROL('revocar invitaciones');
      const inv = invitaciones.find((i) => i.id === p_id);
      if (!inv || estadoInvitacion(inv) !== 'vigente') return { status: 400, cuerpo: { code: 'P0001', message: 'La invitación ya no está vigente.' } };
      inv.revocada = true;
      return { cuerpo: { ok: true } };
    },
    fn_dar_de_baja_usuario: ({ p_id }, yo) => cambiarActivo(p_id, false, yo),
    fn_reactivar_usuario: ({ p_id }, yo) => cambiarActivo(p_id, true, yo),
    fn_pendientes_rechazo: ({ p_incluir_cerrados }, yo) => ({
      cuerpo: dictamenes.filter((d) => (p_incluir_cerrados || ['pendiente', 'retomada'].includes(d.estado)) && (yo.rol !== 'capturista' || d.id_destinatario === yo.id)),
    }),
    fn_decidir_rechazo: ({ p_id_dictamen, p_decision }) => {
      const d = dictamenes.find((x) => x.id_dictamen === p_id_dictamen);
      if (d) d.estado = p_decision === 'retomar' ? 'retomada' : 'descartada';
      return { cuerpo: { ok: !!d } };
    },
    fn_reabrir_rechazo: ({ p_id_dictamen }) => {
      const d = dictamenes.find((x) => x.id_dictamen === p_id_dictamen);
      if (d) d.estado = 'pendiente';
      return { cuerpo: { ok: !!d } };
    },
    fn_guardar_dia_inhabil: ({ p_fecha, p_descripcion }, yo) => {
      if (!['administrador', 'administrador_titular'].includes(yo.rol)) return ERROR_ROL('registrar días inhábiles');
      if (!p_fecha) return { status: 400, cuerpo: { code: '22023', message: 'Indique la fecha.' } };
      const i = diasInhabiles.findIndex((d) => d.fecha === p_fecha);
      const fila = { fecha: p_fecha, descripcion: p_descripcion ?? '' };
      if (i >= 0) diasInhabiles[i] = fila; else diasInhabiles.push(fila);
      return { cuerpo: fila };
    },
    fn_quitar_dia_inhabil: ({ p_fecha }, yo) => {
      if (!['administrador', 'administrador_titular'].includes(yo.rol)) return ERROR_ROL('quitar días inhábiles');
      const i = diasInhabiles.findIndex((d) => d.fecha === p_fecha);
      if (i >= 0) diasInhabiles.splice(i, 1);
      return { cuerpo: { ok: i >= 0 } };
    },
    fn_guardar_capa: ({ p_datos }, yo) => {
      if (yo.rol === 'auditor') return ERROR_ROL('registrar capas');
      const capas = (catalogo.capa_registrada ??= []);
      const fila = { ...p_datos, estatus: 'borrador', actualizado_por: yo.id, actualizado_en: ahoraIso() };
      const i = capas.findIndex((c) => c.id === fila.id);
      if (i >= 0) capas[i] = { ...capas[i], ...fila }; else capas.push(fila);
      registrarOperacion(yo, fila, 'registro');
      return { cuerpo: fila };
    },
    fn_enviar_capa_revision: ({ p_id }, yo) => {
      const c = (catalogo.capa_registrada ?? []).find((x) => x.id === p_id);
      if (!c) return { status: 404, cuerpo: { code: 'P0002', message: 'La capa no existe.' } };
      c.estatus = 'revision';
      registrarOperacion(yo, c, 'envio');
      return { cuerpo: { id: p_id, estatus: 'revision' } };
    },
  };

  function cambiarActivo(idUsuario, activo, yo) {
    if (yo.rol !== 'administrador_titular') return ERROR_ROL(activo ? 'reactivar cuentas' : 'dar de baja cuentas');
    if (idUsuario === yo.id) return { status: 400, cuerpo: { code: 'P0001', message: 'No puede darse de baja a sí mismo.' } };
    const par = porId(idUsuario);
    if (!par) return { status: 404, cuerpo: { code: 'P0002', message: 'La cuenta no existe.' } };
    par[1].activo = activo;
    if (!activo) for (const [rt, id] of refresh) if (id === idUsuario) refresh.delete(rt);
    registrar(activo ? 'reactivacion' : 'baja', yo, par[1]);
    return { cuerpo: { ok: true } };
  }

  async function leerCuerpo(req) {
    if (req.body !== undefined) return req.body;
    return new Promise((ok) => {
      let d = '';
      req.on('data', (c) => (d += c));
      req.on('end', () => {
        try { ok(d ? JSON.parse(d) : {}); } catch { ok({}); }
      });
    });
  }

  /** Atiende una petición. `ruta` es la ruta sin el prefijo de montaje (/auth/v1/…, /rest/v1/…, /admin/…). */
  async function manejar(req, res) {
    const url = new URL(req.url, 'http://demo');
    const ruta = url.pathname;
    const json = (st, o) => { res.statusCode = st; res.setHeader('content-type', 'application/json'); res.end(o === undefined ? '' : JSON.stringify(o)); };
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const cuerpo = req.method === 'GET' ? {} : await leerCuerpo(req);
    const bearer = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = bearer && bearer !== anonKey ? verificar(bearer) : null;
    const par = claims && porId(claims.sub);
    const yo = par?.[1]?.activo ? par[1] : null;

    // ---- servicio-procesos ----
    if (ruta === '/health') return json(200, { ok: true, ambiente: 'demostracion' });
    if (ruta.startsWith('/invitacion/') && req.method === 'GET') {
      const inv = invitacionVigente(decodeURIComponent(ruta.slice('/invitacion/'.length)));
      return inv ? json(200, { correo: inv.correo_destino, rol: inv.rol }) : json(404, { detail: 'invitacion_no_valida_o_vencida' });
    }
    if (ruta === '/invitacion/canjear' && req.method === 'POST') {
      if (String(cuerpo.password ?? '').length < 10) return json(422, { detail: 'contrasena_muy_corta' });
      const inv = invitacionVigente(cuerpo.token);
      if (!inv) return json(404, { detail: 'invitacion_no_valida_o_vencida' });
      const u = agregar(inv.correo_destino, cuerpo.password, String(cuerpo.nombre ?? '').trim() || inv.correo_destino, inv.rol);
      inv.usada_en = ahoraIso();
      inv.id_usuario_creado = u.id;
      registrar('alta', null, u, { rol: u.rol, via: 'invitacion' });
      return json(201, { id_usuario: u.id, correo: inv.correo_destino, rol: inv.rol });
    }
    if (ruta === '/admin/alta-usuario') {
      if (!yo) return json(401, { detail: 'token_invalido' });
      if (yo.rol !== 'administrador_titular') return json(403, { detail: 'solo_administrador_titular_puede_dar_de_alta' });
      if (!ROLES.includes(cuerpo.rol)) return json(422, { detail: 'rol_invalido' });
      if (usuarios.has(String(cuerpo.correo).toLowerCase())) return json(409, { detail: 'gotrue_rechazo_alta' });
      const u = agregar(cuerpo.correo, cuerpo.password, cuerpo.nombre, cuerpo.rol);
      registrar('alta', yo, u, { rol: u.rol, dependencia: cuerpo.dependencia ?? null });
      return json(201, { id_usuario: u.id, id_perfil: u.id.slice(0, 8) });
    }

    // ---- GoTrue y PostgREST: exigen la apikey pública ----
    if (req.headers.apikey !== anonKey) return json(401, { message: 'No API key found in request' });

    if (ruta === '/auth/v1/token') {
      const g = url.searchParams.get('grant_type');
      if (g === 'password') {
        const correo = String(cuerpo.email ?? '').trim().toLowerCase();
        const u = usuarios.get(correo);
        if (!u || u.password !== cuerpo.password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (!u.activo) return json(400, { code: 400, error_code: 'user_banned', msg: 'User is banned' });
        u.ultimo_acceso = ahoraIso();
        registrar('acceso', u, u);
        return json(200, emitir(u, correo));
      }
      if (g === 'refresh_token') {
        const id = refresh.get(cuerpo.refresh_token);
        const p = id && porId(id);
        if (!p || !p[1].activo) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
        refresh.delete(cuerpo.refresh_token);
        return json(200, emitir(p[1], p[0]));
      }
      return json(400, { msg: 'unsupported_grant_type' });
    }
    if (ruta === '/auth/v1/logout') {
      if (!claims) return json(401, { message: 'invalid JWT' });
      for (const [rt, id] of refresh) if (id === claims.sub) refresh.delete(rt);
      res.statusCode = 204;
      return res.end();
    }

    if (!ruta.startsWith('/rest/v1/')) return json(404, { message: 'no existe' });
    const perfilEsquema = req.headers['accept-profile'] ?? req.headers['content-profile'];
    if (perfilEsquema !== 'api') return json(406, { code: 'PGRST106', message: 'Invalid schema' });
    const esAnon = !bearer || bearer === anonKey;
    if (!esAnon && !claims) return json(401, { code: 'PGRST301', message: 'JWT invalid' });
    const nombre = ruta.slice('/rest/v1/'.length);

    if (nombre.startsWith('rpc/')) {
      if (!yo) return json(401, { code: 'PGRST301', message: 'Inicie sesión para continuar.' });
      const fn = funciones[nombre.slice(4)];
      if (!fn) return json(404, { code: 'PGRST202', message: `La función ${nombre.slice(4)} no está disponible en la demostración.` });
      const r = fn(cuerpo ?? {}, yo);
      return json(r.status ?? 200, r.cuerpo);
    }

    const rango = /^(\d+)-(\d+)$/.exec(req.headers.range ?? '');
    const paginar = (filas) => {
      const desde = rango ? Number(rango[1]) : 0;
      const hasta = Math.min(rango ? Number(rango[2]) : 999, desde + 999);
      return filas.slice(desde, hasta + 1);
    };

    if (Object.hasOwn(catalogo, nombre)) {
      if (!esAnon && !(yo && par[1].conPerfil)) return json(200, []);
      let filas = catalogo[nombre];
      if (esAnon && nombre === 'indicador') filas = filas.filter((i) => i.activo);
      if (esAnon && nombre === 'instrumento_origen') filas = filas.filter((i) => i.publicado && i.activo !== false);
      return json(200, paginar(filtrar(filas, url.searchParams)));
    }

    if (nombre === 'mi_perfil') return json(200, par?.[1]?.conPerfil ? [filaPerfil(par[1], par[0])] : []);
    if (!yo) return json(esAnon ? 401 : 200, esAnon ? { code: '42501', message: `permission denied for view ${nombre}` } : []);
    if (nombre === 'perfil' && req.method === 'GET') {
      return json(200, yo.rol === 'capturista' ? [filaPerfil(yo, par[0])] : [...usuarios].map(([c, u]) => filaPerfil(u, c)));
    }
    if (nombre === 'perfil' && req.method === 'PATCH') {
      if (!['administrador', 'administrador_titular'].includes(yo.rol)) return json(200, []);
      const idp = String(url.searchParams.get('id') ?? '').replace('eq.', '');
      const dest = [...usuarios].find(([, u]) => u.id.startsWith(idp));
      if (!dest) return json(200, []);
      dest[1].activo = !!cuerpo.activo;
      registrar(cuerpo.activo ? 'reactivacion' : 'baja', yo, dest[1]);
      return json(200, [filaPerfil(dest[1], dest[0])]);
    }
    if (nombre === 'bitacora') return json(200, paginar(yo.rol === 'capturista' ? bitacora.filter((b) => b.objetivo_id_usuario === yo.id) : bitacora));
    if (nombre === 'bitacora_operativa') return json(200, paginar(yo.rol === 'capturista' ? bitacoraOperativa.filter((b) => b.codigo_usuario === yo.id.slice(0, 8)) : bitacoraOperativa));
    if (nombre === 'dia_inhabil') return json(200, paginar(filtrar(diasInhabiles, url.searchParams)));
    return json(404, { code: 'PGRST205', message: `No existe la tabla api.${nombre}.` });
  }

  return { manejar, agregar, usuarios, refresh, bitacora };
}

/**
 * Cuentas de la demostración. Las de @campeche.gob.mx usan como contraseña el nombre del perfil; las
 * sesim*@gmail.com replican las de desarrollo que crea SESIM_Backend/scripts/seed_dev.py con su
 * PASSWORD_DEV, para entrar con las mismas credenciales con o sin Docker.
 */
const PASSWORD_DEV = 'SesimDev2026!';
export const CUENTAS_DEMOSTRACION = [
  { correo: 'titular@campeche.gob.mx', password: 'titular', nombre: 'Administrador Titular', rol: 'administrador_titular' },
  { correo: 'administrador@campeche.gob.mx', password: 'administrador', nombre: 'Administrador', rol: 'administrador' },
  { correo: 'auditor@campeche.gob.mx', password: 'auditor', nombre: 'Auditor', rol: 'auditor' },
  { correo: 'capturista@campeche.gob.mx', password: 'capturista', nombre: 'Capturista', rol: 'capturista' },
  { correo: 'sesimadminvip@gmail.com', password: PASSWORD_DEV, nombre: 'Administrador titular de prueba', rol: 'administrador_titular' },
  { correo: 'sesimadmin@gmail.com', password: PASSWORD_DEV, nombre: 'Administrador de prueba', rol: 'administrador' },
  { correo: 'sesimauditor1@gmail.com', password: PASSWORD_DEV, nombre: 'Auditor de prueba 1', rol: 'auditor' },
  { correo: 'sesimauditor2@gmail.com', password: PASSWORD_DEV, nombre: 'Auditor de prueba 2', rol: 'auditor' },
  { correo: 'sesimcapturista1@gmail.com', password: PASSWORD_DEV, nombre: 'Capturista de prueba 1', rol: 'capturista' },
  { correo: 'sesimcapturista2@gmail.com', password: PASSWORD_DEV, nombre: 'Capturista de prueba 2', rol: 'capturista' },
];
