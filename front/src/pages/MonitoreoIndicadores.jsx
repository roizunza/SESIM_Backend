import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { X, Map as MapIcon, Search } from 'lucide-react';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { indexar, fnTrazabilidadNormativa, vEquivalenciaPimus, fnCapasDeIndicador } from '../lib/sesim/api';
import { useOperacion, vSerieIndicador, lineaBaseDe } from '../lib/sesim/operacion';
import { fnSemaforo, COLORES_SEMAFORO } from '../lib/sesim/semaforo';
import './MonitoreoIndicadores.css';
import '../components/perfiles/comun/Comun.css';

/**
 * Monitoreo público de indicadores (MESO · indicador + MACRO · gobernanza).
 *
 * La tabla sale de `indicador` (113 filas, ID corto Im01/Ee05/Accgir01) con
 * sus dimensiones resueltas por llave: eje_tematico, sector,
 * fuente_informacion y los instrumentos vía indicador_instrumento.
 * Al elegir un indicador se abre su ficha pública:
 *   · F01 fn_trazabilidad_normativa  (¿por qué se mide y con qué respaldo?)
 *   · F15 v_equivalencia_pimus       (cómo lo nombra cada PIMUS)
 *   · F06 fn_capas_de_indicador      (botón «Ver en el geovisor»)
 *   · F02 v_serie_indicador + F04 fn_semaforo (solo mediciones publicadas)
 * Deep-link: /monitoreo?indicador=Im18
 */
function Semaforo({ estado }) {
  return <span className="semaforo-chip"><i style={{ background: COLORES_SEMAFORO[estado] }} />{estado}</span>;
}

