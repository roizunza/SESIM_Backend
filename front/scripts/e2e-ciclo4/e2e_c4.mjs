import { createRequire } from 'node:module'; const { chromium } = createRequire('/usr/local/lib/node_modules/')('playwright');
const base = 'http://localhost:5298';
const b = await chromium.launch();
const resultados = [];
const ok = (n, c, d = '') => { resultados.push([c ? 'PASA' : 'FALLA', n, d]); };

async function pagina(email, ancho = 1440, alto = 900) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(base + '/');
  await p.evaluate(async (email) => {
    const t = await (await fetch('/supabase/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'x' }) })).json();
    const pr = await (await fetch('/supabase/rest/v1/mi_perfil?select=*', { headers: { Authorization: 'Bearer ' + t.access_token, 'Accept-Profile': 'api' } })).json();
    localStorage.setItem('sesim_auth', JSON.stringify({ access_token: t.access_token, refresh_token: 'r', expires_at: t.expires_at, usuario: { id: t.user.id, correo: email }, inicio: new Date().toISOString(), perfil: pr[0] }));
  }, email);
  return p;
}
const rpc = (p, fn, args) => p.evaluate(async ([fn, args]) => {
  const t = JSON.parse(localStorage.getItem('sesim_auth')).access_token;
  const r = await fetch('/supabase/rest/v1/rpc/' + fn, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'content-type': 'application/json', 'Content-Profile': 'api' }, body: JSON.stringify(args) });
  return { status: r.status, datos: await r.json() };
}, [fn, args]);

// ---------- 1. Titular emite invitacion ----------
const tit = await pagina('tit@e2e.mx');
await tit.goto(base + '/admin-visor'); await tit.waitForTimeout(1800);
await tit.getByText('Usuarios e invitaciones').first().click(); await tit.waitForTimeout(1200);
await tit.fill('input[type=email]', 'nueva.persona@e2e.mx');
await tit.selectOption('.filtros-fila select', 'auditor');
await tit.getByText('Generar enlace').click(); await tit.waitForTimeout(1500);
const enlace = (await tit.locator('.token-mostrado span').first().textContent().catch(() => '')) ?? '';
ok('Titular genera un enlace de invitacion', /\/invitacion\?token=[0-9a-f]{48}/.test(enlace), enlace.slice(0, 80));
await tit.screenshot({ path: 'shots/c4_invitacion_emitida.png' });
ok('La tabla de invitaciones lista la nueva como vigente', (await tit.locator('table').first().textContent()).includes('nueva.persona@e2e.mx'));

// ---------- 2. Persona invitada canjea ----------
const inv = await b.newPage({ viewport: { width: 390, height: 844 } });
await inv.goto(enlace.trim()); await inv.waitForTimeout(1500);
ok('La pagina publica reconoce la invitacion (correo y perfil)', (await inv.textContent('body')).includes('nueva.persona@e2e.mx') && (await inv.textContent('body')).includes('Auditor'));
await inv.fill('input[autocomplete=name]', 'Persona Nueva E2E');
const pw = await inv.$$('input[type=password]');
await pw[0].fill('clave-segura-123'); await pw[1].fill('clave-segura-123');
await inv.screenshot({ path: 'shots/c4_canje_movil.png' });
await inv.getByText('Crear mi cuenta').click(); await inv.waitForTimeout(1800);
ok('El canje crea la cuenta', (await inv.textContent('body')).includes('quedó creada'));
await inv.goto(enlace.trim()); await inv.waitForTimeout(1200);
ok('El mismo enlace ya no sirve', (await inv.textContent('body')).includes('no es válido'));

// ---------- 3. Panel del Titular refleja canje y permite baja/reactivar ----------
await tit.getByText('Usuarios e invitaciones').first().click().catch(() => {});
await tit.reload(); await tit.waitForTimeout(1500);
await tit.getByText('Usuarios e invitaciones').first().click(); await tit.waitForTimeout(1500);
const cuerpoPanel = await tit.locator('.panel-completo').textContent();
ok('El panel muestra la invitacion como usada y a la persona en Usuarios', cuerpoPanel.includes('usada') && cuerpoPanel.includes('Persona Nueva E2E'));
const filaNueva = tit.locator('tr', { hasText: 'Persona Nueva E2E' });
await filaNueva.getByText('Dar de baja').click(); await tit.waitForTimeout(1500);
ok('Dar de baja la deja inactiva', (await tit.locator('tr', { hasText: 'Persona Nueva E2E' }).textContent()).includes('Baja'));
await tit.locator('tr', { hasText: 'Persona Nueva E2E' }).getByText('Reactivar').click(); await tit.waitForTimeout(1500);
ok('Reactivar la devuelve a activa', (await tit.locator('tr', { hasText: 'Persona Nueva E2E' }).textContent()).includes('Activo'));
const filaYo = await tit.locator('tr', { hasText: 'Titular E2E' }).textContent();
ok('El Titular no ve boton de baja sobre si mismo', !filaYo.includes('Dar de baja'));
await tit.screenshot({ path: 'shots/c4_panel_titular.png' });

