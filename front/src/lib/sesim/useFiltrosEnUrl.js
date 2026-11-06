import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFiltros, filtrosAParametros, parametrosAFiltros, urlTraeFiltros, CLAVES_URL } from './filtrosGlobales';

/**
 * Sincroniza el estado global de filtros con la URL de la página que lo llama:
 * al entrar, un enlace con parámetros manda sobre el estado; después, cada cambio
 * de filtro reescribe sus parámetros (sin agregar entradas al historial) y conserva los demás.
 */
export function useFiltrosEnUrl() {
  const { filtros, reemplazar } = useFiltros();
  const [params, setParams] = useSearchParams();
  const leido = useRef(false);

  useEffect(() => {
    if (leido.current) return;
    leido.current = true;
    if (urlTraeFiltros(params)) reemplazar(parametrosAFiltros(params));
  }, [params, reemplazar]);

  useEffect(() => {
    if (!leido.current) return;
    const actuales = new URLSearchParams(window.location.search);
    const siguiente = new URLSearchParams([...actuales].filter(([k]) => !CLAVES_URL.includes(k)));
    for (const [k, v] of filtrosAParametros(filtros)) siguiente.set(k, v);
    if (siguiente.toString() !== actuales.toString()) setParams(siguiente, { replace: true });
  }, [filtros, setParams]);
}
