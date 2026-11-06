import { useEffect, useMemo, useState } from 'react';
import { tablas, contenido } from './api';
import { combinarOperacionLocal, useOperacion } from './operacion';

/**
 * Hook: carga varias tablas del catálogo y devuelve `{ datos, error }`.
 * `datos` es null mientras carga; después `{ indicador: [...], ... }`.
 * Incluye lo publicado en la operación de este navegador (ver combinarOperacionLocal).
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
  const op = useOperacion();
  return useMemo(() => ({ ...estado, datos: combinarOperacionLocal(estado.datos, op) }), [estado, op]);
}

/** Hook: lee un archivo de contenido editorial → `{ datos, error }`. */
export function useContenido(nombre) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    contenido(nombre)
      .then((datos) => vivo && setEstado({ datos, error: null }))
      .catch((error) => vivo && setEstado({ datos: null, error: error.message }));
    return () => {
      vivo = false;
    };
  }, [nombre]);
  return estado;
}
