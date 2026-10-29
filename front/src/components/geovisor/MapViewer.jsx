import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MapContainer, useMap } from 'react-leaflet';
import { ChevronLeft, ChevronRight, ChevronDown, Layers, Info, Camera, Search, X, BarChart3 } from 'lucide-react';
import html2canvas from 'html2canvas';
import 'leaflet/dist/leaflet.css';
import './MapViewer.css';
import PanelFab from '../perfiles/comun/PanelFab';
import GuiaGeovisor, { BotonGuia } from './GuiaGeovisor';
import { usePanelLateral } from '../../lib/sesim/usePanelLateral';
import { toSwatchSvg } from '../../lib/leafletSymbology';
import { cargarArbolCapas, CAPAS_FIJAS, CAPAS_CON_ETIQUETA, ESTATUS_CAPA } from '../../lib/sesim/capas';
import { fnCapasDeIndicador, tabla } from '../../lib/sesim/api';
import EsriBasemap from './EsriBasemap';
import CapaSesim from './CapaSesim';
import CapaMetadataModal from './CapaMetadataModal';

/**
 * Geovisor público del SESIM.
 *
 * Todo el árbol sale del catálogo `capa` (ver lib/sesim/capas.js): ninguna
 * capa está escrita a mano aquí. Cada capa se identifica por su ID corto
 * (Inf09, DIt01, E2Tpp05…), que es también el nombre de su GeoJSON
 * (`/sesim/capas/<id>.geojson`) y la llave de `capa_indicador`.
 *
 * Rutas (deep-links) que entiende:
 *   /geovisor?estrategia=eje2      aísla las capas de una Estrategia
 *   /geovisor?capa=Inf09           enciende una capa y abre su grupo
 *   /geovisor?indicador=Im18       F06 · enciende las capas que ilustran el indicador
 *
 * `incluirBorrador` (perfiles internos) muestra también las capas de uso interno y en borrador.
 */

const ORDEN_GEOMETRIA = { polygon: 0, line: 1, point: 2 };
const CAMPECHE_BOUNDS = [[13.5, -97.0], [25.0, -83.0]];

const MapInstanceCapture = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => {
    setMapInstance(map);
  }, [map, setMapInstance]);
  return null;
};

const CapaControles = ({ opacidad, onOpacidad, etiqueta }) => (
  <div className="capa-opacidad-fila">
    <span className="capa-opacidad-etiqueta">Modificar transparencia</span>
    <input
      type="range" min="0" max="1" step="0.05" value={opacidad}
      onChange={(e) => onOpacidad(Number(e.target.value))}
      className="capa-opacidad-slider" aria-label={`Opacidad de ${etiqueta}`}
    />
  </div>
);

function Muestra({ entrada }) {
  if (entrada.simbolo) {
    return <span className="capa-legend-swatch" dangerouslySetInnerHTML={{ __html: toSwatchSvg(entrada.simbolo) ?? '' }} />;
  }
  return <span className="capa-legend-swatch-plano" style={{ backgroundColor: entrada.color }} />;
}

