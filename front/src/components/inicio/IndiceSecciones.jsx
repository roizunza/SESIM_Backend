import { useEffect, useState } from 'react';
import './IndiceSecciones.css';

/** Altura desde la que una sección se considera «en lectura»: bajo la cabecera, el menú y el índice. */
const LINEA_LECTURA = () => Math.min(260, window.innerHeight * 0.35);
/** Cada sección vive dentro de su capítulo (inicio/Capitulo.jsx); se navega y se mide por el capítulo. */
const contenedor = (id) => {
  const nodo = document.getElementById(id);
  return nodo?.closest('.capitulo') ?? nodo;
};

/**
 * Índice fijo de las secciones de una página larga. Resalta la sección que se lee
 * (por desplazamiento) y lleva a cada una sin recargar.
 */
export default function IndiceSecciones({ secciones, etiqueta = 'Secciones de la página' }) {
  const [activa, setActiva] = useState(secciones[0]?.id);

  useEffect(() => {
    let raf = null;
    const actualizar = () => {
      raf = null;
      const linea = LINEA_LECTURA();
      let actual = secciones[0]?.id;
      for (const sec of secciones) {
        const nodo = contenedor(sec.id);
        if (nodo && nodo.getBoundingClientRect().top <= linea) actual = sec.id;
      }
      setActiva(actual);
    };
    const alDesplazar = () => {
      if (raf === null) raf = requestAnimationFrame(actualizar);
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    window.addEventListener('resize', alDesplazar);
    actualizar();
    return () => {
      window.removeEventListener('scroll', alDesplazar);
      window.removeEventListener('resize', alDesplazar);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [secciones]);

  const ir = (e, id) => {
    e.preventDefault();
    const nodo = document.getElementById(id);
    if (!nodo) return;
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    contenedor(id).scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
    setActiva(id);
    nodo.querySelector('h2')?.setAttribute('tabindex', '-1');
    nodo.querySelector('h2')?.focus({ preventScroll: true });
  };

  return (
    <nav className="indice-secciones" aria-label={etiqueta}>
      <ul>
        {secciones.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={(e) => ir(e, s.id)} aria-current={activa === s.id ? 'location' : undefined}>
              {s.titulo}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
