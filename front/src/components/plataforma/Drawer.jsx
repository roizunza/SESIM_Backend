import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './Drawer.css';

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Panel lateral modal (ficha técnica). Atrapa el foco, cierra con Escape o clic fuera
 * y devuelve el foco al control que lo abrió.
 */
export default function Drawer({ abierto, onCerrar, titulo, subtitulo, children, pie, ancho = 520 }) {
  const panel = useRef(null);
  const idTitulo = useId();
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (!abierto) return undefined;
    const previo = document.activeElement;
    const nodo = panel.current;
    nodo?.querySelector(ENFOCABLES)?.focus();
    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar.current();
      }
      if (e.key !== 'Tab' || !nodo) return;
      const lista = [...nodo.querySelectorAll(ENFOCABLES)];
      if (!lista.length) return;
      const [primero, ultimo] = [lista[0], lista[lista.length - 1]];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      previo?.focus?.();
    };
  }, [abierto]);

  if (!abierto) return null;
  return (
    <div className="drawer-capa">
      <button type="button" className="drawer-fondo" aria-label="Cerrar ficha" tabIndex={-1} onClick={onCerrar} />
      <aside ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby={idTitulo} style={{ '--drawer-ancho': `${ancho}px` }}>
        <header className="drawer__cabecera">
          <div>
            {subtitulo && <span className="drawer__subtitulo">{subtitulo}</span>}
            <h2 id={idTitulo} className="drawer__titulo">{titulo}</h2>
          </div>
          <button type="button" className="drawer__cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="drawer__cuerpo">{children}</div>
        {pie && <footer className="drawer__pie">{pie}</footer>}
      </aside>
    </div>
  );
}
