import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, MapPin, Calendar, Landmark, ChevronRight, ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { useFiltros } from '../lib/sesim/filtrosGlobales';
import { useFiltrosEnUrl } from '../lib/sesim/useFiltrosEnUrl';
import Drawer from '../components/plataforma/Drawer';
import EstadoCarga, { Esqueleto } from '../components/plataforma/EstadoCarga';
import FichaInstrumento from '../components/catalogo/FichaInstrumento';
import AvisoLegal from '../components/plataforma/AvisoLegal';
import { publicables, relacionesVerificadas, fmtPublicacion, anioPublicacion } from '../lib/sesim/normativo';
import { urlPdfInstrumento } from '../lib/sesim/api';
import './CatalogoInstrumentos.css';

const TABLAS = ['instrumento_normativo', 'relacion_normativa', 'unidad_territorial'];
const ESCALAS = { F: 'Federal', E: 'Estatal', M: 'Municipal' };
const ORDEN_ESCALAS = ['F', 'E', 'M'];
const MEDIOS = { DOF: 'Diario Oficial de la Federación', POE: 'Periódico Oficial del Estado' };
const FACETAS_VACIAS = { escala: [], tipo: [], medio: [], anio: '' };
const anioDe = anioPublicacion;
const medioDe = (d) => d.publicacion?.medio ?? '';

