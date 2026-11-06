import { useEffect, useState } from 'react';
import { Bike, Bus, Car, Footprints, Truck } from 'lucide-react';

/** Aclaraciones por nivel: el texto de la ley se lee distinto de la jerarquía de la NOM (5 niveles frente a 6 grupos). */
const ACLARACIONES = {
  transporte_publico: (
    <><b>Un nivel, dos grupos.</b> Este nivel reúne a dos grupos que la Ley General de Movilidad y Seguridad Vial presenta por separado en la fracción III de su artículo 6: las <b className="jer__aclara-b">personas usuarias</b> del transporte público y las <b className="jer__aclara-b">personas prestadoras</b> del servicio. Por eso aquí son 5 niveles y en la ley aparecen como 6 grupos.</>
  ),
};

const ICONOS = { peatones: Footprints, ciclistas: Bike, transporte_publico: Bus, carga: Truck, particulares: Car };

/* Rampa de izquierda (menor prioridad) a derecha (mayor): cada columna es más ancha y más alta que la anterior.
   El borde izquierdo no termina en pico: arranca al 38 % de la altura. */
const PESOS = [1.25, 1.25, 1.5, 1.85, 2.4];
const ALTURA_INICIAL = 0.5;

function useMedia(consulta) {
  const [coincide, setCoincide] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(consulta).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(consulta);
    const alCambiar = () => setCoincide(mq.matches);
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [consulta]);
  return coincide;
}

/**
 * Jerarquía de la movilidad. A la izquierda, título, introducción y la rampa de niveles (de menor a mayor
 * prioridad; las personas peatonas son la columna más ancha y alta); a la derecha, la tarjeta del nivel
 * elegido con su foto y el texto literal de la norma, y debajo la nota de la fuente. Se elige con clic,
 * toque o teclado.
 */
export default function JerarquiaMovilidad({ niveles, introduccion, fundamento, concordancia, nota }) {
  const [activo, setActivo] = useState(niveles[0]?.id ?? null);
  const compacto = useMedia('(max-width: 640px)');
  const nivel = niveles.find((n) => n.id === activo);
  const Icono = ICONOS[nivel?.id] ?? Footprints;

  // De izquierda a derecha: la última prioridad queda a la izquierda y la primera a la derecha.
  const tramos = [...niveles].sort((a, b) => b.orden - a.orden);
  const pesos = tramos.map((_, k) => PESOS[k] ?? 1);
  const total = pesos.reduce((s, p) => s + p, 0);
  let acumulado = 0;
  const columnas = tramos.map((n, k) => {
    const a = acumulado / total;
    acumulado += pesos[k];
    const b = acumulado / total;
    const alto = (x) => ALTURA_INICIAL + (1 - ALTURA_INICIAL) * x;
    return { n, k, peso: pesos[k], recorte: `polygon(0 ${(1 - alto(a)) * 100}%, 100% ${(1 - alto(b)) * 100}%, 100% 100%, 0 100%)` };
  });
  const tono = (k) => {
    const t = tramos.length > 1 ? k / (tramos.length - 1) : 1;
    const a = [96, 20, 44];
    const b = [176, 54, 90];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  };

  // Las imágenes de todos los niveles se descargan desde el inicio: al cambiar no hay parpadeo.
  useEffect(() => {
    for (const n of niveles) if (n.imagen?.archivo) new Image().src = n.imagen.archivo;
  }, [niveles]);

  const alTeclear = (e, k) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (k + d + columnas.length) % columnas.length;
    setActivo(columnas[j].n.id);
    e.currentTarget.parentElement?.querySelectorAll('button')[j]?.focus();
  };

  return (
    <div className={`jer${compacto ? ' jer--compacto' : ''}`}>
      <div className="jer__izq">
        <h3 className="jer__caja jer__titulo-caja">Jerarquía de la movilidad</h3>
        <p className="jer__caja jer__intro">{introduccion}</p>

        <div className="jer__rampa" role="group" aria-label="Niveles de la jerarquía, de menor a mayor prioridad">
          {columnas.map(({ n, k, peso, recorte }) => (
            <button
              key={n.id}
              type="button"
              className={`jer__col${n.id === activo ? ' jer__col--activa' : ''}`}
              style={{ '--peso': peso, '--recorte': recorte, '--tono': tono(k), '--k': k }}
              aria-pressed={n.id === activo}
              aria-label={`Prioridad ${n.orden}: ${n.nombre}`}
              onClick={() => setActivo(n.id)}
              onKeyDown={(e) => alTeclear(e, k)}
            >
              <span className="jer__col-num">{n.orden}</span>
              {!compacto && <span className="jer__col-nombre">{n.nombre}</span>}
            </button>
          ))}
        </div>
        {compacto && (
          <div className="jer__chips" role="group" aria-label="Elegir nivel">
            {[...tramos].reverse().map((n) => (
              <button key={n.id} type="button" className={`jer__chip${n.id === activo ? ' jer__chip--activo' : ''}`} aria-pressed={n.id === activo} onClick={() => setActivo(n.id)}>
                <span>{n.orden}</span>{n.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="jer__eje" aria-hidden="true"><span>Menor prioridad</span><i /><span className="jer__eje-fin">Mayor prioridad</span></div>
      </div>

      <div className="jer__der">
        {nivel && (
          <aside className="jer__tarjeta" aria-live="polite">
            <div key={nivel.id} className="jer__ficha">
              {nivel.imagen && (
                <figure className="jer__foto">
                  <img src={nivel.imagen.archivo} alt={nivel.imagen.alt} style={{ objectPosition: nivel.imagen.enfoque }} />
                  {nivel.imagen.credito && <figcaption>Imagen: {nivel.imagen.credito}</figcaption>}
                </figure>
              )}
              <div className="jer__cuerpo">
                <span className="jer__prioridad">Prioridad {nivel.orden} de {niveles.length}</span>
                <h3 className="jer__titulo"><span className="jer__icono" aria-hidden="true"><Icono size={20} /></span>{nivel.nombre}</h3>
                <blockquote className="jer__cita">«{nivel.texto}»</blockquote>
                {ACLARACIONES[nivel.id] && (
                  <p className="jer__aclara" role="note"><span className="jer__aclara-i" aria-hidden="true">i</span><span>{ACLARACIONES[nivel.id]}</span></p>
                )}
                <p className="jer__fuente">{fundamento}{concordancia ? `. Concordancia: ${concordancia}.` : '.'}</p>
              </div>
            </div>
          </aside>
        )}
        {nota}
      </div>
    </div>
  );
}
