import { useEffect, useState } from 'react';
import { MapContainer, ScaleControl, Polyline, Marker, Tooltip, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Minus, Ruler, CircleHelp, Satellite, Map as MapaIcono } from 'lucide-react';
import EsriBasemap from '../../geovisor/EsriBasemap';
import CapaSesim from '../../geovisor/CapaSesim';
import LeyendaMapa from '../../geovisor/LeyendaMapa';
import { geojsonUnidades } from '../../../lib/sesim/api';
import { CAPAS_MASCARA, CAPAS_POBLACION } from '../../../lib/sesim/capas';
import 'leaflet/dist/leaflet.css';
import '../../geovisor/MapViewer.css';
import '../../geovisor/GeovisorV8.css';
import './MapaCaptura.css';

/**
 * Mapa propio del capturista (no toca el MapaPerfil compartido):
 *  · mismo mapa base y mismas herramientas que el geovisor (acercar, alejar, medir, claro/satélite, guía);
 *  · simbología en cristal, idéntica a la del geovisor público (interruptor por capa y por categoría);
 *  · municipios oficiales como contexto y para ubicar una medición;
 *  · `children` recibe la vista previa de la capa que se está subiendo.
 */
const LIMITES = [[13.5, -97.0], [25.0, -83.0]];

function CapturaMapa({ onMapa }) {
  const map = useMap();
  useEffect(() => { onMapa?.(map); }, [map, onMapa]);
  return null;
}

function Regla({ activa }) {
  const [puntos, setPuntos] = useState([]);
  useMapEvents({ click(e) { if (activa) setPuntos((p) => [...p, e.latlng]); } });
  useEffect(() => { if (!activa) setPuntos([]); }, [activa]);
  if (!activa || puntos.length === 0) return null;
  let metros = 0;
  for (let i = 0; i < puntos.length - 1; i++) metros += puntos[i].distanceTo(puntos[i + 1]);
  const punto = L.divIcon({ className: 'measure-dot', iconSize: [10, 10] });
  return (
    <>
      <Polyline positions={puntos} color="#9F2241" weight={3} dashArray="5, 10" />
      {puntos.map((p, i) => (
        <Marker key={i} position={p} icon={punto}>
          {i === puntos.length - 1 && puntos.length > 1 && <Tooltip permanent direction="right" offset={[10, 0]} className="measure-tooltip">{(metros / 1000).toFixed(2)} km</Tooltip>}
        </Marker>
      ))}
    </>
  );
}

function Municipios({ resaltar, mapa }) {
  const [datos, setDatos] = useState(null);
  useEffect(() => { geojsonUnidades('municipios').then(setDatos).catch(() => setDatos(null)); }, []);
  const idMun = resaltar ? resaltar.slice(0, 5) : null;
  useEffect(() => {
    if (!datos || !mapa || !idMun) return;
    const f = datos.features.find((x) => x.properties.id === idMun);
    if (f) { try { mapa.flyToBounds(L.geoJSON(f).getBounds(), { padding: [60, 60], duration: 1.1 }); } catch { /* geometría vacía */ } }
  }, [datos, mapa, idMun]);
  if (!datos) return null;
  return (
    <GeoJSON
      key={idMun ?? 'todos'}
      data={datos}
      style={(f) => (f.properties.id === idMun
        ? { color: '#9F2241', weight: 3, fillColor: '#9F2241', fillOpacity: 0.18 }
        : { color: '#53565A', weight: 0.8, fillOpacity: 0, dashArray: '3 3' })}
      onEachFeature={(f, capa) => capa.bindTooltip(`${f.properties.nombre} (${f.properties.id})`, { sticky: true })}
    />
  );
}

export default function MapaCaptura({ capas = [], capasDibujo = null, configDe, onAlternarCapa, onAlternarCategoria, resaltarUnidad, onMapa, onGuia, panelAbierto = true, children }) {
  const [mapa, setMapa] = useState(null);
  const [base, setBase] = useState('satelite');
  const [midiendo, setMidiendo] = useState(false);
  const registrar = (m) => { setMapa(m); onMapa?.(m); };
  // Mascara y población son capas especiales del geovisor público; aquí se dibujan como capa común.
  const dibujables = (capasDibujo ?? capas).filter((c) => !CAPAS_MASCARA.has(c.id) && !CAPAS_POBLACION.has(c.id));

  return (
    <div className={`dashboard-map-area mc-area${midiendo ? ' measuring-mode' : ''}`}>
      <div className="mc-herramientas" role="toolbar" aria-label="Herramientas del mapa">
        <button type="button" onClick={() => setBase((b) => (b === 'claro' ? 'satelite' : 'claro'))} title={base === 'claro' ? 'Ver satélite' : 'Ver mapa claro'} aria-label={base === 'claro' ? 'Cambiar a vista satelital' : 'Cambiar a mapa claro'}>
          {base === 'claro' ? <Satellite size={18} /> : <MapaIcono size={18} />}
        </button>
        <button type="button" onClick={() => mapa?.zoomIn()} title="Acercar" aria-label="Acercar"><Plus size={18} /></button>
        <button type="button" onClick={() => mapa?.zoomOut()} title="Alejar" aria-label="Alejar"><Minus size={18} /></button>
        <button type="button" className={midiendo ? 'activo' : ''} aria-pressed={midiendo} onClick={() => setMidiendo((v) => !v)} title="Medir distancia" aria-label="Medir distancia"><Ruler size={18} /></button>
        <button type="button" onClick={onGuia} title="Guía del capturista" aria-label="Abrir la guía del capturista" data-guia="boton"><CircleHelp size={18} /></button>
      </div>

      {capas.length > 0 ? (
        <LeyendaMapa capas={[...capas].reverse()} configDe={configDe} onAlternarCapa={onAlternarCapa} onAlternarCategoria={onAlternarCategoria} panelAbierto={panelAbierto} />
      ) : (
        <div className="mc-leyenda-vacia" role="note"><h4>Simbología</h4><p>Aquí aparecerán los colores de lo que veas en el mapa. Enciende una capa del Catálogo o pulsa «Ver en el mapa» al subir tu archivo.</p></div>
      )}

      <MapContainer center={[19.3, -90.5]} zoom={8} minZoom={6} maxBounds={LIMITES} zoomControl={false} style={{ width: '100%', height: '100%', zIndex: 1 }} preferCanvas>
        <CapturaMapa onMapa={registrar} />
        <EsriBasemap type={base} opacity={1} />
        <Municipios resaltar={resaltarUnidad} mapa={mapa} />
        {dibujables.map((c) => <CapaSesim key={c.id} capa={c} config={configDe(c.id)} />)}
        {children}
        <ScaleControl position="bottomleft" imperial={false} />
        <Regla activa={midiendo} />
      </MapContainer>
    </div>
  );
}
