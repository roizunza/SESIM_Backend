import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import EsriBasemap from '../geovisor/EsriBasemap';
import EstadoCarga from '../plataforma/EstadoCarga';
import { COLORES_SEMAFORO } from '../../lib/sesim/semaforo';
import { fmtNumero, tokenCss } from './formato';

const ESTADOS_LEYENDA = ['verde', 'amarillo', 'rojo', 'mejora', 'estable', 'retrocede', 'sin línea base', 'sin dato'];

function Encuadre({ geojson }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson) return undefined;
    const limites = L.geoJSON(geojson).getBounds();
    const encuadrar = () => {
      map.invalidateSize();
      map.fitBounds(limites, { padding: [12, 12] });
    };
    encuadrar();
    const observador = new ResizeObserver(encuadrar);
    observador.observe(map.getContainer());
    return () => observador.disconnect();
  }, [geojson, map]);
  return null;
}

function Clic({ onClic }) {
  useMapEvents({ click: (e) => onClic?.(e.latlng) });
  return null;
}

/**
 * Visor geográfico del tablero: coropleta municipal (F05) coloreada con el semáforo F04.
 * Al hacer clic en un municipio actualiza el filtro global; el resto de la vista responde.
 * También sirve de lienzo de captura (`onClicMapa`) para georreferenciar reportes.
 */
export default function MapCanvas({ geojson, valores, seleccionado, onSeleccionar, onClicMapa, cargando, error, titulo, alto = 420, children, mostrarLeyenda = true, colorear, describir, leyenda }) {
  const capa = useRef(null);
  const actual = useRef({ seleccionado, onSeleccionar, onClicMapa });
  useEffect(() => {
    actual.current = { seleccionado, onSeleccionar, onClicMapa };
  }, [seleccionado, onSeleccionar, onClicMapa]);
  const contorno = tokenCss('--c-guinda-dk', '#691C32');

  const estilo = useMemo(
    () => (f) => {
      const id = f.properties.id;
      const dato = valores?.get(id);
      const activo = seleccionado === id;
      return {
        color: activo ? contorno : '#ffffff',
        weight: activo ? 3 : 1,
        fillColor: dato ? (colorear ? colorear(dato) : COLORES_SEMAFORO[dato.semaforo]) : COLORES_SEMAFORO['sin dato'],
        fillOpacity: valores ? (dato ? 0.72 : 0.35) : 0.15,
      };
    },
    [valores, seleccionado, contorno, colorear],
  );

  useEffect(() => {
    capa.current?.setStyle(estilo);
    capa.current?.eachLayer((l) => {
      const id = l.feature.properties.id;
      const dato = valores?.get(id);
      l.setTooltipContent(`<strong>${l.feature.properties.nombre}</strong><br/>${dato ? (describir ? describir(dato) : `${fmtNumero(dato.valor)} · ${dato.periodo.etiqueta}`) : 'Sin dato en el corte'}`);
    });
  }, [estilo, valores, describir]);

  const alCadaUno = (f, l) => {
    l.bindTooltip(f.properties.nombre, { sticky: true });
    l.on('click', () => {
      const { seleccionado: sel, onSeleccionar: elegir, onClicMapa: capturar } = actual.current;
      if (capturar) return;
      elegir?.(sel === f.properties.id ? '' : f.properties.id);
    });
  };

  const presentes = !mostrarLeyenda || !valores ? [] : leyenda ?? ESTADOS_LEYENDA.filter((s) => [...valores.values()].some((d) => d.semaforo === s)).map((s) => ({ etiqueta: s.charAt(0).toUpperCase() + s.slice(1), color: COLORES_SEMAFORO[s] }));

  return (
    <figure className="map-canvas" style={{ '--alto-mapa': `${alto}px` }} aria-label={titulo}>
      {error && <div className="map-canvas__estado"><EstadoCarga estado="error" titulo="No se pudo cargar el mapa" mensaje={error} compacto /></div>}
      {!error && cargando && <div className="map-canvas__estado"><EstadoCarga estado="cargando" mensaje="Cargando límites municipales…" compacto /></div>}
      <MapContainer center={[19.0, -90.4]} zoom={7} zoomSnap={0.25} scrollWheelZoom={false} className="map-canvas__mapa" attributionControl>
        <EsriBasemap type="claro" />
        {geojson && <GeoJSON ref={capa} data={geojson} style={estilo} onEachFeature={alCadaUno} />}
        {geojson && <Encuadre geojson={geojson} />}
        {onClicMapa && <Clic onClic={onClicMapa} />}
        {children}
      </MapContainer>
      {presentes.length > 0 && (
        <figcaption className="map-canvas__leyenda">
          {presentes.map((s) => (
            <span key={s.etiqueta}><i style={{ background: s.color }} aria-hidden="true" />{s.etiqueta}</span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
