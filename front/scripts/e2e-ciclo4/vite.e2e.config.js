// Arnes E2E: emula GoTrue + PostgREST + servicio-procesos sobre la base REAL (sesim_e2e) con psql.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';

const PSQL = ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'sesim_e2e', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function sql(texto) {
  try {
    const out = execFileSync('psql', PSQL, { input: texto, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lineas = out.split('\n').filter((l) => l.trim() !== '');
    return { ok: true, ultima: lineas[lineas.length - 1] ?? 'null' };
  } catch (e) {
    const err = String(e.stderr ?? e.message);
    const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(err);
    return { ok: false, code: m?.[1] ?? 'XX000', message: (m?.[2] ?? err).split('\n')[0] };
  }
}

function claims(req) {
  const t = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); return p.sub ? p : null; } catch { return null; }
}
const envoltorio = (c, q) => `begin; set local role ${c ? 'authenticated' : 'anon'};
select set_config('request.jwt.claims', ${lit(JSON.stringify(c ?? {}))}, true), set_config('request.jwt.claim.sub', ${lit(c?.sub ?? '')}, true);
${q}; commit;`;

function cuerpo(req) {
  return new Promise((res) => { let d = ''; req.on('data', (x) => (d += x)); req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch { res({}); } }); });
}
const json = (res, status, obj) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
const estado = (code) => (code === '42501' ? 403 : code === 'P0002' ? 404 : code.startsWith('23') ? 409 : 400);

export default defineConfig({
  plugins: [react(), { name: 'e2e-api', configureServer(s) {
    // GoTrue
    s.middlewares.use('/supabase/auth/v1', async (req, res) => {
      if (req.url.startsWith('/logout')) { res.statusCode = 204; return res.end(); }
      const b = await cuerpo(req);
      const r = sql(`select id from auth.users where email = ${lit(String(b.email ?? '').toLowerCase())}`);
      if (!r.ok || r.ultima === 'null' || !b.password) return json(res, 400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const sub = r.ultima;
      const tok = `${b64({ alg: 'none' })}.${b64({ sub, role: 'authenticated', exp: 9999999999 })}.x`;
      json(res, 200, { access_token: tok, refresh_token: 'r', expires_at: 9999999999, expires_in: 3600, user: { id: sub, email: b.email } });
    });
    // PostgREST
    s.middlewares.use('/supabase/rest/v1', async (req, res) => {
      const c = claims(req);
      const [ruta, qs = ''] = req.url.replace(/^\//, '').split('?');
      const params = new URLSearchParams(qs);
      if (ruta.startsWith('rpc/')) {
        const fn = ruta.slice(4).replace(/[^a-z0-9_]/gi, '');
        const args = await cuerpo(req);
        const lista = Object.entries(args).map(([k, v]) => {
          const nombre = k.replace(/[^a-z0-9_]/gi, '');
          if (v !== null && typeof v === 'object') return `${nombre} => ${lit(JSON.stringify(v))}::jsonb`;
          return `${nombre} => ${lit(v)}`;
        }).join(', ');
        const tabular = ['fn_usuarios', 'fn_invitaciones', 'fn_pendientes_rechazo'].includes(fn);
        const q = tabular
          ? `select coalesce(jsonb_agg(t), '[]'::jsonb) from api.${fn}(${lista}) t`
          : `select coalesce(to_jsonb(x.r), 'null'::jsonb) from (select api.${fn}(${lista}) as r) x`;
        const r = sql(envoltorio(c, q));
        if (!r.ok) return json(res, estado(r.code), { code: r.code, message: r.message });
        res.setHeader('content-type', 'application/json'); return res.end(r.ultima);
      }
      const tabla = ruta.replace(/[^a-z0-9_]/gi, '');
      let orden = '';
      const o = params.get('order'); if (o) { const [col, dir] = o.split('.'); orden = ` order by ${col.replace(/[^a-z0-9_]/gi, '')} ${dir === 'desc' ? 'desc' : 'asc'}`; }
      const r = sql(envoltorio(c, `select coalesce(jsonb_agg(t), '[]'::jsonb) from (select * from api.${tabla}${orden}) t`));
      if (!r.ok) return json(res, estado(r.code), { code: r.code, message: r.message });
      res.setHeader('content-type', 'application/json'); res.end(r.ultima);
    });
    // servicio-procesos (canje)
    s.middlewares.use('/procesos', async (req, res) => {
      if (req.method === 'GET') {
        const token = decodeURIComponent(req.url.replace(/^\/invitacion\//, ''));
        const r = sql(`select coalesce((select jsonb_build_object('correo', correo_destino, 'rol', rol) from core.fn_invitacion_vigente(${lit(token)})), 'null'::jsonb)`);
        if (!r.ok || r.ultima === 'null') return json(res, 404, { detail: 'invitacion_no_valida_o_vencida' });
        res.setHeader('content-type', 'application/json'); return res.end(r.ultima);
      }
      const b = await cuerpo(req);
      if ((b.password ?? '').length < 10) return json(res, 422, { detail: 'contrasena_muy_corta' });
      const v = sql(`select correo_destino from core.fn_invitacion_vigente(${lit(b.token)})`);
      if (!v.ok || v.ultima === 'null') return json(res, 404, { detail: 'invitacion_no_valida_o_vencida' });
      const id = crypto.randomUUID();
      const r = sql(`insert into auth.users (id, email) values (${lit(id)}, ${lit(v.ultima)});
select core.fn_consumir_invitacion(${lit(b.token)}, ${lit(id)}, ${lit(b.nombre)}, ${lit(b.ambito ?? 'estatal')}, ${lit(b.cve_mun)}, ${lit(b.dependencia)})`);
      if (!r.ok) return json(res, 409, { detail: 'no_se_pudo_canjear_la_invitacion' });
      json(res, 201, { id_usuario: id, correo: v.ultima });
    });
  } }],
  server: { port: 5298 },
});
