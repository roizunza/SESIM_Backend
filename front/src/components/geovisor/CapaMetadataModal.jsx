import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, BarChart3 } from 'lucide-react';
import { fnIndicadoresDeCapa, vCapaPorMunicipio, tabla, indexar } from '../../lib/sesim/api';

/**
 * Ficha de una capa (MICRO · tabla `capa` + metadatos ISO 19115 de
 * `metadatos_extra`). Si se abre desde un clic en el mapa, muestra además el
 * elemento seleccionado (`capa_vector`: id, nombre, clasif y su unidad
 * territorial).
 *
 * Secciones que salen de las funciones derivadas del esquema `api`:
 *  · Indicadores asociados  → F07 fn_indicadores_de_capa
 *  · Elementos por municipio → F08 v_capa_por_municipio
 *
 * `datos` = { capa, propiedades? }
 */
const ETIQUETAS_ESTATUS = { vigente_publico: 'Publicada', borrador: 'Borrador (uso interno)' };

function Campo({ etiqueta, valor }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return (
    <div className="capa-modal-campo">
      <span className="capa-modal-campo-etiqueta">{etiqueta}</span>
      <p className="capa-modal-campo-valor">{String(valor)}</p>
    </div>
  );
}

const CapaMetadataModal = ({ datos, onClose }) => {
  const [indicadores, setIndicadores] = useState(null);
  const [porMunicipio, setPorMunicipio] = useState(null);
  const [unidad, setUnidad] = useState(null);
  const [verLinaje, setVerLinaje] = useState(false);

  const capa = datos?.capa;
  const props = datos?.propiedades ?? null;

  useEffect(() => {
    if (!capa) return;
    let vivo = true;
    setVerLinaje(false);
    fnIndicadoresDeCapa(capa.id).then((r) => vivo && setIndicadores(r));
    vCapaPorMunicipio(capa.id).then((r) => vivo && setPorMunicipio(r));
    return () => {
      vivo = false;
    };
  }, [capa]);

  useEffect(() => {
    if (!props?.id_unidad) {
      setUnidad(null);
      return;
    }
    tabla('unidad_territorial').then((ut) => setUnidad(indexar(ut).get(props.id_unidad) ?? null));
  }, [props?.id_unidad]);

  if (!capa) return null;
  const meta = capa.metadatos_extra ?? {};
  const escala = meta.escala_nominal && meta.denominador_escala ? `${meta.escala_nominal} (1:${meta.denominador_escala})` : meta.escala_nominal;

  return (
    <>
      <div className="capa-modal-overlay" onClick={onClose}></div>
      <div className="capa-modal-drawer" role="dialog" aria-modal="true" aria-label={capa.titulo}>
        <div className="capa-modal-header">
          <div>
            <span className="capa-modal-id">{capa.id} · {ETIQUETAS_ESTATUS[capa.estatus] ?? capa.estatus}</span>
            <h3>{capa.titulo}</h3>
          </div>
          <button className="capa-modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="capa-modal-content">
          {props && (
            <div className="capa-modal-elemento">
              <span className="capa-modal-campo-etiqueta">Elemento seleccionado</span>
              <table className="capa-modal-tabla">
                <tbody>
                  <tr><th>Nombre</th><td>{props.nombre ?? '—'}</td></tr>
                  <tr><th>Clase</th><td>{props.clasif ?? '—'}</td></tr>
                  <tr><th>Unidad territorial</th><td>{unidad ? `${unidad.nom_mun} (${unidad.id})` : props.id_unidad ?? 'Fuera de Campeche'}</td></tr>
                  <tr><th>ID del elemento</th><td className="capa-modal-mono">{props.id}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="capa-modal-destacados">
            <Campo etiqueta="Propósito" valor={capa.proposito} />
            <Campo etiqueta="Conjunto de datos" valor={capa.conjunto_datos} />
            <Campo etiqueta="Responsable (custodio)" valor={capa.responsable} />
            <Campo etiqueta="Fuente" valor={meta.fuente_origen} />
            <Campo etiqueta="Instrumento de origen" valor={capa.instrumento ? `${capa.instrumento.nombre} (${capa.instrumento.id})` : 'Mapa Base (sin instrumento)'} />
            <Campo etiqueta="Geometría" valor={`${capa.tipo_geometria} · ${Number(capa.n_elementos).toLocaleString('es-MX')} elementos`} />
            <Campo etiqueta="Escala" valor={escala} />
            <Campo etiqueta="Fecha de corte" valor={meta.fecha_corte} />
            <Campo etiqueta="Periodicidad" valor={meta.periodicidad} />
            <Campo etiqueta="Sistema de coordenadas de origen" valor={meta.sistema_coordenadas} />
            <Campo etiqueta="Restricción de uso" valor={meta.restriccion_uso} />
            <Campo etiqueta="Archivo fuente" valor={capa.archivo} />
          </div>

          {meta.linaje && (
            !verLinaje ? (
              <button type="button" className="capa-modal-ver-todo-btn" onClick={() => setVerLinaje(true)}>
                Consultar linaje completo
              </button>
            ) : (
              <div className="capa-modal-campo">
                <span className="capa-modal-campo-etiqueta">Linaje</span>
                <p className="capa-modal-campo-valor capa-modal-linaje">{meta.linaje}</p>
              </div>
            )
          )}

          <div className="capa-modal-seccion">
            <span className="capa-modal-campo-etiqueta"><BarChart3 size={12} /> Indicadores asociados</span>
            {!indicadores && <p className="text-muted">Cargando…</p>}
            {indicadores && indicadores.length === 0 && <p className="text-muted">Esta capa no ilustra ningún indicador.</p>}
            {indicadores && indicadores.length > 0 && (
              <ul className="capa-modal-lista">
                {indicadores.map((i) => (
                  <li key={i.id}>
                    <Link to={`/monitoreo?indicador=${i.id}`} onClick={onClose}>
                      <strong>{i.id}</strong> {i.nombre}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {porMunicipio && porMunicipio.length > 0 && (
            <div className="capa-modal-seccion">
              <span className="capa-modal-campo-etiqueta">Elementos por municipio</span>
              <table className="capa-modal-tabla">
                <tbody>
                  {porMunicipio.map((r) => (
                    <tr key={r.id_unidad ?? 'fuera'}>
                      <th>{r.nom_mun}</th>
                      <td>{r.n_elementos.toLocaleString('es-MX')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CapaMetadataModal;
