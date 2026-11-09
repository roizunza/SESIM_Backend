import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, Popup, useMap } from 'react-leaflet';
import { ChevronLeft, ChevronRight, Camera, X, Maximize2, Minimize2, Crosshair } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './MapViewer.css';
import './GeovisorV8.css';
import PanelFab from '../perfiles/comun/PanelFab';
import { BotonGuia } from './GuiaGeovisor';
import RecorridoGeovisor, { recorridoVisto, marcarRecorrido } from './RecorridoGeovisor';
import { usePanelLateral } from '../../lib/sesim/usePanelLateral';
import { cargarArbolCapas, CAPAS_FIJAS, CAPAS_INICIALES, CAPAS_CON_ETIQUETA, CAPAS_MASCARA, CAPAS_POBLACION } from '../../lib/sesim/capas';
import { useFiltros } from '../../lib/sesim/filtrosGlobales';
import { useCatalogo } from '../../lib/sesim/useCatalogo';
import { fnCapasDeIndicador, tabla } from '../../lib/sesim/api';
import EsriBasemap from './EsriBasemap';
import CapaSesim from './CapaSesim';
import DetalleCapa from './DetalleCapa';
import PanelControl from './PanelControl';
import LeyendaMapa from './LeyendaMapa';
import EscalaMapa from './EscalaMapa';
import RealceMunicipio from './RealceMunicipio';
import MascaraEntidades from './MascaraEntidades';
import CapaPoblacion from './CapaPoblacion';
import { AVISOS } from '../../lib/avisosLegales';
import Infografia from './Infografia';
import { descargarCapa } from '../../lib/sesim/descargas';
import { CONFIG_INICIAL } from '../../lib/sesim/estiloCapa';

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

/** Recorrido del geovisor público: cada `sel` apunta a una zona real de la pantalla; si no está a la vista el paso se omite. */
const CLAVE_RECORRIDO = 'sesim.geovisor.recorrido.v1';
const PASOS_RECORRIDO = [
  { id: 'escala', sel: '.gv-escala', titulo: 'Elige la escala de consulta', texto: 'Empieza por todo el estado o por un municipio: las capas muestran solo sus elementos, lo demás se atenúa y el mapa se acerca a él.' },
  { id: 'capas', sel: '.map-sidebar', selMovil: '.map-sidebar', titulo: 'Explora y enciende capas', texto: 'En «Explorar» eliges Mapa base, Diagnóstico o Estrategias y enciendes capas.', items: [
    { marca: '⌕', texto: 'Busca por nombre o clave.' }, { marca: '●', texto: 'El interruptor enciende o apaga la capa o la estrategia.' }, { marca: '5', texto: 'Los atajos encienden una estrategia completa.' }] },
  { id: 'abrir-panel', selMovil: '.panel-fab', titulo: 'Abre el panel de capas', texto: 'Con «Capas» eliges la escala de consulta, buscas y enciendes capas.' },
  { id: 'ficha', sel: '.gv-fila .gv-enlace', titulo: 'Consulta la ficha', texto: '«Ficha ›» abre el detalle de la capa: sinopsis, ficha técnica y descarga.' },
  { id: 'estilo', sel: '.gv-pestanas', titulo: 'Capas en el mapa', texto: 'En «En el mapa» ajustas la transparencia, filtras los elementos y cambias el orden en que se dibujan las capas.' },
  { id: 'leyenda', sel: '.leyenda-flotante', titulo: 'Lee la simbología', texto: 'La leyenda explica los colores; sus interruptores ocultan la simbología sin apagar la capa.' },
  { id: 'controles', sel: '.map-custom-controls', titulo: 'Controles del mapa', texto: 'Cambia el mapa base, acerca o aleja, descarga las capas encendidas en GeoJSON, arma la infografía y usa pantalla completa.', items: [
    { marca: '?', texto: 'Con el botón «?» vuelves a este recorrido.' }] },
];

const CIFRAS_RECORRIDO = [{ valor: '66', etiqueta: 'capas públicas' }, { valor: '13', etiqueta: 'municipios' }, { valor: '5', etiqueta: 'estrategias' }];

