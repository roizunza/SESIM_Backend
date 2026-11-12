/**
 * Cálculo del tablero público: del archivo/RPC de estadística territorial (filas {capa, mun, clasif, n, km})
 * y del catálogo de unidades territoriales sale, por municipio, cada cifra que el tablero compara.
 * Módulo puro. Todo se calcula de datos reales; nada se simula.
 */

const IDX_URB = ['Nulo', 'Parcialmente equipado', 'Verde pero no accesible', 'Accesible', 'Completamente equipado'];
const IDX_RED = ['Tierra', 'Grava', 'Asfalto y concreto', 'N/A'];
const idxTP = (c) => {
  const t = c.toLowerCase();
  if (t.startsWith('sin transporte')) return 4;
  if (t.startsWith('menor a 20')) return 0;
  if (t.startsWith('de 21')) return 1;
  if (t.startsWith('de 1.1')) return 2;
  if (t.startsWith('mayor a 1.5')) return 3;
  return -1;
};

export const suma = (a) => a.reduce((x, y) => x + y, 0);

/** Municipios con población y número de localidades, del catálogo `unidad_territorial`. */
export function municipiosDe(unidades) {
  const locs = new Map();
  for (const u of unidades) if (u.nivel === 'localidad') locs.set(u.id_padre, (locs.get(u.id_padre) ?? 0) + 1);
  return unidades.filter((u) => u.nivel === 'municipio')
    .map((u) => ({ id: u.id, cve: u.cve_mun, nombre: u.nom_mun, pob: Number(u.pob_tot) || 0, loc: locs.get(u.id) ?? 0 }))
    .sort((a, b) => a.cve.localeCompare(b.cve));
}

/** Matrices por municipio (clave = cve_mun de 3 dígitos) a partir de las filas de estadística. */
export function construirTerritorio(filas, municipios) {
  const T = {};
  for (const m of municipios) {
    T[m.cve] = { red: [0, 0, 0, 0], urb: [0, 0, 0, 0, 0], tp: [0, 0, 0, 0, 0], cic: 0, carga: 0, fed: 0, sv8: 0, sv7: 0, g1: 0, g2: 0, g4: new Set() };
  }
  for (const r of filas) {
    const t = T[r.mun];
    if (!t) continue; // '000' = fuera del estado
    const n = Number(r.n) || 0; const km = Number(r.km) || 0;
    switch (r.capa) {
      case 'DIt06': { const i = IDX_RED.indexOf(r.clasif); if (i >= 0) t.red[i] += km; break; }
      case 'DIt04': { const i = IDX_URB.indexOf(r.clasif); if (i >= 0) t.urb[i] += km; break; }
      case 'DTp01': { const i = idxTP(r.clasif); if (i >= 0) t.tp[i] += n; break; }
      case 'DIt02': t.cic += km; break;
      case 'DTc05': t.carga += km; break;
      case 'E4SegVial01': t.fed += km; break;
      case 'E4SegVial08': t.sv8 += km; break;
      case 'E4SegVial07': t.sv7 += n; break;
      case 'E5Gen01': t.g1 += n; break;
      case 'E5Gen02': t.g2 += n; break;
      case 'E5Gen04': t.g4.add(r.clasif); break;
      default:
    }
  }
  for (const k of Object.keys(T)) T[k].g4 = T[k].g4.size;
  return T;
}

/**
 * Valor de cada métrica para un municipio (VAL) y para todo el estado (ST). El valor del estado de un porcentaje
 * es la razón de las sumas, no el promedio de los municipios. `mun` = lista de municipios (con pob y loc).
 */
