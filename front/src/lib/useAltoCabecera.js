import { useEffect } from 'react';

/**
 * Publica en CSS la altura real de la cabecera (--alto-header) y de cabecera + menú
 * (--alto-cabecera) para que los elementos fijos se apilen sin huecos en cualquier ancho.
 */
export function useAltoCabecera(selectorCabecera = '.header', selectorMenu = '.navbar') {
  useEffect(() => {
    const cabecera = document.querySelector(selectorCabecera);
    const menu = document.querySelector(selectorMenu);
    if (!cabecera || typeof ResizeObserver === 'undefined') return undefined;
    const raiz = document.documentElement.style;
    const medir = () => {
      const alto = cabecera.offsetHeight;
      raiz.setProperty('--alto-header', `${alto}px`);
      raiz.setProperty('--alto-cabecera', `${alto + (menu?.offsetHeight ?? 0)}px`);
    };
    const obs = new ResizeObserver(medir);
    obs.observe(cabecera);
    if (menu) obs.observe(menu);
    medir();
    return () => obs.disconnect();
  }, [selectorCabecera, selectorMenu]);
}
