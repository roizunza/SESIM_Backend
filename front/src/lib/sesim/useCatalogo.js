import { useEffect, useState } from 'react';
import { tablas } from './api';

/**
 * Hook: carga varias tablas del catálogo y devuelve `{ datos, error }`.
 * `datos` es null mientras carga; después `{ indicador: [...], ... }`.
 */
export function useCatalogo(nombres) {
  const clave = nombres.join('|');
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    tablas(clave.split('|'))
      .then((datos) => vivo && setEstado({ datos, error: null }))
      .catch((error) => vivo && setEstado({ datos: null, error: error.message }));
    return () => {
      vivo = false;
    };
  }, [clave]);
  return estado;
}
