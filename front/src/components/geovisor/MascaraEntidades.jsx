import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';

const PANEL = 'mascara-entidades';
const ENTIDAD_PROPIA = 'Campeche';

/**
 * Lim02 (Entidades) como máscara: las demás entidades federativas se cubren de blanco translúcido
 * por encima de las capas temáticas, de modo que lo que queda fuera de Campeche se atenúa y la
 * lectura se concentra dentro del estado. Campeche no se dibuja. La opacidad del control de capas
 * regula qué tanto se atenúa; con la simbología apagada solo quedan los contornos.
 */
export default function MascaraEntidades({ capa, opacidad = 1, simbologia = true }) {
  const mapa = useMap();
  const { datos } = useDatosCapa(capa);

  useEffect(() => {
    if (!mapa.getPane(PANEL)) {
      const panel = mapa.createPane(PANEL);
      panel.style.zIndex = 450;
      panel.style.pointerEvents = 'none';
    }
  }, [mapa]);

  useEffect(() => {
    if (!datos) return undefined;
    const capaLeaflet = L.geoJSON(datos, {
      pane: PANEL,
      interactive: false,
      filter: (f) => f.properties?.nombre !== ENTIDAD_PROPIA,
      style: { color: '#c9c4c6', weight: 0.8, opacity: 0.9 * opacidad, fillColor: '#ffffff', fillOpacity: simbologia ? 0.78 * opacidad : 0 },
    }).addTo(mapa);
    return () => capaLeaflet.remove();
  }, [mapa, datos, opacidad, simbologia]);

  return null;
}
