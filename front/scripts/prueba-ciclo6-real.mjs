#!/usr/bin/env node
/**
 * Ciclo 6 -- prueba contra GoTrue, PostgREST y STORAGE reales (sin simulacion).
 * Las mediciones aun no se crean por la API (Ciclo 8), asi que una persona con acceso a la base prepara UNA medicion
 * de prueba con db/pruebas/ciclo6_semilla_medicion.sql (imprime su id). Despues:
 *
 *   SESIM_URL=https://tu-gateway ANON_KEY=... \
 *   CAP_CORREO=capturista@... CAP_CLAVE=... AUD_CORREO=auditor@... AUD_CLAVE=... OTRO_CORREO=otro.capturista@... OTRO_CLAVE=... \
 *   MEDICION_ID=<uuid> node front/scripts/prueba-ciclo6-real.mjs
 *
 * El script pausa dos veces para que cambies el estado de la medicion con psql (se indica el comando).
 * Sale con codigo 0 si todo pasa. Deja una evidencia reemplazada y una vigente en esa medicion (no se borra nada).
 */
import { createHash, randomBytes } from 'node:crypto';
import readline from 'node:readline/promises';

const { SESIM_URL, ANON_KEY, CAP_CORREO, CAP_CLAVE, AUD_CORREO, AUD_CLAVE, OTRO_CORREO, OTRO_CLAVE, MEDICION_ID } = process.env;
for (const [k, v] of Object.entries({ SESIM_URL, ANON_KEY, CAP_CORREO, CAP_CLAVE, AUD_CORREO, AUD_CLAVE, OTRO_CORREO, OTRO_CLAVE, MEDICION_ID })) {
  if (!v) { console.error(`Falta la variable ${k}`); process.exit(2); }
}
const resultados = [];
const ok = (n, c, d = '') => { resultados.push(c); console.log(`${c ? 'PASA ' : 'FALLA'} · ${n}${d ? ' · ' + String(d).slice(0, 140) : ''}`); };
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function entrar(correo, clave) {
  const r = await fetch(`${SESIM_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: correo, password: clave }) });
  const d = await r.json(); if (!d.access_token) throw new Error(`No pude entrar como ${correo}: ${JSON.stringify(d).slice(0, 120)}`);
  return d.access_token;
}
const rpc = async (t, fn, args) => { const r = await fetch(`${SESIM_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${t}`, 'content-type': 'application/json', 'Content-Profile': 'api' }, body: JSON.stringify(args) }); return { status: r.status, datos: await r.json().catch(() => null) }; };
const subir = (t, nombre, cuerpo, mime) => fetch(`${SESIM_URL}/storage/v1/object/evidencias/${nombre}`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${t}`, 'Content-Type': mime, 'x-upsert': 'false' }, body: cuerpo });
const bajar = (t, nombre) => fetch(`${SESIM_URL}/storage/v1/object/authenticated/evidencias/${nombre}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${t}` } });
const sha = (b) => createHash('sha256').update(b).digest('hex');

const cap = await entrar(CAP_CORREO, CAP_CLAVE), aud = await entrar(AUD_CORREO, AUD_CLAVE), otro = await entrar(OTRO_CORREO, OTRO_CLAVE);
const pdf1 = Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(512)]); const h1 = sha(pdf1);
const png2 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(256)]); const h2 = sha(png2);

// 1. Politicas del bucket
let r = await subir(otro, `${MEDICION_ID}/${h1}.pdf`, pdf1, 'application/pdf');
ok('Otro Capturista no puede subir a una medicion ajena (4xx)', [400, 403].includes(r.status), r.status);
r = await subir(cap, `${MEDICION_ID}/oficio.pdf`, pdf1, 'application/pdf');
ok('Un nombre que no es <medicion>/<sha256>.<ext> se rechaza (4xx)', [400, 403].includes(r.status), r.status);
r = await subir(cap, `${MEDICION_ID}/${h1}.pdf`, pdf1, 'application/zip');
ok('Un tipo no permitido se rechaza (4xx)', r.status >= 400, r.status);
r = await subir(cap, `${MEDICION_ID}/${h1}.pdf`, pdf1, 'application/pdf');
ok('El autor sube su PDF', r.ok, r.status);
r = await fetch(`${SESIM_URL}/storage/v1/object/evidencias/${MEDICION_ID}/${h1}.pdf`, { headers: { apikey: ANON_KEY } });
ok('El ciudadano (sin sesion) no descarga el archivo', r.status >= 400, r.status);

