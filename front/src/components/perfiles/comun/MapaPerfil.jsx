import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, ScaleControl, Polyline, Marker, Tooltip, useMapEvents, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Map as MapIcon, List, Plus, Minus, Ruler, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import GuiaGeovisor from '../../geovisor/GuiaGeovisor';
import EsriBasemap from '../../geovisor/EsriBasemap';
import { geojsonUnidades } from '../../../lib/sesim/api';
import 'leaflet/dist/leaflet.css';
import '../../geovisor/AdminMapViewer.css';
import '../administradora/Admin.css';
import '../capturista/Capturista.css';

/**
 * Mapa común de los tres perfiles: mapa base, caja de herramientas
 * arrastrable (simbología activa, mapa base, zoom, medición) y la capa de
 * municipios oficiales (unidad_territorial_geom) para ubicar mediciones
 * (Ruta 5 · territorial) o pintar la coropleta F05.
 *
 * props
 *  · resaltarUnidad   id de unidad territorial a resaltar y centrar
 *  · coropleta        Map id_unidad → color (F05 · v_coropleta_indicador)
 *  · simbologia       nodo React para «Simbología activa»
 *  · children         capas extra (CapaSesim, GeoJSON de vista previa…)
 *  · onMapa           recibe la instancia de Leaflet
 */
const CAMPECHE_BOUNDS = [[13.5, -97.0], [25.0, -83.0]];

const MapInstanceCapture = ({ onMapa }) => {
  const map = useMap();
  useEffect(() => {
    onMapa?.(map);
  }, [map, onMapa]);
  return null;
};

const MeasureTool = ({ activa }) => {
  const [puntos, setPuntos] = useState([]);
  useMapEvents({
    click(e) {
      if (activa) setPuntos((p) => [...p, e.latlng]);
    },
  });
  useEffect(() => {
    if (!activa) setPuntos([]);
  }, [activa]);
  if (!activa || puntos.length === 0) return null;
  let dist = 0;
  for (let i = 0; i < puntos.length - 1; i++) dist += puntos[i].distanceTo(puntos[i + 1]);
  const icono = L.divIcon({ className: 'measure-dot', iconSize: [10, 10] });
  return (
    <>
      <Polyline positions={puntos} color="#9F2241" weight={3} dashArray="5, 10" />
      {puntos.map((p, i) => (
        <Marker key={i} position={p} icon={icono}>
          {i === puntos.length - 1 && puntos.length > 1 && (
            <Tooltip permanent direction="right" offset={[10, 0]} className="measure-tooltip">{(dist / 1000).toFixed(2)} km</Tooltip>
          )}
        </Marker>
      ))}
    </>
  );
};

/** Municipios: contorno siempre; relleno por coropleta o resaltado. */
const CapaMunicipios = ({ resaltar, coropleta, mapa }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    geojsonUnidades('municipios').then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (!data || !mapa || !resaltar) return;
    const idMun = resaltar.slice(0, 5);
    const f = data.features.find((x) => x.properties.id === idMun);
    if (f) {
      try {
        mapa.flyToBounds(L.geoJSON(f).getBounds(), { padding: [60, 60], duration: 1.2 });
      } catch {
        /* geometría vacía */
      }
    }
  }, [data, mapa, resaltar]);

  if (!data) return null;
  const idMun = resaltar ? resaltar.slice(0, 5) : null;
  const estilo = (f) => {
    const id = f.properties.id;
    const color = coropleta?.get(id);
    if (color) return { color: '#ffffff', weight: 1, fillColor: color, fillOpacity: 0.7 };
    if (id === idMun) return { color: '#9F2241', weight: 3, fillColor: '#9F2241', fillOpacity: 0.18 };
    return { color: '#53565A', weight: 0.8, fillOpacity: 0, dashArray: '3 3' };
  };
  return (
    <GeoJSON
      key={`${idMun}-${coropleta ? Array.from(coropleta.entries()).join() : ''}`}
      data={data}
      style={estilo}
      onEachFeature={(f, layer) => layer.bindTooltip(`${f.properties.nombre} (${f.properties.id})`, { sticky: true })}
    />
  );
};

