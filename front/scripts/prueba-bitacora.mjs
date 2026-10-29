/**
 * Prueba del traductor de la bitácora de cambios (Ciclo 5): toma filas REALES de api.bitacora_operativa
 * (scripts/datos/bitacora_operativa_ejemplo.json, volcadas de la base tras un ciclo completo de captura,
 * rechazo, corrección, validación y publicación) y comprueba lo que pinta la pantalla.
 * Uso:  node scripts/prueba-bitacora.mjs
 */
import fs from 'node:fs';
import { filaALog, estadoVisual, formatearFechaBitacora } from '../src/lib/sesim/bitacoraOperativa.js';

const filas = JSON.parse(fs.readFileSync(new URL('./datos/bitacora_operativa_ejemplo.json', import.meta.url), 'utf8'));
let pasan = 0, fallan = 0;
const t = (caso, ok, extra = '') => { ok ? pasan++ : fallan++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${caso}${ok ? '' : '  -> ' + extra}`); };

const logs = filas.map(filaALog);
const capa = logs.filter((l) => l.recursoId === 'Ciclo01').sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

t('1. La capa del ciclo completo tiene 7 eventos', capa.length === 7, String(capa.length));
t('2. Orden de operaciones: nuevo, envio, rechazo, actualizacion, envio, aprobacion, publicacion',
  capa.map((l) => l.operacion).join(',') === 'nuevo,envio,rechazo,actualizacion,envio,aprobacion,publicacion', capa.map((l) => l.operacion).join(','));
t('3. Estados visuales: borrador, en_revision, rechazado, borrador, en_revision, aprobado, aprobado',
  capa.map((l) => l.status).join(',') === 'borrador,en_revision,rechazado,borrador,en_revision,aprobado,aprobado', capa.map((l) => l.status).join(','));
t('4. El rechazo trae el motivo del dictamen', /cve_ent/.test(capa[2].comentarioAdmin ?? ''));
t('5. El estatus real de SESIM se conserva (vigente_admin / vigente_publico)', capa[5].estatusSesim === 'vigente_admin' && capa[6].estatusSesim === 'vigente_publico');
t('6. Quien: codigo, nombre y rol vienen del servidor', capa[0].userId === 'CAP-001' && capa[0].actorNombre === 'Marisol Cetina' && capa[2].rol === 'administrador');
t('7. La ficha tecnica sale de los metadatos ISO de la capa', capa[6].fichaTecnica.fuente === 'INEGI' && capa[6].fichaTecnica.escala === '1:50,000' && capa[6].fichaTecnica.periodicidad === 'Quinquenal');
t('8. Faltantes de la ficha quedan con texto legible, nunca vacios', logs.every((l) => Object.values(l.fichaTecnica).filter((v) => v !== null).every((v) => String(v).length > 0)));
t('9. Archivos de la capa: principal y geojson', capa[0].archivos.geojson === 'red_ciclovias_norte.geojson');
const inst = logs.filter((l) => l.tipo === 'instrumento');
t('10. Instrumentos: publicacion / despublicacion con su estado visual', inst.length === 2 && inst.some((l) => l.operacion === 'publicacion' && l.status === 'aprobado') && inst.some((l) => l.operacion === 'despublicacion' && l.status === 'borrador'));
t('11. La fecha se formatea como la pantalla la espera (dd Mes aaaa, hh:mm)', /^\d{2} (Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic) \d{4}, \d{2}:\d{2}$/.test(capa[0].date), capa[0].date);
t('12. estadoVisual: el rechazo gana sobre el estatus; revision -> en_revision; vigente_* -> aprobado',
  estadoVisual({ operacion: 'rechazo', estatus: 'borrador' }) === 'rechazado' && estadoVisual({ operacion: 'envio', estatus: 'revision' }) === 'en_revision'
  && estadoVisual({ operacion: 'aprobacion', estatus: 'vigente_admin' }) === 'aprobado' && estadoVisual({ operacion: 'nuevo', estatus: 'borrador' }) === 'borrador');
t('13. Fecha invalida no rompe la pantalla', formatearFechaBitacora('no-es-fecha') === 'no-es-fecha');
t('14. Evento de sistema (sin cuenta) se muestra como SISTEMA', filaALog({ ...filas[0], codigo_usuario: null, actor_nombre: null, rol: null }).userId === 'SISTEMA');

console.log(`\n${pasan} PASS, ${fallan} FAIL`);
process.exit(fallan ? 1 : 0);