/** Pasos de la guía del geovisor público (cada selector apunta a un control real). */
const PASOS_GUIA = [
  { sel: '.capa-buscador', etiqueta: 'Buscar capas', lado: 'der', texto: 'Escribe el nombre o la clave de una capa para encontrarla.' },
  { sel: '.sidebar-section .eje-group-header .switch-container', etiqueta: 'Encender / apagar', lado: 'der', largo: 120, texto: 'El interruptor muestra u oculta todas las capas de la categoría.' },
  { sel: '.sidebar-section .eje-expand-btn', etiqueta: 'Abrir o cerrar la lista', lado: 'der', largo: 60, texto: 'La flecha despliega las capas de la categoría; cada una se enciende por separado.' },
  { sel: '.capa-info-btn', etiqueta: 'Ficha técnica', lado: 'der', largo: 70, texto: 'La “i” abre la ficha con los metadatos de la capa: fuente, escala, fecha y uso.' },
  { sel: '.capa-opacidad-slider', etiqueta: 'Transparencia', lado: 'der', largo: 60, texto: 'Controla qué tan opaca se ve la capa sobre el mapa.' },
  { sel: '.sidebar-toggle-btn', etiqueta: 'Contraer el panel', lado: 'der', largo: 40, texto: 'Oculta el panel para ver más mapa.' },
  { sel: '.leyenda-flotante', etiqueta: 'Simbología', lado: 'arriba', largo: 26, texto: 'Explica los colores y símbolos de las capas encendidas.' },
  { sel: '.map-custom-controls [aria-label="Cambiar mapa base"]', etiqueta: 'Mapa base', lado: 'izq', texto: 'Cambia entre mapa claro y vista satelital.' },
  { sel: '.map-custom-controls [aria-label="Acercar"]', etiqueta: 'Acercar', lado: 'izq', texto: 'Acerca el mapa.' },
  { sel: '.map-custom-controls [aria-label="Alejar"]', etiqueta: 'Alejar', lado: 'izq', texto: 'Aleja el mapa.' },
  { sel: '.map-custom-controls [aria-label^="Descargar"]', etiqueta: 'Descargar capas', lado: 'izq', texto: 'Baja las capas encendidas en formato GeoJSON.' },
  { sel: '.map-custom-controls [aria-label^="Tomar captura"]', etiqueta: 'Descargar imagen', lado: 'izq', texto: 'Guarda una imagen del mapa tal como lo ves.' },
  { sel: '.map-custom-controls [data-guia="boton"]', etiqueta: 'Abrir esta guía', lado: 'izq', texto: 'Vuelve a mostrar esta guía cuando la necesites.' },
];

