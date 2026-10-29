/**
 * Prueba de la lectura de indicadores desde Supabase (api.indicador), sin navegador.
 *  - Sin variables: usa el mock (scripts/mock-backend.mjs).
 *  - Contra el Supabase REAL:
 *      SESIM_URL=http://localhost:8000 SESIM_ANON_KEY=<ANON_KEY> node scripts/prueba-catalogo.mjs
 *    Compara lo que ve el público (anon) con lo que ve el Titular (sesimadminvip@gmail.com).
 */
import { crearCliente } from '../src/lib/sesim/supabase.js';
import { _usarCliente, tabla, tablas, fnTrazabilidadNormativa } from '../src/lib/sesim/api.js';
import { iniciarMock } from './mock-backend.mjs';

const REAL = !!process.env.SESIM_URL;
let pasan = 0; let fallan = 0;
const ok = (n, c, d = '') => { if (c) { pasan++; console.log(`PASS  ${n}`); } else { fallan++; console.log(`FAIL  ${n} ${d}`); } };

let mock = null; let URL_; let KEY; let titular;
if (REAL) {
  URL_ = process.env.SESIM_URL; KEY = process.env.SESIM_ANON_KEY; titular = ['sesimadminvip@gmail.com', 'SesimDev2026!'];
  if (!KEY) { console.error('Falta SESIM_ANON_KEY'); process.exit(2); }
} else {
  const indicador = Array.from({ length: 113 }, (_, i) => ({
    id: `I${String(i + 1).padStart(3, '0')}`, id_eje: (i % 5) + 1, id_sector: 'SD-01', id_fuente: 1, clave: `C${i}`, nombre: `Indicador ${i + 1}`,
    variable: 'v', meta: null, tendencia: i < 2 ? 'Ascendente' : null, valor_meta: null, linea_base: null, anio_linea_base: null,
    nivel_mir: 'Fin', estatus_aprobado: i < 2, activo: true,
  }));
  const capa_indicador = Array.from({ length: 2500 }, (_, i) => ({ id_capa: `K${i}`, id_indicador: 'I001' }));
  mock = await iniciarMock({
    catalogo: {
      indicador, capa_indicador,
      eje_tematico: [1, 2, 3, 4, 5].map((n) => ({ id: n, numero_eje: n, nombre: `Eje ${n}` })),
      sector: [{ id: 'SD-01', nombre: 'Sector' }], fuente_informacion: [{ id: 1, nombre: 'Fuente' }],
      instrumento_origen: [], matriz_instrumento: [], indicador_instrumento: [],
      indicador_eje: [{ id_indicador: 'I001', id_eje: 1, principal: true }, { id_indicador: 'I001', id_eje: 3, principal: false }],
      periodo: [{ id: 1, anio: 2026, etiqueta: '2026', fecha_inicio: '2026-01-01' }],
      medicion_publica: [{ id: 'm1', id_indicador: 'I001', id_unidad: '04001', id_periodo: 1, valor: 5, estado: 'vigente_publico' }],
    },
  });
  mock.agregar('titular@p.mx', 'Clave2026!', 'Titular', 'administrador_titular');
  URL_ = mock.url; KEY = mock.anonKey; titular = ['titular@p.mx', 'Clave2026!'];
}

const memoria = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) }; };
const C = crearCliente({ url: URL_, anonKey: KEY, almacen: memoria() });
_usarCliente(C);

// 1. Público (sin sesión)
const pub = await tabla('indicador');
ok('01 sin sesión se leen indicadores de la API', Array.isArray(pub) && pub.length > 0 || REAL, `(${pub?.length})`);
ok('02 el público ve el catálogo completo de indicadores activos (la aprobación es un dato, no un filtro)', pub.every((i) => i.activo) && pub.some((i) => !i.estatus_aprobado), `(${pub.length})`);
ok('03 el público ve los 113', pub.length === 113, `(${pub.length})`);
ok('04 las filas traen las columnas del modelo', pub.every((i) => 'clave' in i && 'nivel_mir' in i && 'id_eje' in i));

// 2. Paginación (>1000 filas no se trunca)
if (!REAL) {
  await C.iniciarSesion(...titular);
  const ci = await tabla('capa_indicador');
  ok('05 paginación: 2,500 filas completas (no se trunca a 1,000)', ci.length === 2500, `(${ci.length})`);
  await C.cerrarSesion();
}

// 3. Con sesión ve todo; al cerrar vuelve a lo público (caché invalidada)
await C.iniciarSesion(...titular);
const interno = await tabla('indicador');
ok('06 con sesión de Titular ve al menos lo que ve el público', interno.length >= pub.length, `(${interno.length} vs ${pub.length})`);
if (!REAL) ok('07 con sesión ve los 113', interno.length === 113);
await C.cerrarSesion();
const otraVez = await tabla('indicador');
ok('08 al cerrar sesión vuelve a lo público (sin caché vieja)', otraVez.length === pub.length, `(${otraVez.length})`);

// 4. Dimensiones y trazabilidad por la API
const t = await tablas(['eje_tematico', 'sector', 'fuente_informacion']);
ok('09 ejes, sectores y fuentes se leen de la API', t.eje_tematico.length > 0 && t.sector.length > 0 && t.fuente_informacion.length > 0);
const traz = await fnTrazabilidadNormativa(pub[0].id);
ok('10 fnTrazabilidadNormativa resuelve eje, sector y fuente', !!traz?.eje && !!traz?.sector && !!traz?.fuente);

// 4b. Tablas del Monitoreo: ejes múltiples, periodos y SOLO mediciones publicadas
const m = await tablas(['indicador_eje', 'periodo', 'medicion_publica']);
ok('12 indicador_eje, periodo y medicion_publica se leen de la API', Array.isArray(m.indicador_eje) && Array.isArray(m.periodo) && Array.isArray(m.medicion_publica));
ok('13 el Monitoreo solo recibe mediciones vigente_publico', m.medicion_publica.every((x) => x.estado === 'vigente_publico'));
ok('14 un indicador puede atender varios ejes (indicador_eje)', REAL ? m.indicador_eje.length >= 113 : m.indicador_eje.filter((x) => x.id_indicador === 'I001').length === 2, `(${m.indicador_eje.length})`);

// 5. Sin backend configurado no inventa datos
const sinBackend = crearCliente({ url: '', anonKey: '', almacen: memoria() });
_usarCliente(sinBackend);
let err = null; try { await tabla('indicador'); } catch (e) { err = e; }
ok('11 sin backend configurado falla con mensaje claro (no usa datos estáticos)', err?.codigo === 'sin_config', String(err?.message));

console.log(`\nResultado: ${pasan} PASS, ${fallan} FAIL${REAL ? ' (Supabase REAL)' : ' (mock)'}`);
mock?.cerrar();
process.exit(fallan ? 1 : 0);
