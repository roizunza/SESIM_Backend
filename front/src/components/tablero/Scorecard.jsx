import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { COLORES_SEMAFORO } from '../../lib/sesim/semaforo';
import { fmtNumero, fmtVariacion } from './formato';

function Tendencia({ variacion, favorable }) {
  if (variacion === null || variacion === undefined) return <span className="scorecard__tendencia scorecard__tendencia--neutra">Sin periodo previo</span>;
  const Icono = variacion > 0 ? ArrowUpRight : variacion < 0 ? ArrowDownRight : Minus;
  const clase = favorable === null ? 'neutra' : favorable ? 'avance' : 'retroceso';
  const lectura = favorable === null ? 'sin sentido de mejora definido' : favorable ? 'avance' : 'retroceso';
  return (
    <span className={`scorecard__tendencia scorecard__tendencia--${clase}`} aria-label={`Variación ${fmtVariacion(variacion)} respecto al periodo previo: ${lectura}`}>
      <Icono size={14} aria-hidden="true" /> {fmtVariacion(variacion)}
    </span>
  );
}

/**
 * Tarjeta de indicador: valor del corte, tendencia contra el periodo previo,
 * progreso a la meta (F04) y acceso a la ficha técnica.
 */
export default function Scorecard({ resumen, comparado, etiquetaCorte, etiquetaComparado, activo, onEnfocar, onFicha }) {
  const { indicador: ind, ultimo, variacion, favorable, avance, semaforo } = resumen;
  const progreso = avance === null ? null : Math.max(0, Math.min(100, avance));
  return (
    <article className={`scorecard${activo ? ' scorecard--activo' : ''}`} aria-labelledby={`sc-${ind.id}`}>
      <header className="scorecard__cabecera">
        <button type="button" className="scorecard__enfocar" onClick={onEnfocar} aria-pressed={activo} id={`sc-${ind.id}`}>
          <code>{ind.id}</code>
          <span>{ind.nombre}</span>
        </button>
        <button type="button" className="scorecard__info" onClick={onFicha} aria-label={`Ficha técnica de ${ind.nombre}`} title="Ficha técnica">
          <Info size={16} />
        </button>
      </header>

      <div className="scorecard__valor">
        <strong>{fmtNumero(ultimo.valor)}</strong>
        <Tendencia variacion={variacion} favorable={favorable} />
      </div>
      <p className="scorecard__corte">
        {ultimo.periodo.etiqueta} · {etiquetaCorte}
        {ultimo.n > 1 && ` · promedio de ${ultimo.n} municipios`}
      </p>

      {comparado?.ultimo && (
        <p className="scorecard__comparado">
          <span>{etiquetaComparado}</span>
          <strong>{fmtNumero(comparado.ultimo.valor)}</strong>
          <small>{comparado.ultimo.periodo.etiqueta}</small>
        </p>
      )}

      <div className="scorecard__meta">
        {progreso === null ? (
          <span className="scorecard__sin-meta">{ind.valor_meta == null ? 'Sin meta numérica registrada' : 'Sin línea base para calcular avance'}</span>
        ) : (
          <>
            <div className="scorecard__meta-texto">
              <span>Avance a meta{ind.valor_meta != null ? ` (${fmtNumero(ind.valor_meta)})` : ''}</span>
              <strong>{Math.round(avance)} %</strong>
            </div>
            <div className="scorecard__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progreso)} aria-label={`Avance a la meta de ${ind.nombre}`}>
              <i style={{ width: `${progreso}%`, background: COLORES_SEMAFORO[semaforo] }} />
            </div>
          </>
        )}
        <span className="scorecard__semaforo" style={{ '--sem': COLORES_SEMAFORO[semaforo] }}>
          <i aria-hidden="true" /> {semaforo.charAt(0).toUpperCase() + semaforo.slice(1)}
        </span>
      </div>
    </article>
  );
}
