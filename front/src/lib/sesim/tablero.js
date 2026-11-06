/**
 * Modelo del tablero de seguimiento (módulo puro, sin React).
 *
 * Recibe las tablas del esquema `api` y el estado global de filtros, y devuelve todo lo
 * que consumen las tarjetas, el mapa, las gráficas, la vista tabular y las descargas.
 * Solo cuentan mediciones `vigente_publico` (api.medicion_publica). El valor de un corte
 * con varios municipios es el promedio simple de los valores municipales y se declara así
 * en la interfaz (`n` = municipios con dato); con un municipio elegido es su propio valor.
 */
import { fnSemaforo, avancePct, umbralVigente } from './semaforo.js';

const esMunicipal = (idUnidad) => String(idUnidad).length === 5;
const municipioDe = (idUnidad) => String(idUnidad).slice(0, 5);
const numero = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function prepararCatalogo(datos, jerarquia) {
  const periodos = new Map(datos.periodo.map((p) => [p.id, p]));
  const unidades = new Map(datos.unidad_territorial.map((u) => [u.id, u]));
  const ejes = new Map(datos.eje_tematico.map((e) => [e.id, e]));
  const fuentes = new Map(datos.fuente_informacion.map((f) => [f.id, f]));
  const ejesDe = new Map();
  for (const v of datos.indicador_eje) {
    if (!ejesDe.has(v.id_indicador)) ejesDe.set(v.id_indicador, new Set());
    ejesDe.get(v.id_indicador).add(v.id_eje);
  }
  const indicadores = datos.indicador.filter((i) => i.activo !== false);
  for (const i of indicadores) if (!ejesDe.has(i.id)) ejesDe.set(i.id, new Set([i.id_eje]));

  const mediciones = datos.medicion_publica
    .filter((m) => periodos.has(m.id_periodo))
    .map((m) => ({ ...m, periodo: periodos.get(m.id_periodo), id_municipio: municipioDe(m.id_unidad) }));

  const periodosConDato = [...new Set(mediciones.map((m) => m.id_periodo))]
    .map((id) => periodos.get(id))
    .sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)));

  const jerarquiasViales = [...new Set(mediciones.map((m) => m.desagregaciones?.jerarquia_vial).filter(Boolean))].sort();
  const etiquetaUsuario = new Map((jerarquia?.niveles ?? []).map((n) => [n.id, `${n.fraccion}. ${n.nombre}`]));
  const tiposUsuario = [...new Set(mediciones.map((m) => m.desagregaciones?.tipo_usuario).filter(Boolean))]
    .map((id) => ({ id, nombre: etiquetaUsuario.get(id) ?? id }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    indicadores,
    indicadorPorId: new Map(indicadores.map((i) => [i.id, i])),
    periodos,
    periodosConDato,
    unidades,
    municipios: datos.unidad_territorial.filter((u) => u.nivel === 'municipio').sort((a, b) => a.id.localeCompare(b.id)),
    ejes,
    listaEjes: [...datos.eje_tematico].sort((a, b) => a.numero_eje - b.numero_eje),
    fuentes,
    ejesDe,
    mediciones,
    jerarquiasViales,
    tiposUsuario,
    umbrales: datos.umbral_publico ?? [],
  };
}

function enRango(periodo, desde, hasta, periodos) {
  const ini = String(periodo.fecha_inicio);
  if (desde && ini < String(periodos.get(Number(desde))?.fecha_inicio ?? '')) return false;
  if (hasta && ini > String(periodos.get(Number(hasta))?.fecha_inicio ?? '')) return false;
  return true;
}

/** Indicadores que pasan el filtro temático (eje). */
export function indicadoresFiltrados(cat, filtros) {
  return cat.indicadores.filter((i) => !filtros.eje || cat.ejesDe.get(i.id).has(Number(filtros.eje)));
}

/** Mediciones que pasan los filtros de tiempo, territorio y desagregación. */
export function medicionesFiltradas(cat, filtros, { desde = filtros.periodoDesde, hasta = filtros.periodoHasta, municipio = filtros.municipio, ids } = {}) {
  return cat.mediciones.filter((m) => {
    if (ids && !ids.has(m.id_indicador)) return false;
    if (!enRango(m.periodo, desde, hasta, cat.periodos)) return false;
    if (municipio && m.id_municipio !== municipio) return false;
    if (filtros.jerarquiaVial && m.desagregaciones?.jerarquia_vial !== filtros.jerarquiaVial) return false;
    if (filtros.tipoUsuario && m.desagregaciones?.tipo_usuario !== filtros.tipoUsuario) return false;
    return true;
  });
}

