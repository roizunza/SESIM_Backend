import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { useFiltros } from '../lib/sesim/filtrosGlobales';
import { useFiltrosEnUrl } from '../lib/sesim/useFiltrosEnUrl';
import { tableroTerritorio } from '../lib/sesim/api';
import { descargarPdf, descargarXlsx } from '../lib/sesim/exportarTablero';
import { municipiosDe, construirTerritorio, metricas, indicadoresDelTablero, suma } from '../lib/sesim/tableroTerritorio';
import { NIVELES, NIVEL_POR_ESTRATEGIA, SINOPSIS, META_TIPOS, MIR, METRICAS, f } from '../lib/sesim/tableroTextos';
import { EJES_ESTRATEGICOS } from '../lib/ejesEstrategicos';
import EstadoCarga from '../components/plataforma/EstadoCarga';
import AnilloTerritorio from '../components/tablero/AnilloTerritorio';
import ComparacionTerritorial from '../components/tablero/ComparacionTerritorial';
import './TableroSeguimiento.css';

const TABLAS = ['unidad_territorial', 'indicador', 'indicador_eje', 'eje_tematico'];
const sinNumero = (t) => t.replace(/^\d+\.\s*/, '');

function Apilada({ valores, etiquetas, clases }) {
  const t = suma(valores) || 1;
  return (
    <>
      <div className="tv__stk" aria-hidden="true">{valores.map((v, i) => <i key={etiquetas[i]} className={clases[i]} style={{ width: `${(v / t) * 100}%` }} />)}</div>
      <div className="tv__lg">{valores.map((v, i) => <span key={etiquetas[i]} className={clases[i]}>{etiquetas[i]} <b>{v}</b></span>)}</div>
    </>
  );
}

