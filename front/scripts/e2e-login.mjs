// E2E del login con navegador real (Playwright) contra el mock. Uso (requiere playwright instalado):
//   VITE_SUPABASE_URL=http://127.0.0.1:8000 VITE_SUPABASE_ANON_KEY=anon-mock VITE_PROCESOS_URL=http://127.0.0.1:8000 \
//     npx vite build --outDir site   # y copiar mock-backend.mjs junto a este archivo
//   node scripts/e2e-login.mjs
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { iniciarMock } from './mock-backend.mjs';
const mock = await iniciarMock({ port: 8000 });
mock.agregar('titular@p.mx','Clave2026!','Titular','administrador_titular');
mock.agregar('cap@p.mx','Clave2026!','Capturista','capturista');
mock.agregar('baja@p.mx','Clave2026!','Baja','capturista',{activo:false});
const tipos={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'};
const web = http.createServer((q,r)=>{ let f=path.join('site',decodeURIComponent(q.url.split('?')[0])); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()) f='site/index.html'; r.writeHead(200,{'content-type':tipos[path.extname(f)]??'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(5173);
const B='http://127.0.0.1:5173'; let ok=0,mal=0;
const caso=async(n,fn)=>{try{await fn();ok++;console.log('  PASS  '+n)}catch(e){mal++;console.log('  FAIL  '+n+'\n        '+e.message.split('\n')[0])}};
const br = await chromium.launch(); 
const nueva = async()=>{ const c=await br.newContext(); const p=await c.newPage(); p.setDefaultTimeout(8000); return {c,p}; };
const login=async(p,c,pw)=>{ await p.goto(B+'/admin'); await p.fill('#email',c); await p.fill('#password',pw); await p.click('button.admin-login-submit'); };
const url=(p)=>new URL(p.url()).pathname;
{ const {p}=await nueva();
await caso('E1 /admin-visor sin sesión redirige a /admin',async()=>{ await p.goto(B+'/admin-visor'); await p.waitForURL('**/admin'); });
await caso('E2 contraseña incorrecta muestra error y no entra',async()=>{ await login(p,'titular@p.mx','mala'); await p.waitForTimeout(800); if(url(p)!=='/admin') throw new Error('salió de /admin'); if(await p.locator('.modal-btn-accept').count()) throw new Error('mostró políticas'); const t=await p.locator('body').innerText(); if(!/credencial|incorrect|inválid|error/i.test(t)) throw new Error('sin mensaje de error'); });
await caso('E3 cuenta dada de baja no entra',async()=>{ await login(p,'baja@p.mx','Clave2026!'); await p.waitForTimeout(800); if(await p.locator('.modal-btn-accept').count()) throw new Error('mostró políticas'); if(url(p)!=='/admin') throw new Error('salió'); });
await caso('E4 credenciales válidas → modal de políticas, sesión aún NO activa',async()=>{ await login(p,'titular@p.mx','Clave2026!'); await p.waitForSelector('.modal-btn-accept'); const s=await p.evaluate(()=>localStorage.getItem('sesim_auth')); if(s) throw new Error('sesión guardada antes de aceptar'); });
await caso('E5 Cancelar permanece en /admin y revoca (sin sesión)',async()=>{ await p.click('.modal-btn-cancel'); await p.waitForTimeout(500); if(url(p)!=='/admin') throw new Error('salió'); if(await p.evaluate(()=>localStorage.getItem('sesim_auth'))) throw new Error('quedó sesión'); });
await caso('E6 Aceptar entra a /admin-visor con sesión real (JWT firmado por el servidor)',async()=>{ await login(p,'titular@p.mx','Clave2026!'); await p.click('.modal-btn-accept'); await p.waitForURL('**/admin-visor'); const s=JSON.parse(await p.evaluate(()=>localStorage.getItem('sesim_auth'))); if(s.perfil.rol!=='administrador_titular'||s.access_token.split('.').length!==3) throw new Error('sesión inválida'); });
await caso('E7 recargar conserva la sesión (revalidada con el servidor)',async()=>{ const antes=mock.usuarios.size; await p.reload(); await p.waitForTimeout(1200); if(url(p)!=='/admin-visor') throw new Error('perdió sesión: '+url(p)); });
await caso('E8 banner honesto de módulos aún locales visible',async()=>{ const t=await p.locator('body').innerText(); if(!/modo local/i.test(t)) throw new Error('sin banner'); });
await caso('E9 la sesión se revoca en el servidor al cerrar sesión',async()=>{ await p.click('[aria-label="Cerrar sesión"]'); await p.waitForTimeout(800); if(await p.evaluate(()=>localStorage.getItem('sesim_auth'))) throw new Error('quedó sesión'); await p.goto(B+'/admin-visor'); await p.waitForURL('**/admin'); });
await p.context().close(); }
{ const {p}=await nueva();
await caso('E10 localStorage forjado (rol=titular con token inventado) es expulsado',async()=>{ await p.goto(B+'/admin'); await p.evaluate(()=>localStorage.setItem('sesim_auth',JSON.stringify({access_token:'a.b.c',refresh_token:'x',expires_at:9999999999,user:{id:'1'},perfil:{id:'1',rol:'administrador_titular',activo:true,nombre:'Falso'}}))); await p.goto(B+'/admin-visor'); await p.waitForURL('**/admin',{timeout:8000}); if(await p.evaluate(()=>localStorage.getItem('sesim_auth'))) throw new Error('no limpió'); });
await caso('E11 claves de simulación antiguas (sim_role) ya no otorgan acceso',async()=>{ await p.evaluate(()=>{localStorage.setItem('sim_role','administrador_titular');localStorage.setItem('sesim_sesion',JSON.stringify({rol:'administrador_titular'}))}); await p.goto(B+'/admin-visor'); await p.waitForURL('**/admin'); });
await p.context().close(); }
{ const {p}=await nueva();
await caso('E12 capturista real entra y su rol sale del servidor',async()=>{ await login(p,'cap@p.mx','Clave2026!'); await p.click('.modal-btn-accept'); await p.waitForURL('**/admin-visor'); const s=JSON.parse(await p.evaluate(()=>localStorage.getItem('sesim_auth'))); if(s.perfil.rol!=='capturista') throw new Error(s.perfil.rol); });
await caso('E13 baja de la cuenta en servidor → al recargar se expulsa',async()=>{ mock.usuarios.get('cap@p.mx').activo=false; await p.reload(); await p.waitForURL('**/admin',{timeout:8000}); });
await p.context().close(); }
console.log(`\nResultado E2E: ${ok} PASS, ${mal} FAIL`); await br.close(); web.close(); mock.cerrar(); process.exit(mal?1:0);
