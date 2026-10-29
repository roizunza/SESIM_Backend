import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Move, MousePointer2, HelpCircle } from 'lucide-react';
import { useEsMovil } from '../../lib/sesim/usePanelLateral';
import './GuiaGeovisor.css';

/**
 * Guía interactiva del geovisor (adaptada de la guía del front de SEDUMOP).
 *
 * Diferencia con la original: aquí no hay coordenadas fijas. Cada paso trae un
 * selector CSS y la etiqueta se coloca midiendo el elemento real, así que sigue
 * funcionando con el panel abierto o cerrado, con distintos perfiles y tamaños
 * de ventana. Si un elemento no existe o no está a la vista, su paso se omite.
 *
 * En pantallas angostas (≤ 820 px) las líneas guía dejarían de apuntar a algo
 * útil, así que la guía se presenta como una lista de pasos.
 *
 * paso: { sel, etiqueta, texto, lado: 'izq'|'der'|'arriba'|'abajo', largo? }
 *   lado = hacia dónde queda la etiqueta respecto del elemento señalado.
 */

const ALTO_ETIQUETA = 24;

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

function objetivo(el, lado) {
  const r = el.getBoundingClientRect();
  const cy = r.height > 220 ? r.top + 72 : r.top + r.height / 2;
  const cx = r.width > 420 ? r.left + 96 : r.left + r.width / 2;
  switch (lado) {
    case 'izq': return { x: r.left + 2, y: cy };
    case 'der': return { x: r.right - 2, y: cy };
    case 'arriba': return { x: cx, y: r.top + 2 };
    default: return { x: cx, y: r.bottom - 2 };
  }
}

function medir(pasos) {
  const out = [];
  pasos.forEach((p, i) => {
    const el = document.querySelector(p.sel);
    if (!visible(el)) return;
    const lado = p.lado || 'der';
    const largo = p.largo ?? 38;
    const t = objetivo(el, lado);
    const l = { x: t.x, y: t.y };
    if (lado === 'der') l.x += largo;
    if (lado === 'izq') l.x -= largo;
    if (lado === 'abajo') l.y += largo;
    if (lado === 'arriba') l.y -= largo;
    out.push({ i, etiqueta: p.etiqueta, lado, t, l, w: p.etiqueta.length * 6.6 + 22 });
  });
  // Separa etiquetas que quedarían encimadas (misma columna, alturas parecidas).
  const lateral = out.filter((o) => o.lado === 'izq' || o.lado === 'der').sort((a, b) => a.l.y - b.l.y);
  for (let k = 1; k < lateral.length; k++) {
    const a = lateral[k - 1]; const b = lateral[k];
    const mismoLado = a.lado === b.lado;
    const cruzan = mismoLado
      ? Math.abs(a.l.x - b.l.x) < Math.max(a.w, b.w) + 8
      : (a.lado === 'der' ? a.l.x + a.w : a.l.x - a.w) > (b.lado === 'der' ? b.l.x : b.l.x - b.w);
    if (cruzan && b.l.y - a.l.y < ALTO_ETIQUETA + 4) b.l.y = a.l.y + ALTO_ETIQUETA + 4;
  }
  return out;
}

function Etiqueta({ o }) {
  const tr = { izq: 'translate(-100%, -50%)', der: 'translate(0, -50%)', abajo: 'translate(-50%, 0)', arriba: 'translate(-50%, -100%)' }[o.lado];
  return <span className="guia-etiqueta" style={{ left: o.l.x, top: o.l.y, transform: tr }}>{o.etiqueta}</span>;
}

export default function GuiaGeovisor({ abierto, onCerrar, pasos, titulo = 'Guía del geovisor' }) {
  const esMovil = useEsMovil();
  const [medidos, setMedidos] = useState([]);
  const raiz = useRef(null);

  const recalcular = useCallback(() => setMedidos(medir(pasos)), [pasos]);

  useLayoutEffect(() => {
    if (!abierto || esMovil) return undefined;
    recalcular();
    const id = setInterval(recalcular, 400); // la leyenda y los paneles aparecen con retraso
    window.addEventListener('resize', recalcular);
    return () => { clearInterval(id); window.removeEventListener('resize', recalcular); };
  }, [abierto, esMovil, recalcular]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  if (esMovil) {
    const lista = pasos.filter((p) => p.texto && document.querySelector(p.sel));
    return createPortal(
      <div className="guia-movil" role="dialog" aria-modal="true" aria-label={titulo} onClick={onCerrar}>
        <div className="guia-movil-hoja" onClick={(e) => e.stopPropagation()}>
          <div className="guia-movil-cab">
            <h3><HelpCircle size={18} /> {titulo}</h3>
            <button type="button" onClick={onCerrar} aria-label="Cerrar guía"><X size={18} /></button>
          </div>
          <ul className="guia-movil-lista">
            <li><strong>Mover el mapa</strong><span>Arrastra con un dedo.</span></li>
            <li><strong>Acercar y alejar</strong><span>Pellizca con dos dedos o usa los botones + y −.</span></li>
            {lista.map((p) => (<li key={p.sel}><strong>{p.etiqueta}</strong><span>{p.texto}</span></li>))}
          </ul>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div ref={raiz} className="guia-overlay" role="dialog" aria-modal="true" aria-label={titulo} onClick={onCerrar}>
      <button type="button" className="guia-cerrar" onClick={(e) => { e.stopPropagation(); onCerrar(); }} aria-label="Cerrar guía" title="Cerrar guía (Esc)">
        <X size={16} />
      </button>
      <span className="guia-salir">Clic en cualquier parte para cerrar</span>

      <svg className="guia-lineas" aria-hidden="true">
        {medidos.map((o) => (
          <g key={o.i}>
            <line x1={o.l.x} y1={o.l.y} x2={o.t.x} y2={o.t.y} />
            <circle cx={o.t.x} cy={o.t.y} r="3" />
          </g>
        ))}
      </svg>
      {medidos.map((o) => <Etiqueta key={o.i} o={o} />)}

      <div className="guia-gestos" aria-hidden="true">
        <div className="guia-raton"><MousePointer2 size={34} /></div>
        <span className="guia-etiqueta guia-etiqueta--fija">Rueda: acercar y alejar</span>
        <span className="guia-etiqueta guia-etiqueta--fija"><Move size={12} /> Arrastrar para mover el mapa</span>
      </div>
    </div>,
    document.body
  );
}

/** Botón que abre la guía; se coloca junto a los controles del mapa. */
export function BotonGuia({ onClick, className = '' }) {
  return (
    <button type="button" onClick={onClick} className={className} aria-label="Abrir la guía de uso del geovisor" title="Guía de uso" data-guia="boton">
      <HelpCircle size={16} />
    </button>
  );
}
