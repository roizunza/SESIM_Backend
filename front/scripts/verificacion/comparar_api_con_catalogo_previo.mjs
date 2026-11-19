// Compara lo que hoy entrega la API (api.capa_clases y api.v_capa_por_municipio, como anon = capas públicas) con los
// archivos estáticos que se retiraron en el Ciclo 11 (catalogo/capa.json y catalogo/v_capa_por_municipio.json), que se leen
// solos del historial de git (commit anterior al borrado). Confirma, con los datos REALES de la base, que el orden de
// `clases` y la cobertura por municipio coinciden.
//
// Uso, con el backend alcanzable (túnel al puerto 8000), desde la carpeta front:
//   node scripts/verificacion/comparar_api_con_catalogo_previo.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const git = (args) => execSync(`git ${args}`, { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const raiz = git('rev-parse --show-toplevel').trim();
const borrado = git(`-C "${raiz}" log --diff-filter=D -1 --format=%H -- front/public/sesim/catalogo/capa.json`).trim();
if (!borrado) { console.error('No encuentro el commit que borró catalogo/capa.json: ¿ya hizo commit del borrado?'); process.exit(2); }
const delPrevio = (ruta) => JSON.parse(git(`-C "${raiz}" show ${borrado}~1:${ruta}`));
const leerEnv = (nombre) => {
  if (process.env[nombre]) return process.env[nombre];
  const t = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
  return (new RegExp(`^${nombre}=(.*)$`, 'm').exec(t) ?? [])[1]?.trim();
};
const gw = leerEnv('SESIM_GATEWAY') || 'http://localhost:8000';
const anon = leerEnv('VITE_SUPABASE_ANON_KEY');
if (!anon) { console.error('Falta VITE_SUPABASE_ANON_KEY (.env.local)'); process.exit(2); }

async function leer(ruta) {
  const filas = [];
  for (let d = 0; ; d += 1000) {
    const r = await fetch(`${gw}/rest/v1/${ruta}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Accept-Profile': 'api', Range: `${d}-${d + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status} ${await r.text()}`);
    const p = await r.json(); filas.push(...p); if (p.length < 1000) return filas;
  }
}
const previo = delPrevio('front/public/sesim/catalogo/capa.json');
const vcmPrevio = delPrevio('front/public/sesim/catalogo/v_capa_por_municipio.json');
const [capas, clases, vcm] = await Promise.all([leer('capa?select=id&order=id'), leer('capa_clases?select=*&order=id_capa'), leer('v_capa_por_municipio?select=*&order=id_capa,id_unidad')]);
const visibles = new Set(capas.map((c) => c.id));
const claseApi = new Map(clases.map((c) => [c.id_capa, c.clases]));
let mal = 0; const soloOrden = [];
for (const c of previo.filter((x) => visibles.has(x.id))) {
  const a = (claseApi.get(c.id) ?? []).join('~'); const b = (c.clases ?? []).slice(0, 13).join('~');
  if (a === b) continue;
  const mismas = [...(claseApi.get(c.id) ?? [])].sort().join('~') === [...(c.clases ?? []).slice(0, 13)].sort().join('~');
  if (mismas) { soloOrden.push(c.id); continue; }
  mal++; console.log(`CLASES distintas (otro conjunto) en ${c.id}\n   API:   ${a}\n   previo: ${b}`);
}
if (soloOrden.length) console.log(`Mismas clases pero en otro orden (no cuenta como diferencia): ${soloOrden.join(', ')}`);
const llave = (r) => `${r.id_capa}|${r.id_unidad ?? ''}|${r.n_elementos}`;
const a = new Set(vcm.map(llave)); const b = new Set(vcmPrevio.filter((r) => visibles.has(r.id_capa)).map(llave));
const soloApi = [...a].filter((x) => !b.has(x)), soloPrevio = [...b].filter((x) => !a.has(x));
console.log(`Capas visibles como anon: ${visibles.size}. Clases distintas: ${mal}. Cobertura por municipio: ${soloApi.length} filas solo en la API, ${soloPrevio.length} solo en el archivo previo.`);
soloApi.slice(0, 10).forEach((x) => console.log('  solo API    ', x)); soloPrevio.slice(0, 10).forEach((x) => console.log('  solo previo ', x));
process.exit(mal || soloApi.length || soloPrevio.length ? 1 : 0);
