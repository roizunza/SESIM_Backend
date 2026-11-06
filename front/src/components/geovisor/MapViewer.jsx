import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, useMap } from 'react-leaflet';
import { ChevronLeft, ChevronRight, ChevronDown, Layers, Info, Camera, Search, X, BarChart3, SlidersHorizontal, Maximize2, Minimize2, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './MapViewer.css';
import PanelFab from '../perfiles/comun/PanelFab';
import { BotonGuia } from './GuiaGeovisor';
import RecorridoGeovisor, { recorridoVisto, marcarRecorrido } from './RecorridoGeovisor';
import { usePanelLateral } from '../../lib/sesim/usePanelLateral';
import { cargarArbolCapas, CAPAS_FIJAS, CAPAS_INICIALES, CAPAS_CON_ETIQUETA, CAPAS_MASCARA, CAPAS_POBLACION, ESTATUS_CAPA } from '../../lib/sesim/capas';
import { useFiltros } from '../../lib/sesim/filtrosGlobales';
import { useCatalogo } from '../../lib/sesim/useCatalogo';
import { fnCapasDeIndicador, tabla } from '../../lib/sesim/api';
import EsriBasemap from './EsriBasemap';
import CapaSesim from './CapaSesim';
import CapaMetadataModal from './CapaMetadataModal';
import PanelCapa from './PanelCapa';
import LeyendaMapa from './LeyendaMapa';
import EscalaMapa from './EscalaMapa';
import EtiquetasLocalidades from './EtiquetasLocalidades';
import RealceMunicipio from './RealceMunicipio';
import MascaraEntidades from './MascaraEntidades';
import CapaPoblacion from './CapaPoblacion';
import AvisoLegal from '../plataforma/AvisoLegal';
import EnlaceInstitucional from '../plataforma/EnlaceInstitucional';
import Infografia from './Infografia';
import { descargarCapa } from '../../lib/sesim/descargas';
import html2canvas from 'html2canvas';
import { CONFIG_INICIAL, filtrosActivosCapa } from '../../lib/sesim/estiloCapa';
import { enlace } from '../../lib/rutas';

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

/** Recorrido del geovisor público: cada `sel` apunta a una zona real de la pantalla; si no está a la vista el paso se omite. */
const CLAVE_RECORRIDO = 'sesim.geovisor.recorrido.v1';
const PASOS_RECORRIDO = [
  { id: 'escala', sel: '.capa-filtros-generales', titulo: 'Elige el territorio', texto: 'Empieza por todo el estado o por un municipio: las capas muestran solo sus elementos y el mapa se acerca a él.' },
  { id: 'capas', sel: '.map-sidebar', selMovil: '.map-sidebar', titulo: 'Enciende capas', texto: 'Las capas se agrupan por categoría y estrategia.', items: [
    { marca: '⌕', texto: 'Busca por nombre o clave.' }, { marca: '●', texto: 'El interruptor muestra u oculta toda la categoría.' }, { marca: '▾', texto: 'La flecha despliega sus capas.' }] },
  { id: 'abrir-panel', selMovil: '.panel-fab', titulo: 'Abre el panel de capas', texto: 'Con «Capas» eliges el territorio, buscas y enciendes capas por categoría o estrategia.' },
  { id: 'ficha', sel: '.capa-info-btn', titulo: 'Consulta la ficha', texto: 'La «i» abre la ficha técnica de la capa: fuente, escala, fecha y uso.' },
  { id: 'estilo', sel: '.capa-estilo-btn', titulo: 'Simbología, filtros y atributos', texto: 'Cambia cómo se ve la capa, filtra sus elementos y consulta su tabla de atributos. La transparencia se ajusta con el deslizador de cada capa.' },
  { id: 'leyenda', sel: '.leyenda-flotante', titulo: 'Lee la simbología', texto: 'La leyenda explica los colores; el ojo la oculta sin apagar la capa.' },
  { id: 'controles', sel: '.map-custom-controls', titulo: 'Controles del mapa', texto: 'Cambia el mapa base, acerca o aleja, descarga las capas encendidas en GeoJSON, captura la pantalla o arma la infografía de una capa, y usa pantalla completa.', items: [
    { marca: '?', texto: 'Con el botón «?» vuelves a este recorrido.' }] },
];

const CIFRAS_RECORRIDO = [{ valor: '66', etiqueta: 'capas públicas' }, { valor: '13', etiqueta: 'municipios' }, { valor: '5', etiqueta: 'estrategias' }];

const MapViewer = ({ incluirBorrador = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mapInstance, setMapInstance] = useState(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState(() => !recorridoVisto(CLAVE_RECORRIDO));
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
  const [configPorCapa, setConfigPorCapa] = useState({});
  // Paneles de simbología, filtros y atributos: uno por cada capa de diagnóstico o estrategia
  // encendida (y por las de mapa base que se abran a mano), apilados en el orden en que se encienden.
  const [panelesMapaBase, setPanelesMapaBase] = useState(() => new Set());
  const [panelesContraidos, setPanelesContraidos] = useState(() => new Set());
  const [mapaCompleto, setMapaCompleto] = useState(false);
  const [columnaDerecha, setColumnaDerecha] = useState(true);
  const { filtros, fijar } = useFiltros();
  const municipio = filtros.municipio;
  const { datos: catalogoUT } = useCatalogo(['unidad_territorial']);
  const municipios = useMemo(
    () => (catalogoUT?.unidad_territorial ?? []).filter((u) => u.nivel === 'municipio').sort((a, b) => a.nom_mun.localeCompare(b.nom_mun, 'es')),
    [catalogoUT],
  );

  const configDe = useCallback((id) => configPorCapa[id] ?? CONFIG_INICIAL, [configPorCapa]);
  const fijarConfig = (id, config) => setConfigPorCapa((prev) => ({ ...prev, [id]: config }));
  const alternarSimbologia = (id) => fijarConfig(id, { ...configDe(id), simbologia: !configDe(id).simbologia });

  useEffect(() => {
    cargarArbolCapas({ incluirBorrador })
      .then((a) => {
        setArbol(a);
        setActivas((prev) => new Set([...prev, ...CAPAS_INICIALES.filter((id) => a.capasPorId.has(id))]));
      })
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
    setActivas(new Set([...CAPAS_FIJAS, ...CAPAS_INICIALES.filter((id) => arbol?.capasPorId.has(id))]));
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

  const alternarCategoria = (idCategoria, visible) =>
    setConfigPorCapa((prev) => {
      const next = { ...prev };
      for (const c of capasActivasOrdenadas) if (c.categoria === idCategoria) next[c.id] = { ...(prev[c.id] ?? CONFIG_INICIAL), simbologia: visible };
      return next;
    });

  const coincideFiltro = (capa) => {
    if (!filtro.trim()) return true;
    const q = filtro.trim().toLowerCase();
    return capa.id.toLowerCase().includes(q) || capa.titulo.toLowerCase().includes(q) || (capa.conjunto_datos || '').toLowerCase().includes(q);
  };

  const capasConPanel = useMemo(() => {
    if (!arbol) return [];
    return [...activas]
      .map((id) => arbol.capasPorId.get(id))
      .filter((c) => c && !CAPAS_FIJAS.has(c.id) && (c.categoria !== 'mapa_base' || panelesMapaBase.has(c.id)));
  }, [activas, arbol, panelesMapaBase]);

  const alternarPanel = (id) =>
    setPanelesContraidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Botón de la capa: muestra su panel expandido y lo lleva a la vista (en mapa base lo agrega o lo quita). */
  const mostrarPanel = (capa) => {
    setColumnaDerecha(true);
    if (capa.categoria === 'mapa_base' && panelesMapaBase.has(capa.id)) {
      setPanelesMapaBase((prev) => { const next = new Set(prev); next.delete(capa.id); return next; });
      return;
    }
    if (capa.categoria === 'mapa_base') setPanelesMapaBase((prev) => new Set(prev).add(capa.id));
    setPanelesContraidos((prev) => { const next = new Set(prev); next.delete(capa.id); return next; });
    setTimeout(() => document.querySelector(`.columna-derecha [data-capa="${capa.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  };

  // Descarga de las capas activas: solo «titulo» y los atributos públicos de cada elemento.
  const [errorDescarga, setErrorDescarga] = useState(null);
  const handleDownloadActiveLayers = async () => {
    setErrorDescarga(null);
    try {
      for (const capa of capasActivasOrdenadas) await descargarCapa(capa);
    } catch (e) {
      setErrorDescarga(e.message);
    }
  };

  const [infografia, setInfografia] = useState(false);
  const handleScreenshot = () => setInfografia(true);

  // Captura de toda la pantalla del geovisor: despliega los paneles, espera a que se acomoden y
  // omite el cuadro de la infografía.
  const capturarPantalla = useCallback(async () => {
    setIsSidebarOpen(true);
    setColumnaDerecha(true);
    await new Promise((listo) => setTimeout(listo, 700));
    const lienzo = await html2canvas(document.body, {
      useCORS: true,
      logging: false,
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      ignoreElements: (el) => el.classList?.contains('infografia-capa'),
      // html2canvas no reproduce bien el desplazamiento (transform) de la perilla de los interruptores:
      // en la copia se coloca con `right` y sin transiciones.
      onclone: (doc) => {
        const estilo = doc.createElement('style');
        estilo.textContent = '*{transition:none!important}.switch-container input:checked+.switch-slider:before{transform:none!important;left:auto!important;right:2px}';
        doc.head.appendChild(estilo);
      },
    });
    return lienzo.toDataURL('image/png');
  }, [setIsSidebarOpen]);

  // Mapa a pantalla completa: se ocultan los controles y el encabezado del portal; Escape regresa.
  useEffect(() => {
    document.body.classList.toggle('geovisor-completo', mapaCompleto);
    mapInstance?.invalidateSize();
    if (!mapaCompleto) return undefined;
    const salir = (e) => e.key === 'Escape' && setMapaCompleto(false);
    window.addEventListener('keydown', salir);
    return () => {
      window.removeEventListener('keydown', salir);
      document.body.classList.remove('geovisor-completo');
    };
  }, [mapaCompleto, mapInstance]);

  return (
    <div className={`map-container-wrapper${mapaCompleto ? ' map-container-wrapper--completo' : ''}`}>
      {mapaCompleto && (
        <button type="button" className="mapa-salir-completo" onClick={() => setMapaCompleto(false)}>
          <Minimize2 size={16} aria-hidden="true" /> Mostrar controles
        </button>
      )}
      <PanelFab abierto={isSidebarOpen} esMovil={esMovil} onAbrir={() => setIsSidebarOpen(true)} onCerrar={() => setIsSidebarOpen(false)} etiqueta="Capas" />
      <button
        type="button"
        className={`sidebar-toggle-externo${isSidebarOpen ? '' : ' sidebar-toggle-externo--cerrado'}`}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-expanded={isSidebarOpen}
        aria-label={isSidebarOpen ? 'Contraer el control de capas' : 'Mostrar el control de capas'}
        title={isSidebarOpen ? 'Contraer el control de capas' : 'Mostrar el control de capas'}
      >
        {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
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

        <div className="capa-filtros-generales">
          <label htmlFor="geovisor-escala" className="capa-escala-titulo">Escala de consulta</label>
          <p id="geovisor-escala-ayuda" className="capa-municipio-nota">Elija «Todo el estado» para ver las capas completas o un municipio para ver solo sus elementos y acercar el mapa a él.</p>
          <label className="capa-municipio">
            <MapPin size={14} aria-hidden="true" />
            <select id="geovisor-escala" aria-describedby="geovisor-escala-ayuda" value={municipio} onChange={(e) => fijar('municipio', e.target.value)} disabled={!municipios.length}>
              <option value="">Todo el estado</option>
              {municipios.map((m) => <option key={m.id} value={m.id}>{m.nom_mun}</option>)}
            </select>
          </label>
          {municipio && <p className="capa-municipio-nota">Las capas muestran solo los elementos del municipio; los límites estatal y municipal se conservan.</p>}
        </div>

        {indicadorFoco && (
          <div className="indicador-foco">
            <BarChart3 size={14} />
            <div>
              <span className="indicador-foco-titulo">Capas del indicador {indicadorFoco.indicador.id}</span>
              <span className="indicador-foco-nombre">{indicadorFoco.indicador.nombre}</span>
              <span className="indicador-foco-n">
                {indicadorFoco.n} capa(s)
                <EnlaceInstitucional to={enlace.fichaIndicador(indicadorFoco.indicador.id)} sinAcceso="ocultar"> · ver ficha</EnlaceInstitucional>
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
                                {activas.has(capa.id) && (
                                  <button
                                    type="button"
                                    className={`capa-info-btn capa-estilo-btn${capasConPanel.some((c) => c.id === capa.id) ? ' activo' : ''}`}
                                    onClick={() => mostrarPanel(capa)}
                                    title="Simbología, filtros y atributos"
                                    aria-label={`Simbología, filtros y atributos de ${capa.titulo}`}
                                    aria-pressed={capasConPanel.some((c) => c.id === capa.id)}
                                  >
                                    <SlidersHorizontal size={13} />
                                    {filtrosActivosCapa(configDe(capa.id).filtros) > 0 && <span className="capa-estilo-badge">{filtrosActivosCapa(configDe(capa.id).filtros)}</span>}
                                  </button>
                                )}
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
        <div className="sidebar-aviso">
          <AvisoLegal tipo="cartografico" compacto />
        </div>
      </div>

      {ficha && <CapaMetadataModal datos={ficha} onClose={() => setFicha(null)} />}

      {capasActivasOrdenadas.length > 0 && (
        <>
          <button
            type="button"
            className={`columna-derecha-toggle${columnaDerecha ? '' : ' columna-derecha-toggle--cerrada'}`}
            onClick={() => setColumnaDerecha((v) => !v)}
            aria-expanded={columnaDerecha}
            aria-label={columnaDerecha ? 'Contraer el panel de simbología' : 'Mostrar el panel de simbología'}
            title={columnaDerecha ? 'Contraer el panel de simbología' : 'Mostrar el panel de simbología'}
          >
            {columnaDerecha ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <aside className={`columna-derecha${columnaDerecha ? '' : ' columna-derecha--cerrada'}`} aria-label="Simbología, filtros y atributos">
            {capasConPanel.length > 0 && (
              <div className="columna-derecha__paneles">
                {capasConPanel.map((capa) => (
                  <PanelCapa
                    key={capa.id}
                    capa={capa}
                    config={configDe(capa.id)}
                    onCambio={(c) => fijarConfig(capa.id, c)}
                    contraido={panelesContraidos.has(capa.id)}
                    onAlternar={() => alternarPanel(capa.id)}
                    onFicha={() => setFicha({ capa })}
                    mapa={mapInstance}
                  />
                ))}
              </div>
            )}
            {capasActivasOrdenadas.length > 0 && (
              <LeyendaMapa capas={capasActivasOrdenadas} configDe={configDe} onAlternarCapa={alternarSimbologia} onAlternarCategoria={alternarCategoria} onFicha={(capa) => setFicha({ capa })} />
            )}
          </aside>
        </>
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
          <button onClick={handleScreenshot} className="map-ctrl-btn" aria-label="Tomar captura e infografía del mapa" title="Captura e infografía">
            <Camera size={16} />
          </button>
          <button onClick={() => setMapaCompleto(true)} className="map-ctrl-btn" aria-label="Ver el mapa en pantalla completa" title="Pantalla completa (Esc para salir)">
            <Maximize2 size={16} />
          </button>
          <BotonGuia className="map-ctrl-btn" onClick={() => setGuiaAbierta(true)} />
        </div>
      </div>
      <RecorridoGeovisor abierto={guiaAbierta} onCerrar={() => { marcarRecorrido(CLAVE_RECORRIDO); setGuiaAbierta(false); }} pasos={PASOS_RECORRIDO} cifras={CIFRAS_RECORRIDO} />

      <MapContainer center={[19.3, -90.5]} zoom={8} minZoom={6} maxBounds={CAMPECHE_BOUNDS} maxBoundsViscosity={0.8} zoomControl={false} className="leaflet-map" preferCanvas={true}>
        <MapInstanceCapture setMapInstance={setMapInstance} />
        <EsriBasemap type={activeBaseLayer} opacity={1} />
        {capasActivasOrdenadas.map((capa) => (CAPAS_MASCARA.has(capa.id) ? (
          <MascaraEntidades key={capa.id} capa={capa} opacidad={getOpacidad(capa.id)} simbologia={configDe(capa.id).simbologia} />
        ) : CAPAS_POBLACION.has(capa.id) ? (
          <CapaPoblacion key={capa.id} capa={capa} opacidad={getOpacidad(capa.id)} simbologia={configDe(capa.id).simbologia} municipio={municipio} onSeleccionar={setFicha} />
        ) : (
          <CapaSesim
            key={capa.id}
            capa={capa}
            opacidad={getOpacidad(capa.id) * (hayEstrategia && capa.categoria === 'mapa_base' ? 0.3 : 1)}
            config={configDe(capa.id)}
            conEtiqueta={CAPAS_CON_ETIQUETA.has(capa.id)}
            municipio={CAPAS_FIJAS.has(capa.id) ? '' : municipio}
            onSeleccionar={setFicha}
          />
        )))}
        <EtiquetasLocalidades municipio={municipio} />
        <RealceMunicipio municipio={municipio} />
      </MapContainer>
      {mapInstance && createPortal(
        <div className="mapa-pie">
          <EscalaMapa mapa={mapInstance} />
          <span className="mapa-pie__nota">Información de referencia sin validez jurídica · SESIM Campeche</span>
        </div>,
        mapInstance.getContainer(),
      )}
      {errorDescarga && (
        <div className="mapa-aviso-error" role="alert">
          <span>{errorDescarga}</span>
          <button type="button" onClick={() => setErrorDescarga(null)} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}
      {infografia && arbol && createPortal(
        <Infografia
          arbol={arbol}
          activas={capasActivasOrdenadas}
          limitesActuales={mapInstance ? [[mapInstance.getBounds().getSouth(), mapInstance.getBounds().getWest()], [mapInstance.getBounds().getNorth(), mapInstance.getBounds().getEast()]] : null}
          configDe={configDe}
          capturarPantalla={capturarPantalla}
          onCerrar={() => setInfografia(false)}
        />,
        document.body,
      )}
    </div>
  );
};

export default MapViewer;
