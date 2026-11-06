import { useMemo, useReducer } from 'react';
import { ContextoFiltros, FILTROS_INICIALES, reductor } from './filtrosGlobales';

/** Proveedor del estado global de filtros (ver filtrosGlobales.js). */
export default function FiltrosProvider({ children }) {
  const [filtros, despachar] = useReducer(reductor, FILTROS_INICIALES);
  const acciones = useMemo(
    () => ({
      fijar: (campo, v) => despachar({ tipo: 'fijar', campo, valor: v }),
      fijarVarios: (valores) => despachar({ tipo: 'fijarVarios', valores }),
      comparar: (valores) => despachar({ tipo: 'comparar', valores }),
      reiniciar: () => despachar({ tipo: 'reiniciar' }),
      reemplazar: (filtros) => despachar({ tipo: 'reemplazar', filtros }),
    }),
    [],
  );
  const valor = useMemo(() => ({ filtros, ...acciones }), [filtros, acciones]);
  return <ContextoFiltros.Provider value={valor}>{children}</ContextoFiltros.Provider>;
}
