import { ExternalLink } from 'lucide-react';
import AvisoLegal from '../plataforma/AvisoLegal';

/** Ficha de una fuente oficial de información (estadística o geoespacial): uso en el SESIM, cobertura, variables y limitaciones. */
export default function FichaFuente({ fuente, tipo }) {
  return (
    <>
      <section className="ficha-seccion">
        <h3>Identificación</h3>
        <dl className="ficha-campos">
          <dt>Denominación</dt><dd>{fuente.nombre}</dd>
          <dt>Clave en el SESIM</dt><dd>{fuente.clave}</dd>
          <dt>Tipo de información</dt><dd>{tipo}</dd>
          {fuente.subtipo && <><dt>Desagregación</dt><dd>{fuente.subtipo}</dd></>}
          {fuente.cobertura_geografica && <><dt>Cobertura geográfica</dt><dd>{fuente.cobertura_geografica}</dd></>}
          {fuente.cobertura_temporal && <><dt>Cobertura temporal</dt><dd>{fuente.cobertura_temporal}</dd></>}
        </dl>
      </section>
      {fuente.uso_sesim && (
        <section className="ficha-seccion">
          <h3>Uso en el SESIM</h3>
          <p className="ficha-texto">{fuente.uso_sesim}</p>
        </section>
      )}
      {fuente.variables && (
        <section className="ficha-seccion">
          <h3>Variables</h3>
          <p className="ficha-texto">{fuente.variables}</p>
        </section>
      )}
      {fuente.limitaciones && (
        <section className="ficha-seccion">
          <h3>Limitaciones</h3>
          <p className="ficha-texto">{fuente.limitaciones}</p>
        </section>
      )}
      {fuente.enlaces?.length > 0 && (
        <section className="ficha-seccion">
          <h3>Sitio oficial</h3>
          <div className="ficha-enlaces">
            {fuente.enlaces.map((e, k) => (
              <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer" className={`ficha-enlace${k ? ' ficha-enlace--secundario' : ''}`}>
                <ExternalLink size={15} aria-hidden="true" /> {e.titulo}<span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <AvisoLegal tipo="estadistico" compacto />
    </>
  );
}
