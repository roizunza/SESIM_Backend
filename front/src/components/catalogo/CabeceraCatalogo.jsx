import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const TEXTOS = {
  instrumentos: { titulo: 'Catálogo de instrumentos', sinopsis: 'Consulte las leyes, reglamentos, programas, planes y normas técnicas que sustentan la movilidad y la seguridad vial en el Estado de Campeche y sus municipios.' },
  consulta: { titulo: 'Fuentes de información', sinopsis: 'Consulte las fuentes estadísticas y geoespaciales oficiales que alimentan los indicadores y las capas del SESIM, con su uso, cobertura y limitaciones.' },
};

export const VISTAS = [
  { id: 'instrumentos', titulo: 'Instrumentos normativos' },
  { id: 'consulta', titulo: 'Consulta oficial' },
];

/** Encabezado común del catálogo: título, selector de vista (pestañas) y, a la derecha, los contadores de la vista activa. */
export default function CabeceraCatalogo({ vista, children }) {
  const [, setParams] = useSearchParams();
  const botones = useRef({});
  const ir = (id) => setParams(id === 'instrumentos' ? {} : { vista: id });
  const alTeclear = (e) => {
    const k = VISTAS.findIndex((v) => v.id === vista);
    const destino = e.key === 'ArrowRight' ? (k + 1) % VISTAS.length : e.key === 'ArrowLeft' ? (k - 1 + VISTAS.length) % VISTAS.length : null;
    if (destino === null) return;
    e.preventDefault();
    ir(VISTAS[destino].id);
    botones.current[VISTAS[destino].id]?.focus();
  };
  return (
    <header className="catalogo__cabecera">
      <div className="catalogo__titulos">
        <span className="catalogo__etq">Normativa</span>
        <h1>{TEXTOS[vista].titulo}</h1>
        <p>{TEXTOS[vista].sinopsis}</p>
        <div className="catalogo__vistas" role="tablist" aria-label="Vista del catálogo" onKeyDown={alTeclear}>
          {VISTAS.map((v) => (
            <button
              key={v.id}
              ref={(n) => { botones.current[v.id] = n; }}
              type="button"
              role="tab"
              id={`catalogo-tab-${v.id}`}
              aria-selected={vista === v.id}
              aria-controls="catalogo-panel"
              tabIndex={vista === v.id ? 0 : -1}
              onClick={() => ir(v.id)}
            >
              {v.titulo}
            </button>
          ))}
        </div>
      </div>
      {children}
    </header>
  );
}
