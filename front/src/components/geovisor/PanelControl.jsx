import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Search, X, Lock, MapPin, FileText, ExternalLink } from 'lucide-react';
import { CAPAS_FIJAS, ESTATUS_CAPA } from '../../lib/sesim/capas';
import { EJES_ESTRATEGICOS } from '../../lib/ejesEstrategicos';
import { enlace, RUTAS } from '../../lib/rutas';
import './PanelCapa.css';

const TEMAS = [
  { id: 'mapa_base', etiqueta: 'Mapa base', ayuda: 'Contexto del territorio: límites, localidades, transporte y medio físico.' },
  { id: 'diagnostico', etiqueta: 'Diagnóstico', ayuda: 'Cómo está hoy la movilidad y la seguridad vial.' },
  { id: 'estrategia', etiqueta: 'Estrategias', ayuda: 'Lo que propone la Estrategia Estatal, eje por eje.' },
];
const NOMBRE_CAT = { mapa_base: 'Mapa base', diagnostico: 'Diagnóstico', estrategia: 'Estrategias' };

function Sw({ activo, onCambio, etiqueta, disabled }) {
  return (
    <label className="gv-sw" title={etiqueta}>
      <input type="checkbox" checked={activo} disabled={disabled} onChange={() => onCambio()} aria-label={etiqueta} />
      <span className="gv-sw__pista" aria-hidden="true" />
    </label>
  );
}

/** Una capa en «Explorar»: interruptor + nombre; debajo, su clave y el enlace a la ficha. */
function FilaCapa({ capa, activa, onToggle, onFicha }) {
  const fija = CAPAS_FIJAS.has(capa.id);
  return (
    <div className={`gv-fila${activa ? ' gv-fila--on' : ''}`}>
      <Sw activo={activa} disabled={fija} onCambio={onToggle} etiqueta={`${activa ? 'Quitar del mapa' : 'Poner en el mapa'}: ${capa.titulo}`} />
      <div className="gv-fila__txt">
        <span className="gv-fila__nombre">{capa.titulo}</span>
        <span className="gv-fila__meta">
          <span className="capa-id-chip">{capa.id}</span>
          {capa.estatus !== 'vigente_publico' && <span className="capa-borrador-chip">{(ESTATUS_CAPA[capa.estatus] ?? capa.estatus).toLowerCase()}</span>}
          {fija && <span className="gv-fila__fija"><Lock size={12} aria-hidden="true" /> siempre visible</span>}
          <button type="button" className="gv-enlace" onClick={onFicha} aria-label={`Ver la ficha de ${capa.titulo}`}>Ficha ›</button>
        </span>
      </div>
    </div>
  );
}