export function metricas(T, mun) {
  const por = Object.fromEntries(mun.map((m) => [m.cve, m]));
  const ks = mun.map((m) => m.cve);
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  const redT = (k) => suma(T[k].red);
  const VAL = {
    hab: (k) => por[k].pob,
    loc: (k) => por[k].loc,
    red: redT,
    asf: (k) => pct(T[k].red[2], redT(k)),
    carga: (k) => T[k].carga,
    sintp: (k) => pct(T[k].tp[4], suma(T[k].tp)),
    tp1h: (k) => pct(T[k].tp[0] + T[k].tp[1], suma(T[k].tp)),
    cic: (k) => T[k].cic,
    acc: (k) => pct(T[k].urb[3] + T[k].urb[4], suma(T[k].urb)),
    sinb: (k) => pct(T[k].urb[0], suma(T[k].urb)),
    fedp: (k) => pct(T[k].fed, redT(k)),
    sv8: (k) => T[k].sv8,
    sv7: (k) => T[k].sv7,
    g1: (k) => T[k].g1,
    g2: (k) => T[k].g2,
    g4: (k) => T[k].g4,
  };
  const tot = (fn) => suma(ks.map(fn));
  const sumaF = (f) => tot((k) => suma(T[k][f]));
  const idx = (f, ...is) => tot((k) => suma(is.map((i) => T[k][f][i])));
  const ST = {
    hab: () => tot(VAL.hab),
    loc: () => tot(VAL.loc),
    red: () => sumaF('red'),
    asf: () => pct(idx('red', 2), sumaF('red')),
    carga: () => tot(VAL.carga),
    sintp: () => pct(idx('tp', 4), sumaF('tp')),
    tp1h: () => pct(idx('tp', 0, 1), sumaF('tp')),
    cic: () => tot(VAL.cic),
    acc: () => pct(idx('urb', 3, 4), sumaF('urb')),
    sinb: () => pct(idx('urb', 0), sumaF('urb')),
    fedp: () => pct(tot((k) => T[k].fed), sumaF('red')),
    sv8: () => tot(VAL.sv8),
    sv7: () => tot(VAL.sv7),
    g1: () => tot(VAL.g1),
    g2: () => tot(VAL.g2),
    g4: () => 4,
  };
  const nivelesDe = (cves) => {
    const s = (f, ...is) => suma(cves.map((k) => suma(is.map((i) => T[k][f][i]))));
    const t = (f) => suma(cves.map((k) => suma(T[k][f])));
    return [
      { v: pct(s('urb', 3, 4), t('urb')), u: '%' },
      { v: suma(cves.map((k) => T[k].cic)), u: 'km', d: 1 },
      { v: pct(s('tp', 4), t('tp')), u: '%' },
      { v: suma(cves.map((k) => T[k].carga)), u: 'km' },
      { v: pct(s('red', 2), t('red')), u: '%' },
    ];
  };
  return { VAL, ST, nivelesDe, ks };
}

/** Tipo de meta de un indicador, del texto de su meta: cifra, dirección, línea base o por definir. */
export function tipoMeta(i) {
  const meta = String(i.meta ?? '').trim();
  if (/línea base/i.test(meta)) return 'lb';
  if (/^IM-/i.test(String(i.id))) return 'dir';
  if (!meta || /por definir|pendiente/i.test(meta) || /^aumento del presupuesto actual$/i.test(meta)) return 'pd';
  return 'num';
}

/** Indicadores con sus estrategias (puente indicador_eje) para el anillo del tablero. */
export function indicadoresDelTablero(datos) {
  const numeroDe = new Map(datos.eje_tematico.map((e) => [e.id, e.numero_eje]));
  const ejesDe = new Map();
  for (const v of datos.indicador_eje) {
    if (!ejesDe.has(v.id_indicador)) ejesDe.set(v.id_indicador, new Set());
    ejesDe.get(v.id_indicador).add(numeroDe.get(v.id_eje));
  }
  return datos.indicador.map((i) => ({
    id: i.id,
    nombre: i.nombre ?? i.variable ?? '',
    ejes: [...(ejesDe.get(i.id) ?? new Set([numeroDe.get(i.id_eje)]))].filter(Boolean).sort(),
    meta: tipoMeta(i),
    nivel: ['Fin', 'Propósito', 'Componentes', 'Actividades'].findIndex((n) => String(i.nivel_mir ?? '').startsWith(n)),
  }));
}