/** Guía del geovisor privado: los pasos que no aplican al perfil (p. ej. filtros del Administrador) se omiten solos. */
const PASOS_GUIA = [
  { sel: '.rolbar', etiqueta: 'Tu perfil y tu flujo', lado: 'abajo', largo: 30, texto: 'Muestra tu perfil, en qué tramo del flujo (Borrador → Revisión → Vigente interno → Público) trabajas y qué acciones puedes hacer.' },
  { sel: '.admin-profile-section', etiqueta: 'Tu panel de trabajo', lado: 'abajo', largo: 18, texto: 'Aquí están tus solicitudes y accesos según tu perfil. En el celular se abre con el botón flotante.' },
  { sel: '.banner-filter-row', etiqueta: 'Filtros de indicadores', lado: 'arriba', largo: 28, texto: 'Elige instrumento, eje, indicador y periodo; después pulsa Generar para ver el resultado en el mapa.' },
  { sel: '.floating-panel .panel-section-title', etiqueta: 'Simbología activa', lado: 'der', largo: 60, texto: 'Indica qué se está pintando en el mapa y qué significan los colores.' },
  { sel: '.floating-panel .accordion-header', etiqueta: 'Mapa base', lado: 'der', largo: 60, texto: 'Cambia entre mapa claro y vista satelital.' },
  { sel: '.external-toolbar [title="Acercar"]', etiqueta: 'Acercar', lado: 'der', texto: 'Acerca el mapa.' },
  { sel: '.external-toolbar [title="Alejar"]', etiqueta: 'Alejar', lado: 'der', texto: 'Aleja el mapa.' },
  { sel: '.external-toolbar [title="Medir distancia"]', etiqueta: 'Medir distancia', lado: 'der', texto: 'Activa la regla: haz clic en varios puntos y verás los kilómetros.' },
  { sel: '.external-toolbar [data-guia="boton"]', etiqueta: 'Abrir esta guía', lado: 'der', texto: 'Vuelve a mostrar esta guía cuando la necesites.' },
];

export default function MapaPerfil({ resaltarUnidad, coropleta, simbologia, children, onMapa, colorMedicion = '#9F2241' }) {
  const [mapa, setMapa] = useState(null);
  const [baseAbierta, setBaseAbierta] = useState(false);
  const [base, setBase] = useState('claro');
  const [midiendo, setMidiendo] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [pos, setPos] = useState({ x: 300, y: 24 });
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef({ sx: 0, sy: 0, x: 0, y: 0 });

  useEffect(() => {
    if (!arrastrando) return undefined;
    const mover = (e) => setPos({ x: inicio.current.x + (e.clientX - inicio.current.sx), y: inicio.current.y + (e.clientY - inicio.current.sy) });
    const soltar = () => setArrastrando(false);
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    return () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
    };
  }, [arrastrando]);

  const registrarMapa = (m) => {
    setMapa(m);
    onMapa?.(m);
  };

  return (
    <div className={`dashboard-map-area ${midiendo ? 'measuring-mode' : ''}`}>
      <div className="draggable-wrapper" style={{ left: pos.x, top: pos.y, position: 'absolute', zIndex: 1000, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div className="floating-panel" style={{ position: 'relative', top: 'auto', left: 'auto', width: 280, margin: 0 }}>
          <div className="panel-header drag-handle" onMouseDown={(e) => { setArrastrando(true); inicio.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y }; }}>
            <List size={18} /><h4>Herramientas del Mapa</h4>
          </div>
          <div className="panel-content" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h5 className="panel-section-title">Simbología activa</h5>
            {simbologia ?? (
              resaltarUnidad ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 16, height: 16, border: `2px solid ${colorMedicion}`, background: 'rgba(159,34,65,0.18)', borderRadius: 2 }} />
                  Unidad territorial de la medición
                </div>
              ) : <p className="text-muted" style={{ margin: 0 }}>Municipios oficiales (unidad territorial).</p>
            )}
          </div>
          <div className="accordion-section">
            <button className="accordion-header" onClick={() => setBaseAbierta(!baseAbierta)}>
              <div className="header-title"><MapIcon size={16} /><span>Mapa Base</span></div>
              {baseAbierta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <div className={`accordion-content ${baseAbierta ? 'open' : ''}`}>
              <div className="base-map-grid" style={{ marginTop: 8 }}>
                <button className={`base-map-btn ${base === 'claro' ? 'active' : ''}`} onClick={() => setBase('claro')}>Mapa Claro</button>
                <button className={`base-map-btn ${base === 'satelite' ? 'active' : ''}`} onClick={() => setBase('satelite')}>Vista Satelital</button>
              </div>
            </div>
          </div>
        </div>
        <div className="external-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => mapa?.zoomIn()} title="Acercar"><Plus size={16} /></button>
          <button onClick={() => mapa?.zoomOut()} title="Alejar"><Minus size={16} /></button>
          <button className={midiendo ? 'active' : ''} onClick={() => setMidiendo(!midiendo)} title="Medir distancia"><Ruler size={16} /></button>
          <button type="button" onClick={() => setGuiaAbierta(true)} title="Guía de uso" aria-label="Abrir la guía de uso del geovisor" data-guia="boton"><HelpCircle size={16} /></button>
        </div>
      </div>

      <GuiaGeovisor abierto={guiaAbierta} onCerrar={() => setGuiaAbierta(false)} pasos={PASOS_GUIA} titulo="Cómo usar el geovisor" />

      <MapContainer center={[19.3, -90.5]} zoom={8} minZoom={6} maxBounds={CAMPECHE_BOUNDS} zoomControl={false} style={{ width: '100%', height: '100%', zIndex: 1 }} preferCanvas={true}>
        <MapInstanceCapture onMapa={registrarMapa} />
        <EsriBasemap type={base} opacity={1} />
        <CapaMunicipios resaltar={resaltarUnidad} coropleta={coropleta} mapa={mapa} />
        {children}
        <ScaleControl position="bottomleft" imperial={false} />
        <MeasureTool activa={midiendo} />
      </MapContainer>
    </div>
  );
}