const MapViewer = ({ incluirBorrador = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mapInstance, setMapInstance] = useState(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [activeBaseLayer, setActiveBaseLayer] = useState('claro');
  const [isSidebarOpen, setIsSidebarOpen, esMovil] = usePanelLateral();

  const [arbol, setArbol] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [activas, setActivas] = useState(() => new Set(CAPAS_FIJAS));
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [opacidadPorCapa, setOpacidadPorCapa] = useState({});
  const [ficha, setFicha] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [indicadorFoco, setIndicadorFoco] = useState(null);

  useEffect(() => {
    cargarArbolCapas({ incluirBorrador })
      .then(setArbol)
      .catch((err) => {
        console.error('Error al cargar el catálogo de capas:', err);
        setErrorCarga(err.message);
      });
  }, [incluirBorrador]);

  const getOpacidad = (id) => opacidadPorCapa[id] ?? 1;
  const setOpacidad = (id, v) => setOpacidadPorCapa((prev) => ({ ...prev, [id]: v }));

  const toggleCapa = (id) => {
    if (CAPAS_FIJAS.has(id)) return;
    setActivas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGrupo = (grupo) => {
    const ids = grupo.capas.map((c) => c.id).filter((id) => !CAPAS_FIJAS.has(id));
    if (ids.length === 0) return;
    const alguna = ids.some((id) => activas.has(id));
    setActivas((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (alguna ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleAbierto = (id) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Abre los grupos que contienen alguna de estas capas. */
  const abrirGruposDe = useCallback(
    (ids) => {
      if (!arbol) return;
      const set = new Set(ids);
      const grupos = [];
      for (const cat of arbol.categorias) for (const g of cat.grupos) if (g.capas.some((c) => set.has(c.id))) grupos.push(g.id);
      setAbiertos(new Set(grupos));
    },
    [arbol],
  );

  // Deep-links: ?estrategia= · ?capa= · ?indicador=
  useEffect(() => {
    if (!arbol) return;
    const estrategia = searchParams.get('estrategia');
    const idCapa = searchParams.get('capa');
    const idIndicador = searchParams.get('indicador');

    if (estrategia) {
      const cat = arbol.categorias.find((c) => c.id === 'estrategia');
      const grupo = cat?.grupos.find((g) => g.eje?.id === estrategia);
      if (grupo) {
        setActivas(new Set([...CAPAS_FIJAS, ...grupo.capas.map((c) => c.id)]));
        setAbiertos(new Set([grupo.id]));
      }
    }
    if (idCapa && arbol.capasPorId.has(idCapa)) {
      setActivas((prev) => new Set([...prev, idCapa]));
      abrirGruposDe([idCapa]);
    }
    if (idIndicador) {
      Promise.all([fnCapasDeIndicador(idIndicador, { soloPublicas: !incluirBorrador }), tabla('indicador')]).then(([capas, inds]) => {
        const ids = capas.map((c) => c.id).filter((id) => arbol.capasPorId.has(id));
        setActivas(new Set([...CAPAS_FIJAS, ...ids]));
        abrirGruposDe(ids);
        setIndicadorFoco({ indicador: inds.find((i) => i.id === idIndicador) ?? { id: idIndicador, nombre: '' }, n: ids.length });
      });
    } else {
      setIndicadorFoco(null);
    }
  }, [searchParams, arbol, abrirGruposDe, incluirBorrador]);

  const limpiarIndicador = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('indicador');
    setSearchParams(next);
    setActivas(new Set(CAPAS_FIJAS));
  };

  // Con capas de Estrategia activas, el Mapa Base GeoJSON se atenúa al 30 %.
  const hayEstrategia = useMemo(() => {
    if (!arbol) return false;
    for (const id of activas) if (arbol.capasPorId.get(id)?.categoria === 'estrategia') return true;
    return false;
  }, [activas, arbol]);

  const capasActivasOrdenadas = useMemo(() => {
    if (!arbol) return [];
    return Array.from(activas)
      .map((id) => arbol.capasPorId.get(id))
      .filter(Boolean)
      .sort((a, b) => (ORDEN_GEOMETRIA[a.geom] ?? 1) - (ORDEN_GEOMETRIA[b.geom] ?? 1));
  }, [activas, arbol]);

  const coincideFiltro = (capa) => {
    if (!filtro.trim()) return true;
    const q = filtro.trim().toLowerCase();
    return capa.id.toLowerCase().includes(q) || capa.titulo.toLowerCase().includes(q) || (capa.conjunto_datos || '').toLowerCase().includes(q);
  };

  // Descarga real: el GeoJSON ligero de cada capa activa (mismos atributos
  // que capa_vector: id, nombre, clasif, cve_mun, id_unidad).
  const handleDownloadActiveLayers = () => {
    capasActivasOrdenadas.forEach((capa, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = capa.geojson;
        a.download = `${capa.id}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 300);
    });
  };

  const handleScreenshot = async () => {
    if (!mapInstance) return;
    try {
      const lienzo = await html2canvas(mapInstance.getContainer(), { useCORS: true, logging: false });
      lienzo.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sesim_captura_mapa_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (error) {
      console.error('Error al generar la captura del mapa:', error);
    }
  };

  return (
    <div className="map-container-wrapper">
      <PanelFab abierto={isSidebarOpen} esMovil={esMovil} onAbrir={() => setIsSidebarOpen(true)} onCerrar={() => setIsSidebarOpen(false)} etiqueta="Capas" />
      <div className={`map-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
        <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title={isSidebarOpen ? 'Contraer panel' : 'Expandir panel'}>
          {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>

        <div className="sidebar-header">
          <Layers size={20} className="header-icon" />
          <h3>Control de Capas</h3>
        </div>

        <div className="capa-buscador">
          <Search size={14} />
          <input type="text" placeholder="Buscar capa por nombre o ID (p. ej. Inf09)" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          {filtro && (
            <button type="button" onClick={() => setFiltro('')} aria-label="Limpiar búsqueda"><X size={12} /></button>
          )}
        </div>

        {indicadorFoco && (
          <div className="indicador-foco">
            <BarChart3 size={14} />
            <div>
              <span className="indicador-foco-titulo">Capas del indicador {indicadorFoco.indicador.id}</span>
              <span className="indicador-foco-nombre">{indicadorFoco.indicador.nombre}</span>
              <span className="indicador-foco-n">
                {indicadorFoco.n} capa(s) ·{' '}
                <Link to={`/monitoreo?indicador=${indicadorFoco.indicador.id}`}>ver ficha</Link>
              </span>
            </div>
            <button type="button" onClick={limpiarIndicador} aria-label="Quitar filtro de indicador"><X size={14} /></button>
          </div>
        )}

        {errorCarga && <p className="text-muted" style={{ padding: '0 16px' }}>No se pudo cargar el catálogo de capas: {errorCarga}</p>}
        {!arbol && !errorCarga && <p className="text-muted" style={{ padding: '0 16px' }}>Cargando…</p>}

        {arbol && arbol.categorias.map((cat) => (
          <div key={cat.id} className="sidebar-section">
            <div className="section-title">
              <Layers size={14} />
              <span>{cat.etiqueta}</span>
            </div>
            <div className="overlay-options">
              {cat.grupos.map((grupo) => {
                const visibles = grupo.capas.filter(coincideFiltro);
                if (visibles.length === 0) return null;
                const ids = grupo.capas.map((c) => c.id);
                const activo = ids.some((id) => activas.has(id));
                const soloFijas = ids.every((id) => CAPAS_FIJAS.has(id));
                const abierto = abiertos.has(grupo.id) || !!filtro.trim();
                return (
                  <div key={grupo.id} className="eje-group">
                    <div className="eje-group-header">
                      <label className="switch-container" title={grupo.etiqueta}>
                        <input type="checkbox" checked={activo} disabled={soloFijas} onChange={() => toggleGrupo(grupo)} />
                        <span className="switch-slider"></span>
                        <span className="switch-label">{grupo.etiqueta}</span>
                      </label>
                      <button type="button" className="eje-expand-btn" onClick={() => toggleAbierto(grupo.id)} aria-label={abierto ? 'Contraer capas' : 'Ver capas'}>
                        <ChevronDown size={14} style={{ transform: abierto ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    </div>

                    {abierto && (
                      <div className="eje-sublayers">
                        {visibles.map((capa) => {
                          const fija = CAPAS_FIJAS.has(capa.id);
                          return (
                            <div key={capa.id} className="capa-fila">
                              <div className="capa-fila-encabezado">
                                <label className="switch-container compact" title={fija ? `${capa.titulo} (siempre encendida)` : capa.titulo}>
                                  <input type="checkbox" checked={activas.has(capa.id)} disabled={fija} onChange={() => toggleCapa(capa.id)} />
                                  <span className="switch-slider"></span>
                                  <span className="switch-label">
                                    {capa.titulo}
                                    <span className="capa-id-chip">{capa.id}</span>
                                    {capa.estatus !== 'vigente_publico' && <span className="capa-borrador-chip">{(ESTATUS_CAPA[capa.estatus] ?? capa.estatus).toLowerCase()}</span>}
                                  </span>
                                </label>
                                <button type="button" className="capa-info-btn" onClick={() => setFicha({ capa })} title="Ver ficha y metadatos" aria-label={`Ver ficha de ${capa.titulo}`}>
                                  <Info size={13} />
                                </button>
                              </div>
                              {activas.has(capa.id) && (
                                <CapaControles etiqueta={capa.titulo} opacidad={getOpacidad(capa.id)} onOpacidad={(v) => setOpacidad(capa.id, v)} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {ficha && <CapaMetadataModal datos={ficha} onClose={() => setFicha(null)} />}

      {capasActivasOrdenadas.length > 0 && (
        <div className="leyenda-flotante">
          <div className="leyenda-flotante-header">Simbología</div>
          <div className="leyenda-flotante-scroll">
            {capasActivasOrdenadas.map((capa) => (
              <div key={capa.id} className="leyenda-flotante-capa">
                <span className="leyenda-flotante-nombre">{capa.titulo} <span className="capa-id-chip">{capa.id}</span></span>
                <div className="capa-legend-muestras">
                  {capa.simbologia.leyenda.slice(0, 14).map((m, i) => (
                    <div key={i} className="capa-legend-muestra">
                      <Muestra entrada={m} />
                      <span className="capa-legend-muestra-label">{m.etiqueta}</span>
                    </div>
                  ))}
                  {capa.simbologia.leyenda.length > 14 && (
                    <span className="capa-legend-muestra-label">… {capa.simbologia.leyenda.length - 14} clases más</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="map-custom-controls">
        <div style={{ position: 'relative' }}>
          <button onClick={() => setSelectorOpen(!selectorOpen)} className="map-ctrl-btn" aria-label="Cambiar mapa base" title="Mapa base">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </button>
          {selectorOpen && (
            <div className="capa-base-popover">
              <h5>CAPA BASE</h5>
              <button onClick={() => { setActiveBaseLayer('claro'); setSelectorOpen(false); }} className={`capa-base-option ${activeBaseLayer === 'claro' ? 'active' : ''}`}>Mapa Claro</button>
              <button onClick={() => { setActiveBaseLayer('satelite'); setSelectorOpen(false); }} className={`capa-base-option ${activeBaseLayer === 'satelite' ? 'active' : ''}`}>Vista Satelital</button>
            </div>
          )}
        </div>

        <div className="map-ctrl-stack">
          <button onClick={() => mapInstance && mapInstance.zoomIn()} className="map-ctrl-btn" aria-label="Acercar" title="Acercar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button onClick={() => mapInstance && mapInstance.zoomOut()} className="map-ctrl-btn" aria-label="Alejar" title="Alejar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button onClick={handleDownloadActiveLayers} className="map-ctrl-btn" aria-label="Descargar capas activas (GeoJSON)" title="Descargar capas activas (GeoJSON)">
            <svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor">
              <path d="M256 0C114.6 0 0 114.6 0 256c0 141.4 114.6 256 256 256s256-114.6 256-256C512 114.6 397.4 0 256 0zM256 362.7c-7.5 0-14.7-3-20-8.3L129.3 247.7c-11-11-11-29 0-40s29-11 40 0l58.7 58.7V117.3c0-15.6 12.7-28.3 28.3-28.3s28.3 12.7 28.3 28.3v149.1l58.7-58.7c11-11 29-11 40 0s11 29 0 40L276 354.3C270.7 359.7 263.5 362.7 256 362.7z" />
            </svg>
          </button>
          <button onClick={handleScreenshot} className="map-ctrl-btn" aria-label="Tomar captura de pantalla del mapa" title="Tomar captura de pantalla">
            <Camera size={16} />
          </button>
          <BotonGuia className="map-ctrl-btn" onClick={() => setGuiaAbierta(true)} />
        </div>
      </div>
      <GuiaGeovisor abierto={guiaAbierta} onCerrar={() => setGuiaAbierta(false)} pasos={PASOS_GUIA} titulo="Cómo usar el geovisor" />

      <MapContainer center={[19.3, -90.5]} zoom={8} minZoom={6} maxBounds={CAMPECHE_BOUNDS} maxBoundsViscosity={0.8} zoomControl={false} className="leaflet-map" preferCanvas={true}>
        <MapInstanceCapture setMapInstance={setMapInstance} />
        <EsriBasemap type={activeBaseLayer} opacity={1} />
        {capasActivasOrdenadas.map((capa) => (
          <CapaSesim
            key={capa.id}
            capa={capa}
            opacidad={getOpacidad(capa.id) * (hayEstrategia && capa.categoria === 'mapa_base' ? 0.3 : 1)}
            conEtiqueta={CAPAS_CON_ETIQUETA.has(capa.id)}
            onSeleccionar={setFicha}
          />
        ))}
      </MapContainer>
    </div>
  );
};

export default MapViewer;