/** Valor de un corte: el municipal si existe; si solo hay localidades, su promedio. */
function valorDeCorte(lista) {
  const municipales = lista.filter((m) => esMunicipal(m.id_unidad) && numero(m.valor) !== null);
  const base = municipales.length ? municipales : lista.filter((m) => numero(m.valor) !== null);
  if (!base.length) return { valor: null, n: 0 };
  const porMunicipio = new Map();
  for (const m of base) {
    if (!porMunicipio.has(m.id_municipio)) porMunicipio.set(m.id_municipio, []);
    porMunicipio.get(m.id_municipio).push(numero(m.valor));
  }
  const valores = [...porMunicipio.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  return { valor: valores.reduce((a, b) => a + b, 0) / valores.length, n: valores.length };
}

/** F02 agregada: serie del indicador por periodo dentro del corte. */
export function serieDe(idIndicador, mediciones) {
  const porPeriodo = new Map();
  for (const m of mediciones) {
    if (m.id_indicador !== idIndicador) continue;
    if (!porPeriodo.has(m.id_periodo)) porPeriodo.set(m.id_periodo, { periodo: m.periodo, lista: [] });
    porPeriodo.get(m.id_periodo).lista.push(m);
  }
  return [...porPeriodo.values()]
    .map(({ periodo, lista }) => ({ periodo, ...valorDeCorte(lista) }))
    .filter((p) => p.valor !== null)
    .sort((a, b) => String(a.periodo.fecha_inicio).localeCompare(String(b.periodo.fecha_inicio)));
}

/** Datos de una tarjeta: último valor, variación contra el periodo previo, avance a meta y semáforo F04. */
export function resumenIndicador(ind, serie, umbral) {
  if (!serie.length) return { indicador: ind, serie, ultimo: null };
  const ultimo = serie[serie.length - 1];
  const previo = serie.length > 1 ? serie[serie.length - 2] : null;
  const variacion = previo && previo.valor !== 0 ? ((ultimo.valor - previo.valor) / Math.abs(previo.valor)) * 100 : null;
  const sentido = ind.tendencia === 'Descendente' ? -1 : ind.tendencia === 'Ascendente' ? 1 : 0;
  const favorable = variacion === null || sentido === 0 || variacion === 0 ? null : Math.sign(variacion) === sentido;
  const corte = { valor: ultimo.valor, linea_base: ind.linea_base, valor_meta: ind.valor_meta, tendencia: ind.tendencia, umbral };
  return {
    indicador: ind,
    serie,
    ultimo,
    previo,
    variacion,
    favorable,
    avance: avancePct(corte),
    semaforo: fnSemaforo(corte),
  };
}

/** F05 en el cliente: último valor de cada municipio para un indicador dentro del corte. */
export function valoresPorMunicipio(idIndicador, mediciones, ind, umbral) {
  const ultimo = new Map();
  for (const m of mediciones) {
    if (m.id_indicador !== idIndicador || !esMunicipal(m.id_unidad) || numero(m.valor) === null) continue;
    const previo = ultimo.get(m.id_municipio);
    if (!previo || String(m.periodo.fecha_inicio) > String(previo.periodo.fecha_inicio)) ultimo.set(m.id_municipio, m);
  }
  return new Map(
    [...ultimo].map(([id, m]) => [
      id,
      { valor: numero(m.valor), periodo: m.periodo, semaforo: fnSemaforo({ valor: m.valor, linea_base: ind?.linea_base, valor_meta: ind?.valor_meta, tendencia: ind?.tendencia, umbral }) },
    ]),
  );
}

/** Filas de la vista tabular y del CSV (columnas del diccionario + nombres resueltos). */
export function filasTabla(cat, mediciones) {
  return mediciones
    .map((m) => {
      const ind = cat.indicadorPorId.get(m.id_indicador);
      const u = cat.unidades.get(m.id_unidad);
      return {
        id_medicion: m.id,
        id_indicador: m.id_indicador,
        indicador: ind?.nombre ?? '',
        id_unidad: m.id_unidad,
        municipio: u?.nom_mun ?? cat.unidades.get(m.id_municipio)?.nom_mun ?? '',
        localidad: esMunicipal(m.id_unidad) ? '' : u?.nom_loc ?? '',
        periodo: m.periodo.etiqueta,
        fecha_inicio: m.periodo.fecha_inicio,
        fecha_fin: m.periodo.fecha_fin,
        valor: m.valor,
        valor_texto: m.valor_texto ?? '',
        semaforo: fnSemaforo({ valor: m.valor, linea_base: ind?.linea_base, valor_meta: ind?.valor_meta, tendencia: ind?.tendencia, umbral: umbralVigente(cat.umbrales, m.id_indicador) }),
      };
    })
    .sort((a, b) => a.id_indicador.localeCompare(b.id_indicador) || String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)) || a.id_unidad.localeCompare(b.id_unidad));
}

