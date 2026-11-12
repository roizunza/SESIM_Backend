import { useEffect, useMemo, useState } from 'react';
import EnlaceInstitucional from '../plataforma/EnlaceInstitucional';
import { X, BarChart3, CheckCircle2, AlertCircle, MinusCircle, Download, ArrowUpRight } from 'lucide-react';
import { useAccesoInstitucional } from '../../lib/sesim/sesion';
import { fnIndicadoresDeCapa, vCapaPorMunicipio, tabla, indexar } from '../../lib/sesim/api';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';
import { evaluarCalidad } from '../../lib/sesim/calidadCapa';
import { fmtFecha } from '../../lib/sesim/normativo';
import { enlace } from '../../lib/rutas';
import AvisoLegal from '../plataforma/AvisoLegal';
import EstadoCarga from '../plataforma/EstadoCarga';
import { ESTATUS_CAPA } from '../../lib/sesim/capas';
import { descargarCapa, ATRIBUTOS_PUBLICOS } from '../../lib/sesim/descargas';

/**
 * Ficha de una capa. Metadatos organizados con los paquetes de ISO 19115-1 (identificación,
 * responsable, representación espacial, sistema de referencia, mantenimiento, restricciones,
 * distribución y linaje), calidad evaluada con los elementos de ISO 19157-1 sobre el archivo
 * publicado y control de la información documentada (identificador, versión y fecha del catálogo).
 * Si se abre desde un clic en el mapa, muestra todos los atributos del elemento seleccionado.
 *
 * `datos` = { capa, propiedades? }
 */
function Campo({ etiqueta, valor }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return (
    <div className="capa-modal-campo">
      <span className="capa-modal-campo-etiqueta">{etiqueta}</span>
      <p className="capa-modal-campo-valor">{String(valor)}</p>
    </div>
  );
}

/** Sección ISO: se despliega al pasar el cursor (o al enfocarla con el teclado) y queda abierta. */
function Seccion({ titulo, abierta = false, children }) {
  const [abiertaAhora, setAbiertaAhora] = useState(abierta);
  const abrir = () => setAbiertaAhora(true);
  return (
    <details className="capa-modal-iso" open={abiertaAhora} onMouseEnter={abrir} onFocus={abrir} onToggle={(e) => setAbiertaAhora(e.currentTarget.open)}>
      <summary>{titulo}</summary>
      {abiertaAhora && <div className="capa-modal-iso-cuerpo">{children}</div>}
    </details>
  );
}

const ICONO_CALIDAD = { true: CheckCircle2, false: AlertCircle, null: MinusCircle };

