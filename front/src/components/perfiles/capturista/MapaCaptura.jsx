import { useEffect, useRef, useState } from 'react';
import { MapContainer, ScaleControl, Polyline, Marker, Tooltip, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Minus, Ruler, CircleHelp, Satellite, Map as MapaIcono, GripHorizontal } from 'lucide-react';
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

function Municipios({ resaltar, mapa, colores }) {
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
      key={`${idMun ?? 'todos'}|${colores ? [...colores.entries()].map(([k, v]) => k + v.color).join('') : ''}`}
      data={datos}
      style={(f) => {
        const c = colores?.get(f.properties.id);
        if (c) return { color: '#ffffff', weight: 1.5, fillColor: c.color, fillOpacity: 0.62 };
        return f.properties.id === idMun
          ? { color: '#9F2241', weight: 3, fillColor: '#9F2241', fillOpacity: 0.18 }
          : { color: '#53565A', weight: 0.8, fillOpacity: 0, dashArray: '3 3' };
      }}
      onEachFeature={(f, capa) => capa.bindTooltip(`${f.properties.nombre} (${f.properties.id})${colores?.get(f.properties.id)?.texto ? ` · ${colores.get(f.properties.id).texto}` : ''}`, { sticky: true })}
    />
  );
}

export default function MapaCaptura({ capas = [], capasDibujo = null, configDe, onAlternarCapa, onAlternarCategoria, resaltarUnidad, onMapa, onGuia, rotuloGuia = 'la guía del capturista', agrupar = false, extraHerramientas = null, panelCapas = null, coloresUnidad = null, panelAbierto = true, textoVacio = 'Aquí aparecerán los colores de lo que veas en el mapa. Enciende una capa del Catálogo o pulsa «Ver en el mapa» al subir tu archivo.', children }) {
  const [mapa, setMapa] = useState(null);
  const [base, setBase] = useState('satelite');
  const [midiendo, setMidiendo] = useState(false);
  const registrar = (m) => { setMapa(m); onMapa?.(m); };
  // Modo agrupado: herramientas del mapa + simbología viajan juntas y se mueven desde el asa de cualquiera de las dos.
  const [posG, setPosG] = useState(null);
  const grupoRef = useRef(null);
  const arrastrarGrupo = (e) => {
    if (!agrupar || !e.target.closest('.mc-asa, .leyenda-asa') || (e.button !== undefined && e.button > 0)) return;
    const el = grupoRef.current; const padre = el?.offsetParent?.getBoundingClientRect();
    if (!el || !padre) return;
    const r = el.getBoundingClientRect(); const dx = e.clientX - r.left; const dy = e.clientY - r.top;
    const mover = (ev) => setPosG({ x: Math.min(Math.max(0, ev.clientX - padre.left - dx), Math.max(0, padre.width - 120)), y: Math.min(Math.max(0, ev.clientY - padre.top - dy), Math.max(0, padre.height - 60)) });
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar);
    e.preventDefault();
  };
  // Mascara y población son capas especiales del geovisor público; aquí se dibujan como capa común.
  const dibujables = (capasDibujo ?? capas).filter((c) => !CAPAS_MASCARA.has(c.id) && !CAPAS_POBLACION.has(c.id));

  return (
    <div className={`dashboard-map-area mc-area${midiendo ? ' measuring-mode' : ''}`}>
      {agrupar ? (
        <div ref={grupoRef} className="mc-grupo" style={posG ? { left: posG.x, top: posG.y } : undefined} onPointerDown={arrastrarGrupo}>
          <div className="mc-grupo__barra">
            <span className="mc-asa" role="button" tabIndex={0} aria-label="Mover herramientas y simbología" title="Arrastra para mover las herramientas y la simbología juntas"><GripHorizontal size={16} aria-hidden="true" /></span>
      <div className="mc-herramientas" role="toolbar" aria-label="Herramientas del mapa">
        {agrupar && extraHerramientas}
        <button type="button" onClick={() => setBase((b) => (b === 'claro' ? 'satelite' : 'claro'))} title={base === 'claro' ? 'Ver satélite' : 'Ver mapa claro'} aria-label={base === 'claro' ? 'Cambiar a vista satelital' : 'Cambiar a mapa claro'}>
          {base === 'claro' ? <Satellite size={18} /> : <MapaIcono size={18} />}
        </button>
        <button type="button" onClick={() => mapa?.zoomIn()} title="Acercar" aria-label="Acercar"><Plus size={18} /></button>
        <button type="button" onClick={() => mapa?.zoomOut()} title="Alejar" aria-label="Alejar"><Minus size={18} /></button>
        <button type="button" className={midiendo ? 'activo' : ''} aria-pressed={midiendo} onClick={() => setMidiendo((v) => !v)} title="Medir distancia" aria-label="Medir distancia"><Ruler size={18} /></button>
        <button type="button" onClick={onGuia} title={`Guía: ${rotuloGuia}`} aria-label={`Abrir ${rotuloGuia}`} data-guia="boton"><CircleHelp size={18} /></button>
      </div>
          </div>
          {panelCapas}

      {capas.length > 0 ? (
        <LeyendaMapa capas={[...capas].reverse()} configDe={configDe} onAlternarCapa={onAlternarCapa} onAlternarCategoria={onAlternarCategoria} panelAbierto={panelAbierto} agrupada={agrupar} />
      ) : (
        <div className="mc-leyenda-vacia" role="note"><h4>Simbología</h4><p>{textoVacio}</p></div>
      )}

        </div>
      ) : (
        <>
      <div className="mc-herramientas" role="toolbar" aria-label="Herramientas del mapa">
        {agrupar && extraHerramientas}
        <button type="button" onClick={() => setBase((b) => (b === 'claro' ? 'satelite' : 'claro'))} title={base === 'claro' ? 'Ver satélite' : 'Ver mapa claro'} aria-label={base === 'claro' ? 'Cambiar a vista satelital' : 'Cambiar a mapa claro'}>
          {base === 'claro' ? <Satellite size={18} /> : <MapaIcono size={18} />}
        </button>
        <button type="button" onClick={() => mapa?.zoomIn()} title="Acercar" aria-label="Acercar"><Plus size={18} /></button>
        <button type="button" onClick={() => mapa?.zoomOut()} title="Alejar" aria-label="Alejar"><Minus size={18} /></button>
        <button type="button" className={midiendo ? 'activo' : ''} aria-pressed={midiendo} onClick={() => setMidiendo((v) => !v)} title="Medir distancia" aria-label="Medir distancia"><Ruler size={18} /></button>
        <button type="button" onClick={onGuia} title={`Guía: ${rotuloGuia}`} aria-label={`Abrir ${rotuloGuia}`} data-guia="boton"><CircleHelp size={18} /></button>
      </div>

      {capas.length > 0 ? (
        <LeyendaMapa capas={[...capas].reverse()} configDe={configDe} onAlternarCapa={onAlternarCapa} onAlternarCategoria={onAlternarCategoria} panelAbierto={panelAbierto} agrupada={agrupar} />
      ) : (
        <div className="mc-leyenda-vacia" role="note"><h4>Simbología</h4><p>{textoVacio}</p></div>
      )}

        </>
      )}

      <MapContainer center={[19.3, -90.5]} zoom={8} minZoom={6} maxBounds={LIMITES} zoomControl={false} style={{ width: '100%', height: '100%', zIndex: 1 }} preferCanvas>
        <CapturaMapa onMapa={registrar} />
        <EsriBasemap type={base} opacity={1} />
        <Municipios resaltar={resaltarUnidad} mapa={mapa} colores={coloresUnidad} />
        {dibujables.map((c) => <CapaSesim key={c.id} capa={c} config={configDe(c.id)} />)}
        {children}
        <ScaleControl position="bottomleft" imperial={false} />
        <Regla activa={midiendo} />
      </MapContainer>
    </div>
  );
}
