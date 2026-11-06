import { useMemo } from 'react';
import { fmtNumero } from '../tablero/formato';
import { RELACIONES, SIN_ORIGEN, resumirTrazabilidad } from '../../lib/sesim/trazabilidad';
import './TrazabilidadInstrumentos.css';

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)} %` : '—');

/** Trazabilidad de los indicadores con base en el instrumento de planeación (indicador_instrumento). */
export default function TrazabilidadInstrumentos({ indicadores, vinculosDe, instrumentos, seleccion, onFiltrar }) {
  const r = useMemo(() => resumirTrazabilidad(indicadores, vinculosDe, instrumentos), [indicadores, vinculosDe, instrumentos]);
  if (!r.total) return null;
  const activo = (instrumento, relacion) => seleccion.instrumento === instrumento && seleccion.relacion === relacion;
  const alternar = (instrumento, relacion) => onFiltrar(activo(instrumento, relacion) ? { instrumento: '', relacion: '' } : { instrumento, relacion });

  return (
    <section className="traza-ins" aria-labelledby="traza-ins-titulo">
      <header className="traza-ins__cabecera">
        <h3 id="traza-ins-titulo">Trazabilidad por instrumento</h3>
        {r.principal && (
          <p>
            <strong>{fmtNumero(r.principal.conteo.origen)} de {fmtNumero(r.total)} indicadores ({pct(r.principal.conteo.origen, r.total)})</strong> tienen su origen en {r.principal.instrumento.nombre}.
            {r.sinOrigen > 0 && <> {fmtNumero(r.sinOrigen)} no tienen instrumento de origen registrado{r.sinOrigen > r.sinVinculo ? '; se vinculan con otros instrumentos por correspondencia directa o parcial' : ''}.</>}
          </p>
        )}
        <ul className="traza-ins__leyenda" aria-label="Tipos de relación">
          {RELACIONES.map((rel) => <li key={rel.clave} title={rel.ayuda}><i className={`traza-ins__marca traza-ins__marca--${rel.clave}`} aria-hidden="true" />{rel.etiqueta}</li>)}
        </ul>
      </header>

      <table className="traza-ins__tabla">
        <caption className="sr-only">Indicadores por instrumento y tipo de relación. Cada cifra filtra la lista de indicadores.</caption>
        <thead>
          <tr><th scope="col">Instrumento</th><th scope="col" className="traza-ins__col-barra">Distribución</th>{RELACIONES.map((rel) => <th key={rel.clave} scope="col" title={rel.ayuda}>{rel.etiqueta}</th>)}</tr>
        </thead>
        <tbody>
          {r.filas.map(({ instrumento: ins, conteo }) => (
            <tr key={ins.id}>
              <th scope="row"><span className="traza-ins__clave">{ins.clave}</span><span className="traza-ins__nombre">{ins.nombre}</span></th>
              <td className="traza-ins__col-barra">
                <span className="traza-ins__barra" role="img" aria-label={RELACIONES.map((rel) => `${conteo[rel.clave]} ${rel.etiqueta.toLowerCase()}`).join(', ')}>
                  {RELACIONES.map((rel) => conteo[rel.clave] > 0 && <i key={rel.clave} className={`traza-ins__marca--${rel.clave}`} style={{ width: `${(conteo[rel.clave] / r.total) * 100}%` }} />)}
                </span>
              </td>
              {RELACIONES.map((rel) => (
                <td key={rel.clave}>
                  {conteo[rel.clave] > 0 ? (
                    <button type="button" className="traza-ins__cifra" aria-pressed={activo(ins.id, rel.clave)} onClick={() => alternar(ins.id, rel.clave)} aria-label={`${conteo[rel.clave]} indicadores ${rel.etiqueta.toLowerCase()} con ${ins.clave}: filtrar`}>
                      {fmtNumero(conteo[rel.clave])}
                    </button>
                  ) : <span className="traza-ins__cero">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {r.sinOrigen > 0 && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>Sin instrumento de origen registrado</th>
              <td colSpan={RELACIONES.length}>
                <button type="button" className="traza-ins__cifra traza-ins__cifra--alerta" aria-pressed={activo('', SIN_ORIGEN)} onClick={() => alternar('', SIN_ORIGEN)}>
                  {fmtNumero(r.sinOrigen)} indicadores
                </button>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
