import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { useFiltros } from '../lib/sesim/filtrosGlobales';
import { useFiltrosEnUrl } from '../lib/sesim/useFiltrosEnUrl';
import { resumenEstrategias, NIVELES_MIR } from '../lib/sesim/resumenEstrategias';
import { EJES_ESTRATEGICOS } from '../lib/ejesEstrategicos';
import { publicables } from '../lib/sesim/normativo';
import { RUTAS, enlace } from '../lib/rutas';
import Contador from '../components/plataforma/Contador';
import EstadoCarga from '../components/plataforma/EstadoCarga';
import { fmtNumero } from '../components/tablero/formato';
import './TableroSeguimiento.css';

const TABLAS = ['unidad_territorial', 'capa', 'v_capa_por_municipio', 'instrumento_normativo', 'indicador', 'indicador_eje', 'eje_tematico', 'medicion_publica'];
const ESCALAS = { F: 'Federal', E: 'Estatal', M: 'Municipal' };
const METRICAS = [
  { id: 'capas', etiqueta: 'Capas' },
  { id: 'poblacion', etiqueta: 'Población' },
  { id: 'instrumentos', etiqueta: 'Instrumentos' },
];
const PANELES = [
  { id: 'cobertura', etiqueta: 'Cobertura' },
  { id: 'estrategias', etiqueta: 'Estrategias' },
  { id: 'instrumentos', etiqueta: 'Instrumentos' },
];
/** Posición aproximada de cada municipio en el mosaico (columna, fila): no es cartográfica. */
const POSICION = {
  'Calkiní': [0, 0], 'Dzitbalché': [1, 0], 'Hecelchakán': [2, 0], 'Hopelchén': [3, 0],
  'Tenabo': [0, 1], 'Campeche': [1, 1],
  'Seybaplaya': [0, 2], 'Champotón': [1, 2], 'Escárcega': [2, 2], 'Calakmul': [3, 2],
  'Carmen': [0, 3], 'Palizada': [1, 3], 'Candelaria': [2, 3],
};
const sinNumero = (t) => t.replace(/^\d+\.\s*/, '');
const numeroEje = (capa) => (capa.grupos_lista ?? []).map((g) => Number(/Eje\s*(\d+)/.exec(g.grupo ?? '')?.[1])).filter(Boolean);

/** Todo lo que el tablero muestra, calculado del catálogo para un municipio y una estrategia (o ninguno). */
function calcular(datos, municipioId, estrategia) {
  const municipios = datos.unidad_territorial.filter((u) => u.nivel === 'municipio');
  const capas = new Map(datos.capa.filter((c) => c.estatus === 'vigente_publico').map((c) => [c.id, c]));
  const ejesDeCapa = new Map([...capas.values()].filter((c) => c.categoria === 'estrategia').map((c) => [c.id, new Set(numeroEje(c))]));
  const normativo = publicables(datos.instrumento_normativo);
  const resumen = resumenEstrategias(datos);

  const capasDe = (idMun, eje) => {
    const ids = new Set();
    for (const r of datos.v_capa_por_municipio) {
      if (r.id_unidad !== idMun || !capas.has(r.id_capa)) continue;
      if (eje && !ejesDeCapa.get(r.id_capa)?.has(eje)) continue;
      ids.add(r.id_capa);
    }
    return ids.size;
  };
  const aplicables = (idMun) => normativo.filter((d) => !idMun || d.escala !== 'M' || d.id_unidad === idMun);

  const filas = municipios.map((m) => ({
    id: m.id,
    nombre: m.nom_mun,
    poblacion: Number(m.pob_tot) || 0,
    capas: capasDe(m.id, estrategia),
    instrumentos: aplicables(m.id).length,
  }));
  const poblacionEstado = filas.reduce((s, f) => s + f.poblacion, 0);
  const mun = municipioId ? filas.find((f) => f.id === municipioId) : null;
  const capasEstado = estrategia ? [...ejesDeCapa.values()].filter((s) => s.has(estrategia)).length : capas.size;
  const delCorte = aplicables(municipioId);
  const porEscala = { F: 0, E: 0, M: 0 };
  for (const d of delCorte) porEscala[d.escala] += 1;
  const indicadores = estrategia ? resumen.porEje[estrategia].total : resumen.total;
  const aprobados = estrategia ? resumen.porEje[estrategia].aprobados : resumen.aprobados;
  const conMedicion = new Set(datos.medicion_publica.map((m) => m.id_indicador).filter((id) => !estrategia || true)).size;
  return {
    filas, resumen, poblacionEstado, mun, capasEstado, delCorte, porEscala, normativoTotal: normativo.length, indicadores, aprobados, conMedicion,
    capasKpi: mun ? mun.capas : capasEstado,
    poblacion: mun ? mun.poblacion : poblacionEstado,
  };
}

