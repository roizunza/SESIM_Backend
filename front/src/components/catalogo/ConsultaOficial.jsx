import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Calendar, MapPin, ExternalLink, X } from 'lucide-react';
import { useCatalogo } from '../../lib/sesim/useCatalogo';
import EstadoCarga, { Esqueleto } from '../plataforma/EstadoCarga';
import CabeceraCatalogo from './CabeceraCatalogo';
import Faceta from './Faceta';

const TABLAS = ['fuente_documental'];
/** Sección del Banco documental → tipo de información. El color de la fila reutiliza la paleta del catálogo (E verde, M beige). */
const TIPOS = {
  estadistica: { texto: 'Estadística', marca: 'E' },
  geoespacial: { texto: 'Geoespacial', marca: 'M' },
};
const ORDEN = ['estadistica', 'geoespacial'];
const tipoDe = (f) => f.tipo_informacion ?? (String(f.seccion_banco ?? '').startsWith('5.2') ? 'geoespacial' : 'estadistica');
// Todos los botones empiezan con «Consultar»: una sola liga → «Consultar en el sitio oficial»; varias → «Consultar» + la primera palabra de su nombre (metadatos, programa…).
const etiquetaEnlace = (f, e) => (f.enlaces.length > 1 ? `Consultar ${String(e.titulo).split(' ')[0].toLowerCase()}` : 'Consultar en el sitio oficial');

