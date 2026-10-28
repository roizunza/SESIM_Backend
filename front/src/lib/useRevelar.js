import { useEffect, useState } from 'react';

/**
 * Animaciones al desplazarse (scroll reveal) sin dependencias.
 *
 * Marca con la clase `revelado` cada elemento con atributo `data-revelar`
 * dentro de `refContenedor` cuando entra en la ventana (una sola vez). El CSS
 * decide la animación según el valor del atributo: `arriba` (por omisión),
 * `izquierda`, `derecha`, `zoom`. El retraso escalonado se pasa con la
 * variable CSS `--retardo` (p. ej. style={{ '--retardo': '120ms' }}).
 *
 * Con `prefers-reduced-motion` el CSS muestra todo sin movimiento.
 */
export function useRevelar(refContenedor, deps = []) {
  useEffect(() => {
    const raiz = refContenedor.current;
    if (!raiz) return undefined;
    const elementos = Array.from(raiz.querySelectorAll('[data-revelar]:not(.revelado)'));
    if (!('IntersectionObserver' in window)) {
      elementos.forEach((el) => el.classList.add('revelado'));
      return undefined;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('revelado');
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    elementos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** true cuando el elemento referido ya entró en la ventana (una sola vez). */
export function useVisible(ref, umbral = 0.3) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVisible(true);
        obs.disconnect();
      }
    }, { threshold: umbral });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, umbral, visible]);
  return visible;
}

export function prefiereMenosMovimiento() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
