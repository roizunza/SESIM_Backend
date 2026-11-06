import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { vCoberturaInstrumento } from '../../lib/sesim/api';
import { fmtFecha, fmtPublicacion } from '../../lib/sesim/normativo';
import { enlace } from '../../lib/rutas';
import EstadoCarga from '../plataforma/EstadoCarga';
import AvisoLegal from '../plataforma/AvisoLegal';
import EnlaceInstitucional from '../plataforma/EnlaceInstitucional';

/** Cobertura F14 del instrumento de origen ligado (indicadores y capas). */
function Cobertura({ idInstrumento }) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    vCoberturaInstrumento()
      .then((filas) => vivo && setEstado({ datos: filas.find((f) => f.id === idInstrumento) ?? null, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => {
      vivo = false;
    };
  }, [idInstrumento]);
  if (estado.error) return <EstadoCarga estado="error" titulo="No se pudo leer el seguimiento del instrumento" mensaje={estado.error} compacto />;
  if (!estado.datos) return <EstadoCarga estado="cargando" mensaje="Leyendo indicadores vinculados…" compacto />;
  const d = estado.datos;
  const filas = [
    ['Indicadores de origen', d.vinculos_origen, 'origen'],
    ['Correspondencia directa', d.vinculos_directos, 'directa'],
    ['Correspondencia parcial', d.vinculos_parciales, 'parcial'],
  ].filter(([, n]) => n > 0);
  return (
    <dl className="ficha-campos">
      {filas.map(([etiqueta, n, rel]) => (
        <div key={rel} className="ficha-campos__fila">
          <dt>{etiqueta}</dt>
          <dd><EnlaceInstitucional to={enlace.indicadoresDeInstrumento(d.id, rel)}>{n} indicadores</EnlaceInstitucional></dd>
        </div>
      ))}
      <div className="ficha-campos__fila"><dt>Capas asociadas</dt><dd>{d.capas}</dd></div>
    </dl>
  );
}

/**
 * Ficha técnica de un instrumento normativo. Estructura de cita y responsabilidad conforme a
 * ISO 19115-1 (identificación, parte responsable, fechas de referencia, distribución y linaje).
 */
export default function FichaInstrumento({ doc, municipio, relaciones, porId }) {
  const vinculos = relaciones.filter((r) => r.instrumento_origen === doc.id || r.instrumento_destino === doc.id);
  return (
    <>
      <section className="ficha-seccion">
        <h3>Identificación</h3>
        <dl className="ficha-campos">
          <dt>Denominación</dt><dd>{doc.nombre_oficial ?? doc.nombre}</dd>
          <dt>Clave en el SESIM</dt><dd>{doc.clave}</dd>
          {doc.tipo && <><dt>Tipo</dt><dd>{doc.tipo}{doc.subtipo ? ` · ${doc.subtipo}` : ''}</dd></>}
          {doc.cobertura_geografica && <><dt>Ámbito territorial</dt><dd>{doc.cobertura_geografica}</dd></>}
          {municipio && <><dt>Municipio</dt><dd>{municipio}</dd></>}
        </dl>
      </section>

      {(doc.emisor || doc.aprobacion) && (
        <section className="ficha-seccion">
          <h3>Responsable</h3>
          <dl className="ficha-campos">
            {doc.emisor && <><dt>Emisor</dt><dd>{doc.emisor}</dd></>}
            {doc.instrumento_publicacion && <><dt>Instrumento de expedición</dt><dd>{doc.instrumento_publicacion}</dd></>}
            {doc.aprobacion && <><dt>Aprobación</dt><dd>{doc.aprobacion}</dd></>}
          </dl>
        </section>
      )}

      {(doc.publicacion || doc.ultima_reforma) && (
        <section className="ficha-seccion">
          <h3>Fechas de referencia</h3>
          <dl className="ficha-campos">
            {doc.publicacion && <><dt>Publicación</dt><dd>{fmtPublicacion(doc.publicacion)}</dd></>}
            {doc.ultima_reforma && <><dt>Última reforma</dt><dd>{fmtPublicacion(doc.ultima_reforma)}</dd></>}
          </dl>
        </section>
      )}

      {(doc.descripcion || doc.articulos_verificados?.length > 0) && (
        <section className="ficha-seccion">
          <h3>Contenido</h3>
          {doc.descripcion && <p className="ficha-texto">{doc.descripcion}</p>}
          {doc.articulos_verificados?.length > 0 && (
            <ul className="ficha-lista">
              {doc.articulos_verificados.map((a) => <li key={a.articulo}><strong>Artículo {a.articulo}.</strong> {a.materia}</li>)}
            </ul>
          )}
        </section>
      )}

      {doc.id_instrumento_origen && (
        <section className="ficha-seccion">
          <h3>Seguimiento en el SESIM</h3>
          <Cobertura idInstrumento={doc.id_instrumento_origen} />
        </section>
      )}

      {vinculos.length > 0 && (
        <section className="ficha-seccion">
          <h3>Relación con otros instrumentos</h3>
          <ul className="ficha-lista">
            {vinculos.map((r) => {
              const otro = r.instrumento_origen === doc.id ? r.instrumento_destino : r.instrumento_origen;
              return <li key={r.id}><Link to={enlace.fichaInstrumento(otro)}>{porId.get(otro)?.nombre ?? otro}</Link></li>;
            })}
          </ul>
        </section>
      )}

      <section className="ficha-seccion">
        <h3>Distribución</h3>
        <div className="ficha-enlaces">
          {doc.enlaces.map((e, k) => (
            <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer" className={`ficha-enlace${k ? ' ficha-enlace--secundario' : ''}`}>
              <ExternalLink size={15} aria-hidden="true" /> {e.titulo}<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          ))}
        </div>
      </section>

      {doc.fuentes_verificacion?.length > 0 && (
        <section className="ficha-seccion">
          <h3>Linaje y verificación</h3>
          <p className="ficha-texto">Datos cotejados el {fmtFecha(doc.fecha_verificacion)} contra:</p>
          <ul className="ficha-lista ficha-lista--fuentes">
            {doc.fuentes_verificacion.map((u) => (
              <li key={u}><a href={u} target="_blank" rel="noopener noreferrer">{new URL(u).hostname}<span className="sr-only"> (se abre en una pestaña nueva)</span></a></li>
            ))}
          </ul>
        </section>
      )}

      <AvisoLegal tipo="normativo" compacto />
    </>
  );
}
