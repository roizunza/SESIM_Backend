/**
 * Evaluación automática de la calidad de una capa publicada (módulo puro).
 *
 * Organizada con los elementos de calidad de ISO 19157-1. Solo se informan medidas que pueden
 * calcularse sobre el archivo publicado y el catálogo; lo que requiere un levantamiento de
 * referencia (exactitud posicional absoluta, exactitud temática) se declara «no evaluado».
 */
const TIPOS = { point: ['Point', 'MultiPoint'], line: ['LineString', 'MultiLineString'], polygon: ['Polygon', 'MultiPolygon'] };
const pct = (a, b) => (b ? (100 * a) / b : 0);

function medida(elemento, nombre, valor, total, { umbral = 100, descripcion } = {}) {
  const porcentaje = pct(valor, total);
  return { elemento, nombre, valor, total, porcentaje, conforme: porcentaje >= umbral, descripcion };
}

/** @returns {Array<{ elemento, nombre, valor?, total?, porcentaje?, conforme: boolean|null, descripcion }>} */
export function evaluarCalidad(capa, features, proceso) {
  const total = features.length;
  const esperados = Number(capa.n_elementos) || 0;
  const tipos = TIPOS[capa.geom] ?? [];
  const conGeometria = features.filter((f) => f.geometry && f.geometry.coordinates?.length).length;
  const tipoCorrecto = features.filter((f) => tipos.includes(f.geometry?.type)).length;
  const ids = features.map((f) => f.properties?.id).filter((v) => v !== null && v !== undefined && v !== '');
  const unicos = new Set(ids).size;
  const enCampeche = features.filter((f) => f.properties?.id_unidad).length;
  const conClase = features.filter((f) => f.properties?.clasif !== null && f.properties?.clasif !== undefined && f.properties?.clasif !== '').length;

  return [
    {
      elemento: 'Compleción',
      nombre: 'Elementos publicados frente al registro del catálogo',
      valor: total,
      total: esperados,
      porcentaje: pct(Math.min(total, esperados), esperados),
      conforme: esperados > 0 && total === esperados,
      descripcion: total === esperados ? 'Sin omisión ni comisión.' : `Diferencia de ${Math.abs(total - esperados).toLocaleString('es-MX')} elementos.`,
    },
    medida('Consistencia lógica', 'Elementos con geometría válida', conGeometria, total, { descripcion: 'Consistencia de formato: geometría presente y con coordenadas.' }),
    medida('Consistencia lógica', `Elementos con tipo de geometría «${capa.tipo_geometria ?? capa.geom}»`, tipoCorrecto, total, { descripcion: 'Consistencia de dominio del tipo geométrico.' }),
    medida('Consistencia lógica', 'Identificadores únicos', unicos, total, { descripcion: 'Cada elemento tiene un identificador propio (capa_vector.id).' }),
    medida('Compleción', 'Elementos con clase temática asignada', conClase, total, { umbral: 0, descripcion: 'Atributo «clasif» con valor; se informa, no es requisito.' }),
    medida('Consistencia lógica', 'Elementos asignados a un municipio de Campeche', enCampeche, total, { umbral: 0, descripcion: 'Los elementos fuera del estado se conservan como contexto regional.' }),
    {
      elemento: 'Exactitud posicional',
      nombre: 'Exactitud absoluta',
      conforme: null,
      descripcion: proceso
        ? `No evaluada por el SESIM: depende de la fuente. Coordenadas almacenadas con ${proceso.decimales} decimales (≈ 1.1 m) y simplificación de ${proceso.resolucion_m} m para su publicación web.`
        : 'No evaluada por el SESIM: depende de la escala y el método de la fuente.',
    },
    {
      elemento: 'Exactitud temática',
      nombre: 'Clasificación correcta',
      conforme: null,
      descripcion: 'No evaluada por el SESIM: requiere verificación en campo o contra una fuente de referencia.',
    },
  ];
}
