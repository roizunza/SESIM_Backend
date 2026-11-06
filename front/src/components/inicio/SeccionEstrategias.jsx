import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { EJES_ESTRATEGICOS } from '../../lib/ejesEstrategicos';
import { useCatalogo } from '../../lib/sesim/useCatalogo';
import { RUTAS } from '../../lib/rutas';
import { NIVELES_MIR as NIVELES, resumenEstrategias as resumen } from '../../lib/sesim/resumenEstrategias';
import './SeccionEstrategias.css';

const TABLAS = ['indicador', 'indicador_eje', 'eje_tematico'];

const VERTIENTES = [
  {
    id: 'sectoriales',
    titulo: 'Sectoriales',
    unidad: 'sectores',
    texto: 'Monitorean y evalúan los resultados de las dependencias que integran el Sistema Estatal de Movilidad y Seguridad Vial.',
    etiqueta: 'Sectores de medición',
    items: ['Gobierno y Administración.', 'Ambiente, Cambio Climático y Gestión Integral de Riesgos.', 'Observatorios Ciudadanos.', 'Inclusión y Género.'],
  },
  {
    id: 'desempeno',
    titulo: 'Desempeño',
    unidad: 'horizontes',
    texto: 'Permiten medir los logros obtenidos conforme a los objetivos planteados al final de la ejecución de la EEMSV.',
    etiqueta: 'Horizontes de planeación',
    items: ['Inmediato y corto plazo.', 'Mediano plazo.', 'Largo plazo.'],
  },
];

const sinNumero = (t) => t.replace(/^\d+\.\s*/, '');

const dato = (v) => (v === undefined || v === null ? '—' : v);