/** Filtro de la barra horizontal: botón con el número de opciones elegidas y lista desplegable de casillas. */
function Faceta({ titulo, opciones, elegidas, onCambio }) {
  const id = useId();
  const [abierta, setAbierta] = useState(false);
  const raiz = useRef(null);
  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => !raiz.current?.contains(e.target) && setAbierta(false);
    const escape = (e) => e.key === 'Escape' && setAbierta(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierta]);
  return (
    <div className={`faceta${elegidas.length ? ' faceta--activa' : ''}`} ref={raiz}>
      <button type="button" className="faceta__boton" aria-expanded={abierta} aria-controls={id} onClick={() => setAbierta((v) => !v)}>
        {titulo}
        {elegidas.length > 0 && <b aria-label={`${elegidas.length} elegidas`}>{elegidas.length}</b>}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <fieldset id={id} className="faceta__panel" hidden={!abierta}>
        <legend className="sr-only">{titulo}</legend>
        {opciones.map((o) => (
          <label key={o.valor}>
            <input type="checkbox" checked={elegidas.includes(o.valor)} onChange={(e) => onCambio(e.target.checked ? [...elegidas, o.valor] : elegidas.filter((x) => x !== o.valor))} />
            <span>{o.texto}</span>
            <small aria-label={`${o.n} instrumentos`}>{o.n}</small>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** Opciones de una faceta con su conteo; con `orden` se respeta ese orden (p. ej. Federal, Estatal, Municipal), si no, alfabético. */
const contar = (lista, clave, etiquetas, orden = null) =>
  [...lista.reduce((m, d) => m.set(d[clave], (m.get(d[clave]) ?? 0) + 1), new Map())]
    .filter(([v]) => v)
    .map(([valor, n]) => ({ valor, texto: etiquetas?.[valor] ?? valor, n }))
    .sort((a, b) => (orden ? orden.indexOf(a.valor) - orden.indexOf(b.valor) : a.texto.localeCompare(b.texto, 'es')));

export default function CatalogoInstrumentos() {
  const { datos, error } = useCatalogo(TABLAS);
  useFiltrosEnUrl();
  const { filtros, fijar } = useFiltros();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(() => params.get('q') ?? '');
  const [facetas, setFacetas] = useState(() => ({
    escala: (params.get('escala') ?? '').split(',').filter((e) => ORDEN_ESCALAS.includes(e)),
    tipo: (params.get('tipo') ?? '').split('|').filter(Boolean),
    medio: (params.get('medio') ?? '').split(',').filter((m) => MEDIOS[m]),
    anio: params.get('anio') ?? '',
  }));

  // Búsqueda y filtros en la URL (enlaces compartibles y atajos desde el Tablero); la ficha abierta se conserva.
  useEffect(() => {
    const sig = new URLSearchParams(window.location.search);
    const poner = (k, v) => (v ? sig.set(k, v) : sig.delete(k));
    poner('q', texto.trim());
    poner('escala', facetas.escala.join(','));
    poner('tipo', facetas.tipo.join('|'));
    poner('medio', facetas.medio.join(','));
    poner('anio', facetas.anio);
    if (sig.toString() !== window.location.search.replace(/^\?/, '')) setParams(sig, { replace: true });
  }, [texto, facetas, setParams]);

  const indice = useMemo(() => {
    if (!datos) return null;
    const municipios = datos.unidad_territorial.filter((u) => u.nivel === 'municipio').sort((a, b) => a.nom_mun.localeCompare(b.nom_mun, 'es'));
    const normativo = publicables(datos.instrumento_normativo).map((d) => ({ ...d, medio: medioDe(d) }));
    return {
      normativo,
      relaciones: relacionesVerificadas(datos.relacion_normativa),
      municipios,
      nombreMun: new Map(municipios.map((m) => [m.id, m.nom_mun])),
      porId: new Map(normativo.map((d) => [d.id, d])),
      anios: [...new Set(normativo.map(anioDe).filter(Boolean))].sort().reverse(),
    };
  }, [datos]);

  const filas = useMemo(() => {
    if (!indice) return [];
    const q = texto.trim().toLowerCase();
    return indice.normativo.filter((d) => {
      if (filtros.municipio && d.escala === 'M' && d.id_unidad !== filtros.municipio) return false;
      if (facetas.escala.length && !facetas.escala.includes(d.escala)) return false;
      if (facetas.tipo.length && !facetas.tipo.includes(d.tipo)) return false;
      if (facetas.medio.length && !facetas.medio.includes(d.medio)) return false;
      if (facetas.anio && anioDe(d) !== facetas.anio) return false;
      if (q && !`${d.clave} ${d.nombre} ${d.nombre_oficial ?? ''} ${d.tipo ?? ''} ${d.descripcion ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [indice, texto, facetas, filtros.municipio]);

  const fichaId = params.get('ficha');
  const ficha = fichaId ? indice?.porId.get(fichaId) : null;
  const abrir = (id) => setParams(id ? { ficha: id } : {});
  const hayFiltros = texto || filtros.municipio || facetas.escala.length || facetas.tipo.length || facetas.medio.length || facetas.anio;
  const limpiar = () => {
    setTexto('');
    setFacetas(FACETAS_VACIAS);
    fijar('municipio', '');
  };
  const total = indice?.normativo.length ?? 0;
  const etiquetas = [
    ...(filtros.municipio ? [{ clave: 'mun', texto: `Municipio: ${indice?.nombreMun.get(filtros.municipio) ?? ''}`, quitar: () => fijar('municipio', '') }] : []),
    ...facetas.escala.map((v) => ({ clave: `e${v}`, texto: `Escala: ${ESCALAS[v]}`, quitar: () => setFacetas({ ...facetas, escala: facetas.escala.filter((x) => x !== v) }) })),
    ...facetas.tipo.map((v) => ({ clave: `t${v}`, texto: v, quitar: () => setFacetas({ ...facetas, tipo: facetas.tipo.filter((x) => x !== v) }) })),
    ...facetas.medio.map((v) => ({ clave: `m${v}`, texto: v, quitar: () => setFacetas({ ...facetas, medio: facetas.medio.filter((x) => x !== v) }) })),
    ...(facetas.anio ? [{ clave: 'a', texto: `Año ${facetas.anio}`, quitar: () => setFacetas({ ...facetas, anio: '' }) }] : []),
  ];

  return (
    <div className="catalogo">
      <header className="catalogo__cabecera">
        <div>
          <span className="t-etiqueta catalogo__etq">Catálogo</span>
          <h1>Catálogo de instrumentos</h1>
          <p>Consulte los instrumentos de planeación, regulación y normas técnicas que sustentan la movilidad y la seguridad vial en el Estado de Campeche y sus municipios.</p>
        </div>
        {indice && (
          <div className="catalogo__escalas" role="group" aria-label="Instrumentos por escala">
            {ORDEN_ESCALAS.map((k) => {
              const activa = facetas.escala.length === 1 && facetas.escala[0] === k;
              return (
                <button key={k} type="button" aria-pressed={activa} className={`catalogo__escala${activa ? ' on' : ''}`} onClick={() => setFacetas({ ...facetas, escala: activa ? [] : [k] })}>
                  <b>{indice.normativo.filter((d) => d.escala === k).length}</b><span>{ESCALAS[k]}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="catalogo__busqueda">
        <div className="catalogo__busqueda-fila">
          <label className="catalogo__buscar">
            <span className="sr-only">Buscar por denominación o clave</span>
            <Search size={16} aria-hidden="true" />
            <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por denominación o clave (ej. PMDU, DOC-E008)…" />
          </label>
          <label className="catalogo__municipio">
            <span className="sr-only">Municipio</span>
            <select value={filtros.municipio} onChange={(e) => fijar('municipio', e.target.value)} disabled={!indice}>
              <option value="">Todos los municipios</option>
              {indice?.municipios.map((m) => <option key={m.id} value={m.id}>{m.nom_mun}</option>)}
            </select>
          </label>
        </div>
        <AvisoLegal tipo="normativo" compacto />
        <p className="catalogo__conteo" aria-live="polite">
          Mostrando <strong>{filas.length}</strong> de <strong>{total}</strong> instrumentos
          {hayFiltros ? <button type="button" className="catalogo__limpiar" onClick={limpiar}>Limpiar filtros</button> : null}
        </p>
        {etiquetas.length > 0 && (
          <ul className="catalogo__etiquetas" aria-label="Filtros activos">
            {etiquetas.map((e) => (
              <li key={e.clave}><button type="button" onClick={e.quitar} aria-label={`Quitar filtro ${e.texto}`}>{e.texto} <span aria-hidden="true">✕</span></button></li>
            ))}
          </ul>
        )}
      </div>

      {error && <EstadoCarga estado="error" titulo="No se pudo cargar el catálogo" mensaje={error} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />}

      {!error && (
        <div className="catalogo__cuerpo">
          <section className="catalogo__facetas" aria-label="Parámetros de búsqueda">
            <h2><Filter size={16} aria-hidden="true" /> Parámetros de búsqueda</h2>
            {!indice ? (
              <Esqueleto alto={40} etiqueta="Cargando filtros" />
            ) : (
              <div className="catalogo__facetas-fila">
                <Faceta titulo="Escala" opciones={contar(indice.normativo, 'escala', ESCALAS, ORDEN_ESCALAS)} elegidas={facetas.escala} onCambio={(v) => setFacetas({ ...facetas, escala: v })} />
                <Faceta titulo="Tipo de instrumento" opciones={contar(indice.normativo, 'tipo')} elegidas={facetas.tipo} onCambio={(v) => setFacetas({ ...facetas, tipo: v })} />
                <Faceta titulo="Medio de publicación" opciones={contar(indice.normativo, 'medio', MEDIOS)} elegidas={facetas.medio} onCambio={(v) => setFacetas({ ...facetas, medio: v })} />
                <label className="faceta faceta--anio">
                  <span className="sr-only">Año de publicación</span>
                  <select value={facetas.anio} onChange={(e) => setFacetas({ ...facetas, anio: e.target.value })}>
                    <option value="">Año de publicación: todos</option>
                    {indice.anios.map((a) => <option key={a} value={a}>Año {a}</option>)}
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="catalogo__lista" aria-label="Instrumentos">
            {!indice && [0, 1, 2, 3].map((k) => <Esqueleto key={k} alto={118} etiqueta="Cargando instrumento" />)}
            {indice && filas.length === 0 && (
              <EstadoCarga estado="vacio" titulo="Sin resultados" mensaje="Ningún instrumento coincide con la búsqueda y los filtros." accion={{ etiqueta: 'Limpiar filtros', onClick: limpiar }} />
            )}
            {filas.map((d) => (
              <article key={d.id} className="instrumento">
                <div className="instrumento__chips">
                  {d.tipo && <span className={`chip-tipo chip-tipo--${d.escala}`}>{d.tipo}</span>}
                  {d.escala && <span className="chip-escala">{ESCALAS[d.escala]}</span>}
                </div>
                <h2 className="instrumento__titulo">{d.nombre_oficial ?? d.nombre}</h2>
                {(d.publicacion || d.ultima_reforma) && (
                  <p className="instrumento__publicacion">
                    {d.publicacion && <span>Publicación: {fmtPublicacion(d.publicacion, { corto: true })}</span>}
                    {d.ultima_reforma && <span>Última reforma: {fmtPublicacion(d.ultima_reforma, { corto: true })}</span>}
                  </p>
                )}
                <div className="instrumento__pie">
                  <ul className="instrumento__meta">
                    <li><span>Clave:</span> {d.clave}</li>
                    {d.id_unidad && <li><MapPin size={14} aria-hidden="true" /> {indice.nombreMun.get(d.id_unidad)}</li>}
                    {d.fecha_publicacion && <li><Calendar size={14} aria-hidden="true" /> {anioDe(d)}</li>}
                    {d.emisor && <li><Landmark size={14} aria-hidden="true" /> {d.emisor}</li>}
                  </ul>
                  <div className="instrumento__acciones">
                    <button type="button" className="instrumento__ficha" onClick={() => abrir(d.id)}>
                      Ver ficha técnica <ChevronRight size={15} aria-hidden="true" />
                    </button>
                    {d.pdf_ruta && (
                      <a className="instrumento__doc" href={urlPdfInstrumento(d)} target="_blank" rel="noopener noreferrer">
                        <FileText size={14} aria-hidden="true" /> Abrir PDF<span className="sr-only"> de {d.nombre} (se abre en una pestaña nueva)</span>
                      </a>
                    )}
                    {d.url_oficial && (
                      <a className="instrumento__doc" href={d.url_oficial} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} aria-hidden="true" /> Documento oficial<span className="sr-only"> de {d.nombre} (se abre en una pestaña nueva)</span>
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      <Drawer abierto={!!ficha} onCerrar={() => abrir(null)} titulo={ficha?.nombre} subtitulo={ficha ? `Ficha técnica · ${ficha.clave}` : ''}>
        {ficha && (
          <FichaInstrumento
            doc={ficha}
            municipio={ficha.id_unidad ? indice.nombreMun.get(ficha.id_unidad) : null}
            relaciones={indice.relaciones}
            porId={indice.porId}
          />
        )}
      </Drawer>
    </div>
  );
}
