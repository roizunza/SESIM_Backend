import { useMemo, useState } from 'react';
import {
  X, UploadCloud, ArrowLeft, ArrowRight, CheckCircle2, XCircle, Send, Save, Map as MapaIcono, Info, FileCheck2, Loader2, CircleDashed, FlaskConical,
} from 'lucide-react';
import { guardarCapa, enviarCapaARevision, vincularCapaIndicador } from '../../../lib/sesim/catalogoApi';
import { useCatalogo } from '../../../lib/sesim/useCatalogo';
import { ESTATUS_CAPA } from '../../../lib/sesim/capas';
import { proponerActualizacionCapa } from './actualizacionApi';
import { revisarGeoPackage, TOPE_MB, MENSAJE_FORMATO } from './gpkg';
import { MODO_REVISION_DISENO } from './candados';
import { CATEGORIAS } from './categorias';
import '../comun/Comun.css';
import './CapaCaptura.css';

/**
 * Subir o actualizar una capa (perfil Capturista).
 *
 * Una capa NUNCA se inventa: se sube a algo que ya existe en el catálogo, y solo hay tres lugares:
 *   · Mapa base      → un grupo ya existente (límites, localidades, red de transporte, medio físico…)
 *   · Diagnóstico    → un grupo ya existente (temas del diagnóstico)
 *   · Indicador      → un indicador aprobado (la capa es la que alimenta su medición)
 * El sistema asigna el identificador, el instrumento, el tipo de geometría y el número de elementos.
 *
 * Archivo: solo GeoPackage (.gpkg) en EPSG:4326; se revisa en el navegador (ver gpkg.js).
 * Texto abierto solo en: título (capa nueva), propósito, nota de linaje y justificación de la actualización.
 *
 * `MODO_REVISION_DISENO` (candados.js) abre el botón «Siguiente» para recorrer el diseño sin cumplir los requisitos;
 * guardar y enviar siguen exigiendo todo, para no crear registros incompletos en la base real.
 *
 * Hoy se guarda la FICHA y el conteo de elementos; los elementos llegan a PostGIS con el servicio de ingesta (Ciclo 9).
 */
const GEOM_LEAFLET = { Punto: 'point', Línea: 'line', Polígono: 'polygon' };
const PERIODICIDADES = ['Anual', 'Bienal', 'Quinquenal', 'Decenal', 'Irregular', 'No planeada'];
const PASOS_LINAJE = ['Descarga de una fuente oficial', 'Captura o levantamiento en campo', 'Digitalización', 'Integración de varias fuentes', 'Homologación de atributos', 'Reproyección a EPSG:4326'];
const MOTIVOS = ['Ampliación (se agregan elementos)', 'Depuración (se corrigen o quitan elementos)', 'Actualización de corte', 'Corrección de errores'];
const UMBRAL_VARIACION = 0.2;
const DESTINOS = CATEGORIAS;

