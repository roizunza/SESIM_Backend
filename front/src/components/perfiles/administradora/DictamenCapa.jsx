import { useMemo, useState } from 'react';
import { X, MapPin, BadgeCheck, Globe2, CornerUpLeft, RefreshCw, Info, Loader2, Quote, Lock, Table2 } from 'lucide-react';
import { useCatalogo } from '../../../lib/sesim/useCatalogo';
import { CATEGORIAS } from '../capturista/categorias';
import VisorCampos from './VisorCampos';
import './VisorCampos.css';
import { ESTATUS_CAPA } from '../../../lib/sesim/capas';
import { fechaCorta } from '../comun/formato';
import { dictaminarCapa, resolverActualizacionCapa, definirRestriccionCapa } from './dictamenApi';
import './AdminPerfil.css';

/**
 * Ficha y dictamen de una capa (Administrador y Administrador Titular). Todo se manda al servidor:
 *  · capa EN REVISIÓN      → Validar (pasa a uso interno) o Devolver con el motivo.
 *  · capa VALIDADA         → Publicar (exige restricción de uso «pública», que se define aquí) o Devolver.
 *  · actualización PROPUESTA de una capa vigente → Aprobar o Rechazar con el motivo.
 * Cuatro ojos: quien envió o propuso no resuelve lo suyo (el servidor lo impide y aquí se muestra su mensaje).
 * Devolver y rechazar exigen un motivo; abre el plazo de 10 días hábiles de quien lo envió.
 */
/** Valor largo (p. ej. el linaje): se recorta y se despliega. */
function Valor({ texto }) {
  const [abre, setAbre] = useState(false);
  if (texto.length <= 220) return <>{texto}</>;
  return (
    <>
      <span className={abre ? '' : 'dc-recorte'}>{texto}</span>
      <button type="button" className="dc-mas" onClick={() => setAbre(!abre)}>{abre ? 'Ver menos' : 'Ver más'}</button>
    </>
  );
}
const fila = (k, v) => (v === null || v === undefined || v === '' ? null : [k, String(v)]);