export default function TableroSeguimiento() {
  useFiltrosEnUrl();
  const { filtros, fijar, reiniciar } = useFiltros();
  const [params, setParams] = useSearchParams();
  const { datos, error } = useCatalogo(TABLAS);
  const [territorio, setTerritorio] = useState(null);
  const [errTerr, setErrTerr] = useState('');
  const [trabajando, setTrabajando] = useState('');
  const lienzo = useRef(null);

  useEffect(() => {
    let vivo = true;
    tableroTerritorio().then((d) => vivo && setTerritorio(d)).catch((e) => vivo && setErrTerr(e.message));
    return () => { vivo = false; };
  }, []);

  const estrategiaId = params.get('estrategia') ?? '';
  const ejeSel = EJES_ESTRATEGICOS.find((e) => e.id === estrategiaId) ?? null;
  const eje = ejeSel?.numero ?? 0;
  const fijarEstrategia = useCallback((id) => {
    const sig = new URLSearchParams(window.location.search);
    if (id) sig.set('estrategia', id); else sig.delete('estrategia');
    setParams(sig, { replace: true });
  }, [setParams]);
  const alEje = (n) => fijarEstrategia(eje === n ? '' : `eje${n}`);

  const municipios = useMemo(() => (datos ? municipiosDe(datos.unidad_territorial) : null), [datos]);
  const T = useMemo(() => (territorio && municipios ? construirTerritorio(territorio.filas, municipios) : null), [territorio, municipios]);
  const M = useMemo(() => (T ? metricas(T, municipios) : null), [T, municipios]);
  const indicadores = useMemo(() => (datos ? indicadoresDelTablero(datos) : null), [datos]);

  const sel = municipios?.find((m) => m.id === filtros.municipio) ?? null;
  const cve = sel?.cve ?? '';
  const hayFiltro = Boolean(cve || eje);
  const restablecer = useCallback(() => { reiniciar(); fijarEstrategia(''); }, [reiniciar, fijarEstrategia]);
  const alMunicipio = (c) => fijar('municipio', c ? `04${c}` : '');

  useEffect(() => {
    const alTecla = (e) => { if (e.key === 'Escape' && hayFiltro && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) restablecer(); };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [hayFiltro, restablecer]);

  const pdf = async () => {
    setTrabajando('pdf');
    try { await descargarPdf(lienzo.current, `tablero-sesim${sel ? `-${sel.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-')}` : ''}${eje ? `-estrategia-${eje}` : ''}.pdf`); }
    catch (e) { window.alert(`No se pudo generar el PDF: ${e.message}`); }
    setTrabajando('');
  };
  const excel = () => {
    const claves = [...new Set(Object.values(METRICAS).flat().map((m) => m[0]))];
    const nombre = (k) => Object.values(METRICAS).flat().find((m) => m[0] === k)[1];
    const unidad = (k) => Object.values(METRICAS).flat().find((m) => m[0] === k)[2];
    const enc = ['Clave', 'Municipio', ...claves.map((k) => `${nombre(k)}${unidad(k) ? ` (${unidad(k)})` : ''}`)];
    const r = (n) => Math.round(n * 100) / 100;
    const filasMun = [enc, ['', 'Todo el estado', ...claves.map((k) => r(M.ST[k]()))], ...municipios.map((m) => [m.cve, m.nombre, ...claves.map((k) => r(M.VAL[k](m.cve)))])];
    descargarXlsx([
      { nombre: 'Municipios', filas: filasMun },
      { nombre: 'Estadística por capa', filas: [['Capa', 'Clave municipio', 'Clasificación', 'Elementos', 'Km'], ...territorio.filas.map((x) => [x.capa, x.mun, x.clasif, Number(x.n), Number(x.km)])] },
      { nombre: 'Indicadores', filas: [['Indicador', 'Nombre', 'Estrategias', 'Nivel de la matriz', 'Cómo se mide la meta'], ...indicadores.map((i) => [i.id, i.nombre, i.ejes.join(', '), MIR[i.nivel] ?? '', META_TIPOS.find((t) => t.k === i.meta)?.etiqueta ?? ''])] },
      { nombre: 'Notas', filas: [['Nota'], [`Generado el ${new Date().toLocaleDateString('es-MX')} · estadística territorial: ${territorio.origen ?? 'capas del SESIM'}.`], ['Los porcentajes del estado son la razón de las sumas, no el promedio de los municipios.'], ['Clave de municipio 000 = elementos fuera del estado.']] },
    ], 'datos-tablero-sesim.xlsx');
  };

  const falla = error || errTerr;
  const listo = Boolean(T && M && indicadores);
  const cves = cve ? [cve] : municipios?.map((m) => m.cve);
  const niveles = listo ? M.nivelesDe(cves) : [];
  const delEje = listo ? indicadores.filter((i) => !eje || i.ejes.includes(eje)) : [];
  const mir = [0, 1, 2, 3].map((k) => delEje.filter((i) => i.nivel === k).length);
  const metas = META_TIPOS.map((t) => delEje.filter((i) => i.meta === t.k).length);
  const colorEje = eje ? `var(--tv-e${eje})` : 'var(--tv-beige)';

  return (
    <div className="tv-pagina" ref={lienzo}>
      <div className="tv">
        {falla && <EstadoCarga estado="error" titulo="No se pudo cargar el tablero" mensaje={falla} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />}
        {!falla && !listo && <EstadoCarga estado="cargando" titulo="Cargando el tablero" />}
        {!falla && listo && (
          <>
            <div className="tv__col">
              <div>
                <div className="tv__lbl">Tablero público</div>
                <h1 className="tv__h1">El territorio y sus estrategias</h1>
                <p className="tv__sub">{sel ? `${sel.nombre} · ${f(sel.pob)} habitantes` : `Estado de Campeche · ${municipios.length} municipios`}{eje ? ` · ${sinNumero(ejeSel.tituloCorto)}` : ''}</p>
              </div>
              <section className="tv__card tv__card--jer" aria-label="Jerarquía de la movilidad">
                <h2 className="tv__h2">Jerarquía de la movilidad</h2>
                <div className="tv__jer">
                  {NIVELES.map((n, i) => {
                    const hl = eje && (NIVEL_POR_ESTRATEGIA[eje] ?? []).includes(i);
                    const v = niveles[i];
                    return (
                      <div key={n.n} className={`tv__nv${eje && NIVEL_POR_ESTRATEGIA[eje] ? (hl ? ' hl' : ' dim') : ''}`} style={{ '--ec': colorEje }}>
                        <span className="tv__nv-n">{i + 1}</span>
                        <div><h3>{n.n}</h3><div className="tv__nv-v">{f(v.v, v.d ?? 0)}<small>{v.u}</small></div><div className="tv__nv-t">{n.t}</div></div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="tv__card tv__mid" aria-label="Municipios y estrategias">
              <div className="tv__head">
                <div>
                  <h2 className="tv__h2 tv__h2--0">Municipios y estrategias</h2>
                  <div className="tv__sub">Afuera, los municipios; adentro, un punto por indicador. Toca para filtrar.</div>
                </div>
                <div className="tv__acc" data-html2canvas-ignore="true">
                  <label><span className="sr-only">Municipio</span>
                    <select value={cve} onChange={(e) => alMunicipio(e.target.value)}>
                      <option value="">Todo el estado</option>
                      {municipios.map((m) => <option key={m.cve} value={m.cve}>{m.nombre}</option>)}
                    </select>
                  </label>
                  <button type="button" className="tv__lnk" onClick={restablecer} style={{ visibility: hayFiltro ? 'visible' : 'hidden' }} tabIndex={hayFiltro ? 0 : -1}>Restablecer</button>
                  <button type="button" className="tv__btn" onClick={pdf} disabled={Boolean(trabajando)}>{trabajando === 'pdf' ? 'Generando…' : 'Descargar PDF'}</button>
                  <button type="button" className="tv__btn" onClick={excel}>Descargar datos</button>
                </div>
              </div>
              <div className="tv__anillo"><AnilloTerritorio municipios={municipios} indicadores={indicadores} ejes={EJES_ESTRATEGICOS} municipio={cve} eje={eje} alMunicipio={alMunicipio} alEje={alEje} /></div>
              <div className="tv__leg">
                <span><i className="tv__mun-i" />Municipio (tamaño = habitantes)</span>
                {EJES_ESTRATEGICOS.map((e) => (
                  <button key={e.id} type="button" aria-pressed={eje === e.numero} className={eje && eje !== e.numero ? 'tenue' : ''} onClick={() => alEje(e.numero)}>
                    <i style={{ background: `var(--tv-e${e.numero})` }} />{e.numero} {e.nombreAtajo}
                  </button>
                ))}
                <span>punto brillante = meta con cifra</span>
              </div>
              <div className="tv__info" aria-label="Estrategia">
                <div className="tv__info-a">
                  <div className="tv__lbl">{eje ? `Estrategia ${eje}` : 'Las 5 estrategias'}</div>
                  <h2 className="tv__h2" style={{ color: colorEje }}>{eje ? sinNumero(ejeSel.tituloCorto) : 'Todas las estrategias'}</h2>
                  <p className="tv__sub">{eje ? SINOPSIS[eje - 1] : 'Toca una estrategia en el anillo, o su nombre, para ver qué mide.'}</p>
                  <div className="tv__big">{delEje.length}<small>indicadores</small></div>
                </div>
                <div className="tv__info-b">
                  <div className="tv__lbl">Qué mide (nivel de la matriz)</div>
                  <Apilada valores={mir} etiquetas={MIR} clases={['k1', 'k2', 'k3', 'k4']} />
                  <div className="tv__lbl">Cómo se mide la meta</div>
                  <Apilada valores={metas} etiquetas={META_TIPOS.map((t) => t.etiqueta)} clases={['m1', 'm2', 'm3', 'm4']} />
                </div>
              </div>
            </section>

            <div className="tv__col">
              <section className="tv__card tv__card--cmp" aria-label="Comparación del municipio con el estado">
                <ComparacionTerritorial metricas={METRICAS[eje]} M={M} T={T} municipios={municipios} municipio={cve} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
