import { useEffect, useMemo, useState } from 'react';
import { X, Info, Loader2 } from 'lucide-react';
import { tablas } from '../../../lib/sesim/api';
import { prepararCatalogo, serieDe, resumenIndicador, valoresPorMunicipio } from '../../../lib/sesim/tablero';
import { umbralVigente, COLORES_SEMAFORO } from '../../../lib/sesim/semaforo';
import { ESTATUS_CAPA } from '../../../lib/sesim/capas';
import './VisorCampos.css';

/**
 * Tablero territorial y Semáforo de la administración. TODO sale del servidor (api.indicador, api.medicion_publica,
 * api.umbral_publico, api.periodo…); nada se simula. Solo cuentan las mediciones `vigente_publico` y el semáforo es
 * la misma función F04 del geovisor público (lib/sesim/semaforo.js), con el umbral vigente de cada indicador.
 * El panel es flotante y el mapa sigue a la vista: al elegir un indicador en «Semáforo», los municipios se pintan con su color.
 */
const ORDEN = ['verde', 'mejora', 'amarillo', 'estable', 'rojo', 'retrocede', 'sin línea base', 'sin dato'];
const ROTULO = { verde: 'En meta', mejora: 'Mejora', amarillo: 'Atención', estable: 'Estable', rojo: 'Rezago', retrocede: 'Retrocede', 'sin línea base': 'Sin línea base', 'sin dato': 'Sin dato' };

function useDatosTablero() {
  const [estado, setEstado] = useState({ cat: null, error: '' });
  useEffect(() => {
    let vivo = true;
    tablas(['indicador', 'periodo', 'unidad_territorial', 'eje_tematico', 'fuente_informacion', 'indicador_eje', 'medicion_publica', 'umbral_publico'])
      .then((d) => { if (vivo) setEstado({ cat: prepararCatalogo(d, null), error: '' }); })
      .catch((e) => { if (vivo) setEstado({ cat: null, error: e.message }); });
    return () => { vivo = false; };
  }, []);
  return estado;
}

