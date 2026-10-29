import { useEffect, useState } from 'react';

const CONSULTA_MOVIL = '(max-width: 820px)';
const hayMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** true en pantallas de teléfono / tableta chica (mismo punto de quiebre que tech.css). */
export function useEsMovil() {
  const [movil, setMovil] = useState(() => (hayMatchMedia() ? window.matchMedia(CONSULTA_MOVIL).matches : false));
  useEffect(() => {
    if (!hayMatchMedia()) return undefined;
    const mq = window.matchMedia(CONSULTA_MOVIL);
    const fn = () => setMovil(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return movil;
}

/**
 * Estado del panel lateral de cada perfil: abierto en escritorio, cerrado en
 * móvil (ahí es un cajón que se abre con el botón flotante).
 * Devuelve [abierto, setAbierto, esMovil].
 */
export function usePanelLateral() {
  const esMovil = useEsMovil();
  const [abierto, setAbierto] = useState(!esMovil);
  useEffect(() => { setAbierto(!esMovil); }, [esMovil]);
  return [abierto, setAbierto, esMovil];
}