// ---------- 4. Capa: capturista envia, administradores dictaminan desde la bitacora ----------
const cap = await pagina('cap@e2e.mx');
const ficha = { custodio: 'SEDUMOP', fuente_origen: 'Prueba E2E', linaje: 'Levantamiento E2E', sistema_coordenadas: 'EPSG:4326', restriccion_uso: 'pública' };
let r = await rpc(cap, 'fn_guardar_capa', { p_datos: { id: 'E2E-01', titulo: 'Capa E2E', tipo_geometria: 'Punto', srid_origen: 4326, metadatos_extra: ficha } });
ok('Capturista registra una capa en borrador (rpc)', r.status === 200 && r.datos.estatus === 'borrador', JSON.stringify(r.datos).slice(0, 80));
r = await rpc(cap, 'fn_enviar_capa_revision', { p_id: 'E2E-01' });
ok('Capturista la envia a revision', r.status === 200 && r.datos.estatus === 'revision');
r = await rpc(cap, 'fn_dictaminar_capa', { p_id: 'E2E-01', p_decision: 'validar' });
ok('El servidor niega al Capturista el dictamen con mensaje legible (403)', r.status === 403 && /permiso|rol|dictaminar/i.test(r.datos.message), r.datos.message);

const adm = await pagina('adm@e2e.mx');
await adm.goto(base + '/bitacora'); await adm.waitForTimeout(1500);
await adm.getByText('Cambios (servidor)').click(); await adm.waitForTimeout(1800);
await adm.screenshot({ path: 'shots/c4_bitacora_adm.png' });
const botones = adm.getByText('Determinar Dictamen');
ok('El Administrador ve el boton Determinar Dictamen sobre la capa en revision', (await botones.count()) >= 1);
await botones.first().click(); await adm.waitForTimeout(600);
await adm.screenshot({ path: 'shots/c4_dictamen_modal.png' });
await adm.getByRole('button', { name: 'Rechazar' }).click(); await adm.waitForTimeout(500);
ok('Rechazar sin comentario lo pide', (await adm.textContent('.dictamen-caja')).includes('escriba el motivo'));
await adm.fill('.dictamen-caja textarea', 'Falta precisar el linaje');
await adm.getByRole('button', { name: 'Rechazar' }).click(); await adm.waitForTimeout(1800);
ok('Rechazo con motivo: el modal se cierra y la capa vuelve a borrador', (await adm.locator('.dictamen-caja').count()) === 0);
r = await rpc(adm, 'fn_enviar_capa_revision', { p_id: 'E2E-01' });
ok('El Administrador puede reenviar la capa corregida', r.status === 200 && r.datos.estatus === 'revision', r.datos.message ?? '');
// Cuatro ojos: adm envio, adm no valida; adm2 si
await adm.reload(); await adm.waitForTimeout(1500); await adm.getByText('Cambios (servidor)').click(); await adm.waitForTimeout(1500);
await adm.getByText('Determinar Dictamen').first().click(); await adm.waitForTimeout(500);
await adm.getByRole('button', { name: 'Validar' }).click(); await adm.waitForTimeout(1500);
const msg = await adm.locator('.dictamen-error').textContent().catch(() => '');
ok('Cuatro ojos en pantalla: quien envio no valida (mensaje del servidor)', /Cuatro ojos/.test(msg), msg);
const adm2 = await pagina('adm2@e2e.mx');
await adm2.goto(base + '/bitacora'); await adm2.waitForTimeout(1500); await adm2.getByText('Cambios (servidor)').click(); await adm2.waitForTimeout(1800);
await adm2.getByText('Determinar Dictamen').first().click(); await adm2.waitForTimeout(500);
await adm2.getByRole('button', { name: 'Validar' }).click(); await adm2.waitForTimeout(1800);
ok('Otro administrador valida y el modal se cierra', (await adm2.locator('.dictamen-caja').count()) === 0);
await adm2.getByText('Determinar Dictamen').first().click(); await adm2.waitForTimeout(500);
ok('Ahora el modal ofrece Publicar', (await adm2.getByRole('button', { name: 'Publicar' }).count()) === 1);
await adm2.getByRole('button', { name: 'Publicar' }).click(); await adm2.waitForTimeout(1800);
r = await rpc(adm2, 'fn_baja_capa', { p_id: 'E2E-01' });
ok('La capa quedo publicada (no admite baja: 400 con mensaje)', r.status === 400 && /publicada/.test(r.datos.message), r.datos.message ?? '');
await adm2.screenshot({ path: 'shots/c4_bitacora_publicada.png' });

// movil
const m = await pagina('adm2@e2e.mx', 390, 844);
await m.goto(base + '/bitacora'); await m.waitForTimeout(1500); await m.getByText('Cambios (servidor)').click(); await m.waitForTimeout(1500);
await m.screenshot({ path: 'shots/c4_bitacora_movil.png' });