const MapViewer = ({ incluirBorrador = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mapInstance, setMapInstance] = useState(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState(() => !recorridoVisto(CLAVE_RECORRIDO) || new URLSearchParams(window.location.search).get('recorrido') === '1');
  const [activeBaseLayer, setActiveBaseLayer] = useState('claro');
  const [isSidebarOpen, setIsSidebarOpen, esMovil] = usePanelLateral();

  const [arbol, setArbol] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [activas, setActivas] = useState(() => new Set(CAPAS_FIJAS));
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [opacidadPorCapa, setOpacidadPorCapa] = useState({});
  const [detalle, setDetalle] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [pestana, setPestana] = useState('explorar');
  const [tema, setTema] = useState('estrategia');
  const [ordenDibujo, setOrdenDibujo] = useState([]);
  const [ordenVersion, setOrdenVersion] = useState(0);
  const [avisoAbierto, setAvisoAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [indicadorFoco, setIndicadorFoco] = useState(null);
  const [configPorCapa, setConfigPorCapa] = useState({});
  const [mapaCompleto, setMapaCompleto] = useState(false);
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

  const fijarGrupo = (grupo, encender) => {
    const ids = grupo.capas.map((c) => c.id).filter((id) => !CAPAS_FIJAS.has(id));
    setActivas((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (encender ? next.add(id) : next.delete(id)));
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

  const rangoGeom = (id) => ORDEN_GEOMETRIA[arbol?.capasPorId.get(id)?.geom] ?? 1;
  // Orden de dibujo (de abajo hacia arriba): por geometría al encender, ajustable a mano.
  useEffect(() => {
    if (!arbol) return;
    setOrdenDibujo((prev) => {
      const res = prev.filter((id) => activas.has(id) && arbol.capasPorId.has(id));
      for (const id of activas) {
        if (!arbol.capasPorId.has(id) || res.includes(id)) continue;
        const r = rangoGeom(id);
        const i = res.findIndex((x) => rangoGeom(x) > r);
        res.splice(i < 0 ? res.length : i, 0, id);
      }
      return res.length === prev.length && res.every((x, i) => x === prev[i]) ? prev : res;
    });
  }, [activas, arbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const capasActivasOrdenadas = useMemo(() => {
    if (!arbol) return [];
    const enOrden = ordenDibujo.filter((id) => activas.has(id)).map((id) => arbol.capasPorId.get(id)).filter(Boolean);
    const faltan = [...activas].filter((id) => !ordenDibujo.includes(id)).map((id) => arbol.capasPorId.get(id)).filter(Boolean)
      .sort((a, b) => (ORDEN_GEOMETRIA[a.geom] ?? 1) - (ORDEN_GEOMETRIA[b.geom] ?? 1));
    return [...enOrden, ...faltan];
  }, [activas, arbol, ordenDibujo]);

  const moverCapa = (id, dir, categoria) => {
    setOrdenDibujo((prev) => {
      const i = prev.indexOf(id);
      let j = i + dir;
      while (j >= 0 && j < prev.length && arbol.capasPorId.get(prev[j])?.categoria !== categoria) j += dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const res = [...prev];
      [res[i], res[j]] = [res[j], res[i]];
      return res;
    });
    setOrdenVersion((v) => v + 1);
  };
  const reordenar = (desde, hasta) => {
    setOrdenDibujo((prev) => {
      if (!prev.includes(desde) || !prev.includes(hasta)) return prev;
      const res = prev.filter((x) => x !== desde);
      res.splice(res.indexOf(hasta) + (prev.indexOf(desde) < prev.indexOf(hasta) ? 1 : 0), 0, desde);
      return res;
    });
    setOrdenVersion((v) => v + 1);
  };
  const setOpacidadCategoria = (cat, v) => setOpacidadPorCapa((prev) => { const next = { ...prev }; for (const c of capasActivasOrdenadas) if (c.categoria === cat) next[c.id] = v; return next; });
  const quitarTodas = () => setActivas(new Set(CAPAS_FIJAS));

  /** Atajo de estrategia: enciende las capas de esa estrategia y apaga las de las demás. */
  const aplicarEstrategia = (idEje) => {
    const grupo = arbol?.categorias.find((c) => c.id === 'estrategia')?.grupos.find((g) => g.eje?.id === idEje);
    if (!grupo) return;
    const yaOn = grupo.capas.every((c) => activas.has(c.id));
    setActivas((prev) => {
      const next = new Set([...prev].filter((id) => arbol.capasPorId.get(id)?.categoria !== 'estrategia'));
      if (!yaOn) grupo.capas.forEach((c) => next.add(c.id));
      return next;
    });
    setAbiertos(new Set(yaOn ? [] : [grupo.id]));
  };


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
  const handleScreenshot = () => { setSeleccion(null); setDetalle(null); setInfografia(true); };

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

  const ubicar = (d) => {
    if (!mapInstance || !d?.geometria) return;
    const lim = [Infinity, Infinity, -Infinity, -Infinity];
    const rec = (c) => { if (typeof c[0] === 'number') { lim[0] = Math.min(lim[0], c[0]); lim[1] = Math.min(lim[1], c[1]); lim[2] = Math.max(lim[2], c[0]); lim[3] = Math.max(lim[3], c[1]); } else c.forEach(rec); };
    rec(d.geometria.coordinates);
    if (Number.isFinite(lim[0])) mapInstance.fitBounds([[lim[1], lim[0]], [lim[3], lim[2]]], { maxZoom: 16, padding: [60, 60] });
  };
  const abrirFicha = (capa) => setDetalle({ capa });
  const alSeleccionar = (d) => { setSeleccion(d.latlng ? d : null); setDetalle(d); };
  const nombreMunicipio = municipios.find((m) => m.id === municipio)?.nom_mun;

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

        {errorCarga && <span className="sr-only" role="alert">{errorCarga}</span>}
        <PanelControl
          arbol={arbol}
          errorCarga={errorCarga}
          pestana={pestana}
          setPestana={setPestana}
          tema={tema}
          setTema={setTema}
          nActivas={capasActivasOrdenadas.filter((c) => !CAPAS_FIJAS.has(c.id)).length}
          filtro={filtro}
          setFiltro={setFiltro}
          coincide={coincideFiltro}
          activas={activas}
          toggleCapa={toggleCapa}
          fijarGrupo={fijarGrupo}
          abiertos={abiertos}
          toggleAbierto={toggleAbierto}
          aplicarEstrategia={aplicarEstrategia}
          onFicha={abrirFicha}
          activasOrdenadas={capasActivasOrdenadas}
          ordenDibujo={ordenDibujo}
          moverCapa={moverCapa}
          reordenar={reordenar}
          configDe={configDe}
          fijarConfig={fijarConfig}
          getOpacidad={getOpacidad}
          setOpacidad={setOpacidad}
          setOpacidadCategoria={setOpacidadCategoria}
          quitarCapa={toggleCapa}
          quitarTodas={quitarTodas}
          municipios={municipios}
          municipio={municipio}
          fijar={fijar}
          indicadorFoco={indicadorFoco}
          limpiarIndicador={limpiarIndicador}
        />
      </div>

      {detalle && <DetalleCapa key={`${detalle.capa.id}|${detalle.propiedades?.id ?? ''}`} datos={detalle} onCerrar={() => { setDetalle(null); setSeleccion(null); }} onUbicar={ubicar} />}

      {capasActivasOrdenadas.length > 0 && (
        <LeyendaMapa capas={[...capasActivasOrdenadas].reverse()} configDe={configDe} onAlternarCapa={alternarSimbologia} onAlternarCategoria={alternarCategoria} conDetalle={!!detalle} panelAbierto={isSidebarOpen && !esMovil} />
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
          <MascaraEntidades key={`${capa.id}-${ordenVersion}`} capa={capa} opacidad={getOpacidad(capa.id)} simbologia={configDe(capa.id).simbologia} oscuro={activeBaseLayer === 'satelite'} />
        ) : CAPAS_POBLACION.has(capa.id) ? (
          <CapaPoblacion key={`${capa.id}-${ordenVersion}`} capa={capa} opacidad={getOpacidad(capa.id)} simbologia={configDe(capa.id).simbologia} municipio={municipio} onSeleccionar={alSeleccionar} />
        ) : (
          <CapaSesim
            key={`${capa.id}-${ordenVersion}`}
            capa={capa}
            opacidad={getOpacidad(capa.id) * (hayEstrategia && capa.categoria === 'mapa_base' ? 0.3 : 1)}
            config={configDe(capa.id)}
            conEtiqueta={CAPAS_CON_ETIQUETA.has(capa.id)}
            municipio={CAPAS_FIJAS.has(capa.id) ? '' : municipio}
            onSeleccionar={alSeleccionar}
          />
        )))}
        <RealceMunicipio municipio={municipio} />
        {seleccion?.latlng && (
          <Popup position={seleccion.latlng} className="gv-popup" minWidth={260} maxWidth={420} eventHandlers={{ remove: () => setSeleccion(null) }}>
            <div className="gv-popup__cuerpo">
              <div className="gv-popup__cab">
                <span className="capa-id-chip">{seleccion.capa.id}</span>
                {(seleccion.propiedades?.id_unidad ?? seleccion.propiedades?.numero ?? seleccion.propiedades?.num) != null && (
                  <span className="gv-popup__num">{seleccion.propiedades?.id_unidad ?? seleccion.propiedades?.numero ?? seleccion.propiedades?.num}</span>
                )}
              </div>
              <div className="gv-popup__acciones">
                <button type="button" className="gv-popup__ver" onClick={() => setDetalle(seleccion)}>Ver detalle ›</button>
                <button type="button" onClick={() => ubicar(seleccion)}><Crosshair size={14} aria-hidden="true" /> Ubicar</button>
              </div>
            </div>
          </Popup>
        )}
      </MapContainer>
      {mapInstance && createPortal(
        <div className="mapa-pie">
          <EscalaMapa mapa={mapInstance} />
          <span className="mapa-pie__nota">Información de referencia sin validez jurídica · SESIM Campeche · Los datos pueden actualizarse sin previo aviso</span>
          <button type="button" className="mapa-pie__aviso" onClick={() => setAvisoAbierto(true)}>Aviso completo ›</button>
        </div>,
        mapInstance.getContainer(),
      )}
      {avisoAbierto && (
        <div className="gv-aviso" role="dialog" aria-modal="true" aria-label={AVISOS.aviso.titulo}>
          <div className="gv-aviso__caja">
            <h3>{AVISOS.aviso.titulo}</h3>
            <p>{AVISOS.aviso.texto}</p>
            <button type="button" className="gv-btn gv-btn--primario" onClick={() => setAvisoAbierto(false)}>Cerrar</button>
          </div>
        </div>
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
          satelite={activeBaseLayer === 'satelite'}
          escalaTexto={municipio ? `Municipal · ${nombreMunicipio ?? ''}` : 'Estatal'}
          onCerrar={() => setInfografia(false)}
        />,
        document.body,
      )}
    </div>
  );
};

export default MapViewer;
