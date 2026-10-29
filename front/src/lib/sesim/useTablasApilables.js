import { useEffect } from 'react';

/**
 * Pone `data-label` (el encabezado de su columna) a cada celda de las tablas
 * de las pantallas internas y las marca `apilable`. Con eso tech.css las
 * convierte en tarjetas en pantallas angostas sin tocar el marcado de cada
 * tabla. Las filas de "sin datos" (colSpan) no llevan etiqueta.
 */
export function etiquetarTablas(raiz) {
  raiz.querySelectorAll('table.tabla-sesim, table.bitacora-table').forEach((t) => {
    const cabezas = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    if (!cabezas.length) return;
    t.classList.add('apilable');
    t.querySelectorAll('tbody tr').forEach((tr) => {
      let i = 0;
      Array.from(tr.children).forEach((td) => {
        if (td.tagName !== 'TD') return;
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', cabezas[i] ?? '');
        i += td.colSpan || 1;
      });
    });
  });
}

/** Observa el contenedor y etiqueta las tablas que aparezcan o cambien. */
export function useTablasApilables(ref) {
  useEffect(() => {
    const el = (ref && ref.current) || document.body;
    if (!el || typeof MutationObserver === 'undefined') return undefined;
    let raf = 0;
    const correr = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => etiquetarTablas(el));
    };
    correr();
    const mo = new MutationObserver(correr);
    mo.observe(el, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
