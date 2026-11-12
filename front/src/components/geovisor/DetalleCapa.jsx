import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Crosshair, Download, ExternalLink } from 'lucide-react';
import { fnIndicadoresDeCapa, tabla, indexar } from '../../lib/sesim/api';
import { descargarCapa, ATRIBUTOS_PUBLICOS } from '../../lib/sesim/descargas';
import { ESTATUS_CAPA } from '../../lib/sesim/capas';
import { RUTAS, enlace } from '../../lib/rutas';
import EstadoCarga from '../plataforma/EstadoCarga';

const NOMBRE_CAMPO = { nombre: 'Nombre', clasif: 'Clase', id: 'Identificador' };

function Fila({ k, v }) {
  if (v === null || v === undefined || v === '') return null;
  return <div className="gd-kv"><span>{k}</span><b>{String(v)}</b></div>;
}

function Bloque({ titulo, children }) {
  return <section className="gd-bloque">{titulo && <h4>{titulo}</h4>}{children}</section>;
}

function Texto({ children }) {
  return children ? <p className="gd-p">{children}</p> : null;
}

function palabrasClave(capa) {
  const meta = capa.metadatos_extra ?? {};
  const base = Array.isArray(meta.palabras_clave) ? meta.palabras_clave : String(meta.palabras_clave ?? '').split(/[;,]/);
  const grupos = (capa.grupos_lista ?? []).map((g) => (g.grupo ?? '').replace(/^EEMSV\s+/i, ''));
  return [...new Set([...base, ...grupos, ...(capa.clases ?? []).slice(0, 3)].map((x) => String(x).trim()).filter(Boolean))].slice(0, 8);
}

/**
 * Panel de detalle del geovisor público (cristal, a la derecha, sin velo). Pestañas:
 * Elemento (solo si se tocó un elemento del mapa) · Sinopsis · Ficha técnica · Descarga.
 * `datos` = { capa, propiedades?, geometria? }.
 */