function Calidad({ capa, proceso }) {
  const { datos, error, porTeselas } = useDatosCapa(capa, true);
  const resultados = useMemo(() => (datos ? evaluarCalidad(capa, datos.features, proceso) : null), [capa, datos, proceso]);

  if (porTeselas) return <p className="capa-modal-nota">La evaluación de calidad no se calcula en el navegador para capas por teselas ({Number(capa.n_elementos).toLocaleString('es-MX')} elementos).</p>;
  if (error) return <EstadoCarga estado="error" titulo="No se pudo leer el archivo de la capa" mensaje={error} compacto />;
  if (!resultados) return <EstadoCarga estado="cargando" mensaje="Evaluando los elementos de la capa…" compacto />;
  return (
    <>
      <table className="capa-modal-tabla capa-modal-calidad">
        <thead><tr><th scope="col">Elemento · medida</th><th scope="col">Resultado</th></tr></thead>
        <tbody>
          {resultados.map((r) => {
            const Icono = ICONO_CALIDAD[String(r.conforme)];
            return (
              <tr key={r.nombre}>
                <th scope="row"><span className="capa-modal-calidad-elemento">{r.elemento}</span>{r.nombre}<small>{r.descripcion}</small></th>
                <td className={`capa-modal-calidad-${String(r.conforme)}`}>
                  <Icono size={14} aria-hidden="true" />{' '}
                  {r.total !== undefined ? `${r.valor.toLocaleString('es-MX')} / ${r.total.toLocaleString('es-MX')} (${r.porcentaje.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %)` : 'No evaluado'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="capa-modal-nota">Evaluación automática con los elementos de calidad de ISO 19157-1, calculada en este momento sobre el archivo publicado.</p>
    </>
  );
}

const CapaMetadataModal = ({ datos, onClose }) => {
  const acceso = useAccesoInstitucional();
  const [indicadores, setIndicadores] = useState(null);
  const [porMunicipio, setPorMunicipio] = useState(null);
  const [unidad, setUnidad] = useState(null);
  const [aux, setAux] = useState({ proceso: null, indice: null });
  const [errorDescarga, setErrorDescarga] = useState(null);

  const capa = datos?.capa;
  const props = datos?.propiedades ?? null;

  useEffect(() => {
    const escape = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  useEffect(() => {
    if (!capa) return undefined;
    let vivo = true;
    fnIndicadoresDeCapa(capa.id).then((r) => vivo && setIndicadores(r));
    vCapaPorMunicipio(capa.id).then((r) => vivo && setPorMunicipio(r));
    Promise.all([tabla('proceso_capa').catch(() => []), tabla('indice').catch(() => null)]).then(([proc, ind]) => {
      if (vivo) setAux({ proceso: proc.find((p) => p.id_capa === capa.id) ?? null, indice: ind });
    });
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
  const escala = meta.denominador_escala ? `1:${Number(meta.denominador_escala).toLocaleString('es-MX')}${meta.escala_nominal ? ` (${meta.escala_nominal})` : ''}` : meta.escala_nominal;
  const proceso = aux.proceso;
  const fechaCatalogo = aux.indice?.generado ? fmtFecha(aux.indice.generado.slice(0, 10)) : null;

  return (
    <>
      <div className="capa-modal-overlay" onClick={onClose}></div>
      <div className="capa-modal-drawer" role="dialog" aria-modal="true" aria-label={capa.titulo}>
        <div className="capa-modal-header">
          <div>
            <span className="capa-modal-id">{capa.id}{capa.estatus !== 'vigente_publico' ? ` · ${ESTATUS_CAPA[capa.estatus] ?? capa.estatus}` : ''}</span>
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
                  {Object.entries(props).filter(([k]) => k !== 'id_unidad').map(([k, v]) => (
                    <tr key={k}><th>{k}</th><td className={k === 'id' ? 'capa-modal-mono' : undefined}>{v ?? '—'}</td></tr>
                  ))}
                  <tr><th>Unidad territorial</th><td>{unidad ? `${unidad.nom_mun} (${unidad.id})` : props.id_unidad ?? 'Fuera de Campeche'}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <Seccion titulo="Identificación" abierta={!props}>
            <Campo etiqueta="Resumen y propósito" valor={capa.proposito} />
            <Campo etiqueta="Conjunto de datos" valor={capa.conjunto_datos} />
            <Campo etiqueta="Categoría temática" valor={(capa.grupos_lista ?? []).map((g) => g.grupo).join(' · ') || capa.categoria} />
            <Campo etiqueta="Instrumento de origen" valor={capa.instrumento ? capa.instrumento.nombre : 'Mapa base'} />
            <Campo etiqueta="Identificador" valor={`${capa.id}${capa.uuid_legado ? ` · ${capa.uuid_legado}` : ''}`} />
          </Seccion>

          <Seccion titulo="Responsable">
            <Campo etiqueta="Custodio" valor={capa.responsable} />
            <Campo etiqueta="Contacto del custodio" valor={meta.contacto_custodio} />
            <Campo etiqueta="Fuente de origen" valor={meta.fuente_origen} />
          </Seccion>

          <Seccion titulo="Representación espacial y sistema de referencia">
            <Campo etiqueta="Tipo de representación" valor={`Vectorial · ${capa.tipo_geometria} · ${Number(capa.n_elementos).toLocaleString('es-MX')} elementos`} />
            <Campo etiqueta="Escala de la fuente" valor={escala} />
            <Campo etiqueta="Sistema de referencia de la fuente" valor={meta.sistema_coordenadas} />
            <Campo etiqueta="Sistema de referencia de publicación" valor="WGS 84 (EPSG:4326), GeoPackage (OGC); visualización en Web Mercator (EPSG:3857)" />
          </Seccion>

          <Seccion titulo="Fechas y mantenimiento">
            <Campo etiqueta="Fecha de corte de la información" valor={meta.fecha_corte} />
            <Campo etiqueta="Frecuencia de actualización" valor={meta.periodicidad} />
          </Seccion>

          <Seccion titulo="Restricciones de uso">
            <Campo etiqueta="Restricción de uso" valor={meta.restriccion_uso} />
            <AvisoLegal tipo="cartografico" compacto />
          </Seccion>

          <Seccion titulo="Calidad (ISO 19157-1)">
            <Calidad capa={capa} proceso={proceso} />
          </Seccion>

          <Seccion titulo="Linaje">
            <Campo etiqueta="Linaje de la fuente" valor={meta.linaje} />
            {proceso && (
              <Campo
                etiqueta="Paso de proceso para su publicación"
                valor={`Generalización con ${proceso.herramienta}: resolución ${proceso.resolucion_m} m, coordenadas a ${proceso.decimales} decimales; ${proceso.mb_origen} MB → ${proceso.mb_final} MB; ${Number(proceso.n_elementos).toLocaleString('es-MX')} elementos ${proceso.conteo_coincide ? '(conteo igual al de la fuente)' : '(conteo distinto al de la fuente)'}.`}
              />
            )}
            <Campo etiqueta="Archivo fuente" valor={proceso?.origen ?? capa.archivo} />
          </Seccion>

          <Seccion titulo="Distribución">
            <Campo etiqueta="Formato" valor="GeoPackage (OGC GPKG 1.3)" />
            <Campo etiqueta="Atributos incluidos" valor={`titulo de la capa; por elemento: ${ATRIBUTOS_PUBLICOS.join(', ')}`} />
            <button type="button" className="capa-modal-descarga" onClick={() => descargarCapa(capa).catch((e) => setErrorDescarga(e.message))}>
              <Download size={14} aria-hidden="true" /> Descargar la capa
            </button>
            {errorDescarga && <EstadoCarga estado="error" titulo="No se pudo descargar la capa" mensaje={errorDescarga} compacto />}
          </Seccion>

          <div className="capa-modal-seccion">
            <span className="capa-modal-campo-etiqueta"><BarChart3 size={12} /> Indicadores asociados</span>
            {!indicadores && <p className="text-muted">Cargando…</p>}
            {indicadores && indicadores.length === 0 && <p className="text-muted">Esta capa no ilustra ningún indicador.</p>}
            {indicadores && indicadores.length > 0 && (
              <ul className="capa-modal-lista">
                {indicadores.map((i) => (
                  <li key={i.id}>
                    <EnlaceInstitucional to={enlace.fichaIndicador(i.id)} onClick={onClose} title={acceso ? `Abrir la ficha de ${i.id}` : undefined}>
                      <span><strong>{i.id}</strong> {i.nombre}</span>
                      {acceso && <ArrowUpRight size={13} aria-hidden="true" />}
                    </EnlaceInstitucional>
                  </li>
                ))}
              </ul>
            )}
            {indicadores?.length > 0 && !acceso && <p className="capa-modal-nota">Con sesión institucional, cada indicador abre su ficha en Seguimiento.</p>}
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

          <footer className="capa-modal-control">
            <span>Metadatos: estructura ISO 19115-1 · calidad ISO 19157-1 · idioma español · UTF-8</span>
            <span>Información documentada: {capa.id}{fechaCatalogo ? ` · catálogo generado el ${fechaCatalogo}` : ''}</span>
          </footer>
        </div>
      </div>
    </>
  );
};

export default CapaMetadataModal;
