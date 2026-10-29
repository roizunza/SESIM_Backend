import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { X, Map as MapIcon, Search, Activity } from 'lucide-react';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { indexar, fnTrazabilidadNormativa, vEquivalenciaPimus, fnCapasDeIndicador } from '../lib/sesim/api';
import { fnSemaforo, COLORES_SEMAFORO } from '../lib/sesim/semaforo';
import './MonitoreoIndicadores.css';
import '../components/perfiles/comun/Comun.css';

/**
 * Monitoreo público de indicadores (MESO · indicador + MACRO · gobernanza).
 *
 * La tabla sale de `indicador` (113 filas, ID corto Im01/Ee05/Accgir01) con
 * sus dimensiones resueltas por llave: eje_tematico, sector,
 * fuente_informacion y los instrumentos vía indicador_instrumento.
 * Mediciones, periodos, ejes y capas salen de la base (api.medicion_publica, api.periodo, api.indicador_eje,
 * api.capa_indicador): nada se lee del navegador. Solo cuentan mediciones vigente_publico.
 * Al elegir un indicador se abre su ficha pública:
 *   · F01 fn_trazabilidad_normativa  (¿por qué se mide y con qué respaldo?)
 *   · F15 v_equivalencia_pimus       (cómo lo nombra cada PIMUS)
 *   · F06 fn_capas_de_indicador      (botón «Ver en el geovisor»)
 *   · F02 v_serie_indicador + F04 fn_semaforo (solo mediciones publicadas)
 * Deep-link: /monitoreo?indicador=Im18
 */
const numeroDeEjeDe = (catalogo, i) => catalogo.ejes.get(i.id_eje)?.numero_eje;

function Semaforo({ estado }) {
  return <span className="semaforo-chip" style={{ '--sem': COLORES_SEMAFORO[estado] }}><i />{estado.charAt(0).toUpperCase() + estado.slice(1)}</span>;
}

const TENDENCIA = { Ascendente: { flecha: '▲', clase: 'sube' }, Descendente: { flecha: '▼', clase: 'baja' } };
const NIVELES_MIR = ['Fin', 'Propósito', 'Componentes', 'Actividades'];
const FILTROS_VACIOS = { texto: '', eje: '', instrumento: '', mir: '', aprobados: false };