/** Frecuencia de actualización observada (tipos de periodo con mediciones publicadas). */
export function frecuenciaObservada(idIndicador, cat) {
  return [...new Set(cat.mediciones.filter((m) => m.id_indicador === idIndicador).map((m) => m.periodo.tipo_periodo).filter(Boolean))];
}

function dentroDeAnillo([x, y], anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Feature (polígono o multipolígono) que contiene el punto [lng, lat]; prueba plana de rayos. */
export function featureEnPunto(geojson, punto) {
  return (
    geojson?.features.find((f) => {
      const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      return poligonos.some(([exterior, ...huecos]) => dentroDeAnillo(punto, exterior) && !huecos.some((h) => dentroDeAnillo(punto, h)));
    }) ?? null
  );
}

const ORDEN_MIR = { Fin: 0, Propósito: 1, Componentes: 2, Actividades: 3 };
const ESTADOS_CON_META = ['verde', 'amarillo', 'rojo'];
const contarSemaforos = (lista) => lista.reduce((m, r) => m.set(r.semaforo, (m.get(r.semaforo) ?? 0) + 1), new Map());
const porcentaje = (parte, total) => (total ? (parte / total) * 100 : null);

/**
 * Vista «Resumen» del tablero: agrega los resúmenes del corte sin agregar datos propios.
 * Destacados = indicadores con dato ordenados por nivel MIR (Fin primero) y por periodos publicados.
 * Cumplimiento = proporción en verde entre los indicadores con meta numérica (F04).
 * Evolución = índice base 100 en el primer periodo de cada serie, para comparar unidades distintas.
 */
export function resumenEjecutivo(cat, resumenes, mediciones, indicadores, { destacados = 4, enEvolucion = 3 } = {}) {
  const ordenados = [...resumenes].sort(
    (a, b) => (ORDEN_MIR[a.indicador.nivel_mir] ?? 9) - (ORDEN_MIR[b.indicador.nivel_mir] ?? 9) || b.serie.length - a.serie.length || a.indicador.id.localeCompare(b.indicador.id),
  );
  const conMeta = resumenes.filter((r) => ESTADOS_CON_META.includes(r.semaforo));
  const avances = resumenes.map((r) => r.avance).filter((a) => a !== null && a !== undefined);

  const porEje = cat.listaEjes.map((eje) => {
    const del = (r) => cat.ejesDe.get(r.indicador.id)?.has(eje.id);
    const rs = resumenes.filter(del);
    const meta = rs.filter((r) => ESTADOS_CON_META.includes(r.semaforo));
    return {
      eje,
      total: indicadores.filter((i) => cat.ejesDe.get(i.id)?.has(eje.id)).length,
      conDato: rs.length,
      semaforos: contarSemaforos(rs),
      conMeta: meta.length,
      cumplimiento: porcentaje(meta.filter((r) => r.semaforo === 'verde').length, meta.length),
    };
  });

  const porMunicipio = new Map();
  for (const m of mediciones) {
    if (!cat.unidades.has(m.id_municipio)) continue;
    const fila = porMunicipio.get(m.id_municipio) ?? { mediciones: 0, indicadores: new Set() };
    fila.mediciones += 1;
    fila.indicadores.add(m.id_indicador);
    porMunicipio.set(m.id_municipio, fila);
  }

  const ultimoPeriodo = mediciones.reduce((u, m) => (!u || String(m.periodo.fecha_inicio) > String(u.fecha_inicio) ? m.periodo : u), null);
  const evolucion = ordenados
    .filter((r) => r.serie.length > 1 && r.serie[0].valor)
    .slice(0, enEvolucion)
    .map((r) => ({ indicador: r.indicador, puntos: r.serie.map((p) => ({ periodo: p.periodo, valor: (p.valor / r.serie[0].valor) * 100 })) }));

  return {
    destacados: ordenados.slice(0, destacados),
    semaforos: contarSemaforos(resumenes),
    conMeta: conMeta.length,
    cumplimiento: porcentaje(conMeta.filter((r) => r.semaforo === 'verde').length, conMeta.length),
    avancePromedio: avances.length ? avances.reduce((s, a) => s + Math.max(0, Math.min(100, a)), 0) / avances.length : null,
    nAvances: avances.length,
    porEje,
    porMunicipio: [...porMunicipio].map(([id, f]) => ({ id, nombre: cat.unidades.get(id)?.nom_mun ?? id, mediciones: f.mediciones, indicadores: f.indicadores.size })).sort((a, b) => b.indicadores - a.indicadores || a.nombre.localeCompare(b.nombre, 'es')),
    cobertura: {
      indicadores: porcentaje(resumenes.length, indicadores.length),
      municipios: porcentaje(porMunicipio.size, cat.municipios.length),
      nMunicipios: porMunicipio.size,
      totalMunicipios: cat.municipios.length,
    },
    ultimoPeriodo,
    periodos: new Set(mediciones.map((m) => m.id_periodo)).size,
    evolucion,
  };
}
