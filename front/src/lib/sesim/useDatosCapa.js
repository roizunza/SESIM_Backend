import { useEffect, useState } from 'react';
import { geojsonDeCapa } from './api';
import { esPorTeselas } from './teselas';

/** GeoJSON de una capa (memoizado en api.geojsonDeCapa). `activo = false` no dispara la descarga. */
export function useDatosCapa(capa, activo = true) {
  const [estado, setEstado] = useState({ id: null, datos: null, error: null });
  const porTeselas = !!capa && esPorTeselas(capa);
  useEffect(() => {
    if (!capa || !activo || porTeselas) return undefined;
    let vivo = true;
    geojsonDeCapa(capa)
      .then((datos) => vivo && setEstado({ id: capa.id, datos, error: null }))
      .catch((e) => vivo && setEstado({ id: capa.id, datos: null, error: e.message }));
    return () => {
      vivo = false;
    };
  }, [capa, activo, porTeselas]);
  // Capas por teselas: no hay atributos completos en el navegador (filtros, tabla y estilo por campo no aplican).
  if (porTeselas) return { id: capa.id, datos: null, error: null, porTeselas: true };
  return estado.id === capa?.id ? estado : { id: null, datos: null, error: null };
}
