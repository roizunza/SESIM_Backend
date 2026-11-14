import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { prefiereMenosMovimiento } from '../../lib/useRevelar';
import './FlechasPantallas.css';

/** Pantallas de Inicio, en orden. Cada selector es un punto donde la flecha deja el inicio del bloque a la vista. */
const PANTALLAS = ['#introduccion', '.portada__banda', '#vision', '.mj__cuerpo', '.mj__transicion', '.mj-traza', '#estrategias', '.estr__paso--clasif'];

/** Posición en la página sin contar transformaciones: un capítulo inactivo se dibuja 36 px más abajo y se acomoda al activarse, lo que desviaba el destino. */
function topAbsoluto(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}

/** Animación de desplazamiento propia: arranque y llegada suaves, duración según la distancia y cancelable si la persona toma el control. */
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

function posiciones() {
  const cab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--alto-cabecera')) || 122;
  const margen = cab + 16;
  const lista = PANTALLAS
    .map((sel) => document.querySelector(sel))
    .filter(Boolean)
    .map((el) => ({ el, y: Math.max(0, el.id === 'introduccion' ? 0 : topAbsoluto(el) - margen) }))
    .sort((a, b) => a.y - b.y)
    .filter((p, i, arr) => i === 0 || p.y - arr[i - 1].y > 80);
  return lista;
}

/** Flechas fijas a la derecha: suben o bajan de una pantalla a la siguiente de la página de Inicio. */
export default function FlechasPantallas() {
  const [indice, setIndice] = useState({ i: 0, n: 1 });
  const raf = useRef(null);
  const cancelar = useRef(null);

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

  useEffect(() => () => cancelar.current?.(), []);

  const ir = (delta) => {
    const lista = posiciones();
    const y = window.scrollY;
    let destino;
    if (delta > 0) destino = lista.find((p) => p.y > y + 60);
    else destino = [...lista].reverse().find((p) => p.y < y - 60);
    const top = destino ? destino.y : delta > 0 ? document.documentElement.scrollHeight : 0;
    // El ajuste automático al inicio de cada capítulo se suspende mientras dura el desplazamiento.
    const raiz = document.documentElement;
    raiz.classList.add('sin-ajuste');
    cancelar.current?.();
    if (prefiereMenosMovimiento()) { window.scrollTo({ top, behavior: 'auto' }); raiz.classList.remove('sin-ajuste'); return; }
    const desde = window.scrollY;
    const distancia = top - desde;
    const duracion = Math.min(1100, Math.max(550, Math.abs(distancia) * 0.55));
    const t0 = performance.now();
    let id = 0;
    const parar = () => {
      cancelAnimationFrame(id);
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((e) => window.removeEventListener(e, parar));
      raiz.classList.remove('sin-ajuste');
      cancelar.current = null;
    };
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - t0) / duracion);
      window.scrollTo(0, desde + distancia * suave(t));
      if (t < 1) id = requestAnimationFrame(paso); else parar();
    };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((e) => window.addEventListener(e, parar, { passive: true }));
    cancelar.current = parar;
    id = requestAnimationFrame(paso);
  };

  return (
    <nav className="flechas-pantallas" aria-label="Moverse entre pantallas de Inicio">
      <button type="button" onClick={() => ir(-1)} disabled={indice.i <= 0} aria-label="Pantalla anterior"><ChevronUp size={22} aria-hidden="true" /></button>
      <span className="flechas-pantallas__cuenta" aria-hidden="true">{indice.i + 1}<i>/</i>{indice.n}</span>
      <button type="button" onClick={() => ir(1)} disabled={indice.i >= indice.n - 1} aria-label="Pantalla siguiente"><ChevronDown size={22} aria-hidden="true" /></button>
    </nav>
  );
}