const unicos = (lista) => [...new Set(lista.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const moda = (lista) => { const m = new Map(); lista.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''; };

const Req = () => <b className="cc-req" title="Obligatorio" aria-label="obligatorio">*</b>;
const NotaObligatorio = () => <p className="cc-obl"><b className="cc-req" aria-hidden="true">*</b> Dato obligatorio: sin él la capa no se puede enviar.</p>;

export default function CapaCapturaModal({ modo = 'nueva', capaInicial = null, catalogo, onClose, onGuardada, onVistaPrevia }) {
  const actualizar = modo === 'actualizar';
  const total = actualizar ? 3 : 4;
  const [paso, setPaso] = useState(actualizar && capaInicial ? 2 : 1);
  const [idBase, setIdBase] = useState(capaInicial?.id ?? '');
  const [destino, setDestino] = useState({ cat: '', grupo: '', indicador: '' });
  const [archivo, setArchivo] = useState(null);
  const [revision, setRevision] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const [colId, setColId] = useState('');
  const [ficha, setFicha] = useState({ titulo: '', custodio: '', fuente: '', periodicidad: '', corte: '', proposito: '', pasos: [], notaLinaje: '', motivo: '', justificacion: '' });
  const [estado, setEstado] = useState({ ocupado: false, error: '', hecho: '', aviso: '' });
  const { datos: rel } = useCatalogo(['capa_indicador']);

  const capas = useMemo(() => catalogo?.capa ?? [], [catalogo]);
  const base = actualizar ? capas.find((c) => c.id === idBase) ?? null : null;
  const vigente = !!base && ['vigente_admin', 'vigente_publico'].includes(base.estatus);
  const propuestaPendiente = base?.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente';
  const enRevision = base?.estatus === 'revision';
  const [extra, setExtra] = useState([]);
  const ahora = new Date().toISOString().slice(0, 10);

  // ---- Destino ----
  const gruposDe = (cat) => unicos(capas.filter((c) => c.categoria === cat).flatMap((c) => (c.grupos_lista ?? []).map((g) => g.grupo)));
  const indicadores = useMemo(() => (catalogo?.indicador ?? []).filter((i) => i.activo !== false).sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true })), [catalogo]);
  const indicador = destino.indicador ? indicadores.find((i) => i.id === destino.indicador) : null;
  const numeroEje = indicador ? catalogo?.ejes?.get(indicador.id_eje)?.numero_eje ?? indicador.id_eje : null;
  const grupoDestino = destino.cat === 'estrategia'
    ? gruposDe('estrategia').find((g) => new RegExp(`Eje\\s*${numeroEje}\\b`).test(g)) ?? ''
    : destino.grupo;
  const capasDelGrupo = capas.filter((c) => c.categoria === destino.cat && (c.grupos_lista ?? []).some((g) => g.grupo === grupoDestino));
  const capasDelIndicador = indicador ? (rel?.capa_indicador ?? []).filter((r) => r.id_indicador === indicador.id).map((r) => capas.find((c) => c.id === r.id_capa)).filter(Boolean) : [];
  const nomenclatura = moda(capasDelGrupo.map((c) => c.nomenclatura));
  const idNuevo = useMemo(() => {
    if (!nomenclatura) return '';
    const mismas = capas.filter((c) => c.nomenclatura === nomenclatura);
    const prefijo = mismas[0]?.id.replace(/\d+$/, '') ?? '';
    const max = Math.max(0, ...mismas.map((c) => Number(c.id.match(/(\d+)$/)?.[1] ?? 0)));
    return `${prefijo}${String(max + 1).padStart(2, '0')}`;
  }, [capas, nomenclatura]);
  const instrumento = destino.cat && destino.cat !== 'mapa_base' ? (catalogo?.instrumento_origen ?? []).find((i) => /eemsv01/i.test(i.id)) ?? null : null;
  const custodios = useMemo(() => unicos(capas.map((c) => c.responsable)), [capas]);
  // Solo nombres de institución breves: las citas bibliográficas largas del catálogo no son opciones de lista.
  const fuentes = useMemo(() => unicos(capas.map((c) => c.metadatos_extra?.fuente_origen)).filter((f) => f.length <= 90), [capas]);
  const tituloRepetido = capas.some((c) => c.titulo.trim().toLowerCase() === ficha.titulo.trim().toLowerCase());

  // ---- Archivo ----
  const ident = revision?.identificadores?.[colId] ?? null;
  const archivoOk = !!(revision?.valido && colId && ident?.bien);
  const previo = actualizar ? Number(base?.n_elementos ?? 0) : 0;
  const variacion = actualizar && previo > 0 && revision?.n ? Math.abs(revision.n - previo) / previo : 0;
  const fijar = (k) => (e) => setFicha((f) => ({ ...f, [k]: e.target.value }));

  const leer = async (f) => {
    setRevision(null); setArchivo(null); setColId('');
    if (!f) return;
    setArchivo(f); setRevisando(true);
    const r = await revisarGeoPackage(f, actualizar ? base?.tipo_geometria : null);
    setRevision(r); setRevisando(false);
    const sugerida = ['id_origen', 'id', 'ID', 'fid', 'cve', 'clave', 'folio'].find((c) => r.columnas?.includes(c));
    if (sugerida) setColId(sugerida);
  };

  // ---- Qué falta (se muestra en el último paso; ahí se ve por qué un botón está apagado) ----
  const linaje = [ficha.pasos.length ? `Pasos: ${ficha.pasos.join('; ')}.` : '', ficha.notaLinaje.trim() ? `Nota: ${ficha.notaLinaje.trim()}` : ''].filter(Boolean).join(' ');
  const faltan = [];
  if (actualizar) {
    if (!base) faltan.push('Elegir la capa que se actualiza');
    if (enRevision) faltan.push('Esa capa está en revisión: espera el dictamen de la administración');
    if (propuestaPendiente) faltan.push('Esa capa ya tiene una actualización esperando dictamen');
    if (!archivoOk) faltan.push('Subir un GeoPackage que pase la revisión y elegir su columna identificadora');
    if (!ficha.motivo) faltan.push('Elegir el motivo de la actualización');
    if (!ficha.corte) faltan.push('Indicar la nueva fecha de corte');
    if (ficha.justificacion.trim().length < 30) faltan.push(`Justificar la actualización (${ficha.justificacion.trim().length}/30 caracteres)`);
  } else {
    if (!destino.cat || !grupoDestino || (destino.cat === 'estrategia' && !indicador)) faltan.push('Elegir a dónde pertenece la capa');
    if (!archivoOk) faltan.push('Subir un GeoPackage que pase la revisión y elegir su columna identificadora');
    if (ficha.titulo.trim().length < 5 || tituloRepetido) faltan.push('Un título de al menos 5 caracteres que no repita el de otra capa');
    if (!ficha.custodio || !ficha.fuente || !ficha.periodicidad || !ficha.corte) faltan.push('Completar custodio, fuente, periodicidad y fecha de corte');
    if (ficha.proposito.trim().length < 20) faltan.push(`Propósito de al menos 20 caracteres (${ficha.proposito.trim().length}/20)`);
    if (!ficha.pasos.length || ficha.notaLinaje.trim().length < 15) faltan.push('Linaje: marcar al menos un paso y escribir una nota de 15 caracteres');
  }
  const listo = faltan.length === 0;

  // Candado de «Siguiente» por paso (se abre por completo en modo revisión de diseño).
  const pasoCompleto = (p) => {
    if (actualizar) return p === 1 ? !!base && !enRevision && !propuestaPendiente : p === 2 ? archivoOk : true;
    if (p === 1) return !!destino.cat && !!grupoDestino && (destino.cat !== 'estrategia' || !!indicador);
    if (p === 2) return archivoOk;
    if (p === 3) return ficha.titulo.trim().length >= 5 && !tituloRepetido && !!ficha.custodio && !!ficha.fuente && !!ficha.periodicidad && !!ficha.corte && ficha.proposito.trim().length >= 20 && ficha.pasos.length > 0 && ficha.notaLinaje.trim().length >= 15;
    return true;
  };
  const puedeSeguir = MODO_REVISION_DISENO || pasoCompleto(paso);

  const guardar = async (enviar) => {
    setEstado({ ocupado: true, error: '', hecho: '', aviso: '' });
    try {
      let id = idBase; let aviso = '';
      if (actualizar && vigente) {
        await proponerActualizacionCapa(base.id, {
          archivo: archivo.name, n_elementos: revision.n, fecha_corte: ficha.corte, motivo: ficha.motivo, justificacion: ficha.justificacion.trim(),
          columna_id_origen: colId, variacion_elementos: Number(variacion.toFixed(3)), indicadores_agregar: extra,
        });
        setEstado({ ocupado: false, error: '', aviso: '', hecho: `Tu propuesta de actualización de ${base.id} quedó enviada. La capa sigue vigente hasta que la administración la apruebe o la rechace.` });
        onGuardada?.(base.id);
        return;
      }
      if (actualizar) {
        await guardarCapa({
          id: base.id, n_elementos: revision.n, archivo: archivo.name,
          metadatos_extra: { fecha_corte: ficha.corte, motivo_actualizacion: ficha.motivo, justificacion_actualizacion: ficha.justificacion.trim(), columna_id_origen: colId, variacion_elementos: Number(variacion.toFixed(3)) },
        });
        for (const ind of extra) {
          try { await vincularCapaIndicador(base.id, ind); } catch { aviso = `El vínculo con ${ind} queda pendiente: lo registra la administración.`; }
        }
      } else {
        id = idNuevo;
        await guardarCapa({
          id, titulo: ficha.titulo.trim(), proposito: ficha.proposito.trim(), tipo_geometria: revision.tipo, srid_origen: 4326,
          responsable: ficha.custodio, id_instrumento: instrumento?.id ?? null, nomenclatura, grupos: grupoDestino || null,
          n_elementos: revision.n, archivo: archivo.name,
          metadatos_extra: {
            custodio: ficha.custodio, fuente_origen: ficha.fuente, linaje, sistema_coordenadas: 'EPSG:4326 — WGS 84',
            periodicidad: ficha.periodicidad, fecha_corte: ficha.corte, categoria: destino.cat, columna_id_origen: colId,
          },
        });
        if (indicador) {
          try { await vincularCapaIndicador(id, indicador.id); } catch { aviso = `El vínculo con el indicador ${indicador.id} queda pendiente: lo registra la administración.`; }
        }
      }
      if (enviar) await enviarCapaARevision(id);
      setEstado({ ocupado: false, error: '', aviso, hecho: enviar ? `La capa ${id} quedó enviada a revisión de la administración.` : `La capa ${id} quedó guardada como borrador.` });
      onGuardada?.(id);
    } catch (err) {
      setEstado({ ocupado: false, error: err.message, hecho: '', aviso: '' });
    }
  };

  const verEnMapa = () => {
    const c = actualizar ? base : { id: idNuevo || 'Vista previa', titulo: ficha.titulo || archivo?.name || 'Vista previa', categoria: destino.cat || 'diagnostico' };
    onVistaPrevia?.({ capa: { ...c, tipo_geometria: revision.tipo, geom: GEOM_LEAFLET[revision.tipo] ?? 'polygon', estatus: 'borrador' }, geojson: revision.geojson, parcial: revision.vistaParcial, n: revision.n });
    onClose();
  };

  const nombres = actualizar ? ['Capa', 'Archivo', 'Justificación'] : ['Destino', 'Archivo', 'Ficha', 'Enviar'];
  const ultimo = paso === total;

  const selectorDestino = () => (
    <>
                  <div className="cc-destinos" role="radiogroup" aria-label="Categoría de la capa">
      {DESTINOS.map(({ id, titulo, texto, Icono }) => (
        <button key={id} type="button" role="radio" aria-checked={destino.cat === id} className={`cc-destino${destino.cat === id ? ' cc-destino--act' : ''}`} onClick={() => { setDestino({ cat: id, grupo: '', indicador: '' }); if (actualizar) setIdBase(''); }}>
          <Icono size={22} aria-hidden="true" /><strong>{titulo}</strong><span>{texto}</span>
        </button>
      ))}
    </div>
    {destino.cat && destino.cat !== 'estrategia' && (
      <label className="cc-campo"><span className="cc-et">Grupo<Req /></span>
        <select className="form-input" value={destino.grupo} onChange={(e) => setDestino((d) => ({ ...d, grupo: e.target.value }))}>
          <option value="">Elige el grupo…</option>
          {gruposDe(destino.cat).map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
    )}
    {destino.cat === 'estrategia' && (
      <label className="cc-campo"><span className="cc-et">Indicador<Req /></span>
        <select className="form-input" value={destino.indicador} onChange={(e) => setDestino((d) => ({ ...d, indicador: e.target.value }))}>
          <option value="">Elige el indicador…</option>
          {indicadores.map((i) => <option key={i.id} value={i.id}>{i.id} · {i.nombre}</option>)}
        </select>
      </label>
    )}
    </>
  );

  return (
    <>
      <div className="modal-drawer-overlay" onClick={onClose} />
      <div className="modal-drawer cc-drawer" role="dialog" aria-modal="true" aria-labelledby="cc-titulo">
        <div className="modal-drawer-header">
          <div>
            <h3 id="cc-titulo" className="cc-titulo">{actualizar ? 'Actualizar una capa' : 'Subir una capa'}</h3>
            <ol className="cc-pasos" aria-label="Avance">
              {nombres.map((n, i) => <li key={n} className={i + 1 === paso ? 'cc-paso cc-paso--act' : i + 1 < paso ? 'cc-paso cc-paso--ok' : 'cc-paso'} aria-current={i + 1 === paso ? 'step' : undefined}>{i + 1}. {n}</li>)}
            </ol>
          </div>
          <button type="button" className="btn-close-drawer" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="modal-drawer-content cc-cuerpo">
          {MODO_REVISION_DISENO && !estado.hecho && (
            <div className="cc-modo" role="note"><FlaskConical size={15} aria-hidden="true" /><span><b>Modo revisión de diseño:</b> «Siguiente» está abierto para que recorras todos los pasos. Guardar y enviar siguen pidiendo todo.</span></div>
          )}

          {estado.hecho ? (
            <div className="cc-hecho">
              <CheckCircle2 size={40} aria-hidden="true" />
              <p>{estado.hecho}</p>
              {estado.aviso && <small>{estado.aviso}</small>}
              <small>Los elementos del archivo se cargarán a la base cuando el servicio de ingesta esté habilitado; la administración ya puede revisar la ficha.</small>
              <button type="button" className="btn-base btn-primary" onClick={onClose}>Listo</button>
            </div>
          ) : (
            <>
              {/* ================= Nueva · 1 Destino ================= */}
              {!actualizar && paso === 1 && (
                <>
                  <p className="cc-intro">Una capa no se inventa: se sube a algo que <b>ya existe</b> en el catálogo. ¿A cuál pertenece?<Req /></p>
                  {selectorDestino()}
                  {grupoDestino && (
                    <div className="cc-ya">
                      <p><b>Se registrará como {idNuevo || '—'}</b> en «{grupoDestino}».</p>
                      {(destino.cat === 'estrategia' ? capasDelIndicador : capasDelGrupo).length > 0 ? (
                        <>
                          <small>{destino.cat === 'estrategia' ? 'Capas que ya alimentan este indicador' : 'Capas que ya están en este grupo'} — revisa que la tuya no esté repetida:</small>
                          <ul>{(destino.cat === 'estrategia' ? capasDelIndicador : capasDelGrupo).slice(0, 8).map((c) => <li key={c.id}><code>{c.id}</code> {c.titulo} <em>({ESTATUS_CAPA[c.estatus] ?? c.estatus})</em></li>)}</ul>
                        </>
                      ) : <small>Este lugar aún no tiene capas.</small>}
                    </div>
                  )}
                </>
              )}

              {/* ================= Actualizar · 1 Capa ================= */}
              {actualizar && paso === 1 && (
                <>
                  {!base ? (
                    <>
                      <p className="cc-intro">Elige la capa que vas a actualizar. Se busca igual que en el catálogo: <b>categoría → {destino.cat === 'estrategia' ? 'indicador' : 'grupo'} → capa</b>.<Req /></p>
                      {selectorDestino()}
                      {grupoDestino && (
                        <label className="cc-campo"><span className="cc-et">Capa que se actualiza<Req /></span>
                          <select className="form-input" value={idBase} onChange={(e) => { setIdBase(e.target.value); setRevision(null); setArchivo(null); setExtra([]); }}>
                            <option value="">{(destino.cat === 'estrategia' ? capasDelIndicador : capasDelGrupo).length ? 'Elige una capa…' : 'Aún no hay capas aquí'}</option>
                            {(destino.cat === 'estrategia' ? capasDelIndicador : capasDelGrupo).sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true })).map((c) => <option key={c.id} value={c.id}>{c.id} · {c.titulo} ({ESTATUS_CAPA[c.estatus] ?? c.estatus})</option>)}
                          </select>
                        </label>
                      )}
                    </>
                  ) : (
                    <p className="cc-intro">Vas a actualizar esta capa. <button type="button" className="cc-enlace" onClick={() => { setIdBase(''); setRevision(null); setArchivo(null); }}>Elegir otra</button></p>
                  )}
                  {base && (
                    <dl className="cc-ficha-fija">
                      <dt>Capa</dt><dd>{base.id} · {base.titulo}</dd>
                      <dt>Estatus</dt><dd>{ESTATUS_CAPA[base.estatus] ?? base.estatus}</dd>
                      <dt>Tipo de geometría</dt><dd>{base.tipo_geometria ?? '—'}</dd>
                      <dt>Elementos actuales</dt><dd>{previo || '—'}</dd>
                    </dl>
                  )}
                  {base && enRevision && <div className="cc-aviso cc-aviso--error"><Info size={16} aria-hidden="true" /><span>Esta capa está <b>en revisión</b>: la administración todavía no la dictamina. Podrás proponer una actualización cuando quede vigente.</span></div>}
                  {base && propuestaPendiente && <div className="cc-aviso cc-aviso--error"><Info size={16} aria-hidden="true" /><span>Esta capa <b>ya tiene una actualización esperando dictamen</b>. Cuando la administración la resuelva podrás proponer otra.</span></div>}
                  {base && vigente && !propuestaPendiente && <div className="cc-aviso cc-aviso--info"><Info size={16} aria-hidden="true" /><span>La capa está <b>{ESTATUS_CAPA[base.estatus]}</b>. Tu archivo se envía como <b>propuesta</b>: la capa actual se queda como está y la administración aprueba o rechaza el cambio con tu justificación.</span></div>}
                  {base && base.estatus === 'borrador' && <div className="cc-aviso cc-aviso--info"><Info size={16} aria-hidden="true" /><span>La capa está en <b>borrador</b>: el archivo nuevo reemplaza al actual y puedes seguir editando antes de enviarla.</span></div>}
                </>
              )}

              {/* ================= Archivo ================= */}
              {paso === (actualizar ? 2 : 2) && (
                <>
                  <div className="cc-carga">
                    <UploadCloud size={24} aria-hidden="true" />
                    <label className="cc-campo"><span className="cc-et">Archivo de la capa<Req /></span>
                      <input type="file" className="form-input" accept=".gpkg" onChange={(e) => leer(e.target.files?.[0])} />
                    </label>
                    <p className="cc-nota-archivo">Solo se acepta un archivo <b>GeoPackage (.gpkg)</b> en <b>EPSG:4326 (WGS 84)</b>, de hasta {TOPE_MB} MB. El sistema lo revisa al instante.</p>
                  </div>
                  {revisando && <p className="cc-veredicto" role="status"><Loader2 size={16} className="girando" aria-hidden="true" /> Revisando el archivo…</p>}
                  {revision && !revisando && (
                    <>
                      <p className={`cc-veredicto ${revision.valido ? 'cc-veredicto--ok' : 'cc-veredicto--mal'}`} role="status">
                        {revision.valido ? <><CheckCircle2 size={16} aria-hidden="true" /> El archivo pasó la revisión.</> : <><XCircle size={16} aria-hidden="true" /> El archivo no pasó la revisión. {MENSAJE_FORMATO}</>}
                      </p>
                      <table className="cc-tabla">
                        <tbody>
                          {revision.filas.map((f) => (
                            <tr key={f.que} className={f.bien ? '' : 'cc-mal'}>
                              <th scope="row">{f.que}</th>
                              <td>{f.encontrado}{!f.bien && f.ayuda && <small>{f.ayuda}</small>}</td>
                              <td aria-label={f.bien ? 'Correcto' : 'Con error'}>{f.bien ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {revision.valido && (
                        <>
                          <label className="cc-campo"><span className="cc-et">¿Qué columna identifica a cada elemento?<Req /></span>
                            <select className="form-input" value={colId} onChange={(e) => setColId(e.target.value)}>
                              <option value="">Elige una columna…</option>
                              {revision.columnas.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </label>
                          {ident && <p className={`cc-veredicto ${ident.bien ? 'cc-veredicto--ok' : 'cc-veredicto--mal'}`}>{ident.bien ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />} {ident.texto}</p>}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ================= Nueva · 3 Ficha ================= */}
              {!actualizar && paso === 3 && (
                <>
                  <NotaObligatorio />
                  <dl className="cc-ficha-fija">
                    <dt>Pertenece a</dt><dd>{DESTINOS.find((d) => d.id === destino.cat)?.titulo ?? '—'} · {grupoDestino || '—'}{indicador ? ` · ${indicador.id}` : ''}</dd>
                    <dt>Identificador (lo asigna el sistema)</dt><dd>{idNuevo || '—'}</dd>
                    <dt>Instrumento de origen</dt><dd>{instrumento ? `${instrumento.clave} (${instrumento.id})` : destino.cat ? 'Ninguno (mapa base)' : '—'}</dd>
                    <dt>Geometría · elementos (del archivo)</dt><dd>{revision?.tipo ? `${revision.tipo} · ${revision.n}` : '—'}</dd>
                    <dt>Sistema de coordenadas</dt><dd>EPSG:4326 — WGS 84</dd>
                  </dl>
                  <label className="cc-campo"><span className="cc-et">Título de la capa<Req /></span>
                    <input className="form-input" value={ficha.titulo} onChange={fijar('titulo')} maxLength={120} />
                    {tituloRepetido && <small className="cc-error">Ya existe una capa con ese título.</small>}
                  </label>
                  <div className="cc-dos">
                    <label className="cc-campo"><span className="cc-et">Custodio<Req /></span>
                      <select className="form-input" value={ficha.custodio} onChange={fijar('custodio')}><option value="">Elige…</option>{custodios.map((c) => <option key={c}>{c}</option>)}</select>
                    </label>
                    <label className="cc-campo"><span className="cc-et">Fuente de origen<Req /></span>
                      <select className="form-input" value={ficha.fuente} onChange={fijar('fuente')}><option value="">Elige…</option>{fuentes.map((c) => <option key={c}>{c}</option>)}</select>
                    </label>
                    <label className="cc-campo"><span className="cc-et">Periodicidad<Req /></span>
                      <select className="form-input" value={ficha.periodicidad} onChange={fijar('periodicidad')}><option value="">Elige…</option>{PERIODICIDADES.map((p) => <option key={p}>{p}</option>)}</select>
                    </label>
                    <label className="cc-campo"><span className="cc-et">Fecha de corte de los datos<Req /></span>
                      <input type="date" className="form-input" value={ficha.corte} max={ahora} onChange={fijar('corte')} />
                    </label>
                  </div>
                  <label className="cc-campo"><span className="cc-et">Propósito (¿para qué sirve esta capa?)<Req /></span>
                    <textarea className="form-input" rows={3} value={ficha.proposito} onChange={fijar('proposito')} maxLength={400} />
                    <small>{ficha.proposito.trim().length}/20 caracteres mínimo</small>
                  </label>
                  <fieldset className="cc-campo cc-opciones">
                    <legend>Linaje: ¿cómo se obtuvo? (marca los que apliquen)<Req /></legend>
                    {PASOS_LINAJE.map((p) => (
                      <label key={p}><input type="checkbox" checked={ficha.pasos.includes(p)} onChange={(e) => setFicha((f) => ({ ...f, pasos: e.target.checked ? [...f.pasos, p] : f.pasos.filter((x) => x !== p) }))} /> {p}</label>
                    ))}
                  </fieldset>
                  <label className="cc-campo"><span className="cc-et">Nota de linaje (una o dos frases)<Req /></span>
                    <textarea className="form-input" rows={2} value={ficha.notaLinaje} onChange={fijar('notaLinaje')} maxLength={300} />
                    <small>{ficha.notaLinaje.trim().length}/15 caracteres mínimo. «No aplica» no es una respuesta válida.</small>
                  </label>
                </>
              )}

              {/* ================= Actualizar · 3 Justificación ================= */}
              {actualizar && paso === 3 && (
                <>
                  <NotaObligatorio />
                  <dl className="cc-ficha-fija">
                    <dt>Capa</dt><dd>{base ? `${base.id} · ${base.titulo}` : '—'}</dd>
                    <dt>Elementos</dt><dd>{revision?.n != null && base ? `${previo || '—'} antes → ${revision.n} ahora${previo ? ` (${revision.n - previo >= 0 ? '+' : ''}${revision.n - previo}, ${(variacion * 100).toFixed(0)} %)` : ''}` : '—'}</dd>
                  </dl>
                  {variacion >= UMBRAL_VARIACION && <div className="cc-aviso cc-aviso--info"><Info size={16} aria-hidden="true" /><span>La capa cambia {(variacion * 100).toFixed(0)} %: la administración revisará con especial cuidado tu justificación.</span></div>}
                  <div className="cc-dos">
                    <label className="cc-campo"><span className="cc-et">Motivo de la actualización<Req /></span>
                      <select className="form-input" value={ficha.motivo} onChange={fijar('motivo')}><option value="">Elige…</option>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
                    </label>
                    <label className="cc-campo"><span className="cc-et">Nueva fecha de corte<Req /></span>
                      <input type="date" className="form-input" value={ficha.corte} max={ahora} onChange={fijar('corte')} />
                    </label>
                  </div>
                  <label className="cc-campo"><span className="cc-et">Justificación (qué cambió y por qué)<Req /></span>
                    <textarea className="form-input" rows={4} value={ficha.justificacion} onChange={fijar('justificacion')} maxLength={800} />
                    <small>{ficha.justificacion.trim().length}/30 caracteres mínimo. La revisa la administración.</small>
                  </label>
                  <div className="cc-campo">
                    <span className="cc-et">Ligar a otros indicadores (opcional)</span>
                    <select className="form-input" value="" onChange={(e) => e.target.value && setExtra((x) => (x.includes(e.target.value) ? x : [...x, e.target.value]))}>
                      <option value="">Agregar un indicador…</option>
                      {indicadores.filter((i) => !extra.includes(i.id) && !(rel?.capa_indicador ?? []).some((r) => r.id_capa === base?.id && r.id_indicador === i.id)).map((i) => <option key={i.id} value={i.id}>{i.id} · {i.nombre}</option>)}
                    </select>
                    {extra.length > 0 && <ul className="cc-chips">{extra.map((i) => <li key={i}><code>{i}</code><button type="button" aria-label={`Quitar ${i}`} onClick={() => setExtra((x) => x.filter((y) => y !== i))}><XCircle size={14} /></button></li>)}</ul>}
                    <small>{vigente ? 'Se ligan cuando la administración apruebe la actualización.' : 'Se ligan al guardar.'} Todo queda en la bitácora.</small>
                  </div>
                  <p className="cc-nota"><FileCheck2 size={14} aria-hidden="true" /> La ficha (título, custodio, fuente y linaje) se conserva igual.</p>
                </>
              )}

              {/* ================= Nueva · 4 Enviar ================= */}
              {!actualizar && paso === 4 && (
                <>
                  <dl className="cc-ficha-fija">
                    <dt>Identificador</dt><dd>{idNuevo || '—'}</dd>
                    <dt>Título</dt><dd>{ficha.titulo || '—'}</dd>
                    <dt>Pertenece a</dt><dd>{DESTINOS.find((d) => d.id === destino.cat)?.titulo ?? '—'} · {grupoDestino || '—'}</dd>
                    <dt>Geometría · elementos</dt><dd>{revision?.tipo ? `${revision.tipo} · ${revision.n}` : '—'}</dd>
                    <dt>Custodio · fuente</dt><dd>{ficha.custodio || '—'} · {ficha.fuente || '—'}</dd>
                    <dt>Fecha de corte</dt><dd>{ficha.corte || '—'}</dd>
                    <dt>Restricción de uso</dt><dd>La define la administración al revisar</dd>
                  </dl>
                </>
              )}

              {ultimo && (
                <div className={`cc-lista ${listo ? 'cc-lista--ok' : ''}`} role="status">
                  {listo ? <p><CheckCircle2 size={16} aria-hidden="true" /> Todo listo. «Guardar borrador» te deja seguir editando; «Enviar a revisión» la manda a la administración.</p> : (
                    <>
                      <p><CircleDashed size={16} aria-hidden="true" /> Antes de guardar o enviar falta:</p>
                      <ul>{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
                    </>
                  )}
                </div>
              )}

              {estado.error && <div className="cc-aviso cc-aviso--error" role="alert"><XCircle size={16} aria-hidden="true" /><span>{estado.error}</span></div>}
            </>
          )}
        </div>

        {!estado.hecho && (
          <div className="modal-drawer-footer cc-pie">
            <button type="button" className="btn-base btn-secondary" onClick={() => (paso > 1 ? setPaso(paso - 1) : onClose())}><ArrowLeft size={14} /> {paso > 1 ? 'Atrás' : 'Cancelar'}</button>
            {revision?.valido && <button type="button" className="btn-base btn-secondary" onClick={verEnMapa}><MapaIcono size={14} /> Ver en el mapa</button>}
            {!ultimo ? (
              <button type="button" className="btn-base btn-primary" disabled={!puedeSeguir} onClick={() => setPaso(paso + 1)}>Siguiente <ArrowRight size={14} /></button>
            ) : (
              <>
                {!(actualizar && vigente) && <button type="button" className="btn-base btn-secondary" disabled={estado.ocupado || !listo} onClick={() => guardar(false)}><Save size={14} /> Guardar borrador</button>}
                <button type="button" className="btn-base btn-primary" disabled={estado.ocupado || !listo} aria-busy={estado.ocupado} onClick={() => guardar(true)}><Send size={14} /> {estado.ocupado ? 'Enviando…' : actualizar && vigente ? 'Enviar propuesta' : 'Enviar a revisión'}</button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
