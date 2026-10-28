import { useEffect, useRef, useState } from 'react';
import { useVisible, prefiereMenosMovimiento } from '../../lib/useRevelar';

/**
 * Número que «cuenta» de 0 al valor final cuando entra en pantalla.
 * Si `valor` es null muestra un guion (dato aún cargando).
 */
export default function Contador({ valor, duracion = 1400, className }) {
  const ref = useRef(null);
  const visible = useVisible(ref, 0.5);
  const [actual, setActual] = useState(0);

  useEffect(() => {
    if (!visible || valor === null || valor === undefined) return undefined;
    if (prefiereMenosMovimiento()) {
      setActual(valor);
      return undefined;
    }
    let raf;
    const inicio = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - inicio) / duracion);
      const suave = 1 - Math.pow(1 - p, 3); // ease-out cúbico
      setActual(Math.round(valor * suave));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [visible, valor, duracion]);

  return (
    <span ref={ref} className={className}>
      {valor === null || valor === undefined ? '—' : actual.toLocaleString('es-MX')}
    </span>
  );
}