/** Mosaico de una vertiente: título y sinopsis; al pasar el cursor (o tocar) se alarga y muestra su detalle. */
function Vertiente({ v }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className={`estr-vertiente${abierto ? ' estr-vertiente--abierta' : ''}`} onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
      <button type="button" className="estr-vertiente__cabeza" aria-expanded={abierto} aria-controls={`vert-${v.id}`} onClick={() => setAbierto((a) => !a)} onFocus={() => setAbierto(true)}>
        <span className="estr-vertiente__fila">
          <span className="estr-vertiente__titulo">{v.titulo}</span>
          <span className="estr-vertiente__num">{v.items.length}<small>{v.unidad}</small></span>
        </span>
        <span className="estr-vertiente__texto">{v.texto}</span>
        <span className="estr-vertiente__mas" aria-hidden="true">Ver detalle <ChevronDown size={14} /></span>
      </button>
      <div id={`vert-${v.id}`} className="estr-vertiente__detalle" role="region" aria-label={v.etiqueta}>
        <div>
          <span className="estr-vertiente__etiqueta">{v.etiqueta}</span>
          <ul>{v.items.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

/**
 * «Estrategias y sus indicadores»: un hilo de tres pasos.
 *  1 · Las cinco Estrategias con su número de indicadores (cada pastilla lleva al Geovisor).
 *  2 · Clasificación de los indicadores (vertientes) y medición (qué es la MIR).
 *  3 · Cómo se lee esa clasificación en cada Estrategia, por nivel de la MIR (cada tarjeta lleva al Tablero).
 * Las cifras salen del catálogo; mientras carga se muestran guiones.
 */
export default function SeccionEstrategias({ id }) {
  const { datos, error } = useCatalogo(TABLAS);
  const r = useMemo(() => resumen(datos), [datos]);
  const [activa, setActiva] = useState(null);
  const maxMir = r ? Math.max(1, ...EJES_ESTRATEGICOS.flatMap((e) => Object.values(r.porEje[e.numero].mir))) : 1;

  return (
    <section id={id} className="estr" aria-labelledby={`${id}-titulo`}>
      <header className="sec-cab" data-revelar>
        <h2 id={`${id}-titulo`} className="sec-titulo">Estrategias e indicadores</h2>
        <p className="sec-subtitulo">Las cinco estrategias de la EEMSV</p>
      </header>
      <p className="estr__sinopsis sec-sinopsis" data-revelar style={{ '--retardo': '100ms' }}>
        Cada indicador del SESIM apunta a una estrategia, mide un tipo de resultado y se evalúa desde una vertiente. Elige una estrategia y explora sus indicadores.
      </p>

      <div className="estr__hilo">
        {/* 1 · Las cinco estrategias */}
        <div className="estr__paso" data-revelar>
          <span className="estr__nodo" aria-hidden="true">1</span>
          <div className="estr__pastillas" role="group" aria-label="Estrategias de la EEMSV">
            {EJES_ESTRATEGICOS.map((e) => (
              <article key={e.id} className={`estr-pastilla${activa === e.numero ? ' estr-pastilla--activa' : ''}`} style={{ '--c': e.colorVar }}>
                <button type="button" className="estr-pastilla__sel" aria-pressed={activa === e.numero} onClick={() => setActiva(activa === e.numero ? null : e.numero)}>
                  <span className="estr-pastilla__num" aria-hidden="true">{e.numero}</span>
                  <span className="estr-pastilla__titulo">{sinNumero(e.tituloCorto)}</span>
                  <span className="estr-pastilla__texto">{e.descripcionCorta}</span>
                  <span className="estr-pastilla__cifra"><strong>{dato(r?.porEje[e.numero].total)}</strong> indicadores</span>
                </button>
                <Link to={`${RUTAS.geovisor}?estrategia=${e.id}`} className="estr-pastilla__mapa" title={`Ver ${e.label} en el Geovisualizador`}>Ver en el mapa →</Link>
              </article>
            ))}
          </div>
          <p className="estr__total"><strong>{dato(r?.total)}</strong> indicadores en total. Un indicador puede pertenecer a más de una estrategia.</p>
        </div>

        {/* 2 · Clasificación y medición */}
        <div className="estr__paso estr__paso--clasif" data-revelar>
          <span className="estr__nodo" aria-hidden="true">2</span>
          <div className="estr__clasif">
            <div>
              <h3 className="estr__h3">Clasificación de indicadores</h3>
              <p className="estr__d">El modelo conceptual estructura el catálogo maestro en dos vertientes principales de evaluación institucional.</p>
              <div className="estr__vertientes">{VERTIENTES.map((v) => <Vertiente key={v.id} v={v} />)}</div>
            </div>
            <div>
              <h3 className="estr__h3">Medición de los indicadores</h3>
              <p className="estr__d">¿Qué es la MIR?</p>
              <div className="estr-mir">
                <p>La Matriz de Indicadores para Resultados (MIR) ordena los indicadores según lo que miden, de lo más amplio a lo más concreto.</p>
                <h4>Qué tipo de resultado mide</h4>
                <ul>
                  {NIVELES.map((n) => (
                    <li key={n.clave}>
                      <span>{n.etiqueta}</span>
                      <em>{n.texto}</em>
                      <b>{dato(r?.mirTotal[n.clave])}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 3 · Lectura por estrategia */}
        <div className="estr__paso" data-revelar>
          <span className="estr__nodo" aria-hidden="true">3</span>
          <h3 className="estr__h3">Cómo se lee la clasificación en cada estrategia</h3>
          <p className="estr__d">Así se distribuyen los indicadores de cada estrategia según el nivel de la MIR: Fin, Propósito, Componentes y Actividades.</p>
          <div className={`estr__lectura${activa ? ' estr__lectura--sel' : ''}`}>
            {EJES_ESTRATEGICOS.map((e) => (
              <div key={e.id} className={`estr-col${activa === e.numero ? ' estr-col--activa' : ''}`} style={{ '--c': e.colorVar }}>
                <span className="estr-col__flecha" aria-hidden="true"><i /></span>
                <div className="estr-col__tarjeta">
                  <h4><span aria-hidden="true" />{sinNumero(e.tituloCorto)}</h4>
                  <dl>
                    {NIVELES.map((n) => {
                      const v = r?.porEje[e.numero].mir[n.clave];
                      return (
                        <div key={n.clave}>
                          <dt>{n.clave}</dt>
                          <dd><span className="estr-barra"><i style={{ width: `${r ? (100 * v) / maxMir : 0}%` }} /></span><b>{dato(v)}</b></dd>
                        </div>
                      );
                    })}
                  </dl>
                  <Link to={RUTAS.tableroPublico} className="estr-col__ir">Ver en el tablero →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="estr__aviso" role="status">No se pudieron leer las cifras del catálogo: {error}</p>}

      <div className="estr__cierre" data-revelar>
        <div>
          <strong>Explora datos</strong>
          <span>El Tablero reúne la cobertura, los instrumentos y los indicadores del sistema.</span>
        </div>
        <Link to={RUTAS.tableroPublico} className="estr__boton">Ir al tablero ↗</Link>
      </div>
    </section>
  );
}
