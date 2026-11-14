import { useMemo, useRef, useState } from 'react';
import { X, Table2, Info, ArrowRight, Minus, Maximize2, Minimize2, Expand, GripHorizontal } from 'lucide-react';
import { useDatosCapa } from '../../../lib/sesim/useDatosCapa';
import './VisorCampos.css';

/**
 * «Ver campos y registros»: qué trae la capa. Muestra la tabla de campos (nombre, tipo, vacíos, ejemplo) y un resumen
 * de registros y campos. Si hay una actualización propuesta (o la capa aún no tiene geometría cargada en la base), compara
 * lo que hay hoy contra lo que viene en el archivo del capturista.
 *  · «Hoy»: se calcula de los elementos que la base sirve para la capa.
 *  · «Propuesta/archivo»: la ficha de campos que el capturista guardó al revisar su GeoPackage (metadatos_extra.campos).
 */
const claves = (lista) => new Set(lista.map((c) => c.nombre));

function camposDeFeatures(datos) {
  const fs = datos?.features ?? [];
  if (!fs.length) return [];
  const muestra = fs.slice(0, 500);
  const nombres = new Set();
  muestra.forEach((f) => Object.keys(f.properties ?? {}).forEach((k) => nombres.add(k)));
  return [...nombres].map((nombre) => {
    let vacios = 0; let ejemplo = ''; let tipo = '';
    for (const f of muestra) {
      const v = f.properties?.[nombre];
      if (v === null || v === undefined || String(v).trim() === '') vacios += 1;
      else if (!ejemplo) { ejemplo = String(v).slice(0, 60); tipo = typeof v === 'number' ? (Number.isInteger(v) ? 'entero' : 'decimal') : 'texto'; }
    }
    return { nombre, tipo, vacios, ejemplo };
  });
}