/** Pestaña «Explorar»: busca y elige capas. El interruptor de cada capa la pone o la quita del mapa. */
function Explorar({ arbol, filtro, setFiltro, activas, toggleCapa, fijarGrupo, abiertos, toggleAbierto, onFicha, coincide, aplicarEstrategia, tema, setTema }) {
  const categoria = arbol.categorias.find((c) => c.id === tema);
  const buscando = !!filtro.trim();
  const planas = useMemo(() => {
    if (!buscando) return [];
    const vistos = new Set();
    const lista = [];
    for (const cat of arbol.categorias) for (const g of cat.grupos) for (const c of g.capas) if (!vistos.has(c.id) && coincide(c)) { vistos.add(c.id); lista.push(c); }
    return lista;
  }, [arbol, buscando, filtro, coincide]); // eslint-disable-line react-hooks/exhaustive-deps

  const estrategiaActiva = (g) => g.capas.length > 0 && g.capas.every((c) => activas.has(c.id));
  const fila = (c) => <FilaCapa key={c.id} capa={c} activa={activas.has(c.id)} onToggle={() => toggleCapa(c.id)} onFicha={() => onFicha(c)} />;

  return (
    <>
      <div className="capa-buscador">
        <Search size={16} aria-hidden="true" />
        <input type="text" placeholder="Buscar capa por nombre o ID (p. ej. Inf09)" aria-label="Buscar capa por nombre o ID" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        {filtro && <button type="button" onClick={() => setFiltro('')} aria-label="Limpiar búsqueda"><X size={14} /></button>}
      </div>

      {buscando ? (
        <div className="gv-lista">
          <p className="gv-etiqueta">Resultados de la búsqueda</p>
          {planas.length === 0 && <p className="gv-nota">Ninguna capa coincide con la búsqueda.</p>}
          {planas.map(fila)}
        </div>
      ) : (
        <>
          <div className="gv-paso">
            <p className="gv-etiqueta">Elige un tema</p>
            <div className="gv-temas" role="tablist" aria-label="Tema de las capas">
              {TEMAS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tema === t.id} className={tema === t.id ? 'activo' : undefined} onClick={() => setTema(t.id)}>{t.etiqueta}</button>
              ))}
            </div>
            <p className="gv-nota">{TEMAS.find((t) => t.id === tema)?.ayuda}</p>
          </div>

          {tema === 'estrategia' && (
            <div className="gv-paso gv-atajos">
              <p className="gv-etiqueta">Atajo: una estrategia completa</p>
              <div className="gv-atajos__rejilla">
                {EJES_ESTRATEGICOS.map((e) => {
                  const grupo = categoria?.grupos.find((g) => g.eje?.id === e.id);
                  if (!grupo) return null;
                  const on = estrategiaActiva(grupo);
                  return (
                    <button key={e.id} type="button" className={`gv-atajo${on ? ' activo' : ''}`} style={{ '--c': e.color }} data-claro={e.id === 'eje2' || e.id === 'eje5' ? 'no' : 'si'} aria-pressed={on} onClick={() => aplicarEstrategia(e.id)}>
                      <b>{e.numero}</b><span>{e.nombreAtajo}</span>
                    </button>
                  );
                })}
              </div>
              <p className="gv-nota">Enciende todas las capas de esa estrategia y apaga las de las demás. Para mezclar, enciende capas sueltas abajo.</p>
            </div>
          )}

          <div className="gv-paso">
            <p className="gv-etiqueta">{tema === 'mapa_base' ? 'Capas' : 'Capas por grupo'}</p>
            <div className="gv-lista">
              {tema === 'mapa_base' && (() => {
                const vistos = new Set();
                const capas = categoria?.grupos.flatMap((g) => g.capas).filter((c) => !vistos.has(c.id) && vistos.add(c.id)) ?? [];
                return capas.map(fila);
              })()}

              {tema !== 'mapa_base' && categoria?.grupos.map((grupo) => {
                const abierto = abiertos.has(grupo.id);
                const ids = grupo.capas.map((c) => c.id).filter((id) => !CAPAS_FIJAS.has(id));
                const nOn = ids.filter((id) => activas.has(id)).length;
                return (
                  <section key={grupo.id} className={`gv-grupo${grupo.eje ? ' gv-grupo--eje' : ''}${nOn ? ' gv-grupo--on' : ''}`} style={grupo.eje ? { '--c': grupo.eje.color } : undefined}>
                    <button type="button" className="gv-grupo__titulo" onClick={() => toggleAbierto(grupo.id)} aria-expanded={abierto}>
                      <span className="gv-grupo__nombre">{grupo.etiqueta}</span>
                      {nOn > 0 && <span className="gv-grupo__on">{nOn} en el mapa</span>}
                      <ChevronDown size={18} aria-hidden="true" style={{ transform: abierto ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    {abierto && (
                      <div className="gv-grupo__capas">
                        <div className="gv-grupo__barra">
                          <button type="button" className="gv-enlace" onClick={() => fijarGrupo(grupo, true)}>Encender todas</button>
                          <button type="button" className="gv-enlace" onClick={() => fijarGrupo(grupo, false)} disabled={nOn === 0}>Apagar todas</button>
                        </div>
                        {grupo.capas.map(fila)}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Tarjeta de una capa encendida: a la izquierda el orden de dibujo; a la derecha, todo lo demás. */
function TarjetaCapa({ capa, opacidad, onOpacidad, onQuitar, onFicha, onSubir, onBajar, zona, asa }) {
  return (
    <article className="gv-tarjeta" style={{ '--c': capa.colorBase }} data-capa={capa.id} {...zona}>
      <div className="gv-tarjeta__orden" role="group" aria-label={`Orden de dibujo de ${capa.titulo}`}>
        <button type="button" onClick={onSubir} aria-label={`Subir ${capa.titulo}: se dibuja encima`} title="Subir (se dibuja encima)"><ChevronUp size={16} /></button>
        <span className="gv-tarjeta__asa" {...asa} title="Arrastra para cambiar el orden"><GripVertical size={16} aria-hidden="true" /></span>
        <button type="button" onClick={onBajar} aria-label={`Bajar ${capa.titulo}: se dibuja debajo`} title="Bajar (se dibuja debajo)"><ChevronDown size={16} /></button>
      </div>
      <div className="gv-tarjeta__main">
        <header className="gv-tarjeta__cab">
          <div className="gv-tarjeta__nombre">
            <span>{capa.titulo}</span>
            <span className="capa-id-chip">{capa.id}</span>
          </div>
          <button type="button" className="gv-tarjeta__quitar" onClick={onQuitar} aria-label={`Quitar ${capa.titulo} del mapa`} title="Quitar del mapa"><X size={16} /></button>
        </header>
        <label className="gv-trans">
          <span>Transparencia</span>
          <input type="range" min="0" max="1" step="0.05" value={1 - opacidad} onChange={(e) => onOpacidad(1 - Number(e.target.value))} aria-label={`Transparencia de ${capa.titulo}`} />
          <b>{Math.round((1 - opacidad) * 100)}%</b>
        </label>
        <div className="gv-tarjeta__acciones">
          <button type="button" className="gv-btn" onClick={onFicha}><FileText size={15} aria-hidden="true" /> Ficha</button>
        </div>
      </div>
    </article>
  );
}

/** Pestaña «En el mapa»: lo que está encendido, por categoría. */
function EnElMapa({ activasOrdenadas, ordenDibujo, moverCapa, reordenar, getOpacidad, setOpacidad, setOpacidadCategoria, quitarCapa, quitarTodas, onFicha, setPestana }) {
  const [mapaBaseAbierto, setMapaBaseAbierto] = useState(false);
  const arriba = useMemo(() => [...ordenDibujo].reverse().map((id) => activasOrdenadas.find((c) => c.id === id)).filter(Boolean), [ordenDibujo, activasOrdenadas]);
  const [arrastrando, setArrastrando] = useState(null);
  const sinTematicas = !arriba.some((c) => c.categoria !== 'mapa_base');

  const instrumentos = useMemo(() => {
    const m = new Map();
    activasOrdenadas.filter((c) => c.instrumento).forEach((c) => m.set(c.instrumento.id, c.instrumento));
    return [...m.values()];
  }, [activasOrdenadas]);
  const instituciones = useMemo(() => {
    const m = new Map();
    activasOrdenadas.forEach((c) => {
      const nombre = c.instrumento?.competencia ?? c.metadatos_extra?.contacto_custodio;
      if (nombre) m.set(nombre, nombre);
    });
    return [...m.values()];
  }, [activasOrdenadas]);

  const tarjeta = (c) => (
    <TarjetaCapa
      key={c.id}
      capa={c}
      opacidad={getOpacidad(c.id)}
      onOpacidad={(v) => setOpacidad(c.id, v)}
      onQuitar={() => quitarCapa(c.id)}
      onFicha={() => onFicha(c)}
      onSubir={() => moverCapa(c.id, 1, c.categoria)}
      onBajar={() => moverCapa(c.id, -1, c.categoria)}
      asa={{ draggable: true, onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; setArrastrando(c.id); }, onDragEnd: () => setArrastrando(null) }}
      zona={{
        onDragOver: (e) => e.preventDefault(),
        onDrop: () => { if (arrastrando && arrastrando !== c.id) reordenar(arrastrando, c.id); setArrastrando(null); },
      }}
    />
  );

  const base = arriba.filter((c) => c.categoria === 'mapa_base');
  return (
    <>
      <div className="gv-ayuda">
        <p className="gv-nota">Lo que está arriba se dibuja encima. Cambia el orden con las flechas o arrastrando el asa de la izquierda.</p>
        <button type="button" className="gv-enlace" onClick={quitarTodas}>Quitar todas las capas</button>
      </div>

      {sinTematicas && (
        <div className="gv-vacio">
          <p className="gv-nota">Aún no hay capas de diagnóstico ni de estrategias en el mapa.</p>
          <button type="button" className="gv-btn" onClick={() => setPestana('explorar')}>Ir a Explorar</button>
        </div>
      )}

      {['diagnostico', 'estrategia'].map((cat) => {
        const lista = arriba.filter((c) => c.categoria === cat);
        if (!lista.length) return null;
        return (
          <section key={cat} className="gv-seccion">
            <h4 className="gv-etiqueta">{NOMBRE_CAT[cat]}</h4>
            {lista.map(tarjeta)}
          </section>
        );
      })}

      {base.length > 0 && (
        <section className="gv-seccion">
          <h4 className="gv-etiqueta">Mapa base</h4>
          <div className="gv-base">
            <button type="button" className="gv-base__cab" aria-expanded={mapaBaseAbierto} onClick={() => setMapaBaseAbierto((v) => !v)}>
              <span>Límites, localidades, red de transportes y demás capas de contexto</span>
              <ChevronDown size={18} aria-hidden="true" style={{ transform: mapaBaseAbierto ? 'rotate(180deg)' : 'none' }} />
            </button>
            <label className="gv-trans">
              <span>Transparencia</span>
              <input type="range" min="0" max="1" step="0.05" value={1 - getOpacidad(base[0].id)} onChange={(e) => setOpacidadCategoria('mapa_base', 1 - Number(e.target.value))} aria-label="Transparencia de todo el mapa base" />
              <b>{Math.round((1 - getOpacidad(base[0].id)) * 100)}%</b>
            </label>
            {mapaBaseAbierto && (
              <ul className="gv-base__lista">
                {base.map((c) => (
                  <li key={c.id}>
                    <span className="gv-base__nombre">{c.titulo} <span className="capa-id-chip">{c.id}</span></span>
                    {CAPAS_FIJAS.has(c.id)
                      ? <span className="gv-fila__fija"><Lock size={12} aria-hidden="true" /> siempre visible</span>
                      : <button type="button" className="gv-tarjeta__quitar" onClick={() => quitarCapa(c.id)} aria-label={`Quitar ${c.titulo} del mapa`} title="Quitar del mapa"><X size={16} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {(instrumentos.length > 0 || instituciones.length > 0) && (
        <section className="gv-quien">
          <h4 className="gv-etiqueta">Quién publica lo que ves</h4>
          {instrumentos.length > 0 && (
            <p><b>Instrumentos de origen</b>{' '}
              {instrumentos.map((i, k) => (
                <span key={i.id}>{k > 0 && ' · '}<a href={enlace.fichaInstrumento(i.id)} className="gv-enlace">{i.clave ?? i.nombre} <ExternalLink size={12} aria-hidden="true" /></a></span>
              ))}
            </p>
          )}
          {instituciones.length > 0 && (
            <p><b>Instituciones responsables</b>{' '}
              {instituciones.map((n, k) => (
                <span key={n}>{k > 0 && ' · '}<a href={RUTAS.catalogo} className="gv-enlace">{n} <ExternalLink size={12} aria-hidden="true" /></a></span>
              ))}
            </p>
          )}
        </section>
      )}
    </>
  );
}

/**
 * Control de capas del geovisor público: «Explorar» (qué capas hay) y «En el mapa» (cómo se ven las
 * encendidas), con la escala de consulta fija al pie.
 */
export default function PanelControl(props) {
  const { pestana, setPestana, nActivas, municipios, municipio, fijar, indicadorFoco, limpiarIndicador, errorCarga, arbol } = props;
  const nombreMun = municipios.find((m) => m.id === municipio)?.nom_mun;
  return (
    <div className="gv-panel">
      <h3 className="gv-panel__titulo">Control de capas</h3>
      <div className="gv-pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === 'explorar'} className={pestana === 'explorar' ? 'activo' : undefined} onClick={() => setPestana('explorar')}>Explorar</button>
        <button type="button" role="tab" aria-selected={pestana === 'mapa'} className={pestana === 'mapa' ? 'activo' : undefined} onClick={() => setPestana('mapa')}>
          En el mapa <span className="gv-insignia">{nActivas}</span>
        </button>
      </div>

      <div className="gv-panel__cuerpo" role="tabpanel">
        {indicadorFoco && (
          <div className="indicador-foco">
            <div>
              <span className="indicador-foco-titulo">Capas del indicador {indicadorFoco.indicador.id}</span>
              <span className="indicador-foco-nombre">{indicadorFoco.indicador.nombre}</span>
              <span className="indicador-foco-n">{indicadorFoco.n} capa(s)</span>
            </div>
            <button type="button" onClick={limpiarIndicador} aria-label="Quitar filtro de indicador"><X size={14} /></button>
          </div>
        )}
        {errorCarga && <p className="gv-nota">No se pudo cargar el catálogo de capas: {errorCarga}</p>}
        {!arbol && !errorCarga && <p className="gv-nota">Cargando…</p>}
        {arbol && pestana === 'explorar' && <Explorar {...props} />}
        {arbol && pestana === 'mapa' && <EnElMapa {...props} />}
      </div>

      <div className="gv-escala capa-filtros-generales">
        <label htmlFor="geovisor-escala" className="gv-etiqueta">Escala de consulta</label>
        <label className="capa-municipio">
          <MapPin size={16} aria-hidden="true" />
          <select id="geovisor-escala" aria-describedby="geovisor-escala-ayuda" value={municipio} onChange={(e) => fijar('municipio', e.target.value)} disabled={!municipios.length}>
            <option value="">Todo el estado</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nom_mun}</option>)}
          </select>
        </label>
        {municipio ? (
          <>
            <span className="gv-chip-mun"><MapPin size={14} aria-hidden="true" /> {nombreMun}
              <button type="button" onClick={() => fijar('municipio', '')} aria-label="Volver a todo el estado"><X size={14} /></button>
            </span>
            <p id="geovisor-escala-ayuda" className="gv-nota">Se ven solo los elementos de este municipio y lo demás se atenúa.</p>
          </>
        ) : (
          <p id="geovisor-escala-ayuda" className="gv-nota">Elija «Todo el estado» para ver las capas completas o un municipio para ver solo sus elementos y acercar el mapa a él.</p>
        )}
      </div>
    </div>
  );
}