function FichaIndicador({ id, catalogo, onClose }) {
  const op = useOperacion();
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
  const serie = vSerieIndicador(id, op);
  const lb = lineaBaseDe(ind, op);

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
        <div className="dato"><span className="dato-etiqueta">Meta</span><span className="dato-valor">{ind.meta ?? '—'}{ind.valor_meta !== null ? ` (valor meta: ${ind.valor_meta})` : ''}</span></div>
        <div className="dato"><span className="dato-etiqueta">Tendencia · línea base</span><span className="dato-valor">{ind.tendencia ?? 'Sin definir'} · {lb.linea_base !== null ? `${lb.linea_base}${lb.anio_linea_base ? ` (${lb.anio_linea_base})` : ''}` : 'sin línea base'}</span></div>
        <div className="dato"><span className="dato-etiqueta">Criterios SMART</span>
          <span className="dato-valor">Medible {ind.smart_medible ? '✓' : '✗'} · Alcanzable {ind.smart_alcanzable ? '✓' : '✗'} · Temporal {ind.smart_temporal ? '✓' : '✗'} · Ficha {ind.estatus_aprobado ? 'aprobada' : 'pendiente de aprobación'}</span>
        </div>

        {traz && (
          <div className="dato">
            <span className="dato-etiqueta">Trazabilidad normativa (F01)</span>
            <span className="dato-valor">Eje {traz.eje?.numero_eje}. {traz.eje?.nombre}</span>
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
  const op = useOperacion();
  const { datos, error } = useCatalogo(['indicador', 'eje_tematico', 'sector', 'fuente_informacion', 'instrumento_origen', 'indicador_instrumento', 'capa_indicador', 'unidad_territorial']);
  const [f, setF] = useState({ texto: '', eje: '', instrumento: '', mir: '', aprobados: false });

  const catalogo = useMemo(() => {
    if (!datos) return null;
    const vinculos = new Map();
    for (const v of datos.indicador_instrumento) {
      if (!vinculos.has(v.id_indicador)) vinculos.set(v.id_indicador, []);
      vinculos.get(v.id_indicador).push(v);
    }
    const nCapas = new Map();
    for (const v of datos.capa_indicador) nCapas.set(v.id_indicador, (nCapas.get(v.id_indicador) ?? 0) + 1);
    return {
      ...datos,
      indicadores: indexar(datos.indicador),
      ejes: indexar(datos.eje_tematico),
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
      if (f.eje && String(i.id_eje) !== f.eje) return false;
      if (f.mir && !String(i.nivel_mir).startsWith(f.mir)) return false;
      if (f.aprobados && !i.estatus_aprobado) return false;
      if (f.instrumento && !(catalogo.vinculos.get(i.id) ?? []).some((v) => v.id_instrumento === f.instrumento)) return false;
      if (q && !`${i.id} ${i.clave} ${i.nombre} ${i.variable}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogo, f]);

  const ultimoSemaforo = (ind) => {
    const serie = vSerieIndicador(ind.id, op);
    if (!serie.length) return 'sin dato';
    const m = serie[serie.length - 1];
    const lb = lineaBaseDe(ind, op);
    return fnSemaforo({ valor: m.valor, linea_base: lb.linea_base, valor_meta: ind.valor_meta, tendencia: ind.tendencia });
  };

  const nivelesMir = ['Fin', 'Propósito', 'Componentes', 'Actividades'];

  return (
    <div className="page-content indicadores-page">
      <h1>Monitoreo de Indicadores</h1>
      <p className="text-muted">Sistema Estatal de Seguimiento a Indicadores de Movilidad y Seguridad Vial</p>

      {error && <p className="indicadores-error">No se pudo cargar el catálogo de indicadores: {error}</p>}
      {!catalogo && !error && <p className="text-muted">Cargando indicadores…</p>}

      {catalogo && (
        <>
          <div className="filtros-fila indicadores-filtros">
            <label>Buscar
              <span className="capa-buscador" style={{ margin: 0 }}><Search size={13} /><input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="ID, clave, nombre o variable" /></span>
            </label>
            <label>Eje temático
              <select value={f.eje} onChange={(e) => setF({ ...f, eje: e.target.value })}>
                <option value="">Todos</option>
                {catalogo.eje_tematico.map((e) => <option key={e.id} value={e.id}>{e.numero_eje}. {e.nombre}</option>)}
              </select>
            </label>
            <label>Instrumento
              <select value={f.instrumento} onChange={(e) => setF({ ...f, instrumento: e.target.value })}>
                <option value="">Todos</option>
                {catalogo.instrumento_origen.map((i) => <option key={i.id} value={i.id}>{i.clave}</option>)}
              </select>
            </label>
            <label>Nivel MIR
              <select value={f.mir} onChange={(e) => setF({ ...f, mir: e.target.value })}>
                <option value="">Todos</option>
                {nivelesMir.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={f.aprobados} onChange={(e) => setF({ ...f, aprobados: e.target.checked })} style={{ minWidth: 0 }} /> Solo fichas aprobadas
            </label>
          </div>

          <p className="indicadores-conteo">{filas.length} de {catalogo.indicador.length} indicadores</p>
          <div className={`indicadores-cuerpo ${seleccion ? 'con-ficha' : ''}`}>
            <div className="indicadores-scroll">
              <table className="indicadores-tabla">
                <thead>
                  <tr>
                    <th>ID</th><th>Indicador</th><th>Eje</th><th>Sector</th><th>Nivel MIR</th><th>Tendencia</th><th>Instrumentos</th><th>Capas</th><th>Semáforo</th><th>Ficha</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((i) => (
                    <tr key={i.id} className={`clic ${seleccion === i.id ? 'activa' : ''}`} onClick={() => abrir(i.id)}>
                      <td><strong>{i.id}</strong></td>
                      <td>{i.nombre}</td>
                      <td>{catalogo.ejes.get(i.id_eje)?.numero_eje}</td>
                      <td>{catalogo.sectores.get(i.id_sector)?.nombre}</td>
                      <td>{String(i.nivel_mir).split(' ')[0]}</td>
                      <td>{i.tendencia ?? '—'}</td>
                      <td>{(catalogo.vinculos.get(i.id) ?? []).map((v) => catalogo.instrumentos.get(v.id_instrumento)?.clave.replace('PIMUS-', 'P-')).filter((x, k, a) => a.indexOf(x) === k).join(', ')}</td>
                      <td>{catalogo.nCapas.get(i.id) ?? 0}</td>
                      <td><Semaforo estado={ultimoSemaforo(i)} /></td>
                      <td>{i.estatus_aprobado ? 'Aprobada' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {seleccion && <FichaIndicador id={seleccion} catalogo={catalogo} onClose={() => abrir(null)} />}
          </div>
        </>
      )}
    </div>
  );
}