function FichaIndicador({ id, catalogo, onClose }) {
  const [traz, setTraz] = useState(null);
  const [equiv, setEquiv] = useState([]);
  const [capas, setCapas] = useState([]);

  useEffect(() => {
    let vivo = true;
    fnTrazabilidadNormativa(id).then((r) => vivo && setTraz(r));
    vEquivalenciaPimus(id).then((r) => vivo && setEquiv(r));
    fnCapasDeIndicador(id).then((r) => vivo && setCapas(r));
    return () => {
      vivo = false;
    };
  }, [id]);

  const ind = catalogo.indicadores.get(id);
  if (!ind) return null;
  const serie = catalogo.serie.get(id) ?? [];
  const lb = { linea_base: ind.linea_base, anio_linea_base: ind.anio_linea_base };

  return (
    <div className="ficha-indicador" role="dialog" aria-label={ind.nombre}>
      <div className="panel-detalle-header">
        <div>
          <span className="panel-detalle-sup">{ind.id} · {ind.clave} · {ind.nivel_mir}</span>
          <h3>{ind.nombre}</h3>
        </div>
        <button className="panel-detalle-cerrar" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
      </div>
      <div className="panel-detalle-cuerpo">
        <div className="dato"><span className="dato-etiqueta">Variable</span><span className="dato-valor">{ind.variable}</span></div>
        <div className="dato"><span className="dato-etiqueta">Meta</span><span className="dato-valor">{ind.meta ?? '—'}{ind.valor_meta != null ? ` (valor meta: ${ind.valor_meta})` : ''}</span></div>
        <div className="dato"><span className="dato-etiqueta">Tendencia · línea base</span><span className="dato-valor">{ind.tendencia ?? 'Sin definir'} · {lb.linea_base != null ? `${lb.linea_base}${lb.anio_linea_base ? ` (${lb.anio_linea_base})` : ''}` : 'sin línea base'}</span></div>
        <div className="dato"><span className="dato-etiqueta">Criterios SMART</span>
          <span className="dato-valor">Medible {ind.smart_medible ? '✓' : '✗'} · Alcanzable {ind.smart_alcanzable ? '✓' : '✗'} · Temporal {ind.smart_temporal ? '✓' : '✗'} · Ficha {ind.estatus_aprobado ? 'aprobada' : 'pendiente de aprobación'}</span>
        </div>

        {traz && (
          <div className="dato">
            <span className="dato-etiqueta">Trazabilidad normativa (F01)</span>
            <span className="dato-valor">Eje principal {traz.eje?.numero_eje}. {traz.eje?.nombre}</span>
            {(catalogo.ejesDe.get(id) ?? []).length > 1 && <span className="dato-valor">También atiende: {catalogo.ejesDe.get(id).filter((n) => n !== traz.eje?.numero_eje).map((n) => `Eje ${n}`).join(', ')}</span>}
            <span className="dato-valor">Sector: {traz.sector?.nombre} ({traz.sector?.id})</span>
            <span className="dato-valor">Fuente: {traz.fuente?.nombre}</span>
          </div>
        )}

        <div className="dato">
          <span className="dato-etiqueta">Instrumentos y equivalencia PIMUS (F15)</span>
          <table className="tabla-sesim">
            <thead><tr><th>Instrumento</th><th>Vínculo</th><th>Cómo lo nombra</th></tr></thead>
            <tbody>
              {equiv.map((e, i) => (
                <tr key={i}>
                  <td><strong>{e.instrumento?.clave}</strong></td>
                  <td>{e.correspondencia}</td>
                  <td>{e.matriz ? <>{e.matriz.indicador_origen} <small>({e.matriz.clave_oe ?? 's/c'}{e.matriz.tendencia ? ` · ${e.matriz.tendencia}` : ''})</small></> : 'Indicador de origen de la EEMSV'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dato">
          <span className="dato-etiqueta">Capas que lo ilustran (F06) · {capas.length}</span>
          {capas.length > 0 && (
            <Link className="btn-base btn-primary" style={{ width: 'auto', alignSelf: 'flex-start', margin: '4px 0', textDecoration: 'none' }} to={`/geovisor?indicador=${ind.id}`}>
              <MapIcon size={15} /> Ver en el geovisor
            </Link>
          )}
          <ul className="capa-modal-lista" style={{ listStyle: 'none', padding: 0, maxHeight: 180, overflowY: 'auto' }}>
            {capas.map((c) => (
              <li key={c.id}><Link to={`/geovisor?capa=${c.id}`}><strong style={{ color: 'var(--c-guinda)' }}>{c.id}</strong> {c.titulo}</Link></li>
            ))}
          </ul>
        </div>

        <div className="dato">
          <span className="dato-etiqueta">Serie publicada (F02) y semáforo (F04)</span>
          {serie.length === 0 && <span className="text-muted">Aún no hay mediciones publicadas.</span>}
          {serie.length > 0 && (
            <table className="tabla-sesim">
              <thead><tr><th>Periodo</th><th>Unidad</th><th>Valor</th><th>Semáforo</th></tr></thead>
              <tbody>
                {serie.map((m) => (
                  <tr key={m.id}>
                    <td>{m.periodo?.etiqueta}</td>
                    <td>{catalogo.unidades.get(m.id_unidad)?.nom_mun ?? m.id_unidad}{m.id_unidad.length > 5 ? ` · ${catalogo.unidades.get(m.id_unidad)?.nom_loc}` : ''}</td>
                    <td>{m.valor ?? m.valor_texto}</td>
                    <td><Semaforo estado={fnSemaforo({ valor: m.valor, linea_base: lb.linea_base, valor_meta: ind.valor_meta, tendencia: ind.tendencia })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MonitoreoIndicadores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { datos, error } = useCatalogo(['indicador', 'eje_tematico', 'sector', 'fuente_informacion', 'instrumento_origen', 'indicador_instrumento', 'indicador_eje', 'capa_indicador', 'capa', 'periodo', 'medicion_publica', 'unidad_territorial']);
  const [f, setF] = useState({ texto: '', eje: '', instrumento: '', mir: '', aprobados: false });

  const catalogo = useMemo(() => {
    if (!datos) return null;
    const vinculos = new Map();
    for (const v of datos.indicador_instrumento) {
      if (!vinculos.has(v.id_indicador)) vinculos.set(v.id_indicador, []);
      vinculos.get(v.id_indicador).push(v);
    }
    // Solo cuentan las capas publicadas (con sesión la RLS deja ver también las de uso interno y borradores).
    const capasPublicas = new Set(datos.capa.filter((c) => c.estatus === 'vigente_publico').map((c) => c.id));
    const nCapas = new Map();
    for (const v of datos.capa_indicador) if (capasPublicas.has(v.id_capa)) nCapas.set(v.id_indicador, (nCapas.get(v.id_indicador) ?? 0) + 1);
    // Todos los ejes de cada indicador (indicador_eje, 127 vínculos), el principal primero.
    const numeroDeEje = new Map(datos.eje_tematico.map((e) => [e.id, e.numero_eje]));
    const ejesDe = new Map();
    for (const v of datos.indicador_eje) {
      if (!ejesDe.has(v.id_indicador)) ejesDe.set(v.id_indicador, []);
      ejesDe.get(v.id_indicador).push({ n: numeroDeEje.get(v.id_eje), principal: v.principal });
    }
    for (const [k, lista] of ejesDe) ejesDe.set(k, lista.sort((a, b) => Number(b.principal) - Number(a.principal) || a.n - b.n).map((x) => x.n));
    // Mediciones publicadas por indicador, en orden cronológico (F02).
    const periodos = new Map(datos.periodo.map((p) => [p.id, p]));
    const serie = new Map();
    for (const m of datos.medicion_publica) {
      if (!serie.has(m.id_indicador)) serie.set(m.id_indicador, []);
      serie.get(m.id_indicador).push({ ...m, periodo: periodos.get(m.id_periodo) });
    }
    for (const lista of serie.values()) lista.sort((a, b) => (a.periodo?.fecha_inicio ?? '').localeCompare(b.periodo?.fecha_inicio ?? ''));
    return {
      ...datos,
      indicador: datos.indicador.filter((i) => i.activo !== false),
      indicadores: indexar(datos.indicador),
      ejes: indexar(datos.eje_tematico),
      ejesDe,
      serie,
      sectores: indexar(datos.sector),
      instrumentos: indexar(datos.instrumento_origen),
      unidades: indexar(datos.unidad_territorial),
      vinculos,
      nCapas,
    };
  }, [datos]);

  const seleccion = searchParams.get('indicador');
  const abrir = (id) => setSearchParams(id ? { indicador: id } : {});

  const filas = useMemo(() => {
    if (!catalogo) return [];
    const q = f.texto.trim().toLowerCase();
    return catalogo.indicador.filter((i) => {
      if (f.eje && !(catalogo.ejesDe.get(i.id) ?? [numeroDeEjeDe(catalogo, i)]).includes(Number(f.eje))) return false;
      if (f.mir && !String(i.nivel_mir).startsWith(f.mir)) return false;
      if (f.aprobados && !i.estatus_aprobado) return false;
      if (f.instrumento && !(catalogo.vinculos.get(i.id) ?? []).some((v) => v.id_instrumento === f.instrumento)) return false;
      if (q && !`${i.id} ${i.clave} ${i.nombre} ${i.variable}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogo, f]);

  const ultimoSemaforo = (ind) => {
    const serie = catalogo?.serie.get(ind.id) ?? [];
    if (!serie.length) return 'sin dato';
    const m = serie[serie.length - 1];
    return fnSemaforo({ valor: m.valor, linea_base: ind.linea_base, valor_meta: ind.valor_meta, tendencia: ind.tendencia });
  };

  const hora = useMemo(() => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), [datos]);
  const hayFiltros = JSON.stringify(f) !== JSON.stringify(FILTROS_VACIOS);

  // Escape cierra la ficha.
  useEffect(() => {
    if (!seleccion) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') abrir(null); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [seleccion]);

  const kpis = catalogo && [
    { etiqueta: 'Indicadores', valor: catalogo.indicador.length, total: catalogo.indicador.length },
    { etiqueta: 'Fichas aprobadas', valor: catalogo.indicador.filter((i) => i.estatus_aprobado).length, total: catalogo.indicador.length },
    { etiqueta: 'Con mediciones publicadas', valor: catalogo.indicador.filter((i) => catalogo.serie.has(i.id)).length, total: catalogo.indicador.length },
    { etiqueta: 'Con capas en el mapa', valor: catalogo.indicador.filter((i) => catalogo.nCapas.has(i.id)).length, total: catalogo.indicador.length },
  ];
  const porMir = catalogo && Object.fromEntries(NIVELES_MIR.map((n) => [n, catalogo.indicador.filter((i) => String(i.nivel_mir).startsWith(n)).length]));

  return (
    <div className="page-content indicadores-page">
      <header className="mon-hero">
        <div>
          <span className="mon-eyebrow"><i className="mon-pulso" aria-hidden="true" /> <Activity size={13} aria-hidden="true" /> Tablero en vivo</span>
          <h1>Monitoreo de Indicadores</h1>
          <p>Sistema Estatal de Seguimiento a Indicadores de Movilidad y Seguridad Vial</p>
        </div>
        {catalogo && <div className="mon-hero-hora" title="Hora de la última lectura a la base de datos">Última lectura<strong>{hora}</strong></div>}
      </header>

      {error && <p className="indicadores-error" role="alert">No se pudo cargar el catálogo de indicadores: {error}</p>}
      {!catalogo && !error && (
        <div className="mon-esqueleto" aria-busy="true" aria-label="Cargando indicadores">
          <div className="mon-kpis">{[0, 1, 2, 3].map((k) => <span key={k} className="mon-kpi sk" />)}</div>
          {[0, 1, 2, 3, 4, 5].map((k) => <span key={k} className="mon-fila-sk" />)}
        </div>
      )}

      {catalogo && (
        <>
          <section className="mon-kpis" aria-label="Resumen">
            {kpis.map((k) => (
              <div key={k.etiqueta} className="mon-kpi">
                <span className="mon-kpi-etiqueta">{k.etiqueta}</span>
                <strong className="mon-kpi-valor">{k.valor}<small>/{k.total}</small></strong>
                <span className="mon-kpi-barra"><i style={{ width: `${k.total ? (k.valor / k.total) * 100 : 0}%` }} /></span>
              </div>
            ))}
          </section>

          <section className="mon-mir" aria-label="Filtrar por nivel MIR">
            {NIVELES_MIR.map((n) => (
              <button key={n} type="button" className={`mon-mir-chip ${f.mir === n ? 'activa' : ''}`} aria-pressed={f.mir === n} onClick={() => setF({ ...f, mir: f.mir === n ? '' : n })}>
                {n}<b>{porMir[n]}</b>
              </button>
            ))}
          </section>

          <div className="filtros-fila indicadores-filtros mon-filtros">
            <label className="mon-buscar">Buscar
              <span className="capa-buscador"><Search size={14} aria-hidden="true" /><input type="search" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="ID, clave, nombre o variable" /></span>
            </label>
            <label>Eje temático
              <select value={f.eje} onChange={(e) => setF({ ...f, eje: e.target.value })}>
                <option value="">Todos</option>
                {catalogo.eje_tematico.map((e) => <option key={e.id} value={e.numero_eje}>{e.numero_eje}. {e.nombre}</option>)}
              </select>
            </label>
            <label>Instrumento
              <select value={f.instrumento} onChange={(e) => setF({ ...f, instrumento: e.target.value })}>
                <option value="">Todos</option>
                {catalogo.instrumento_origen.map((i) => <option key={i.id} value={i.id}>{i.clave}</option>)}
              </select>
            </label>
            <label className="mon-interruptor">
              <input type="checkbox" checked={f.aprobados} onChange={(e) => setF({ ...f, aprobados: e.target.checked })} />
              <span className="mon-interruptor-pista" aria-hidden="true" /> Solo fichas aprobadas
            </label>
            {hayFiltros && <button type="button" className="mon-limpiar" onClick={() => setF(FILTROS_VACIOS)}>Limpiar filtros</button>}
          </div>

          <p className="indicadores-conteo mon-conteo" aria-live="polite">Mostrando <strong>{filas.length}</strong> de {catalogo.indicador.length} indicadores</p>
          <div className={`indicadores-cuerpo ${seleccion ? 'con-ficha' : ''}`}>
            <div className="indicadores-scroll">
              <table className="indicadores-tabla">
                <thead>
                  <tr>
                    <th>ID</th><th>Indicador</th><th>Eje</th><th>Sector</th><th>Nivel MIR</th><th>Tendencia</th><th>Instrumentos</th><th>Capas</th><th>Semáforo</th><th>Ficha</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <tr className="mon-vacio"><td colSpan={10}>Ningún indicador coincide con los filtros. <button type="button" className="mon-limpiar" onClick={() => setF(FILTROS_VACIOS)}>Limpiar filtros</button></td></tr>
                  )}
                  {filas.map((i) => {
                    const t = TENDENCIA[i.tendencia];
                    const ejes = catalogo.ejesDe.get(i.id) ?? [numeroDeEjeDe(catalogo, i)];
                    const instr = (catalogo.vinculos.get(i.id) ?? []).map((v) => catalogo.instrumentos.get(v.id_instrumento)?.clave.replace('PIMUS-', 'P-')).filter((x, k, a) => x && a.indexOf(x) === k);
                    return (
                      <tr key={i.id} className={`clic ${seleccion === i.id ? 'activa' : ''}`} tabIndex={0} aria-selected={seleccion === i.id} onClick={() => abrir(i.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(i.id); } }}>
                        <td data-label="ID"><code className="mon-id">{i.id}</code></td>
                        <td data-label="Indicador" className="mon-nombre">{i.nombre}</td>
                        <td data-label="Eje">{ejes.map((n, k) => <span key={n} className={`mon-eje ${k === 0 ? 'principal' : ''}`} title={k === 0 ? 'Eje principal' : 'Eje adicional'}>{n}</span>)}</td>
                        <td data-label="Sector">{catalogo.sectores.get(i.id_sector)?.nombre}</td>
                        <td data-label="Nivel MIR"><span className="mon-mir-etiqueta">{String(i.nivel_mir).split(' ')[0]}</span></td>
                        <td data-label="Tendencia">{t ? <span className={`mon-tend ${t.clase}`}>{t.flecha} {i.tendencia}</span> : <span className="mon-nulo">Sin definir</span>}</td>
                        <td data-label="Instrumentos">{instr.length ? instr.map((x) => <span key={x} className="mon-chip">{x}</span>) : <span className="mon-nulo">—</span>}</td>
                        <td data-label="Capas"><span className="mon-num">{catalogo.nCapas.get(i.id) ?? 0}</span></td>
                        <td data-label="Semáforo"><Semaforo estado={ultimoSemaforo(i)} /></td>
                        <td data-label="Ficha"><span className={`mon-ficha ${i.estatus_aprobado ? 'ok' : 'pend'}`}>{i.estatus_aprobado ? 'Aprobada' : 'Pendiente'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {seleccion && <button type="button" className="ficha-fondo" aria-label="Cerrar ficha" onClick={() => abrir(null)} />}
            {seleccion && <FichaIndicador id={seleccion} catalogo={catalogo} onClose={() => abrir(null)} />}
          </div>
        </>
      )}
    </div>
  );
}