export default function ConsultaOficial() {
  const { datos, error } = useCatalogo(TABLAS);
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(() => params.get('q') ?? '');
  const [tipos, setTipos] = useState(() => (params.get('tipo') ?? '').split(',').filter((t) => TIPOS[t]));
  const [panelAbierto, setPanelAbierto] = useState(false);

  // Búsqueda y filtros en la URL (enlaces compartibles); se conserva `vista`.
  useEffect(() => {
    const sig = new URLSearchParams(window.location.search);
    const poner = (k, v) => (v ? sig.set(k, v) : sig.delete(k));
    poner('q', texto.trim());
    poner('tipo', tipos.join(','));
    if (sig.toString() !== window.location.search.replace(/^\?/, '')) setParams(sig, { replace: true });
  }, [texto, tipos, setParams]);

  const fuentes = useMemo(() => (datos ? datos.fuente_documental.map((f) => ({ ...f, tipoInfo: tipoDe(f) })) : null), [datos]);
  const filas = useMemo(() => {
    if (!fuentes) return [];
    const q = texto.trim().toLowerCase();
    return fuentes.filter((f) => {
      if (tipos.length && !tipos.includes(f.tipoInfo)) return false;
      return !q || `${f.clave} ${f.nombre} ${f.uso_sesim ?? ''} ${f.variables ?? ''}`.toLowerCase().includes(q);
    });
  }, [fuentes, texto, tipos]);

  const hayFiltros = texto || tipos.length;
  const limpiar = () => { setTexto(''); setTipos([]); };
  const total = fuentes?.length ?? 0;
  const n = (k) => fuentes?.filter((f) => f.tipoInfo === k).length ?? 0;
  const etiquetas = tipos.map((v) => ({ clave: v, texto: `Tipo: ${TIPOS[v].texto}`, quitar: () => setTipos(tipos.filter((x) => x !== v)) }));
  const opciones = ORDEN.map((k) => ({ valor: k, texto: TIPOS[k].texto, n: n(k) }));

  return (
    <>
      <div className="cat-pagina">
        <div className="catalogo">
          <CabeceraCatalogo vista="consulta">
            {fuentes && (
              <div className="catalogo__escalas catalogo__escalas--dos" role="group" aria-label="Fuentes por tipo de información">
                {ORDEN.map((k) => {
                  const activa = tipos.length === 1 && tipos[0] === k;
                  return (
                    <button key={k} type="button" aria-pressed={activa} data-escala={TIPOS[k].marca} className={`catalogo__escala${activa ? ' on' : ''}`} onClick={() => setTipos(activa ? [] : [k])}>
                      <span className="catalogo__escala-et">{TIPOS[k].texto}</span>
                      <b>{n(k)}</b>
                      <i className="catalogo__escala-barra" aria-hidden="true"><em style={{ width: `${total ? (n(k) / total) * 100 : 0}%` }} /></i>
                    </button>
                  );
                })}
              </div>
            )}
          </CabeceraCatalogo>

          {error && <EstadoCarga estado="error" titulo="No se pudo cargar la consulta oficial" mensaje={error} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />}

          {!error && (
            <div className="catalogo__cuerpo" id="catalogo-panel" role="tabpanel" aria-labelledby="catalogo-tab-consulta">
              <aside className={`catalogo__facetas${panelAbierto ? ' abierto' : ''}`} aria-label="Parámetros de búsqueda">
                <h2><SlidersHorizontal size={16} aria-hidden="true" /> Parámetros de búsqueda
                  {hayFiltros ? <button type="button" className="catalogo__limpiar" onClick={limpiar}>Limpiar</button> : null}
                </h2>
                {!fuentes ? <Esqueleto alto={120} etiqueta="Cargando filtros" /> : (
                  <div className="catalogo__facetas-fila">
                    <Faceta titulo="Tipo de información" marca={(o) => TIPOS[o.valor].marca} opciones={opciones} elegidas={tipos} onCambio={setTipos} />
                  </div>
                )}
                <button type="button" className="catalogo__aplicar" onClick={() => setPanelAbierto(false)}>Ver {filas.length} fuentes</button>
              </aside>

              <div className="catalogo__principal">
                <div className="catalogo__busqueda">
                  <div className="catalogo__busqueda-fila">
                    <label className="catalogo__buscar">
                      <span className="sr-only">Buscar por nombre, clave o uso</span>
                      <Search size={18} aria-hidden="true" />
                      <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, clave o uso (ej. ATUS, DAT-F001, siniestralidad)…" />
                    </label>
                    <button type="button" className="catalogo__filtros-btn" aria-expanded={panelAbierto} onClick={() => setPanelAbierto(true)}>
                      <SlidersHorizontal size={16} aria-hidden="true" /> Filtros{etiquetas.length > 0 && <b>{etiquetas.length}</b>}
                    </button>
                  </div>
                  <p className="catalogo__conteo" aria-live="polite">
                    Mostrando <strong>{filas.length}</strong> de <strong>{total}</strong> fuentes oficiales
                    {hayFiltros ? <button type="button" className="catalogo__limpiar" onClick={limpiar}>Limpiar filtros</button> : null}
                  </p>
                  {etiquetas.length > 0 && (
                    <ul className="catalogo__etiquetas" aria-label="Filtros activos">
                      {etiquetas.map((e) => (
                        <li key={e.clave}><button type="button" onClick={e.quitar} aria-label={`Quitar filtro ${e.texto}`}>{e.texto} <X size={14} aria-hidden="true" /></button></li>
                      ))}
                    </ul>
                  )}
                </div>

                <section className="catalogo__lista" aria-label="Fuentes oficiales de información">
                  {!fuentes && [0, 1, 2, 3].map((k) => <Esqueleto key={k} alto={132} etiqueta="Cargando fuente" />)}
                  {fuentes && filas.length === 0 && (
                    <EstadoCarga estado="vacio" titulo="Sin resultados" mensaje="Ninguna fuente coincide con la búsqueda y los filtros." accion={{ etiqueta: 'Limpiar filtros', onClick: limpiar }} />
                  )}
                  {filas.map((f) => (
                    <article key={f.id} className="instrumento" data-escala={TIPOS[f.tipoInfo].marca}>
                      <div className="instrumento__chips">
                        <span className="chip-tipo">{TIPOS[f.tipoInfo].texto}</span>
                        {f.estatus_documental && <span className="chip-escala">{f.estatus_documental}</span>}
                        <span className="instrumento__clave">{f.clave}</span>
                      </div>
                      <h2 className="instrumento__titulo">{f.nombre}</h2>
                      {f.uso_sesim && <p className="instrumento__publicacion"><span><strong>Uso en el SESIM:</strong> {f.uso_sesim}</span></p>}
                      <div className="instrumento__pie">
                        <ul className="instrumento__meta">
                          {f.cobertura_temporal && <li><Calendar size={15} aria-hidden="true" /> {f.cobertura_temporal.replace(/\.$/, '')}</li>}
                          {f.cobertura_geografica && <li><MapPin size={15} aria-hidden="true" /> {f.cobertura_geografica}</li>}
                        </ul>
                        <div className="instrumento__acciones">
                          {f.enlaces?.map((e, k) => (
                            <a key={e.url} className={`instrumento__doc${k ? '' : ' instrumento__doc--pdf'}`} href={e.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink size={16} aria-hidden="true" /> {etiquetaEnlace(f, e)}<span className="sr-only"> {f.nombre}: {e.titulo} (se abre en una pestaña nueva)</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