export default function DetalleCapa({ datos, pestanaInicial, onCerrar, onUbicar }) {
  const capa = datos.capa;
  const props = datos.propiedades ?? null;
  const hayElemento = !!props;
  const [pestana, setPestana] = useState(pestanaInicial ?? (hayElemento ? 'elemento' : 'sinopsis'));
  const [indicadores, setIndicadores] = useState(null);
  const [unidad, setUnidad] = useState(null);
  const [proceso, setProceso] = useState(null);
  const [errorDescarga, setErrorDescarga] = useState(null);
  const meta = capa.metadatos_extra ?? {};

  useEffect(() => setPestana(pestanaInicial ?? (props ? 'elemento' : 'sinopsis')), [capa.id, props, pestanaInicial]);

  useEffect(() => {
    const salir = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', salir);
    return () => window.removeEventListener('keydown', salir);
  }, [onCerrar]);

  useEffect(() => {
    let vivo = true;
    setIndicadores(null);
    fnIndicadoresDeCapa(capa.id).then((r) => vivo && setIndicadores(r)).catch(() => vivo && setIndicadores('error'));
    tabla('proceso_capa').then((p) => vivo && setProceso(p.find((x) => x.id_capa === capa.id) ?? null)).catch(() => {});
    return () => { vivo = false; };
  }, [capa.id]);

  useEffect(() => {
    if (!props?.id_unidad) { setUnidad(null); return; }
    tabla('unidad_territorial').then((ut) => setUnidad(indexar(ut).get(props.id_unidad) ?? null)).catch(() => {});
  }, [props?.id_unidad]);

  const pestanas = [
    ...(hayElemento ? [{ id: 'elemento', t: 'Elemento' }] : []),
    { id: 'sinopsis', t: 'Sinopsis' },
    { id: 'ficha', t: 'Ficha técnica' },
    { id: 'descarga', t: 'Descarga' },
  ];
  const eje = (capa.grupos_lista ?? []).map((g) => g.grupo).find((g) => /Eje\s*\d/.test(g ?? ''));
  const numEje = /Eje\s*(\d)/.exec(eje ?? '')?.[1];
  const rutaTablero = numEje ? `${RUTAS.tableroPublico}?estrategia=eje${numEje}` : RUTAS.tableroPublico;

  return (
    <aside className="gd" role="dialog" aria-label={`Detalle de ${capa.titulo}`}>
      <header className="gd__cab">
        <div>
          {pestana === 'elemento' && props?.nombre ? (
            <>
              <h3>{props.nombre}</h3>
              <p className="gd__sub">{capa.titulo} · {capa.id}</p>
            </>
          ) : (
            <>
              <h3>{capa.titulo}</h3>
              <p className="gd__sub">{capa.id}{capa.estatus !== 'vigente_publico' ? ` · ${ESTATUS_CAPA[capa.estatus] ?? capa.estatus}` : ''}</p>
            </>
          )}
        </div>
        <button type="button" className="gd__cerrar" onClick={onCerrar} aria-label="Cerrar el detalle"><X size={20} /></button>
      </header>
      <div className="gd__pestanas" role="tablist">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'activo' : undefined} onClick={() => setPestana(p.id)}>{p.t}</button>
        ))}
      </div>

      <div className="gd__cuerpo" role="tabpanel">
        {pestana === 'elemento' && props && (
          <>
            <Bloque titulo="Elemento">
              <Fila k={NOMBRE_CAMPO.nombre} v={props.nombre} />
              <Fila k={NOMBRE_CAMPO.clasif} v={props.clasif} />
              <Fila k={NOMBRE_CAMPO.id} v={props.id} />
              <Fila k="Unidad territorial" v={unidad ? unidad.nom_mun : props.id_unidad ?? 'Fuera de Campeche'} />
              {datos.geometria && <button type="button" className="gv-btn gd__ubicar" onClick={() => onUbicar(datos)}><Crosshair size={15} aria-hidden="true" /> Ubicar en el mapa</button>}
            </Bloque>
            <Bloque titulo="Sobre esta capa">
              <p className="gd-p"><b>{capa.titulo}</b></p>
              <div className="gd-pills">{palabrasClave(capa).map((k) => <span key={k}>{k}</span>)}</div>
              <button type="button" className="gv-btn" onClick={() => setPestana('ficha')}>Abrir la ficha de la capa ›</button>
            </Bloque>
          </>
        )}

        {pestana === 'sinopsis' && (
          <>
            <Bloque><Texto>{capa.proposito ?? 'Sin sinopsis registrada.'}</Texto></Bloque>
            <Bloque titulo="Responsable">
              <Texto>{capa.responsable}</Texto>
              <Fila k="Contacto" v={meta.contacto_custodio} />
            </Bloque>
            <Bloque titulo="Procedencia temática">
              {capa.instrumento ? <p className="gd-p"><Link className="gv-enlace" to={enlace.fichaInstrumento(capa.instrumento.id)}>{capa.instrumento.nombre} <ExternalLink size={12} aria-hidden="true" /></Link></p> : <Texto>Mapa base</Texto>}
              {eje && <Fila k="Estrategia" v={eje.replace(/^.*›\s*/, '')} />}
            </Bloque>
            <Bloque titulo="Fecha">
              <Fila k="Fecha de corte" v={meta.fecha_corte} />
              <Fila k="Actualización" v={meta.periodicidad} />
            </Bloque>
            {Array.isArray(indicadores) && indicadores.length > 0 && (
              <Bloque titulo="Indicadores">
                <ul className="gd-indicadores">
                  {indicadores.map((i) => (
                    <li key={i.id}><b>{i.id}</b><span>{i.nombre}</span></li>
                  ))}
                </ul>
                <Link className="gv-btn gv-btn--primario gd__tablero" to={rutaTablero}>Explorar información en el Tablero ›</Link>
              </Bloque>
            )}
          </>
        )}

        {pestana === 'ficha' && (
          <>
            <Bloque titulo="Identificación">
              <Fila k="Conjunto de datos" v={capa.conjunto_datos} />
              <Fila k="Código" v={capa.id} />
              {capa.estatus !== 'vigente_publico' && <Fila k="Estatus" v={ESTATUS_CAPA[capa.estatus] ?? capa.estatus} />}
            </Bloque>
            <Bloque titulo="Trazabilidad">
              <Fila k="Fuente" v={meta.fuente_origen} />
              <Fila k="Archivo de origen" v={proceso?.origen ?? capa.archivo} />
              <Fila k="Fecha de corte" v={meta.fecha_corte} />
              <Fila k="Elementos" v={`${Number(proceso?.n_elementos ?? capa.n_elementos).toLocaleString('es-MX')} en la fuente · ${Number(capa.n_elementos).toLocaleString('es-MX')} publicados`} />
              {proceso && <Fila k="Proceso de publicación" v={`Generalización con ${proceso.herramienta}: resolución ${proceso.resolucion_m} m, coordenadas a ${proceso.decimales} decimales.`} />}
            </Bloque>
          </>
        )}

        {pestana === 'descarga' && (
          <>
            <button type="button" className="gv-btn gv-btn--primario" onClick={() => descargarCapa(capa).catch((e) => setErrorDescarga(e.message))}>
              <Download size={16} aria-hidden="true" /> Descargar GeoPackage (.gpkg)
            </button>
            {errorDescarga && <EstadoCarga estado="error" titulo="No se pudo descargar la capa" mensaje={errorDescarga} compacto />}
            <Bloque titulo="Qué incluye el archivo">
              <Fila k="Formato" v="GeoPackage (OGC GPKG), tabla de geometrías" />
              <Fila k="Sistema de referencia" v="WGS 84" />
              <Fila k="Elementos" v={Number(capa.n_elementos).toLocaleString('es-MX')} />
              <Fila k="Campos" v={ATRIBUTOS_PUBLICOS.join(' · ')} />
            </Bloque>
          </>
        )}
      </div>
    </aside>
  );
}