// 2. Registro
let x = await rpc(cap, 'fn_registrar_evidencia', { p_id_medicion: MEDICION_ID, p_tipo_documento: 'Oficio', p_hash: h1, p_mime: 'application/pdf', p_bytes: pdf1.length });
ok('El autor registra su evidencia (vigente)', x.status === 200 && x.datos?.vigente === true, JSON.stringify(x.datos).slice(0, 100));
const e1 = x.datos?.id;
x = await rpc(otro, 'fn_registrar_evidencia', { p_id_medicion: MEDICION_ID, p_tipo_documento: 'Oficio', p_hash: h1, p_mime: 'application/pdf', p_bytes: pdf1.length });
ok('Otro Capturista no registra (403)', x.status === 403, x.datos?.message);
x = await rpc(cap, 'fn_registrar_evidencia', { p_id_medicion: MEDICION_ID, p_tipo_documento: 'Oficio', p_hash: h1, p_mime: 'application/pdf', p_bytes: pdf1.length });
ok('La misma huella no se registra dos veces (400)', x.status === 400 || x.status === 409, x.datos?.message);
r = await bajar(cap, `${MEDICION_ID}/${h1}.pdf`); ok('El autor descarga su archivo y la huella coincide', r.ok && sha(Buffer.from(await r.arrayBuffer())) === h1, r.status);
r = await bajar(otro, `${MEDICION_ID}/${h1}.pdf`); ok('Otro Capturista no descarga archivos ajenos', r.status >= 400, r.status);

// 3. Pausa: la medicion pasa a revision (la ve el Auditor) y se verifica
await rl.question(`\nEn la base, ejecuta:\n  update core.medicion_indicador set estado='rechazado', usuario_validacion=(select id_usuario from core.perfil where rol='administrador' limit 1), fecha_validacion=now() where id='${MEDICION_ID}';\ny presiona Enter... `);
r = await bajar(aud, `${MEDICION_ID}/${h1}.pdf`); ok('El Auditor ya descarga el archivo (la medicion salio del borrador)', r.ok, r.status);
x = await rpc(aud, 'fn_verificar_evidencia', { p_id: e1, p_hash_calculado: h1 }); ok('Verificacion con la huella correcta: coincide', x.datos?.coincide === true, JSON.stringify(x.datos).slice(0, 100));
x = await rpc(aud, 'fn_verificar_evidencia', { p_id: e1, p_hash_calculado: sha(Buffer.from('otro archivo')) }); ok('Verificacion con otra huella: no coincide y deja hallazgo', x.datos?.coincide === false && !!x.datos?.id_hallazgo, JSON.stringify(x.datos).slice(0, 100));

// 4. Reemplazo (rechazada)
r = await subir(cap, `${MEDICION_ID}/${h2}.png`, png2, 'image/png'); ok('Rechazada: el autor sube la imagen de reemplazo', r.ok, r.status);
x = await rpc(cap, 'fn_registrar_evidencia', { p_id_medicion: MEDICION_ID, p_tipo_documento: 'Fotografia', p_hash: h2, p_mime: 'image/png', p_bytes: png2.length });
ok('El reemplazo deja vigente la nueva y reemplazada la anterior', x.status === 200 && x.datos?.reemplazo_a === e1, JSON.stringify(x.datos).slice(0, 100));
const lista = await (await fetch(`${SESIM_URL}/rest/v1/evidencia_medicion?id_medicion=eq.${MEDICION_ID}&select=id,vigente`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${cap}`, 'Accept-Profile': 'api' } })).json();
ok('Quedan 2 filas (nada se borro) y solo 1 vigente', Array.isArray(lista) && lista.length === 2 && lista.filter((f) => f.vigente).length === 1, JSON.stringify(lista));
r = await fetch(`${SESIM_URL}/storage/v1/object/evidencias/${MEDICION_ID}/${h1}.pdf`, { method: 'DELETE', headers: { apikey: ANON_KEY, Authorization: `Bearer ${cap}` } });
ok('Nadie borra un archivo desde la API (sin politica de DELETE)', r.status >= 400, r.status);

rl.close();
const fallan = resultados.filter((v) => !v).length;
console.log(`\nPasan ${resultados.length - fallan} de ${resultados.length}.`);
process.exit(fallan ? 1 : 0);
