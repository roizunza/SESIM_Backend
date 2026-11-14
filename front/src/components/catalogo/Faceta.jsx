import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Grupo de filtro del panel lateral: encabezado plegable con el número de opciones elegidas y casillas siempre a la vista. */
export default function Faceta({ titulo, opciones, elegidas, onCambio, abiertaInicial = true, marca = null }) {
  const id = useId();
  const [abierta, setAbierta] = useState(abiertaInicial);
  return (
    <div className={`faceta${elegidas.length ? ' faceta--activa' : ''}`}>
      <button type="button" className="faceta__boton" aria-expanded={abierta} aria-controls={id} onClick={() => setAbierta((v) => !v)}>
        <span>{titulo}</span>
        {elegidas.length > 0 && <b aria-label={`${elegidas.length} elegidas`}>{elegidas.length}</b>}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <fieldset id={id} className="faceta__panel" hidden={!abierta}>
        <legend className="sr-only">{titulo}</legend>
        {opciones.map((o) => (
          <label key={o.valor}>
            <input type="checkbox" checked={elegidas.includes(o.valor)} onChange={(e) => onCambio(e.target.checked ? [...elegidas, o.valor] : elegidas.filter((x) => x !== o.valor))} />
            <span>{marca && <i className={`punto punto--${marca(o)}`} aria-hidden="true" />}{o.texto}</span>
            <small aria-label={`${o.n} instrumentos`}>{o.n}</small>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