// ---------- 5. ER-4: rechazo con plazo, lista del capturista, retomar / quitar ----------
const cap2 = await pagina('cap@e2e.mx');
for (const id of ['E2E-R1', 'E2E-R2']) {
  await rpc(cap2, 'fn_guardar_capa', { p_datos: { id, titulo: 'Capa ' + id, tipo_geometria: 'Punto', srid_origen: 4326, metadatos_extra: ficha } });
  await rpc(cap2, 'fn_enviar_capa_revision', { p_id: id });
  await rpc(adm2, 'fn_dictaminar_capa', { p_id: id, p_decision: 'rechazar', p_comentario: 'Falta documentar ' + id });
}
await cap2.goto(base + '/admin-visor'); await cap2.waitForTimeout(1800);
const chip = await cap2.getByText('Mis rechazos por atender').first().textContent();
ok('El Capturista ve en su barra la insignia con 2 rechazos', /2/.test(chip), chip);
await cap2.getByText('Mis rechazos por atender').first().click(); await cap2.waitForTimeout(1500);
let panelR = await cap2.locator('.panel-completo').textContent();
ok('La lista muestra motivo y plazo de 10 dias habiles', panelR.includes('Falta documentar E2E-R1') && /10 días hábiles/.test(panelR));
await cap2.screenshot({ path: 'shots/c4_rechazos_capturista.png' });
await cap2.locator('tr', { hasText: 'E2E-R1' }).getByText('Retomar').click(); await cap2.waitForTimeout(1500);
ok('Retomar deja el rechazo como Retomada y ofrece reenviar', (await cap2.locator('tr', { hasText: 'E2E-R1' }).textContent()).includes('Retomada') && (await cap2.locator('tr', { hasText: 'E2E-R1' }).getByText('Reenviar a revisión').count()) === 1);
await cap2.locator('tr', { hasText: 'E2E-R2' }).getByText('Quitar de mi lista').click(); await cap2.waitForTimeout(1500);
ok('Quitar de mi lista saca el rechazo de la lista', (await cap2.locator('tr', { hasText: 'E2E-R2' }).count()) === 0);
await cap2.locator('tr', { hasText: 'E2E-R1' }).getByText('Reenviar a revisión').click(); await cap2.waitForTimeout(1500);
ok('Reenviar cierra el rechazo y la capa vuelve a revision', (await cap2.locator('tr', { hasText: 'E2E-R1' }).count()) === 0);
r = await rpc(cap2, 'fn_enviar_capa_revision', { p_id: 'E2E-R2' });
ok('Una capa quitada de la lista no se reenvia (409/400 con mensaje)', r.status >= 400 && /descartado|reabra/i.test(r.datos.message), r.datos.message ?? '');

const adm3 = await pagina('adm@e2e.mx');
await adm3.goto(base + '/admin-visor'); await adm3.waitForTimeout(1800);
await adm3.getByText('Rechazos y plazos').first().click(); await adm3.waitForTimeout(1200);
await adm3.getByText('Ver también los cerrados').click(); await adm3.waitForTimeout(1200);
ok('El Administrador ve el rechazo quitado y puede reabrirlo', (await adm3.locator('tr', { hasText: 'E2E-R2' }).getByText('Reabrir').count()) === 1);
await adm3.locator('tr', { hasText: 'E2E-R2' }).getByText('Reabrir').click(); await adm3.waitForTimeout(1500);
ok('Reabrir lo devuelve a Pendiente', (await adm3.locator('tr', { hasText: 'E2E-R2' }).textContent()).includes('Pendiente'));
ok('El Administrador no ve el calendario de inhabiles (solo el Titular)', (await adm3.locator('.panel-completo input[type=date]').count()) === 0);
await tit.goto(base + '/admin-visor'); await tit.waitForTimeout(1800);
await tit.getByText('Rechazos y plazos').first().click(); await tit.waitForTimeout(1200);
await tit.fill('.panel-completo input[type=date]', '2026-12-25');
await tit.fill('.panel-completo input[placeholder^="Ej."]', 'Navidad');
await tit.getByText('Agregar', { exact: true }).click(); await tit.waitForTimeout(1500);
ok('El Titular agrega un dia inhabil al calendario', (await tit.locator('.panel-completo').textContent()).includes('Navidad'));
await tit.screenshot({ path: 'shots/c4_rechazos_titular.png' });
const mcap = await pagina('cap@e2e.mx', 390, 844);
await mcap.goto(base + '/admin-visor'); await mcap.waitForTimeout(1500);
await mcap.getByText('Mis mediciones').first().click().catch(() => {}); await mcap.waitForTimeout(600);
await mcap.getByRole('button', { name: /Mis rechazos/ }).dispatchEvent('click'); await mcap.waitForTimeout(2500);
await mcap.screenshot({ path: 'shots/c4_rechazos_movil.png' });

for (const p of [tit, inv, cap, adm, adm2, m, cap2, adm3, mcap]) if (p.errs?.length) resultados.push(['FALLA', 'Errores de JavaScript', p.errs.slice(0, 2).join(' | ')]);
for (const [e, n, d] of resultados) console.log(e, '·', n, d ? '· ' + d : '');
console.log('Pasan:', resultados.filter((x) => x[0] === 'PASA').length, 'Fallan:', resultados.filter((x) => x[0] === 'FALLA').length);
await b.close();
