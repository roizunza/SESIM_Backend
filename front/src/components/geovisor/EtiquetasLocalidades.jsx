import { useEffect, useMemo, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { geojsonUnidades, tabla } from '../../lib/sesim/api';

const ZOOM_MINIMO = 9;
const MAXIMO_ETIQUETAS = 300;
const ANCHO_CARACTER = 6.4;
const ALTO_ETIQUETA = 16;
const HOLGURA = 4;

function puntoDe(geometria) {
  if (geometria.type === 'Point') return geometria.coordinates;
  const anillo = geometria.type === 'Polygon' ? geometria.coordinates[0] : geometria.coordinates[0][0];
  const [x, y] = anillo.reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0]);
  return [x / anillo.length, y / anillo.length];
}

const seEncima = (a, b) => a.x1 < b.x2 + HOLGURA && b.x1 < a.x2 + HOLGURA && a.y1 < b.y2 + HOLGURA && b.y1 < a.y2 + HOLGURA;

/**
 * Nombres de localidades que aparecen al acercar el mapa (zoom ≥ 9). En cada vista se colocan de
 * mayor a menor población y se omite todo nombre que se encimaría con otro ya colocado, así la
 * información crece conforme se acerca sin saturar la escala.
 */
export default function EtiquetasLocalidades({ municipio = '' }) {
  const mapa = useMap();
  const [localidades, setLocalidades] = useState(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([geojsonUnidades('localidades'), tabla('unidad_territorial')])
      .then(([fc, unidades]) => {
        if (!vivo) return;
        const pob = new Map(unidades.map((u) => [u.id, Number(u.pob_tot) || 0]));
        setLocalidades(
          fc.features
            .map((f) => ({ id: f.properties.id, nombre: f.properties.nombre, municipio: f.properties.id_unidad, pob: pob.get(f.properties.id) ?? 0, lnglat: puntoDe(f.geometry) }))
            .sort((a, b) => b.pob - a.pob),
        );
      })
      .catch(() => vivo && setLocalidades([]));
    return () => {
      vivo = false;
    };
  }, []);

  const candidatas = useMemo(() => (localidades ?? []).filter((l) => !municipio || l.municipio === municipio), [localidades, municipio]);

  useEffect(() => {
    if (!candidatas.length) return undefined;
    const capa = L.layerGroup().addTo(mapa);
    const dibujar = () => {
      capa.clearLayers();
      if (mapa.getZoom() < ZOOM_MINIMO) return;
      const limites = mapa.getBounds();
      const colocadas = [];
      for (const l of candidatas) {
        if (colocadas.length >= MAXIMO_ETIQUETAS) break;
        const latlng = L.latLng(l.lnglat[1], l.lnglat[0]);
        if (!limites.contains(latlng)) continue;
        const p = mapa.latLngToContainerPoint(latlng);
        const caja = { x1: p.x - 3, y1: p.y - ALTO_ETIQUETA / 2, x2: p.x + 8 + l.nombre.length * ANCHO_CARACTER, y2: p.y + ALTO_ETIQUETA / 2 };
        if (colocadas.some((c) => seEncima(c, caja))) continue;
        colocadas.push(caja);
        L.marker(latlng, {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'etiqueta-localidad', html: `<i></i><span>${l.nombre.replace(/[<>&]/g, '')}</span>`, iconSize: null, iconAnchor: [3, 8] }),
        }).addTo(capa);
      }
    };
    dibujar();
    mapa.on('moveend zoomend', dibujar);
    return () => {
      mapa.off('moveend zoomend', dibujar);
      capa.remove();
    };
  }, [mapa, candidatas]);

  return null;
}