const csv = (filas) => filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');

export default function TableroSeguimiento() {
  useFiltrosEnUrl();
  const { filtros, fijar, reiniciar } = useFiltros();
  const [params, setParams] = useSearchParams();
  const { datos, error } = useCatalogo(TABLAS);
  const [metrica, setMetrica] = useState('capas');
  const [panel, setPanel] = useState('cobertura');
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [listo, setListo] = useState(false);
  const mosaico = useRef(null);

  const estrategiaId = params.get('estrategia') ?? '';
  const eje = EJES_ESTRATEGICOS.find((e) => e.id === estrategiaId) ?? null;
  const estrategia = eje?.numero ?? null;
  const fijarEstrategia = useCallback((id) => {
    const sig = new URLSearchParams(window.location.search);
    if (id) sig.set('estrategia', id); else sig.delete('estrategia');
    setParams(sig, { replace: true });
  }, [setParams]);

  useEffect(() => { const t = requestAnimationFrame(() => setListo(true)); return () => cancelAnimationFrame(t); }, []);

  const t = useMemo(() => (datos ? calcular(datos, filtros.municipio, estrategia) : null), [datos, filtros.municipio, estrategia]);
  const hayFiltro = Boolean(filtros.municipio || estrategia);
  const nombreMun = t?.mun?.nombre ?? '';
  const restablecer = useCallback(() => { reiniciar(); fijarEstrategia(''); }, [reiniciar, fijarEstrategia]);

  // Esc restablece, salvo que la persona esté escribiendo o eligiendo en un campo.
  useEffect(() => {
    const alTecla = (e) => { if (e.key === 'Escape' && hayFiltro && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) restablecer(); };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [hayFiltro, restablecer]);

  // Anuncio para lectores de pantalla cada vez que cambia el corte.
  useEffect(() => {
    if (!t) return;
    setAviso(`${nombreMun || 'Todo el estado'}${eje ? `, ${sinNumero(eje.tituloCorto)}` : ''}: ${t.indicadores} indicadores, ${t.capasKpi} capas, ${t.delCorte.length} instrumentos aplicables.`);
  }, [t, nombreMun, eje]);

  const valorMosaico = (f) => (metrica === 'poblacion' ? f.poblacion : metrica === 'instrumentos' ? f.instrumentos : f.capas);
  const rango = useMemo(() => {
    if (!t) return [0, 1];
    const v = t.filas.map(valorMosaico);
    return [Math.min(...v), Math.max(...v)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, metrica]);
  const rejilla = useMemo(() => {
    const g = Array.from({ length: 4 }, () => Array(4).fill(null));
    t?.filas.forEach((f) => { const p = POSICION[f.nombre]; if (p) g[p[1]][p[0]] = f; });
    return g;
  }, [t]);

  const moverFoco = (e) => {
    const flechas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = flechas[e.key];
    if (!d) return;
    const [c0, r0] = (e.target.dataset.pos ?? '').split(',').map(Number);
    if (Number.isNaN(c0)) return;
    e.preventDefault();
    for (let paso = 1; paso <= 4; paso += 1) {
      const c = c0 + d[0] * paso; const r = r0 + d[1] * paso;
      const sig = mosaico.current?.querySelector(`[data-pos="${c},${r}"]`);
      if (sig) { sig.focus(); return; }
    }
  };

  const compartir = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopiado(true); setTimeout(() => setCopiado(false), 2200); }
    catch { window.prompt('Copia el enlace de esta vista:', window.location.href); }
  };
  const descargar = () => {
    const filas = [['Municipio', 'Población', 'Capas publicadas', 'Instrumentos aplicables'], ...t.filas.map((f) => [f.nombre, f.poblacion, f.capas, f.instrumentos]), [], ['Estrategia', 'Indicadores', ...NIVELES_MIR.map((n) => n.clave)],
      ...EJES_ESTRATEGICOS.map((e) => [sinNumero(e.tituloCorto), t.resumen.porEje[e.numero].total, ...NIVELES_MIR.map((n) => t.resumen.porEje[e.numero].mir[n.clave])])];
    const url = URL.createObjectURL(new Blob([`﻿${csv(filas)}`], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'resumen-tablero-sesim.csv' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const kpis = t && [
    { clave: 'poblacion', etiqueta: 'Población', valor: t.poblacion, sub: t.mun ? `${((t.poblacion / t.poblacionEstado) * 100).toFixed(1)} % del estado` : `${t.filas.length} municipios`, pct: (t.poblacion / t.poblacionEstado) * 100 },
    { clave: 'indicadores', etiqueta: 'Indicadores', valor: t.indicadores, sub: `${fmtNumero(t.conMedicion)} con medición publicada`, pct: (t.indicadores / t.resumen.total) * 100, nota: true },
    { clave: 'capas', etiqueta: 'Capas publicadas', valor: t.capasKpi, sub: hayFiltro ? `de ${t.capasEstado} en el estado` : 'en el Geovisor', pct: hayFiltro ? (t.capasKpi / Math.max(1, t.capasEstado)) * 100 : 100, nota: true },
    { clave: 'instrumentos', etiqueta: 'Instrumentos aplicables', valor: t.delCorte.length, sub: filtros.municipio ? `de ${t.normativoTotal} en el estado` : `F ${t.porEscala.F} · E ${t.porEscala.E} · M ${t.porEscala.M}`, pct: (t.delCorte.length / t.normativoTotal) * 100, nota: true },
  ];

  const maxIndicadores = t ? Math.max(1, ...EJES_ESTRATEGICOS.map((e) => t.resumen.porEje[e.numero].total)) : 1;
  const instrumentosLista = useMemo(() => {
    if (!t) return [];
    const orden = { M: 0, E: 1, F: 2 };
    return [...t.delCorte].sort((a, b) => (filtros.municipio ? orden[a.escala] - orden[b.escala] : ({ E: 0, F: 1, M: 2 }[a.escala] - { E: 0, F: 1, M: 2 }[b.escala])) || a.clave.localeCompare(b.clave));
  }, [t, filtros.municipio]);
  const paramsCatalogo = new URLSearchParams();
  if (filtros.municipio) paramsCatalogo.set('mun', filtros.municipio);
  const irCatalogo = `${RUTAS.catalogo}${paramsCatalogo.toString() ? `?${paramsCatalogo}` : ''}`;
  const irGeovisor = `${RUTAS.geovisor}${(() => { const p = new URLSearchParams(); if (filtros.municipio) p.set('mun', filtros.municipio); if (estrategiaId) p.set('estrategia', estrategiaId); return p.toString() ? `?${p}` : ''; })()}`;

  return (
    <div className="tps">
      <header className="tps__cab">
        <div className="tps__titulo">
          <span className="t-etiqueta tps__etq">Tablero de seguimiento{eje ? ` · ${sinNumero(eje.tituloCorto)}` : ''}</span>
          <h1>Cobertura y estructura del sistema</h1>
        </div>
        <div className="tps__filtros" role="group" aria-label="Filtros del tablero">
          <label className="tps__sel">
            <span className="sr-only">Municipio</span>
            <select value={filtros.municipio} onChange={(e) => fijar('municipio', e.target.value)} disabled={!t}>
              <option value="">Todo el estado</option>
              {t?.filas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </label>
          <div className="tps__chips">
            <button type="button" className={`tps__chip tps__chip--todas${eje ? '' : ' on'}`} aria-pressed={!eje} onClick={() => fijarEstrategia('')}>Todas</button>
            {EJES_ESTRATEGICOS.map((e) => (
              <button key={e.id} type="button" className={`tps__chip${estrategiaId === e.id ? ' on' : ''}`} style={{ '--c': e.colorVar }} aria-pressed={estrategiaId === e.id} title={e.label} aria-label={e.label} onClick={() => fijarEstrategia(estrategiaId === e.id ? '' : e.id)}>
                <i aria-hidden="true">{e.numero}</i>
              </button>
            ))}
          </div>
          <button type="button" className="tps__reset" onClick={restablecer} style={{ visibility: hayFiltro ? 'visible' : 'hidden' }} tabIndex={hayFiltro ? 0 : -1} aria-hidden={!hayFiltro}>Restablecer</button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">{aviso}</p>
      {error && <EstadoCarga estado="error" titulo="No se pudo cargar el tablero" mensaje={error} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />}

      {!error && (
        <>
          <section className="tps__kpis" aria-label="Cifras del corte">
            {(kpis ?? [0, 1, 2, 3].map((k) => ({ clave: k, vacio: true }))).map((k) => (
              <div key={k.clave} className="tps__kpi">
                <span className="t-etiqueta">{k.etiqueta ?? ' '}{k.nota && <span aria-label="cifra provisional">*</span>}</span>
                <div className="tps__kpi-fila"><Contador valor={k.vacio ? null : k.valor} duracion={650} className="tps__kpi-num" /><small>{k.sub}</small></div>
                <div className="tps__kpi-barra" aria-hidden="true"><i style={{ width: listo && !k.vacio ? `${Math.max(3, Math.min(100, k.pct))}%` : 0 }} /></div>
              </div>
            ))}
          </section>

          <div className="tps__pestanas" role="tablist" aria-label="Paneles del tablero">
            {PANELES.map((p) => (
              <button key={p.id} type="button" role="tab" id={`tab-${p.id}`} aria-selected={panel === p.id} aria-controls={`panel-${p.id}`} className={panel === p.id ? 'on' : ''} onClick={() => setPanel(p.id)}>{p.etiqueta}</button>
            ))}
          </div>

          <div className="tps__paneles">
            {/* Cobertura territorial */}
            <section id="panel-cobertura" role="tabpanel" aria-labelledby="tab-cobertura" className={`tps__panel${panel === 'cobertura' ? ' activo' : ''}`}>
              <h2>Cobertura territorial</h2>
              <p className="tps__sub">Un mosaico, un municipio. Clic para filtrar todo el tablero.</p>
              <div className="tps__seg" role="group" aria-label="Qué mide el mosaico">
                {estrategia ? <span className="tps__seg-fijo">Capas de la estrategia</span> : METRICAS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={metrica === m.id} className={metrica === m.id ? 'on' : ''} onClick={() => setMetrica(m.id)}>{m.etiqueta}</button>
                ))}
              </div>
              <div className="tps__mosaico" ref={mosaico} onKeyDown={moverFoco} role="group" aria-label="Municipios" style={eje ? { '--tps-rgb': eje.colorRgbVar } : undefined}>
                {rejilla.flatMap((fila, r) => fila.map((f, c) => {
                  if (!f) return <span key={`${c}${r}`} aria-hidden="true" />;
                  const v = valorMosaico(f);
                  const a = 0.1 + 0.48 * ((v - rango[0]) / Math.max(rango[1] - rango[0], 1));
                  const activo = filtros.municipio === f.id;
                  return (
                    <button key={f.id} type="button" data-pos={`${c},${r}`} aria-pressed={activo} aria-label={`${f.nombre}: ${fmtNumero(v)} ${metrica === 'poblacion' && !estrategia ? 'habitantes' : metrica === 'instrumentos' && !estrategia ? 'instrumentos' : 'capas'}`}
                      className={`tps__tesela${activo ? ' on' : ''}${filtros.municipio && !activo ? ' tenue' : ''}`}
                      style={{ '--a': a.toFixed(2), '--i': r * 4 + c }} onClick={() => fijar('municipio', activo ? '' : f.id)}>
                      <b>{f.nombre}</b><span>{fmtNumero(v)}</span>
                      <em role="tooltip">{fmtNumero(f.poblacion)} habitantes · {f.capas} capas · {f.instrumentos} instrumentos</em>
                    </button>
                  );
                }))}
              </div>
              <div className="tps__leyenda" aria-hidden="true"><span>Menos</span><i /><span>Más</span><small>Mosaico: posición aproximada</small></div>
              <footer className="tps__pie"><span>{nombreMun || 'Todo el estado'} · {t?.capasKpi ?? '—'} capas</span><Link to={irGeovisor}>Abrir en el Geovisor →</Link></footer>
            </section>

            {/* Estrategias e indicadores */}
            <section id="panel-estrategias" role="tabpanel" aria-labelledby="tab-estrategias" className={`tps__panel${panel === 'estrategias' ? ' activo' : ''}`}>
              <h2>Estrategias e indicadores</h2>
              <p className="tps__sub">Longitud: indicadores · segmentos: nivel de la MIR.</p>
              <ul className="tps__estrategias">
                {EJES_ESTRATEGICOS.map((e) => {
                  const r = t?.resumen.porEje[e.numero];
                  const tenue = estrategia && estrategia !== e.numero;
                  return (
                    <li key={e.id} className={`${estrategia === e.numero ? 'on' : ''}${tenue ? ' tenue' : ''}`} style={{ '--c': e.colorVar }}>
                      <button type="button" aria-pressed={estrategia === e.numero} onClick={() => fijarEstrategia(estrategia === e.numero ? '' : e.id)}>
                        <i aria-hidden="true">{e.numero}</i>
                        <span className="tps__est-nombre">{sinNumero(e.tituloCorto)}</span>
                        <b>{r?.total ?? '—'}</b>
                        <span className="tps__mir" aria-hidden="true">
                          {NIVELES_MIR.map((n, k) => <s key={n.clave} title={`${n.clave}: ${r?.mir[n.clave] ?? 0}`} style={{ flex: listo ? r?.mir[n.clave] ?? 0 : 0, opacity: 1 - k * 0.22, transitionDelay: `${k * 90}ms`, width: 0 }} />)}
                          <u style={{ width: listo && r ? `${(1 - r.total / maxIndicadores) * 100}%` : '100%' }} />
                        </span>
                        <span className="sr-only">{NIVELES_MIR.map((n) => `${n.clave} ${r?.mir[n.clave] ?? 0}`).join(', ')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="tps__leyenda-mir" aria-hidden="true">{NIVELES_MIR.map((n, k) => <span key={n.clave}><i style={{ opacity: 1 - k * 0.22 }} />{n.clave}</span>)}</div>
              <div className="tps__madurez">
                <span className="t-etiqueta">Madurez de la información</span>
                <div>
                  <div><b>{t?.indicadores ?? '—'}</b><span>definidos</span></div><i aria-hidden="true">→</i>
                  <div><b>{t?.aprobados ?? '—'}<sup>*</sup></b><span>aprobados</span></div><i aria-hidden="true">→</i>
                  <div><b>{t ? t.conMedicion : '—'}<sup>*</sup></b><span>con medición</span></div>
                </div>
              </div>
              <footer className="tps__pie"><span>{eje ? `Estrategia ${eje.numero} · ${t?.indicadores ?? '—'} indicadores` : `Las 5 estrategias · ${t?.indicadores ?? '—'} indicadores`}</span><Link to={RUTAS.tablero}>Ver indicadores →</Link></footer>
            </section>

            {/* Instrumentos aplicables */}
            <section id="panel-instrumentos" role="tabpanel" aria-labelledby="tab-instrumentos" className={`tps__panel${panel === 'instrumentos' ? ' activo' : ''}`}>
              <h2>Instrumentos aplicables</h2>
              <p className="tps__sub">{t?.delCorte.length ?? '—'} para {nombreMun || 'el estado'}</p>
              <div className="tps__escalas" role="img" aria-label={`Federales ${t?.porEscala.F ?? 0}, estatales ${t?.porEscala.E ?? 0}, municipales ${t?.porEscala.M ?? 0}`}>
                {['F', 'E', 'M'].map((k) => t && t.porEscala[k] > 0 && <span key={k} className={`tps__esc tps__esc--${k}`} style={{ flexGrow: listo ? t.porEscala[k] : 0 }}>{k} {t.porEscala[k]}</span>)}
              </div>
              <ul className="tps__lista">
                {instrumentosLista.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    <span className={`tps__ins-esc tps__esc--${d.escala}`} title={ESCALAS[d.escala]}>{d.escala}</span>
                    <div><Link to={enlace.fichaInstrumento(d.id)}>{d.nombre_oficial ?? d.nombre}</Link><small>{d.tipo}{d.publicacion ? ` · ${d.publicacion.medio} ${new Date(`${d.publicacion.fecha}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}</small></div>
                  </li>
                ))}
                {t && instrumentosLista.length === 0 && <li className="tps__vacio">Sin instrumentos publicados para este corte.</li>}
              </ul>
              <footer className="tps__pie"><span>{instrumentosLista.length > 5 ? `+${instrumentosLista.length - 5} más` : 'Federales, estatales y municipales'}</span><Link to={irCatalogo}>Ver en el Catálogo →</Link></footer>
            </section>
          </div>

          <footer className="tps__nota">
            <p><strong>Datos del catálogo SESIM.</strong> * Cifra provisional hasta conectar la fuente única. Información de carácter informativo sin validez jurídica.</p>
            <div>
              <button type="button" onClick={compartir}>{copiado ? 'Enlace copiado ✓' : 'Compartir vista'}</button>
              <button type="button" onClick={descargar} disabled={!t}>Descargar resumen (CSV)</button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
