import { useRef } from 'react';

const ANCHO_MIN = 0.6;
/** Gama de la pirámide: del beige claro del primer peldaño al café oscuro del último (misma gama que la pirámide del SEOTDU). */
const TONOS = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ fondo: `var(--pal-pir-${i})`, acento: `var(--pal-pir-a-${i})`, texto: `var(--pal-pir-t-${i})` }));

/**
 * Pirámide de instrumentos de planeación como embudo escalonado (diseño del SEOTDU): peldaños numerados que
 * se estrechan de arriba hacia abajo; el elegido se resalta con un anillo, los anteriores y los siguientes se
 * atenúan ligeramente; la letra de cada peldaño (F, E, M, T) indica su escala. Cada peldaño es un botón; las flechas ↑/↓ recorren la pirámide
 * y los paneles laterales cambian con el peldaño elegido.
 */
export default function PiramideNormativa({ niveles, conteos, escalas, seleccionado, onSeleccionar, filtro = null }) {
  const botones = useRef(new Map());
  const orden = [...niveles].sort((a, b) => a.nivel - b.nivel);
  const n = orden.length;
  const paso = (1 - ANCHO_MIN) / Math.max(n - 1, 1);

  const mover = (evento, nivel) => {
    const delta = { ArrowUp: -1, ArrowDown: 1, Home: 1 - nivel, End: n - nivel }[evento.key];
    if (delta === undefined) return;
    evento.preventDefault();
    const destino = Math.min(n, Math.max(1, nivel + delta));
    onSeleccionar(destino);
    botones.current.get(destino)?.focus();
  };

  return (
    <ol className="piramide" aria-label="Pirámide de instrumentos de planeación; use las flechas arriba y abajo para recorrerla">
      {orden.map((nivel, fila) => {
        const activo = seleccionado === nivel.nivel;
        const recorrido = nivel.nivel < seleccionado;
        const tono = TONOS[Math.min(fila, TONOS.length - 1)];
        const total = conteos.get(nivel.nivel) ?? 0;
        const estado = activo ? 'activa' : recorrido ? 'recorrida' : 'pendiente';
        const fuera = filtro && nivel.escala !== filtro;
        return (
          <li
            key={nivel.nivel}
            className={`piramide__fila piramide__fila--${estado}${fuera ? ' piramide__fila--fuera' : ''}`}
            style={{ '--ancho': 1 - paso * fila, '--fila': fila, '--fondo': tono.fondo, '--texto': tono.texto, '--acento': tono.acento }}
          >
            <button
              type="button"
              ref={(el) => (el ? botones.current.set(nivel.nivel, el) : botones.current.delete(nivel.nivel))}
              className="piramide__peldano"
              aria-pressed={activo}
              tabIndex={activo ? 0 : -1}
              aria-label={`${nivel.titulo}: ${nivel.subtitulo}. Escala ${escalas[nivel.escala] ?? nivel.escala}.${total ? ` ${total} instrumentos en el banco documental.` : ''}`}
              onClick={() => onSeleccionar(nivel.nivel)}
              onKeyDown={(e) => mover(e, nivel.nivel)}
            >
              <span className="piramide__num" aria-hidden="true">{String(nivel.nivel).padStart(2, '0')}</span>
              <span className="piramide__textos">
                <span className="piramide__titulo">{nivel.titulo}</span>
                <span className="piramide__subtitulo">{nivel.subtitulo}</span>
              </span>
              <span className={`piramide-badge piramide-badge--${nivel.escala} piramide__escala`} aria-hidden="true">{nivel.escala}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
