import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { geojsonUnidades } from '../../lib/sesim/api';

/** Contorno del municipio elegido en el filtro del control de capas; el mapa se encuadra en él. */
export default function RealceMunicipio({ municipio }) {
  const mapa = useMap();
  const [municipios, setMunicipios] = useState(null);

  useEffect(() => {
    let vivo = true;
    geojsonUnidades('municipios').then((fc) => vivo && setMunicipios(fc)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!municipios || !municipio) return undefined;
    const rasgo = municipios.features.find((f) => f.properties.id === municipio);
    if (!rasgo) return undefined;
    const capa = L.geoJSON(rasgo, { interactive: false, style: { color: '#691C32', weight: 3, opacity: 0.95, fill: false, dashArray: '6 4' } }).addTo(mapa);
    mapa.fitBounds(capa.getBounds(), { padding: [32, 32] });
    return () => capa.remove();
  }, [mapa, municipios, municipio]);

  return null;
}