export default function TableroTerritorial({ modo, capas = [], pendientes = 0, onCerrar, onColores, soloLectura = false }) {
  const { cat, error } = useDatosTablero();
  const [sel, setSel] = useState(null);

  const resumenes = useMemo(() => {
    if (!cat) return [];
    return cat.indicadores.filter((i) => i.estatus_aprobado !== false).map((ind) => {
      const umbral = umbralVigente(cat.umbrales, ind.id);
      return { ...resumenIndicador(ind, serieDe(ind.id, cat.mediciones), umbral), umbral };
    });
  }, [cat]);

  const conteo = useMemo(() => {
    const c = {};
    resumenes.forEach((r) => { const k = r.semaforo ?? 'sin dato'; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [resumenes]);
  const conDato = resumenes.filter((r) => r.ultimo).length;
  const municipiosConDato = useMemo(() => new Set((cat?.mediciones ?? []).map((m) => m.id_municipio)).size, [cat]);

  // Pintar el mapa con el indicador elegido (solo en modo Semáforo).
  const elegido = resumenes.find((r) => r.indicador.id === sel) ?? null;
  const porMunicipio = useMemo(() => (elegido && cat ? valoresPorMunicipio(elegido.indicador.id, cat.mediciones, elegido.indicador, elegido.umbral) : null), [elegido, cat]);
  useEffect(() => {
    if (modo !== 'semaforo' || !porMunicipio) { onColores?.(null); return undefined; }
    onColores?.(new Map([...porMunicipio].map(([id, v]) => [id, { color: COLORES_SEMAFORO[v.semaforo] ?? '#D1D5DB', texto: `${ROTULO[v.semaforo] ?? v.semaforo} · ${v.valor}` }])));
    return () => onColores?.(null);
  }, [modo, porMunicipio]); // eslint-disable-line react-hooks/exhaustive-deps

  const capasPorEstatus = useMemo(() => {
    const c = {};
    capas.forEach((x) => { c[x.estatus] = (c[x.estatus] ?? 0) + 1; });
    return c;
  }, [capas]);

  return (
    <aside className="modal-drawer dc-drawer dc-flotante tt-panel" aria-label={modo === 'semaforo' ? 'Semáforo de indicadores' : 'Tablero territorial'}>
      <div className="modal-drawer-header">
        <div><p className="dc-rotulo">Datos publicados del servidor</p><h3 className="dc-titulo">{modo === 'semaforo' ? 'Semáforo de indicadores' : 'Tablero territorial'}</h3></div>
        <button type="button" className="btn-close-drawer" onClick={onCerrar} aria-label="Cerrar y volver al mapa"><X size={20} /></button>
      </div>
      <div className="modal-drawer-content dc-cuerpo">
        {!cat && !error && <p className="dc-nota"><Loader2 size={14} className="spin" aria-hidden="true" /> Leyendo del servidor…</p>}
        {error && <div className="aviso aviso-error" role="alert">No se pudo leer del servidor: {error}</div>}
        {cat && (
          <>
            {modo === 'tablero' && (
              <>
                <div className="tt-kpis">
                  <div><strong>{resumenes.length}</strong><span>indicadores aprobados</span></div>
                  <div><strong>{conDato}</strong><span>con medición publicada</span></div>
                  <div><strong>{municipiosConDato}</strong><span>municipios con dato</span></div>
                  <div><strong>{cat.periodosConDato.length}</strong><span>periodos con dato</span></div>
                </div>
                <section className="dc-bloque" aria-label="Semaforización">
                  <h4>Semaforización</h4>
                  <div className="tt-barra" role="img" aria-label="Distribución del semáforo">
                    {ORDEN.filter((k) => conteo[k]).map((k) => <span key={k} style={{ flex: conteo[k], background: COLORES_SEMAFORO[k] }} title={`${ROTULO[k]}: ${conteo[k]}`} />)}
                  </div>
                  <ul className="tt-leyenda">{ORDEN.filter((k) => conteo[k]).map((k) => <li key={k}><i style={{ background: COLORES_SEMAFORO[k] }} />{ROTULO[k]} <b>{conteo[k]}</b></li>)}</ul>
                </section>
                <section className="dc-bloque" aria-label="Capas por estado">
                  <h4>Capas por estado</h4>
                  <ul className="tt-leyenda">{Object.keys(ESTATUS_CAPA).map((k) => <li key={k}>{ESTATUS_CAPA[k]} <b>{capasPorEstatus[k] ?? 0}</b></li>)}</ul>
                  <p className="dc-nota"><Info size={14} aria-hidden="true" /> {soloLectura ? `${pendientes} en el flujo de dictamen (tú solo observas).` : `${pendientes} por dictaminar ahora.`}</p>
                </section>
                {conDato === 0 && <p className="dc-nota"><Info size={14} aria-hidden="true" /> Aún no hay mediciones publicadas: el tablero se llena cuando el equipo captura y la administración publica mediciones.</p>}
              </>
            )}
            {modo === 'semaforo' && (
              <>
                <p className="dc-nota"><Info size={14} aria-hidden="true" /> Elige un indicador para pintar los municipios en el mapa con su semáforo. Cuenta solo lo publicado.</p>
                <ul className="tt-lista">
                  {resumenes.map((r) => {
                    const k = r.semaforo ?? 'sin dato';
                    return (
                      <li key={r.indicador.id}>
                        <button type="button" className={`tt-fila${sel === r.indicador.id ? ' tt-fila--sel' : ''}`} onClick={() => setSel(sel === r.indicador.id ? null : r.indicador.id)} aria-pressed={sel === r.indicador.id}>
                          <i className="tt-punto" style={{ background: COLORES_SEMAFORO[k] }} aria-hidden="true" />
                          <span className="tt-fila__txt"><code>{r.indicador.id}</code> {r.indicador.nombre}<small>{ROTULO[k]}{r.ultimo ? ` · ${r.ultimo.valor} (${r.ultimo.periodo?.etiqueta ?? ''})` : ''}</small></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!resumenes.length && <p className="dc-nota">No hay indicadores aprobados.</p>}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
