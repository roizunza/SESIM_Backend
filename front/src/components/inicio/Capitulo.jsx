import { useEffect, useRef, useState } from 'react';
import './Capitulo.css';

/**
 * Página de la historia de Inicio. Se activa cuando cruza la franja central de la ventana:
 * la portada (título y línea) entra con una transición y el contenido toma foco,
 * mientras los capítulos vecinos quedan atenuados. Sin IntersectionObserver o con
 * `prefers-reduced-motion`, todo se muestra activo y sin movimiento.
 */
export default function Capitulo({ titulo, tono = 'claro', pantalla = false, children }) {
  const ref = useRef(null);
  const [activo, setActivo] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver(([e]) => setActivo(e.isIntersecting), { rootMargin: '-40% 0px -40% 0px' });
    obs.observe(nodo);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`capitulo capitulo--${tono}${pantalla ? ' capitulo--pantalla' : ''}${activo ? ' capitulo--activo' : ''}`}>
      <div className="capitulo__portada" aria-hidden="true">
        <span className="capitulo__titulo">{titulo}</span>
        <span className="capitulo__linea" />
      </div>
      <div className="capitulo__contenido">{children}</div>
    </div>
  );
}
