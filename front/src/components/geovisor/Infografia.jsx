import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import html2canvas from 'html2canvas';
import { Download, Printer, X, ArrowLeft, Image as ImageIcon, Layers } from 'lucide-react';
import EsriBasemap from './EsriBasemap';
import CapaSesim from './CapaSesim';
import MascaraEntidades from './MascaraEntidades';
import CapaPoblacion from './CapaPoblacion';
import EscalaMapa from './EscalaMapa';
import LeyendaMapa from './LeyendaMapa';
import EstadoCarga from '../plataforma/EstadoCarga';
import { CAPAS_FIJAS, CAPAS_MASCARA, CAPAS_POBLACION, CAPAS_CON_ETIQUETA, CATEGORIAS } from '../../lib/sesim/capas';
import { CONFIG_INICIAL } from '../../lib/sesim/estiloCapa';
import { EJES_ESTRATEGICOS } from '../../lib/ejesEstrategicos';
import { fnIndicadoresDeCapa, tablas } from '../../lib/sesim/api';
import { AVISOS } from '../../lib/avisosLegales';
import './Infografia.css';

const EXTENSION_CAMPECHE = [[17.8, -92.5], [20.9, -89.1]];
const CAPAS_BASE = ['Lim02', 'Lim03', 'Lim04'];
const VISTA_ACTUAL = '__vista_actual__';

/** Título de la infografía según la categoría de la capa: diagnóstico y su tema, estrategia y su eje. */
function tituloInfografia(capa) {
  const grupo = capa.grupos_lista?.[0]?.grupo ?? '';
  if (capa.categoria === 'diagnostico') return { etiqueta: 'Diagnóstico', tema: grupo.replace(/^EEMSV\s+/i, '') || capa.titulo };
  if (capa.categoria === 'estrategia') {
    const numero = Number(/Eje\s*(\d+)/.exec(grupo)?.[1]);
    const eje = EJES_ESTRATEGICOS.find((e) => e.numero === numero);
    return eje ? { etiqueta: `Estrategia ${eje.numero}`, tema: eje.tituloCorto.replace(/^\d+\.\s*/, '') } : { etiqueta: 'Estrategia', tema: grupo || capa.titulo };
  }
  return { etiqueta: 'Mapa base', tema: grupo || capa.titulo };
}

function Encuadre({ limites }) {
  const mapa = useMap();
  useEffect(() => {
    mapa.fitBounds(limites, { padding: [12, 12] });
  }, [mapa, limites]);
  return null;
}

function MapaFijo({ capas, limites, configDe, onMapa }) {
  return (
    <MapContainer bounds={limites} zoomSnap={0.25} zoomControl={false} attributionControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false} preferCanvas className="infografia__mapa-leaflet" ref={onMapa}>
      <EsriBasemap type="claro" opacity={1} />
      <Encuadre limites={limites} />
      {capas.map((capa) =>
        CAPAS_MASCARA.has(capa.id) ? (
          <MascaraEntidades key={capa.id} capa={capa} simbologia={configDe(capa.id).simbologia} />
        ) : CAPAS_POBLACION.has(capa.id) ? (
          <CapaPoblacion key={capa.id} capa={capa} simbologia={configDe(capa.id).simbologia} />
        ) : (
          <CapaSesim key={capa.id} capa={capa} config={configDe(capa.id)} conEtiqueta={CAPAS_CON_ETIQUETA.has(capa.id)} />
        ),
      )}
    </MapContainer>
  );
}

