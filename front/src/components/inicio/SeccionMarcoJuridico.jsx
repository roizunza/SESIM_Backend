import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useCatalogo, useContenido } from '../../lib/sesim/useCatalogo';
import { RUTAS, enlace } from '../../lib/rutas';
import { publicables, fmtPublicacion } from '../../lib/sesim/normativo';
import PiramideNormativa from '../marco/PiramideNormativa';
import EstadoCarga, { Esqueleto } from '../plataforma/EstadoCarga';
import EnlaceInstitucional from '../plataforma/EnlaceInstitucional';
import { fmtNumero } from '../tablero/formato';
import './SeccionMarcoJuridico.css';

const TABLAS = ['instrumento_normativo', 'indicador', 'capa'];

/** Trazabilidad: del instrumento al territorio, seis pasos (cada uno lleva a su módulo). */
const RUTA = [
  { titulo: 'Instrumento', texto: 'Ley, estrategia o programa que origina la obligación', a: RUTAS.catalogo },
  { titulo: 'Estrategia y meta', texto: 'Objetivo y línea de acción documentados', a: RUTAS.indicadores, institucional: true },
  { titulo: 'Indicador', texto: 'Fórmula, línea base, meta y semáforo', a: RUTAS.tablero, institucional: true },
  { titulo: 'Proyecto', texto: 'Responsable, avance y cumplimiento', a: RUTAS.proyectos, institucional: true },
  { titulo: 'Fuente y evidencia', texto: 'Registro oficial, fecha y validación', a: `${RUTAS.proyectos}?pestana=datos`, institucional: true },
  { titulo: 'Territorio', texto: 'Resultado observable en el mapa', a: RUTAS.geovisor },
];

const PESTANAS = [
  { id: 'descripcion', etiqueta: 'Descripción' },
  { id: 'alineacion', etiqueta: 'Alineación normativa' },
  { id: 'documentos', etiqueta: 'Documentos' },
];

const siglas = (nombre) => /\(([^)]+)\)\s*$/.exec(nombre)?.[1] ?? nombre;

/** Cita en línea: «LGMSV, art. 6» enlazada al texto oficial del ordenamiento. */
function Cita({ cita, ordenamientos }) {
  const o = ordenamientos[cita.ordenamiento];
  if (!o) return null;
  return (
    <a className="cita" href={o.url} target="_blank" rel="noopener noreferrer" title={`${o.nombre}. ${o.publicacion ?? ''}`.trim()}>
      {o.sigla}, {cita.articulo}
      <ExternalLink size={11} aria-hidden="true" />
      <span className="sr-only"> ({o.nombre}; se abre en una pestaña nueva)</span>
    </a>
  );
}

function Citas({ citas = [], ordenamientos }) {
  if (!citas.length) return null;
  return (
    <span className="citas">
      ({citas.map((c, k) => (
        <span key={`${c.ordenamiento}-${c.articulo}`}>{k > 0 && '; '}<Cita cita={c} ordenamientos={ordenamientos} /></span>
      ))})
    </span>
  );
}

