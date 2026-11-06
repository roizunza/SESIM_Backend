import { useEffect, useState } from 'react';
import { ExternalLink, Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fnTrazabilidadNormativa, vEquivalenciaPimus } from '../../lib/sesim/api';
import { frecuenciaObservada } from '../../lib/sesim/tablero';
import EstadoCarga from '../plataforma/EstadoCarga';
import { fmtNumero } from './formato';

const siglasDe = (texto) => [...String(texto ?? '').matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim().toUpperCase());

/** Fuente documental (banco) que corresponde a la fuente del indicador, por sus siglas. */
function fuenteOficial(fuente, fuentesDocumentales) {
  if (!fuente) return null;
  const siglas = String(fuente.siglas ?? '').toUpperCase().split(/[/,]/).map((s) => s.trim()).filter(Boolean);
  return fuentesDocumentales.find((d) => siglasDe(d.nombre).some((s) => siglas.includes(s))) ?? null;
}

/** Contenido de la ficha técnica del indicador: definición, metodología, origen de datos y vínculos. */
export default function FichaIndicador({ indicador: ind, catalogo, fuentesDocumentales, umbral }) {
  const [traz, setTraz] = useState({ datos: null, error: null });

  useEffect(() => {
    let vivo = true;
    Promise.all([fnTrazabilidadNormativa(ind.id), vEquivalenciaPimus(ind.id)])
      .then(([t, e]) => vivo && setTraz({ datos: { ...t, equivalencias: e }, error: null }))
      .catch((err) => vivo && setTraz({ datos: null, error: err.message }));
    return () => {
      vivo = false;
    };
  }, [ind.id]);

  const frecuencia = frecuenciaObservada(ind.id, catalogo);
  const oficial = traz.datos ? fuenteOficial(traz.datos.fuente, fuentesDocumentales) : null;

  return (
    <>
      <section className="ficha-seccion">
        <h3>Definición</h3>
        <p className="ficha-texto">{ind.variable ?? 'Sin variable registrada en el catálogo.'}</p>
      </section>

      <section className="ficha-seccion">
        <h3>Metodología de cálculo</h3>
        <dl className="ficha-campos">
          <dt>Nivel MIR</dt><dd>{ind.nivel_mir ?? '—'}</dd>
          <dt>Sentido esperado</dt><dd>{ind.tendencia ?? 'Sin definir'}</dd>
          <dt>Línea base</dt><dd>{ind.linea_base != null ? `${fmtNumero(ind.linea_base)}${ind.anio_linea_base ? ` (${ind.anio_linea_base})` : ''}` : 'Sin línea base'}</dd>
          <dt>Meta</dt><dd>{ind.meta ?? '—'}{ind.valor_meta != null ? ` · valor meta ${fmtNumero(ind.valor_meta)}` : ''}</dd>
          <dt>Avance a meta</dt><dd>(valor − línea base) ÷ (meta − línea base). Verde ≥ {fmtNumero(umbral.verde_desde)} %, amarillo ≥ {fmtNumero(umbral.amarillo_desde)} %, rojo por debajo (F04, umbral {umbral.id_indicador ? 'propio del indicador' : umbral.id ? 'global vigente' : 'por omisión'}).</dd>
          <dt>Agregación estatal</dt><dd>Promedio simple de los valores municipales publicados en el periodo.</dd>
          <dt>Criterios SMART</dt><dd>Medible {ind.smart_medible ? 'sí' : 'no'} · Alcanzable {ind.smart_alcanzable ? 'sí' : 'no'} · Temporal {ind.smart_temporal ? 'sí' : 'no'}</dd>
          <dt>Estatus de la ficha</dt><dd>{ind.estatus_aprobado ? 'Aprobada' : 'Pendiente de aprobación'}</dd>
        </dl>
      </section>

      <section className="ficha-seccion">
        <h3>Origen de los datos</h3>
        {traz.error && <EstadoCarga estado="error" titulo="No se pudo leer la trazabilidad" mensaje={traz.error} compacto />}
        {!traz.datos && !traz.error && <EstadoCarga estado="cargando" mensaje="Leyendo trazabilidad normativa…" compacto />}
        {traz.datos && (
          <dl className="ficha-campos">
            <dt>Fuente</dt><dd>{traz.datos.fuente?.nombre ?? '—'}</dd>
            <dt>Frecuencia de actualización</dt><dd>{frecuencia.length ? frecuencia.join(', ') : 'Sin mediciones publicadas'}</dd>
            <dt>Eje y sector</dt><dd>{traz.datos.eje ? `Eje ${traz.datos.eje.numero_eje}. ${traz.datos.eje.nombre}` : '—'}{traz.datos.sector ? ` · ${traz.datos.sector.nombre}` : ''}</dd>
            <dt>Instrumentos</dt>
            <dd>{traz.datos.equivalencias.length ? traz.datos.equivalencias.map((e) => `${e.instrumento?.clave ?? e.id_instrumento} (${e.correspondencia})`).join(' · ') : '—'}</dd>
          </dl>
        )}
        {oficial?.url_oficial && (
          <a className="ficha-enlace ficha-enlace--secundario" href={oficial.url_oficial} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> Consultar fuente oficial ({oficial.clave})
            <span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
        )}
      </section>

      <Link className="ficha-enlace" to={`/geovisor?indicador=${ind.id}`}>
        <MapIcon size={15} aria-hidden="true" /> Ver capas del indicador en el geovisor
      </Link>
    </>
  );
}