function Indicadores({ capas }) {
  const [estado, setEstado] = useState({ cargando: true });
  useEffect(() => {
    let vivo = true;
    Promise.all([Promise.all(capas.map((c) => fnIndicadoresDeCapa(c.id))), tablas(['medicion_publica', 'periodo']).catch(() => null)])
      .then(([listas, med]) => {
        if (!vivo) return;
        const unicos = new Map(listas.flat().map((i) => [i.id, i]));
        const periodos = new Map((med?.periodo ?? []).map((p) => [p.id, p]));
        const resumen = new Map();
        for (const m of med?.medicion_publica ?? []) {
          if (!unicos.has(m.id_indicador)) continue;
          const r = resumen.get(m.id_indicador) ?? { n: 0, ultimo: null };
          r.n += 1;
          const p = periodos.get(m.id_periodo);
          if (p && (!r.ultimo || String(p.fecha_inicio) > String(r.ultimo.fecha_inicio))) r.ultimo = p;
          resumen.set(m.id_indicador, r);
        }
        setEstado({ indicadores: [...unicos.values()].sort((a, b) => a.id.localeCompare(b.id)), resumen, sinMediciones: !med });
      })
      .catch((e) => vivo && setEstado({ error: e.message }));
    return () => {
      vivo = false;
    };
  }, [capas]);

  if (estado.cargando) return <EstadoCarga estado="cargando" mensaje="Cargando indicadores…" compacto />;
  if (estado.error) return <EstadoCarga estado="error" titulo="No se pudieron cargar los indicadores" mensaje={estado.error} compacto />;
  if (!estado.indicadores.length) return <EstadoCarga estado="vacio" mensaje={capas.length > 1 ? 'Las capas encendidas no tienen indicadores asociados en el catálogo (capa_indicador).' : capas.length ? 'Esta capa no tiene indicadores asociados en el catálogo (capa_indicador).' : 'El mapa base no tiene indicadores asociados.'} compacto />;
  return (
    <ol className="infografia__indicadores">
      {estado.indicadores.map((i) => {
        const r = estado.resumen.get(i.id);
        return (
          <li key={i.id}>
            <span className="infografia__ind-cabeza"><b>{i.id}</b>{i.nivel_mir && <small>{i.nivel_mir}</small>}</span>
            <span className="infografia__ind-nombre">{i.nombre}</span>
            {i.meta && <span className="infografia__ind-meta">Meta: {i.meta}</span>}
            <span className="infografia__ind-dato">
              {r ? `${r.n} mediciones publicadas${r.ultimo ? ` · último periodo ${r.ultimo.etiqueta}` : ''}` : 'Sin mediciones publicadas'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Ficha({ capa }) {
  const m = capa.metadatos_extra ?? {};
  const escala = m.denominador_escala ? `1:${Number(m.denominador_escala).toLocaleString('es-MX')}` : m.escala_nominal;
  const filas = [
    ['Identificador', capa.id],
    ['Propósito', capa.proposito],
    ['Responsable', m.contacto_custodio],
    ['Fuente', m.fuente_origen],
    ['Fecha de corte', m.fecha_corte],
    ['Periodicidad', m.periodicidad],
    ['Escala', escala],
    ['Sistema de referencia', m.sistema_coordenadas],
    ['Elementos', capa.n_elementos?.toLocaleString('es-MX')],
    ['Restricción de uso', m.restriccion_uso],
    ['Instrumento de origen', capa.instrumento?.nombre ?? (capa.categoria === 'mapa_base' ? 'Mapa base' : null)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <section className="infografia__ficha">
      <h4>{capa.titulo}</h4>
      <dl>
        {filas.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
        ))}
      </dl>
      {m.linaje && (
        <>
          <h5>Linaje (ISO 19115-1)</h5>
          <p className="infografia__linaje">{m.linaje}</p>
        </>
      )}
    </section>
  );
}

/**
 * Infografía del geovisor: lámina con el mapa base predeterminado y la capa elegida (o la vista actual),
 * título por categoría (Diagnóstico y tema; Estrategia, número y nombre), panel de seguimiento e
 * indicadores asociados (F07 + mediciones publicadas), ficha técnica ISO 19115 con linaje y aviso
 * cartográfico. Se descarga como PNG o se imprime / guarda como PDF.
 */
export default function Infografia({ arbol, activas, limitesActuales, configDe, capturarPantalla, onCerrar }) {
  const [eleccion, setEleccion] = useState(null);
  const [captura, setCaptura] = useState(null);
  const [generando, setGenerando] = useState(false);
  const lamina = useRef(null);
  const [mapaLamina, setMapaLamina] = useState(null);

  const opciones = useMemo(
    () =>
      CATEGORIAS.map((cat) => ({ ...cat, capas: [...arbol.capasPorId.values()].filter((c) => c.categoria === cat.id && !CAPAS_BASE.includes(c.id)).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')) })).filter((c) => c.capas.length),
    [arbol],
  );

  const contenido = useMemo(() => {
    if (!eleccion) return null;
    const base = CAPAS_BASE.map((id) => arbol.capasPorId.get(id)).filter(Boolean);
    if (eleccion === VISTA_ACTUAL) {
      const tematicas = activas.filter((c) => !CAPAS_BASE.includes(c.id) && !CAPAS_FIJAS.has(c.id));
      return {
        etiqueta: 'Captura de pantalla del geovisor',
        tema: tematicas.length === 1 ? tematicas[0].titulo : tematicas.length ? `${tematicas.length} capas encendidas` : 'Mapa base',
        subtitulo: tematicas.length > 1 ? tematicas.map((c) => `${c.titulo} (${c.id})`).join(' · ') : tematicas[0] ? `${tituloInfografia(tematicas[0]).etiqueta} · ${tituloInfografia(tematicas[0]).tema} (${tematicas[0].id})` : '',
        capasMapa: [...activas].sort((a, b) => (CAPAS_MASCARA.has(b.id) ? -1 : 0) - (CAPAS_MASCARA.has(a.id) ? -1 : 0)),
        tematicas,
        limites: limitesActuales ?? EXTENSION_CAMPECHE,
      };
    }
    const capa = arbol.capasPorId.get(eleccion);
    const t = tituloInfografia(capa);
    return { ...t, subtitulo: `${capa.titulo} (${capa.id})`, capasMapa: [...base, capa], tematicas: [capa], limites: EXTENSION_CAMPECHE };
  }, [eleccion, arbol, activas, limitesActuales]);

  useEffect(() => {
    const escape = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onCerrar]);

  const descargar = async () => {
    if (!lamina.current) return;
    setGenerando(true);
    try {
      const lienzo = await html2canvas(lamina.current, { useCORS: true, logging: false, scale: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = lienzo.toDataURL('image/png');
      a.download = `SESIM_infografia_${esCaptura ? 'captura_pantalla' : eleccion}_${new Date().toLocaleDateString('sv-SE')}.png`;
      a.click();
    } finally {
      setGenerando(false);
    }
  };

  const imprimir = () => {
    document.body.classList.add('imprimiendo-infografia');
    const quitar = () => {
      document.body.classList.remove('imprimiendo-infografia');
      window.removeEventListener('afterprint', quitar);
    };
    window.addEventListener('afterprint', quitar);
    window.print();
  };

  const elegirVistaActual = async () => {
    setEleccion(VISTA_ACTUAL);
    setCaptura({ estado: 'cargando' });
    try {
      setCaptura({ estado: 'lista', url: await capturarPantalla() });
    } catch (e) {
      setCaptura({ estado: 'error', mensaje: e.message });
    }
  };

  const esCaptura = eleccion === VISTA_ACTUAL;

  const configLamina = (id) => (eleccion === VISTA_ACTUAL ? configDe?.(id) : null) ?? CONFIG_INICIAL;

  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="infografia-capa" role="dialog" aria-modal="true" aria-label="Infografía del geovisor">
      <div className="infografia-barra">
        {contenido ? (
          <button type="button" onClick={() => setEleccion(null)}><ArrowLeft size={16} aria-hidden="true" /> Elegir otra capa</button>
        ) : (
          <strong>Captura e infografía</strong>
        )}
        <span className="infografia-barra__espacio" />
        {contenido && (
          <>
            <button type="button" onClick={descargar} disabled={generando || (esCaptura && captura?.estado !== 'lista')}><Download size={16} aria-hidden="true" /> {generando ? 'Generando…' : 'Descargar PNG'}</button>
            <button type="button" onClick={imprimir}><Printer size={16} aria-hidden="true" /> Imprimir o guardar PDF</button>
          </>
        )}
        <button type="button" onClick={onCerrar} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
      </div>

      {!contenido ? (
        <div className="infografia-eleccion">
          <button type="button" className="infografia-eleccion__actual" onClick={elegirVistaActual}>
            <ImageIcon size={22} aria-hidden="true" />
            <span><b>Captura de pantalla</b><small>Imagen de toda la pantalla del geovisor con los paneles desplegados, junto con los indicadores, la ficha técnica, los metadatos y el linaje de las {activas.filter((c) => !CAPAS_BASE.includes(c.id)).length} capas encendidas.</small></span>
          </button>
          <h3><Layers size={18} aria-hidden="true" /> Infografía de una capa del sistema</h3>
          <p>Lámina con el mapa base predeterminado y la capa elegida; su título indica el tema del diagnóstico o el número y nombre de la estrategia.</p>
          <div className="infografia-eleccion__grupos">
            {opciones.map((cat) => (
              <section key={cat.id}>
                <h4>{cat.etiqueta}</h4>
                <ul>
                  {cat.capas.map((c) => (
                    <li key={c.id}><button type="button" onClick={() => setEleccion(c.id)}>{c.titulo} <code>{c.id}</code></button></li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="infografia-vista">
          <article className="infografia" ref={lamina}>
            <header className="infografia__cabecera">
              <img src="/gobiernoparatodos.png" alt="Escudo del Estado de Campeche" />
              <img src="/logocampeche.png" alt="Gobierno de Campeche" />
              <div className="infografia__titulos">
                <span className="infografia__etiqueta">{contenido.etiqueta}</span>
                <h2>{contenido.tema}</h2>
                {contenido.subtitulo && <p>{contenido.subtitulo}</p>}
              </div>
              <div className="infografia__sello"><b>SESIM</b><small>Sistema Estatal de Seguimiento de Indicadores de Movilidad y Seguridad Vial</small></div>
            </header>
            {esCaptura && (
              <div className="infografia__captura">
                {captura?.estado === 'cargando' && <EstadoCarga estado="cargando" mensaje="Desplegando los paneles y capturando la pantalla…" />}
                {captura?.estado === 'error' && <EstadoCarga estado="error" titulo="No se pudo capturar la pantalla" mensaje={captura.mensaje} />}
                {captura?.estado === 'lista' && <img src={captura.url} alt={`Captura de pantalla del geovisor: ${contenido.tema}`} />}
              </div>
            )}
            {esCaptura && (
              <section className="infografia__seguimiento infografia__seguimiento--banda">
                <h3>Seguimiento e indicadores</h3>
                <Indicadores capas={contenido.tematicas} />
              </section>
            )}
            {!esCaptura && <div className={`infografia__cuerpo${contenido.tematicas.length > 1 ? ' infografia__cuerpo--ancho' : ''}`}>
              <aside className="infografia__seguimiento">
                <h3>Seguimiento e indicadores</h3>
                <Indicadores capas={contenido.tematicas} />
              </aside>
              <div className="infografia__mapa">
                <MapaFijo capas={contenido.capasMapa} limites={contenido.limites} configDe={configLamina} onMapa={setMapaLamina} />
                {mapaLamina && <EscalaMapa mapa={mapaLamina} />}
                <span className="infografia__norte" aria-label="Norte">N<i /></span>
                {contenido.tematicas.length <= 1 && <div className="infografia__leyenda"><LeyendaMapa capas={contenido.capasMapa} configDe={configLamina} onAlternarCapa={() => {}} onAlternarCategoria={() => {}} /></div>}
              </div>
              {contenido.tematicas.length > 1 && <aside className="infografia__leyenda-columna"><LeyendaMapa capas={contenido.capasMapa} configDe={configLamina} onAlternarCapa={() => {}} onAlternarCategoria={() => {}} /></aside>}
              {contenido.tematicas.length <= 1 && (
                <aside className="infografia__fichas">
                  <h3>Ficha técnica y metadatos</h3>
                  {contenido.tematicas.length ? <Ficha capa={contenido.tematicas[0]} /> : <p className="infografia__nota">Solo mapa base y límites administrativos.</p>}
                </aside>
              )}
            </div>}
            {(esCaptura || contenido.tematicas.length > 1) && contenido.tematicas.length > 0 && (
              <section className="infografia__fichas infografia__fichas--banda">
                <h3>{contenido.tematicas.length > 1 ? 'Ficha técnica y metadatos de las capas encendidas' : 'Ficha técnica y metadatos'}</h3>
                <div className="infografia__fichas-columnas">
                  {contenido.tematicas.map((c) => <Ficha key={c.id} capa={c} />)}
                </div>
              </section>
            )}
            <footer className="infografia__pie">
              <p><b>{AVISOS.cartografico.titulo}.</b> {AVISOS.cartografico.texto}</p>
              <p>Generado el {hoy} desde el Geovisor SESIM Campeche · Mapa base: Esri · Sistema de referencia de visualización: EPSG:3857.</p>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
}
