/** Textos del tablero público en lenguaje llano (para personas no especializadas). */
/** Número con decimales fijos, en es-MX. */
export const f = (n, d = 0) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

export const NIVELES = [
  { n: 'Peatones', t: 'de la red urbana con banqueta accesible o completa' },
  { n: 'Personas ciclistas', t: 'de ciclovías' },
  { n: 'Transporte público', t: 'de localidades sin transporte o a más de 2 h' },
  { n: 'Transporte de bienes', t: 'de corredores de carga con aforo' },
  { n: 'Vehículos particulares', t: 'de la red con asfalto o concreto' },
];
/** Niveles de la jerarquía que resalta cada estrategia. */
export const NIVEL_POR_ESTRATEGIA = { 1: [3, 4], 2: [2], 3: [0, 1] };

export const SINOPSIS = [
  'Cómo se mueven las mercancías y qué tan conectado está el territorio.',
  'Qué tan lejos queda el servicio de transporte público de las localidades.',
  'Cuánto se puede caminar y pedalear con infraestructura.',
  'Dónde se concentran los siniestros graves en las vías del estado.',
  'Brechas de acceso y seguridad para mujeres, niñez, discapacidad y personas mayores.',
];

export const META_TIPOS = [
  { k: 'num', etiqueta: 'Con cifra' },
  { k: 'dir', etiqueta: 'Con dirección' },
  { k: 'lb', etiqueta: 'Línea base' },
  { k: 'pd', etiqueta: 'Por definir' },
];
export const MIR = ['Fin', 'Propósito', 'Componentes', 'Actividades'];

const LOC = (v) => `${f(v)} localidades: pueblos, rancherías y colonias.`;
const RED = (v) => `${f(v)} km de carreteras, caminos y calles principales.`;
const M = {
  hab: ['hab', '¿Cuántas personas viven aquí?', '', 0, 0, 'cuenta', (v, N) => `${f(v)} personas viven en ${N === 'el estado' ? 'todo el estado' : N}.`],
  loc: ['loc', '¿Cuántas localidades hay?', '', 0, 0, 'cuenta', LOC],
  red: ['red', '¿Cuánto camino hay?', 'km', 0, 0, 'cuenta', RED],
};

/**
 * [clave, pregunta, unidad, decimales, mejor (1 alto, -1 bajo, 0 neutro), tipo (cuenta | pct | prog),
 *  frase(valor, nombre, {loc, fedKm})]
 */
export const METRICAS = {
  0: [M.hab, M.loc, M.red],
  1: [M.red,
    ['asf', '¿Qué tan pavimentados están?', '%', 0, 1, 'pct', (v) => `De cada 100 km de camino, ${f(v)} tienen asfalto o concreto. El resto es grava, tierra o sin dato.`],
    ['carga', '¿Por dónde pasa la carga pesada?', 'km', 0, 0, 'cuenta', (v) => `${f(v)} km de caminos donde se mide el paso de camiones y carga.`]],
  2: [['sintp', '¿Qué localidades se quedan sin transporte?', '%', 0, -1, 'pct', (v) => `De cada 100 localidades, ${f(v)} no tienen transporte público o les queda a más de 2 horas.`],
    ['tp1h', '¿A cuáles les llega el servicio rápido?', '%', 0, 1, 'pct', (v) => `De cada 100 localidades, ${f(v)} llegan a un servicio de transporte en menos de 1 hora.`],
    M.loc],
  3: [['cic', '¿Hay ciclovías?', 'km', 1, 1, 'cuenta', (v, N) => `${N === 'el estado' ? 'El estado tiene' : `${N} tiene`} ${f(v, 1)} km de ciclovías.`],
    ['acc', '¿Se puede caminar con banqueta?', '%', 0, 1, 'pct', (v) => `De cada 100 calles urbanas, ${f(v)} tienen banqueta accesible o completa.`],
    ['sinb', '¿Qué calles no tienen banqueta?', '%', 0, -1, 'pct', (v) => `De cada 100 calles urbanas, ${f(v)} no tienen banqueta.`]],
  4: [['fedp', '¿Qué tan peligrosa es la carretera?', '%', 1, -1, 'pct', (v, N, c) => `De cada 100 km de camino, ${f(v, 1)} son tramos federales donde han muerto personas (${f(c.fedKm)} km en total, 2022).`],
    ['sv8', '¿Dónde se propone hacer más segura la carretera?', 'km', 0, 0, 'cuenta', (v) => `${f(v)} km de carretera con programa de seguridad vial propuesto.`],
    ['sv7', '¿Qué puntos peligrosos se atenderían?', '', 0, 0, 'cuenta', (v) => `${f(v)} puntos con una acción propuesta: cruces seguros, señalización o ajustes de diseño.`]],
  5: [['g1', '¿Qué localidades necesitan mejor acceso?', 'localidades', 0, 0, 'cuenta', (v, N, c) => `${f(v)} de ${f(c.loc)} localidades (${f(c.loc ? (v / c.loc) * 100 : 0, c.loc && (v / c.loc) * 100 < 10 ? 1 : 0)} %) están priorizadas para mejorar su acceso a servicios y transporte.`],
    ['g2', '¿Qué estaciones del Tren Maya se adaptan?', '', 0, 0, 'cuenta', (v) => `${v === 1 ? '1 estación por adecuar' : `${f(v)} estaciones por adecuar`} para personas con discapacidad y otros grupos vulnerables.`],
    ['g4', '¿Qué programas de inclusión llegan?', 'de 4', 0, 1, 'prog', (v) => `${f(v)} de 4 programas llegan aquí: transporte para grupos vulnerables, sensibilización de género y estudio de seguridad.`]],
};