/** «¿A quién se alinea?» / «¿A quién orienta?»: cada instrumento es un acordeón con su enunciado y fundamento. */
function BloqueVinculos({ pregunta, etiqueta, flecha, items = [], ordenamientos, abiertoInicial = false }) {
  const base = useId();
  const [abierto, setAbierto] = useState(abiertoInicial ? 0 : -1);
  if (!items.length) return null;
  return (
    <section className="mj-vinc">
      <h4>{pregunta}</h4>
      <p className="mj-vinc__etiqueta"><span aria-hidden="true">{flecha}</span> {etiqueta}</p>
      <ul>
        {items.map((it, k) => {
          const nombre = it.con ?? siglas(ordenamientos[it.ordenamiento]?.nombre ?? '');
          const abierta = abierto === k;
          return (
            <li key={`${it.ordenamiento}-${it.articulo}-${it.texto.slice(0, 24)}`} className={`mj-vinc__item${abierta ? ' mj-vinc__item--abierto' : ''}`}>
              <button type="button" className="mj-vinc__nombre" aria-expanded={abierta} aria-controls={`${base}-${k}`} onClick={() => setAbierto(abierta ? -1 : k)}>
                <span>{nombre}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div id={`${base}-${k}`} className="mj-vinc__detalle" role="region" aria-label={nombre}>
                <p>{it.texto} <Citas citas={[it]} ordenamientos={ordenamientos} /></p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Sección «Marco jurídico» de Inicio: pirámide con filtro de escala, ficha del peldaño en pestañas y, al pie, la transición hacia la Trazabilidad. */
export default function SeccionMarcoJuridico({ id }) {
  const { datos, error } = useCatalogo(TABLAS);
  const piramide = useContenido('piramide_normativa');
  const [nivel, setNivel] = useState(null);
  const [pestana, setPestana] = useState('descripcion');
  const [filtro, setFiltro] = useState(null);
  const [paso, setPaso] = useState(null);
  const idBase = useId();
  const refsTab = useRef([]);

  const contenido = piramide.datos;
  const indice = useMemo(() => {
    if (!datos || !contenido) return null;
    const publicados = publicables(datos.instrumento_normativo);
    const excluidos = new Set(contenido.tipos_excluidos ?? []);
    const normativo = publicados.filter((d) => !excluidos.has(d.tipo));
    const porNivel = new Map();
    for (const d of normativo) {
      if (!porNivel.has(d.nivel_piramide)) porNivel.set(d.nivel_piramide, []);
      porNivel.get(d.nivel_piramide).push(d);
    }
    return {
      porNivel,
      conteos: new Map([...porNivel].map(([k, v]) => [k, v.length])),
      noms: normativo.filter((d) => d.tipo === 'Norma Oficial Mexicana'),
      enCatalogo: publicados.length,
      indicadores: datos.indicador.filter((i) => i.activo !== false).length,
      capas: datos.capa.filter((c) => c.estatus === 'vigente_publico').length,
    };
  }, [datos, contenido]);

  const niveles = useMemo(() => contenido?.niveles ?? [], [contenido]);
  const ordenamientos = contenido?.ordenamientos ?? {};
  const escalas = contenido?.escalas ?? {};
  const seleccionado = nivel ?? (niveles.some((n) => n.nivel === 4) ? 4 : niveles.at(-1)?.nivel) ?? null;
  const actual = niveles.find((n) => n.nivel === seleccionado);
  const superior = niveles.find((n) => n.nivel === seleccionado + 1);
  const inferior = niveles.find((n) => n.nivel === seleccionado - 1);
  const docs = indice?.porNivel.get(seleccionado) ?? [];
  const fallo = error || piramide.error;
  const ultimo = niveles.length;

  const elegirNivel = (n) => setNivel(n);
  const elegirEscala = (clave) => {
    const nueva = filtro === clave ? null : clave;
    setFiltro(nueva);
    if (nueva && actual?.escala !== nueva) {
      const primero = niveles.find((n) => n.escala === nueva);
      if (primero) setNivel(primero.nivel);
    }
  };
  const teclearPestana = (e, k) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (k + d + PESTANAS.length) % PESTANAS.length;
    setPestana(PESTANAS[j].id);
    refsTab.current[j]?.focus();
  };

  const grupos = useMemo(() => {
    const m = new Map();
    for (const d of docs) {
      const clave = d.tipo ?? 'Documentos';
      if (!m.has(clave)) m.set(clave, []);
      m.get(clave).push(d);
    }
    return [...m];
  }, [docs]);

  const modulos = indice ? [
    { a: RUTAS.inicio, titulo: 'Portal SESIM', texto: 'Inicio del sistema' },
    { a: RUTAS.geovisor, titulo: 'Geovisor de movilidad', texto: `${fmtNumero(indice.capas)} capas publicadas` },
    { a: RUTAS.catalogo, titulo: 'Catálogo de instrumentos', texto: `${fmtNumero(indice.enCatalogo)} instrumentos con documento oficial` },
    { a: RUTAS.tablero, titulo: 'Tablero de seguimiento', texto: `${fmtNumero(indice.indicadores)} indicadores en seguimiento` },
    { a: RUTAS.proyectos, titulo: 'Proyectos y reportes', texto: 'Metas, avance y series históricas', institucional: true },
  ] : [];

  const fundamentaEn = actual ? (actual.fundamenta_en ?? (inferior ? [{ nivel: inferior.nivel, texto: inferior.titulo }] : [])) : [];

  return (
    <section id={id} className="mj" aria-labelledby={`${id}-titulo`}>
      <div className="mj__cuerpo">
        <header className="mj__cab" data-revelar>
          <span className="mj__etiqueta">Marco jurídico</span>
          <h2 id={`${id}-titulo`} className="mj__titulo">Pirámide de instrumentos de planeación</h2>
        </header>

        {actual && (
          <div className="mj__tabs" role="tablist" aria-label="Información del peldaño" data-revelar>
            {PESTANAS.map((t, k) => (
              <button
                key={t.id}
                ref={(el) => { refsTab.current[k] = el; }}
                type="button"
                role="tab"
                id={`${idBase}-t-${t.id}`}
                aria-selected={pestana === t.id}
                aria-controls={`${idBase}-p`}
                tabIndex={pestana === t.id ? 0 : -1}
                className={`mj__tab${pestana === t.id ? ' mj__tab--activa' : ''}`}
                onClick={() => setPestana(t.id)}
                onKeyDown={(e) => teclearPestana(e, k)}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>
        )}

        <div className="mj__izq" data-revelar style={{ '--retardo': '100ms' }}>
          {contenido?.lema && <p className="mj__lema">{contenido.lema.texto}</p>}
          {contenido && (
            <div className="mj__escala" role="group" aria-label="Filtrar la pirámide por escala">
              <span className="mj__escala-rotulo">Escala</span>
              {Object.entries(escalas).map(([k, v]) => (
                <button key={k} type="button" className={`mj__escala-op${filtro === k ? ' mj__escala-op--activa' : ''}`} aria-pressed={filtro === k} onClick={() => elegirEscala(k)}>
                  <span className={`piramide-badge piramide-badge--${k}`} aria-hidden="true">{k}</span> {v}
                </button>
              ))}
            </div>
          )}

          {fallo && <EstadoCarga estado="error" titulo="No se pudo cargar el marco normativo" mensaje={fallo} accion={{ etiqueta: 'Reintentar', onClick: () => window.location.reload() }} />}
          {!fallo && (!indice || !actual) && <Esqueleto alto={480} etiqueta="Cargando la pirámide de instrumentos" />}
          {indice && actual && <PiramideNormativa niveles={niveles} conteos={indice.conteos} escalas={escalas} seleccionado={seleccionado} onSeleccionar={elegirNivel} filtro={filtro} />}
          {contenido?.lema && <p className="mj__fuente">Fuente: <Citas citas={contenido.lema.citas} ordenamientos={ordenamientos} /></p>}
        </div>

        {indice && actual && (
          <div className="mj__tarjeta" data-revelar style={{ '--retardo': '160ms' }}>
            <div className="mj__tarjeta-in" role="tabpanel" id={`${idBase}-p`} aria-labelledby={`${idBase}-t-${pestana}`} aria-live="polite">
              <div key={`${actual.nivel}-${pestana}`} className="mj__cambio">
                <span className="mj__nivel">Escala {escalas[actual.escala]?.toLowerCase()} · Peldaño {String(actual.nivel).padStart(2, '0')} de {String(ultimo).padStart(2, '0')}</span>

                {pestana === 'descripcion' && (
                  <>
                    <h3 className="mj__nombre">{actual.titulo}</h3>
                    {actual.instrumentos?.length ? (
                      <>
                        <ol className="mj__instrumentos">
                          {actual.instrumentos.map((i, k) => (
                            <li key={i.nombre}><span className="mj__instrumentos-n" aria-hidden="true">{k + 1}</span><span><b>{i.nombre}</b><em>{i.detalle}</em></span></li>
                          ))}
                        </ol>
                        <p className="mj__fundamento">Fundamento: <Citas citas={actual.descripcion.citas} ordenamientos={ordenamientos} /></p>
                      </>
                    ) : (
                      <p className="mj__texto">{actual.descripcion.texto} <Citas citas={actual.descripcion.citas} ordenamientos={ordenamientos} /></p>
                    )}
                  </>
                )}

                {pestana === 'alineacion' && (
                  <>
                    <h3 className="mj__nombre">{actual.titulo}</h3>
                    <div className="mj__vinculos">
                      <BloqueVinculos pregunta="¿A quién se alinea?" etiqueta="Concordancia con:" flecha="↑" items={actual.concordancia} ordenamientos={ordenamientos} abiertoInicial />
                      <BloqueVinculos pregunta="¿A quién orienta?" etiqueta="Orienta a:" flecha="↓" items={actual.orientacion} ordenamientos={ordenamientos} />
                    </div>
                  </>
                )}

                {pestana === 'documentos' && (
                  <>
                    <h3 className="mj__nombre">{actual.titulo}{docs.length > 0 && <span className="mj__nombre-n"> · {docs.length} {docs.length === 1 ? 'documento' : 'documentos'}</span>}</h3>
                    {actual.nivel === ultimo ? (
                      <ul className="mj__modulos">
                        {modulos.map(({ a, titulo, texto, institucional }) => {
                          const cuerpo = <><b>{titulo}</b><span>{texto}</span></>;
                          return (
                            <li key={a}>
                              {institucional
                                ? <EnlaceInstitucional to={a} sinAcceso="acceso" className="mj__modulo">{cuerpo}</EnlaceInstitucional>
                                : <Link to={a} className="mj__modulo">{cuerpo}</Link>}
                            </li>
                          );
                        })}
                      </ul>
                    ) : grupos.length ? (
                      grupos.map(([tipo, lista]) => (
                        <div key={tipo} className="mj__grupo">
                          <h4>{tipo} <span>({lista.length})</span></h4>
                          <ul>
                            {lista.map((d) => (
                              <li key={d.id} className="mj__doc">
                                <code>{d.clave}</code>
                                <span className="mj__doc-texto">
                                  <b>{d.nombre_oficial ?? d.nombre}</b>
                                  <em>{d.publicacion ? fmtPublicacion(d.publicacion) : 'Sin publicación registrada'}</em>
                                </span>
                                <span className="mj__doc-enlaces">
                                  {d.url_oficial && <a href={d.url_oficial} target="_blank" rel="noopener noreferrer">Documento oficial<span className="sr-only"> de {d.nombre} (se abre en una pestaña nueva)</span></a>}
                                  <Link to={enlace.fichaInstrumento(d.id)}>Ficha técnica</Link>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <EstadoCarga estado="vacio" mensaje="El banco documental no registra instrumentos publicados en este peldaño." compacto />
                    )}
                  </>
                )}
              </div>
            </div>

            {pestana !== 'documentos' && (
              <div className="mj__pie">
                <div className="mj__pasos">
                  {fundamentaEn.map((f) => (
                    <button key={`${f.nivel}-${f.texto}`} type="button" onClick={() => elegirNivel(f.nivel)}>
                      <i>Se fundamenta en</i>{f.texto}
                    </button>
                  ))}
                  {superior && (
                    <button type="button" onClick={() => elegirNivel(superior.nivel)}>
                      <i>Orienta a</i>{superior.titulo}
                    </button>
                  )}
                </div>
                <button type="button" className="mj__cambiar" onClick={() => setPestana(pestana === 'descripcion' ? 'alineacion' : 'descripcion')}>
                  {pestana === 'descripcion' ? 'Ver alineación' : 'Ver descripción'} →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transición: marco técnico y fuentes, a todo lo ancho, antes de la Trazabilidad */}
      {contenido && (
        <div className="mj__transicion" data-revelar>
          <div className="mj__transicion-cols">
            {indice?.noms.length > 0 && (
              <div className="mj__bloque">
                <h3><span aria-hidden="true" /> Marco técnico transversal</h3>
                <ul>
                  {indice.noms.map((d) => (
                    <li key={d.id}>
                      {d.url_oficial ? (
                        <a href={d.url_oficial} target="_blank" rel="noopener noreferrer" title={`${d.nombre_oficial ?? d.nombre}. ${fmtPublicacion(d.publicacion) ?? ''}`}>
                          {d.nombre}<ExternalLink size={11} aria-hidden="true" /><span className="sr-only"> (DOF; se abre en una pestaña nueva)</span>
                        </a>
                      ) : <span>{d.nombre}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mj__bloque-nota">Aplican a todos los peldaños de la pirámide.</p>
              </div>
            )}
            <div className="mj__bloque">
              <h3><span aria-hidden="true" /> Fuentes oficiales</h3>
              <ul>
                {contenido.portales.map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">{p.nombre}<ExternalLink size={11} aria-hidden="true" /><span className="sr-only"> (se abre en una pestaña nueva)</span></a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mj__elaborado">{contenido.fuente}</p>
          <span className="mj__bajada" aria-hidden="true"><i /></span>
        </div>
      )}

      {/* Trazabilidad */}
      <div className="mj-traza" data-revelar>
        <span className="mj-traza__etiqueta">Marco jurídico · Cómo se sigue cada indicador</span>
        <h2 className="mj-traza__titulo">Trazabilidad<span aria-hidden="true">.</span></h2>
        <p className="mj-traza__sinopsis">Del instrumento al territorio: cada indicador del SESIM puede seguirse paso a paso, desde la norma que lo origina hasta el resultado que se observa en el mapa.</p>
        <ol className="mj-ruta">
          {RUTA.map(({ titulo, texto, a, institucional }, k) => {
            const cuerpo = (
              <>
                <span className="mj-paso__num">{String(k + 1).padStart(2, '0')}</span>
                <span className="mj-paso__titulo">{titulo}</span>
                <span className="mj-paso__texto">{texto}</span>
              </>
            );
            const clase = 'mj-paso__cuerpo';
            return (
              <li
                key={titulo}
                className={`mj-paso ${k % 2 ? 'mj-paso--abajo' : 'mj-paso--arriba'}${paso === k ? ' mj-paso--activo' : ''}`}
                onMouseEnter={() => setPaso(k)}
                onMouseLeave={() => setPaso(null)}
                onFocus={() => setPaso(k)}
                onBlur={() => setPaso(null)}
              >
                <span className="mj-paso__nodo" aria-hidden="true" />
                {institucional
                  ? <EnlaceInstitucional to={a} className={clase}>{cuerpo}</EnlaceInstitucional>
                  : <Link to={a} className={clase}>{cuerpo}</Link>}
              </li>
            );
          })}
        </ol>
        <p className="mj-traza__pie">Pase el cursor, use el teclado o toque un paso para ver su descripción. Cada paso lleva a su módulo.</p>
      </div>
    </section>
  );
}
