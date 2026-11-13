import { useEffect, useState } from 'react';
import { Bike, Bus, Car, Footprints, Truck } from 'lucide-react';
import './JerarquiaMovilidad.css';

/** Aclaraciones por nivel: el texto de la ley se lee distinto de la jerarquía de la NOM (5 niveles frente a 6 grupos). */
const ACLARACIONES = {
  transporte_publico: (
    <><b>Un nivel, dos grupos.</b> Este nivel reúne a dos grupos que la Ley General de Movilidad y Seguridad Vial presenta por separado en la fracción III de su artículo 6: las <b className="jer__aclara-b">personas usuarias</b> del transporte público y las <b className="jer__aclara-b">personas prestadoras</b> del servicio. Por eso aquí son 5 niveles y en la ley aparecen como 6 grupos.</>
  ),
};

const ICONOS = { peatones: Footprints, ciclistas: Bike, transporte_publico: Bus, carga: Truck, particulares: Car };

/**
 * Jerarquía de la movilidad. Una escalera a todo el ancho: cinco escalones que suben de izquierda a derecha
 * (de menor a mayor prioridad), cada uno con su color. Al pasar el cursor, enfocar con el teclado o tocar un
 * escalón, éste cambia a su fotografía y crece; debajo aparece la ficha con el texto literal de la norma.
 * En pantallas angostas los escalones se apilan como barras horizontales.
 */
export default function JerarquiaMovilidad({ niveles, introduccion, fundamento, concordancia, nota }) {
  // Se abre con la prioridad 1 para que la ficha nunca quede vacía.
  const primero = [...niveles].sort((a, b) => a.orden - b.orden)[0];
  const [activo, setActivo] = useState(primero?.id ?? null);

  // De izquierda a derecha: la última prioridad queda a la izquierda y la primera a la derecha.
  const tramos = [...niveles].sort((a, b) => b.orden - a.orden);
  const n = tramos.length;
  // beige claro → verde profundo (styles/paleta.css)
  const tono = (k) => `color-mix(in srgb, var(--pal-verde) ${Math.round(15 + 85 * (n > 1 ? k / (n - 1) : 1))}%, var(--pal-beige))`;

  // Las fotos se descargan desde el inicio: al pasar de un escalón a otro no hay parpadeo.
  useEffect(() => {
    for (const nv of niveles) if (nv.imagen?.archivo) new Image().src = nv.imagen.archivo;
  }, [niveles]);

  const alTeclear = (e, k) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    e.currentTarget.parentElement?.querySelectorAll('button')[(k + d + n) % n]?.focus();
  };
  // El ratón cambia al pasar; el toque, al tocar (onFocus cubre el teclado).
  const alPasar = (e, id) => { if (e.pointerType === 'mouse') setActivo(id); };

  return (
    <div className="jer">
      <header className="jer__cabecera">
        <h3 className="jer__titulo-caja">Jerarquía de la movilidad</h3>
        <p className="jer__intro">{introduccion}</p>
      </header>

      <div className="jer__escalera" role="group" aria-label="Niveles de la jerarquía, de menor a mayor prioridad">
        {tramos.map((nv, k) => {
          const Icono = ICONOS[nv.id] ?? Footprints;
          const sel = nv.id === activo;
          return (
            <button
              key={nv.id}
              type="button"
              className={`jer__esc${sel ? ' jer__esc--activo' : ''}${n > 1 && k / (n - 1) > 0.55 ? ' jer__esc--oscuro' : ''}`}
              style={{ '--k': k, '--n': n, '--tono': tono(k) }}
              aria-pressed={sel}
              aria-controls={`jer-ficha-${nv.id}`}
              aria-label={`Prioridad ${nv.orden}: ${nv.nombre}`}
              onPointerEnter={(e) => alPasar(e, nv.id)}
              onFocus={() => setActivo(nv.id)}
              onClick={() => setActivo(nv.id)}
              onKeyDown={(e) => alTeclear(e, k)}
            >
              {nv.imagen?.archivo && (
                <img className="jer__esc-foto" src={nv.imagen.archivo} alt="" loading="eager" decoding="async" style={{ objectPosition: nv.imagen.enfoque }} />
              )}
              <span className="jer__esc-velo" aria-hidden="true" />
              <span className="jer__esc-texto">
                <span className="jer__esc-num">{nv.orden}</span>
                <span className="jer__esc-nombre"><Icono size={18} aria-hidden="true" />{nv.nombre}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="jer__eje" aria-hidden="true"><span>Menor prioridad</span><i /><span className="jer__eje-fin">Mayor prioridad</span></div>

      {/* Las fichas comparten celda: la altura es la de la más larga y nada salta al cambiar de nivel. */}
      <div className="jer__info">
        {niveles.map((nv) => {
          const sel = nv.id === activo;
          const Icono = ICONOS[nv.id] ?? Footprints;
          return (
            <section
              key={nv.id}
              id={`jer-ficha-${nv.id}`}
              className={`jer__ficha${sel ? ' jer__ficha--activa' : ''}`}
              aria-hidden={!sel}
              aria-label={`Prioridad ${nv.orden}: ${nv.nombre}`}
            >
              <div className="jer__ficha-cab">
                <span className="jer__prioridad">Prioridad {nv.orden} de {niveles.length}</span>
                <h4 className="jer__titulo"><span className="jer__icono" aria-hidden="true"><Icono size={22} /></span>{nv.nombre}</h4>
              </div>
              <div className="jer__ficha-cuerpo">
                <blockquote className="jer__cita">«{nv.texto}»</blockquote>
                {ACLARACIONES[nv.id] && (
                  <p className="jer__aclara" role="note"><span className="jer__aclara-i" aria-hidden="true">i</span><span>{ACLARACIONES[nv.id]}</span></p>
                )}
                <p className="jer__fuente">
                  {fundamento}{concordancia ? `. Concordancia: ${concordancia}.` : '.'}
                  {nv.imagen?.credito && <> Imagen: {nv.imagen.credito}.</>}
                </p>
              </div>
            </section>
          );
        })}
      </div>
      {nota}
    </div>
  );
}
