import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { prefiereMenosMovimiento } from '../../lib/useRevelar';
import './FlechasPantallas.css';

/** Pantallas de Inicio, en orden. Cada selector es un punto donde la flecha deja el inicio del bloque a la vista. */
const PANTALLAS = ['#introduccion', '.portada__banda', '#vision', '.mj__cuerpo', '.mj__transicion', '.mj-traza', '#estrategias', '.estr__paso--clasif', '.estr__total'];

function posiciones() {
  const cab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--alto-cabecera')) || 122;
  const margen = cab + 16;
  const lista = PANTALLAS
    .map((sel) => document.querySelector(sel))
    .filter(Boolean)
    .map((el) => ({ el, y: Math.max(0, el.getBoundingClientRect().top + window.scrollY - (el.id === 'introduccion' ? 0 : margen)) }))
    .sort((a, b) => a.y - b.y)
    .filter((p, i, arr) => i === 0 || p.y - arr[i - 1].y > 80);
  return lista;
}

/** Flechas fijas a la derecha: suben o bajan de una pantalla a la siguiente de la página de Inicio. */
export default function FlechasPantallas() {
  const [indice, setIndice] = useState({ i: 0, n: 1 });
  const raf = useRef(null);
  const libre = useRef(null);

  const medir = useCallback(() => {
    raf.current = null;
    const lista = posiciones();
    const y = window.scrollY + 40;
    let i = 0;
    lista.forEach((p, k) => { if (p.y <= y) i = k; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) i = lista.length - 1;
    setIndice((a) => (a.i === i && a.n === lista.length ? a : { i, n: lista.length }));
  }, []);

  useEffect(() => {
    const pedir = () => { if (raf.current === null) raf.current = requestAnimationFrame(medir); };
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    const t = setInterval(pedir, 700); // el contenido llega por etapas: se vuelve a medir
    pedir();
    return () => { window.removeEventListener('scroll', pedir); window.removeEventListener('resize', pedir); clearInterval(t); if (raf.current) cancelAnimationFrame(raf.current); raf.current = null; };
  }, [medir]);

  const ir = (delta) => {
    const lista = posiciones();
    const y = window.scrollY;
    let destino;
    if (delta > 0) destino = lista.find((p) => p.y > y + 60);
    else destino = [...lista].reverse().find((p) => p.y < y - 60);
    const top = destino ? destino.y : delta > 0 ? document.documentElement.scrollHeight : 0;
    // El ajuste suave al inicio de cada capítulo se suspende mientras dura el desplazamiento.
    const raiz = document.documentElement;
    raiz.classList.add('sin-ajuste');
    window.scrollTo({ top, behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
    clearTimeout(libre.current);
    libre.current = setTimeout(() => raiz.classList.remove('sin-ajuste'), 1400);
  };

  return (
    <nav className="flechas-pantallas" aria-label="Moverse entre pantallas de Inicio">
      <button type="button" onClick={() => ir(-1)} disabled={indice.i <= 0} aria-label="Pantalla anterior"><ChevronUp size={22} aria-hidden="true" /></button>
      <span className="flechas-pantallas__cuenta" aria-hidden="true">{indice.i + 1}<i>/</i>{indice.n}</span>
      <button type="button" onClick={() => ir(1)} disabled={indice.i >= indice.n - 1} aria-label="Pantalla siguiente"><ChevronDown size={22} aria-hidden="true" /></button>
    </nav>
  );
}