export default function DictamenCapa({ capa, onClose, onHecho, onVerEnMapa, soloLectura = false }) {
  const m = capa.metadatos_extra ?? {};
  const prop = m.actualizacion_pendiente?.estado === 'pendiente' ? m.actualizacion_pendiente : null;
  const [motivo, setMotivo] = useState('');
  const [restriccion, setRestriccion] = useState(m.restriccion_uso && m.restriccion_uso !== 'sin definir' ? m.restriccion_uso : '');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [campos, setCampos] = useState(false);
  const [ancho, setAncho] = useState(null);
  const redim = (e) => {
    e.preventDefault();
    const sobre = (ev) => setAncho(Math.min(Math.max(340, window.innerWidth - 16 - ev.clientX), Math.round(window.innerWidth * 0.8)));
    const fin = () => { window.removeEventListener('pointermove', sobre); window.removeEventListener('pointerup', fin); };
    window.addEventListener('pointermove', sobre); window.addEventListener('pointerup', fin);
  };
  const { datos: rel } = useCatalogo(['capa_indicador', 'indicador']);
  const categoria = CATEGORIAS.find((c) => c.id === (capa.categoria ?? m.categoria));
  const grupo = capa.grupos_lista?.[0]?.grupo ?? capa.grupos ?? null;
  const indicadores = useMemo(() => {
    if (!rel || categoria?.id !== 'estrategia') return [];
    const nom = new Map(rel.indicador.map((i) => [i.id, i.nombre]));
    return rel.capa_indicador.filter((r) => r.id_capa === capa.id).map((r) => `${r.id_indicador}${nom.get(r.id_indicador) ? ` · ${nom.get(r.id_indicador)}` : ''}`);
  }, [rel, categoria, capa.id]);
  const PASOS = [['borrador', 'Borrador'], ['revision', 'En revisión'], ['vigente_admin', 'Uso interno'], ['vigente_publico', 'Publicada']];
  const iPaso = PASOS.findIndex(([k]) => k === capa.estatus);
  const veredicto = prop ? 'Hay una actualización propuesta: la capa vigente no cambia hasta que la apruebes.'
    : capa.estatus === 'borrador' ? 'Aún no se envía a revisión: nadie la ha dictaminado.'
    : capa.estatus === 'revision' ? 'Pendiente de tu dictamen: todavía NO está aprobada.'
    : capa.estatus === 'vigente_admin' ? 'Aprobada para uso interno. Falta publicarla (requiere restricción «pública»).'
    : 'Aprobada y publicada.';
  const justificacion = prop?.justificacion ?? m.justificacion_actualizacion ?? null;

  const filas = useMemo(() => [
    fila('Custodio', m.custodio ?? capa.responsable), fila('Fuente', m.fuente_origen), fila('Linaje', m.linaje),
    fila('Sistema de coordenadas', m.sistema_coordenadas), fila('Periodicidad', m.periodicidad), fila('Fecha de corte', m.fecha_corte),
    fila('Tipo de geometría', capa.tipo_geometria), fila('Elementos', capa.n_elementos?.toLocaleString('es-MX')), fila('Archivo', capa.archivo),
  ].filter(Boolean), [m, capa]);

  const ejecutar = async (accion, texto) => {
    setError(''); setOcupado(true);
    try {
      await accion();
      setHecho(texto);
      onHecho?.();
    } catch (e) { setError(e.message || 'No se pudo completar.'); } finally { setOcupado(false); }
  };
  const necesitaMotivo = !motivo.trim();
  const publica = (m.restriccion_uso ?? '') === 'pública';

  const definir = () => ejecutar(() => definirRestriccionCapa(capa.id, restriccion), `Restricción de uso definida: ${restriccion}.`);

  return (
    <>
      {/* Panel flotante SIN velo: el mapa sigue visible y operable mientras dictaminas. */}
      <div className="modal-drawer dc-drawer dc-flotante" role="dialog" aria-modal="false" aria-labelledby="dc-titulo" style={ancho ? { width: ancho } : undefined}>
        <span className="dc-redim" onPointerDown={redim} title="Arrastra para ensanchar o reducir" aria-hidden="true" />
        <div className="modal-drawer-header">
          <div>
            <p className="dc-rotulo"><code>{capa.id}</code> · {prop ? 'Actualización propuesta' : ESTATUS_CAPA[capa.estatus] ?? capa.estatus}</p>
            <h3 id="dc-titulo" className="dc-titulo">{capa.titulo}</h3>
            <div className="dc-etiquetas">
              {categoria && <span className="dc-etiqueta dc-etiqueta--cat"><categoria.Icono size={13} aria-hidden="true" /> {categoria.titulo}</span>}
              {grupo && <span className="dc-etiqueta">Grupo: {grupo}</span>}
              {indicadores.slice(0, 3).map((i) => <span key={i} className="dc-etiqueta" title={i}>Indicador {i.split(' · ')[0]}</span>)}
              {indicadores.length > 3 && <span className="dc-etiqueta">+{indicadores.length - 3} indicadores</span>}
            </div>
          </div>
          <button type="button" className="btn-close-drawer" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="modal-drawer-content dc-cuerpo">
          <section className="dc-bloque" aria-label="Estado de la capa">
            <h4>Estado</h4>
            <ol className="dc-pasos">{PASOS.map(([k, t], i) => <li key={k} className={i < iPaso ? 'hecho' : i === iPaso ? 'actual' : ''} aria-current={i === iPaso ? 'step' : undefined}>{t}</li>)}</ol>
            <p className="dc-veredicto"><strong>{veredicto}</strong></p>
            {capa.proposito && <p className="dc-nota"><Info size={14} aria-hidden="true" /> <span><b>Propósito:</b> {capa.proposito}</span></p>}
          </section>

          {justificacion && !prop && (
            <section className="dc-bloque" aria-label="Justificación"><blockquote><Quote size={13} aria-hidden="true" /><p>{justificacion}</p><footer>Justificación de quien actualizó</footer></blockquote></section>
          )}

          <button type="button" className="dc-mapa" onClick={() => onVerEnMapa?.(capa.id)}><MapPin size={15} aria-hidden="true" /> Centrar la capa en el mapa</button>
          <button type="button" className="dc-botoncampos" onClick={() => setCampos(true)}><Table2 size={16} aria-hidden="true" /> Ver campos y registros</button>

          {prop && (
            <section className="dc-bloque dc-bloque--prop" aria-label="Propuesta de actualización">
              <h4><RefreshCw size={16} aria-hidden="true" /> Qué se propone</h4>
              <dl className="dc-ficha">
                <dt>Motivo</dt><dd>{prop.motivo}</dd>
                <dt>Elementos</dt><dd>{prop.n_elementos_antes ?? '—'} → {prop.n_elementos}</dd>
                <dt>Fecha de corte</dt><dd>{prop.fecha_corte}</dd>
                <dt>Archivo</dt><dd>{prop.archivo}</dd>
                {prop.variacion_elementos && <><dt>Variación</dt><dd>{prop.variacion_elementos}</dd></>}
              </dl>
              <blockquote><Quote size={13} aria-hidden="true" /><p>{prop.justificacion}</p><footer>Justificación de quien propone{prop.propuesta_en ? ` · ${fechaCorta(prop.propuesta_en)}` : ''}</footer></blockquote>
              <p className="dc-nota"><Info size={14} aria-hidden="true" /> Al aprobar se actualizan el conteo y la fecha de corte; los elementos del archivo se cargan en la siguiente carga a la base.</p>
            </section>
          )}

          <section className="dc-bloque" aria-label="Ficha de la capa">
            <h4>Ficha</h4>
            <dl className="dc-ficha">{filas.map(([k, v]) => <div key={k} className="dc-fila"><dt>{k}</dt><dd><Valor texto={v} /></dd></div>)}</dl>
          </section>

          {!soloLectura && !prop && capa.estatus === 'vigente_admin' && (
            <section className="dc-bloque" aria-label="Restricción de uso">
              <h4><Lock size={15} aria-hidden="true" /> Restricción de uso</h4>
              <p className="dc-nota">La define la administración. Para publicar debe ser «pública»; una capa «interna» se queda para uso de la dependencia.</p>
              <div className="dc-restr">
                <select value={restriccion} onChange={(e) => setRestriccion(e.target.value)} aria-label="Restricción de uso">
                  <option value="">Sin definir</option><option value="pública">Pública</option><option value="interna">Interna</option>
                </select>
                <button type="button" className="btn-base btn-secondary" disabled={ocupado || !restriccion || restriccion === m.restriccion_uso} onClick={definir}>Guardar restricción</button>
              </div>
            </section>
          )}

          {hecho && <div className="aviso aviso-ok" role="status">{hecho}</div>}
          {error && <div className="aviso aviso-error" role="alert">{error}</div>}

          {!soloLectura && (prop || ['revision', 'vigente_admin'].includes(capa.estatus)) && !hecho && (
            <section className="dc-bloque" aria-label="Dictamen">
              <h4>Tu dictamen</h4>
              <label className="dc-campo">Motivo o comentario <small>{necesitaMotivo ? 'Obligatorio solo si devuelves o rechazas.' : ''}</small>
                <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Dile al equipo qué debe corregir, o deja un comentario." />
              </label>
              <div className="dc-botones">
                {prop && <button type="button" className="btn-base btn-primary" disabled={ocupado} onClick={() => ejecutar(() => resolverActualizacionCapa(capa.id, 'aprobar', motivo || null), 'Actualización aprobada. Quedó registrada en la bitácora.')}>{ocupado ? <Loader2 size={15} className="gira" /> : <BadgeCheck size={15} aria-hidden="true" />} Aprobar actualización</button>}
                {!prop && capa.estatus === 'revision' && <button type="button" className="btn-base btn-primary" disabled={ocupado} onClick={() => ejecutar(() => dictaminarCapa(capa.id, 'validar', motivo || null), 'Capa validada: ya es de uso interno.')}><BadgeCheck size={15} aria-hidden="true" /> Validar</button>}
                {!prop && capa.estatus === 'vigente_admin' && <button type="button" className="btn-base btn-primary" disabled={ocupado || !publica} title={publica ? '' : 'Primero define la restricción de uso como «pública».'} onClick={() => ejecutar(() => dictaminarCapa(capa.id, 'publicar', motivo || null), 'Capa publicada: ya la ve el público.')}><Globe2 size={15} aria-hidden="true" /> Publicar</button>}
                <button type="button" className="btn-base btn-tertiary dc-devolver" disabled={ocupado || necesitaMotivo}
                  onClick={() => ejecutar(() => (prop ? resolverActualizacionCapa(capa.id, 'rechazar', motivo) : dictaminarCapa(capa.id, 'rechazar', motivo)), prop ? 'Actualización rechazada. Quien la propuso tiene 10 días hábiles para decidir.' : 'Capa devuelta. Quien la envió tiene 10 días hábiles para decidir.')}>
                  <CornerUpLeft size={15} aria-hidden="true" /> {prop ? 'Rechazar' : 'Devolver'}
                </button>
              </div>
              {!prop && capa.estatus === 'vigente_admin' && !publica && <p className="dc-nota"><Info size={14} aria-hidden="true" /> «Publicar» se activa cuando la restricción de uso es «pública».</p>}
            </section>
          )}
          {soloLectura && (
            <div className="aviso aviso-info"><Info size={14} aria-hidden="true" /> Consulta de auditoría: ves la ficha y el historial, pero no dictaminas. Restricción de uso: {m.restriccion_uso ?? 'sin definir'}.</div>
          )}
          {!soloLectura && !prop && !['revision', 'vigente_admin'].includes(capa.estatus) && !hecho && (
            <div className="aviso aviso-info"><Info size={14} aria-hidden="true" /> Esta capa está {ESTATUS_CAPA[capa.estatus]?.toLowerCase() ?? capa.estatus}: no tiene nada pendiente de dictamen.</div>
          )}
        </div>
      </div>
      {campos && <VisorCampos capa={capa} propuesta={prop} onClose={() => setCampos(false)} />}
    </>
  );
}