function TablaCampos({ campos, marcar }) {
  if (!campos.length) return <p className="dc-nota"><Info size={14} aria-hidden="true" /> Sin campos disponibles.</p>;
  return (
    <div className="vc-tabla-caja">
      <table className="vc-tabla">
        <thead><tr><th>Campo</th><th>Tipo</th><th>Vacíos</th><th>Ejemplo</th></tr></thead>
        <tbody>
          {campos.map((c) => (
            <tr key={c.nombre} className={marcar?.has(c.nombre) ? 'vc-nuevo' : ''}>
              <td><code>{c.nombre}</code></td><td>{c.tipo || '—'}</td><td>{c.vacios ?? '—'}</td><td>{c.ejemplo || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VisorCampos({ capa, propuesta, onClose }) {
  // Ventana flotante: se arrastra desde el encabezado, se redimensiona desde la esquina y se minimiza. No tapa ni bloquea el mapa.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [min, setMin] = useState(false);
  const [tam, setTam] = useState(null); // { w, h } una vez que se redimensiona
  const ventana = useRef(null);
  const [previo, setPrevio] = useState(null);
  const grande = !!previo;
  const ampliar = () => {
    if (previo) { setTam(previo.tam); setPos(previo.pos); setPrevio(null); return; }
    const r = ventana.current.getBoundingClientRect();
    setPrevio({ tam, pos });
    setTam({ w: Math.min(1100, window.innerWidth - 32), h: window.innerHeight - 120 });
    setPos({ x: pos.x - (r.left - 16), y: pos.y - (r.top - 80) });
  };
  const redimensionar = (dir) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = ventana.current; const r0 = el.getBoundingClientRect(); const x0 = e.clientX; const y0 = e.clientY;
    const mover = (ev) => setTam({ w: dir.includes('x') ? Math.min(Math.max(300, r0.width + ev.clientX - x0), window.innerWidth - 16) : r0.width, h: dir.includes('y') ? Math.min(Math.max(140, r0.height + ev.clientY - y0), window.innerHeight - 16) : r0.height });
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar);
  };
  const arrastre = useRef(null);
  const iniciar = (e) => {
    if (e.target.closest('button')) return;
    arrastre.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e) => { if (arrastre.current) setPos({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y }); };
  const soltar = () => { arrastre.current = null; };
  const m = capa.metadatos_extra ?? {};
  const { datos, error } = useDatosCapa(capa, true);
  const hoy = useMemo(() => camposDeFeatures(datos), [datos]);
  const nHoy = datos?.features?.length ?? null;
  const archivo = Array.isArray((propuesta ?? m).campos) ? (propuesta ?? m).campos : [];
  const comparar = !!propuesta && hoy.length > 0 && archivo.length > 0;
  const nuevos = useMemo(() => (comparar ? archivo.filter((c) => !claves(hoy).has(c.nombre)).map((c) => c.nombre) : []), [comparar, archivo, hoy]);
  const quitados = useMemo(() => (comparar ? hoy.filter((c) => !claves(archivo).has(c.nombre)).map((c) => c.nombre) : []), [comparar, archivo, hoy]);
  const registrosArchivo = (propuesta ?? {}).n_elementos ?? capa.n_elementos;

  const vistaPrincipal = propuesta || !hoy.length ? archivo : hoy;
  const etiquetaPrincipal = propuesta ? 'Campos del archivo propuesto' : hoy.length ? 'Campos de la capa' : 'Campos del archivo cargado';

  return (
    <>
      <div ref={ventana} className={`vc-ventana${min ? ' vc-ventana--min' : ''}`} style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, ...(tam && !min ? { width: tam.w, height: tam.h } : {}) }} role="dialog" aria-modal="false" aria-labelledby="vc-titulo">
        <div className="vc-cab" onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} title="Arrastra para mover la ventana">
          <GripHorizontal size={16} className="vc-asa" aria-hidden="true" />
          <div className="vc-cab__txt"><p className="dc-rotulo"><code>{capa.id}</code> · Campos y registros</p><h3 id="vc-titulo" className="dc-titulo">{capa.titulo}</h3></div>
          <button type="button" className="vc-btn" onClick={ampliar} aria-label={grande ? 'Reducir al tamaño anterior' : 'Ampliar la ventana'} title={grande ? 'Reducir' : 'Ampliar'}>{grande ? <Minimize2 size={16} /> : <Expand size={16} />}</button>
          <button type="button" className="vc-btn" onClick={() => setMin(!min)} aria-label={min ? 'Restaurar' : 'Minimizar'} title={min ? 'Restaurar' : 'Minimizar'}>{min ? <Maximize2 size={16} /> : <Minus size={16} />}</button>
          <button type="button" className="vc-btn" onClick={onClose} aria-label="Cerrar" title="Cerrar"><X size={18} /></button>
        </div>
        {!min && <div className="vc-cuerpo">
          <section className="vc-resumen" aria-label="Resumen">
            <div><strong>{(propuesta ? registrosArchivo : (nHoy ?? capa.n_elementos))?.toLocaleString('es-MX') ?? '—'}</strong><span>registros{propuesta ? ' en el archivo' : ''}</span></div>
            <div><strong>{vistaPrincipal.length || '—'}</strong><span>campos</span></div>
            {propuesta && <div><strong>{(propuesta.n_elementos_antes ?? capa.n_elementos ?? '—')?.toLocaleString?.('es-MX') ?? '—'} <ArrowRight size={14} aria-hidden="true" /> {propuesta.n_elementos?.toLocaleString('es-MX')}</strong><span>registros antes → propuesta</span></div>}
          </section>

          {propuesta && (
            <section className="dc-bloque" aria-label="Diferencias">
              <h4>Qué cambia entre la capa actual y la propuesta</h4>
              {comparar ? (
                <ul className="vc-dif">
                  <li>Registros: {propuesta.n_elementos_antes ?? '—'} → {propuesta.n_elementos}.</li>
                  <li>Campos: {hoy.length} → {archivo.length}.</li>
                  <li>Campos nuevos: {nuevos.length ? nuevos.join(', ') : 'ninguno'}.</li>
                  <li>Campos que ya no vienen: {quitados.length ? quitados.join(', ') : 'ninguno'}.</li>
                </ul>
              ) : (
                <p className="dc-nota"><Info size={14} aria-hidden="true" /> {!archivo.length ? 'Esta propuesta no trae la ficha de campos (se envió antes de que se guardara).' : 'No se pudieron leer los campos actuales de la capa para compararlos.'} Registros: {propuesta.n_elementos_antes ?? '—'} → {propuesta.n_elementos}.</p>
              )}
            </section>
          )}

          <section aria-label="Campos">
            <h4 className="vc-subtitulo"><Table2 size={15} aria-hidden="true" /> {etiquetaPrincipal}</h4>
            {vistaPrincipal.length > 0 && <TablaCampos campos={vistaPrincipal} marcar={propuesta ? new Set(nuevos) : null} />}
            {!vistaPrincipal.length && <p className="dc-nota"><Info size={14} aria-hidden="true" /> {error ? 'Los elementos de esta capa todavía no están cargados en la base.' : 'Sin campos disponibles.'} La ficha de campos aparece cuando el capturista sube la capa con la revisión del GeoPackage.</p>}
          </section>

          {propuesta && hoy.length > 0 && (
            <section aria-label="Campos actuales">
              <h4 className="vc-subtitulo"><Table2 size={15} aria-hidden="true" /> Campos de la capa vigente</h4>
              <TablaCampos campos={hoy} marcar={null} />
            </section>
          )}
        </div>}
        {!min && <>
          <span className="vc-asa-r vc-asa-r--x" onPointerDown={redimensionar('x')} aria-hidden="true" />
          <span className="vc-asa-r vc-asa-r--y" onPointerDown={redimensionar('y')} aria-hidden="true" />
          <span className="vc-asa-r vc-asa-r--xy" onPointerDown={redimensionar('xy')} title="Arrastra para cambiar el tamaño" aria-hidden="true" />
        </>}
      </div>
    </>
  );
}
