import { useEffect, useState } from 'react';
import { geojsonDeCapa } from './api';

/** GeoJSON de una capa (memoizado en api.geojsonDeCapa). `activo = false` no dispara la descarga. */
export function useDatosCapa(capa, activo = true) {
  const [estado, setEstado] = useState({ id: null, datos: null, error: null });
  useEffect(() => {
    if (!capa || !activo) return undefined;
    let vivo = true;
    geojsonDeCapa(capa)
      .then((datos) => vivo && setEstado({ id: capa.id, datos, error: null }))
      .catch((e) => vivo && setEstado({ id: capa.id, datos: null, error: e.message }));
    return () => {
      vivo = false;
    };
  }, [capa, activo]);
  return estado.id === capa?.id ? estado : { id: null, datos: null, error: null };
}
