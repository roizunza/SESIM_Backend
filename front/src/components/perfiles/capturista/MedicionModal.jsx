import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, UploadCloud, Trash2, Plus, Send, Save, FileCheck2, Loader2 } from 'lucide-react';
import {
  useMediciones, guardarMedicionApi, enviarMedicionApi, ultimoDictamenDe, nombreEvidencia,
} from '../../../lib/sesim/medicionesApi';
import { subirEvidencia, validarArchivoEvidencia, EVIDENCIA_MAX_BYTES } from '../../../lib/sesim/catalogoApi';
import { vEquivalenciaPimus } from '../../../lib/sesim/api';
import '../comun/Comun.css';

/**
 * Captura de una medición (MESO · medicion_indicador) — paso 2 y 3 del flujo
 * transversal (sección 1.5):
 *   1. elegir indicador, periodo y unidad territorial;
 *   2. registrar el valor (cuantitativo o cualitativo) y sus desagregaciones;
 *   3. adjuntar evidencia (se calcula su SHA-256);
 *   4. guardar como borrador o enviar a revisión (F10).
 *
 * `idMedicion` = null crea una medición nueva; con id edita una en borrador
 * o rechazada.
 */
// Evidencia documental: solo PDF, JPG o PNG (el bucket lo exige también en el servidor).
// Los datos geoespaciales NO se adjuntan aquí: se cargan como capa (Ciclo 9).
const TIPOS_DOCUMENTO = ['Oficio', 'Reporte', 'Fotografía', 'Publicación oficial', 'Captura de pantalla', 'Otro'];
const ANIOS = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i);
const SUBPERIODOS = { anual: [], semestral: [1, 2], trimestral: [1, 2, 3, 4], mensual: Array.from({ length: 12 }, (_, i) => i + 1) };

export default function MedicionModal({ abierto, idMedicion, sesion, catalogo, onClose, onGuardada }) {
  const api = useMediciones();
  const existente = idMedicion ? api.mediciones.find((m) => m.id === idMedicion) : null;
  const periodoExistente = existente ? api.periodos.find((p) => p.id === existente.id_periodo) : null;

  const [busqueda, setBusqueda] = useState('');
  const [idIndicador, setIdIndicador] = useState('');
  const [tipoPeriodo, setTipoPeriodo] = useState('anual');
  const [anio, setAnio] = useState(ANIOS[0]);
  const [sub, setSub] = useState(1);
  const [idMunicipio, setIdMunicipio] = useState('');
  const [idLocalidad, setIdLocalidad] = useState('');
  const [valor, setValor] = useState('');
  const [valorTexto, setValorTexto] = useState('');
  const [desag, setDesag] = useState([]);
  const [tipoDoc, setTipoDoc] = useState(TIPOS_DOCUMENTO[0]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [idActual, setIdActual] = useState(null);
  const [equivalencias, setEquivalencias] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const ocupado = subiendo || guardando || enviando;

  // Cargar valores al abrir
  useEffect(() => {
    if (!abierto) return;
    setError('');
    setAviso('');
    setBusqueda('');
    setGuardando(false);
    setEnviando(false);
    setSubiendo(false);
    if (existente) {
      const u = catalogo.unidades.get(existente.id_unidad);
      setIdActual(existente.id);
      setIdIndicador(existente.id_indicador);
      setTipoPeriodo(periodoExistente?.tipo_periodo ?? 'anual');
      setAnio(periodoExistente?.anio ?? ANIOS[0]);
      const m = /-(?:S|T|M)(\d+)$/.exec(periodoExistente?.etiqueta ?? '');
      setSub(m ? Number(m[1]) : 1);
      setIdMunicipio(u?.nivel === 'municipio' ? u.id : u?.id_padre ?? '');
      setIdLocalidad(u?.nivel === 'localidad' ? u.id : '');
      setValor(existente.valor ?? '');
      setValorTexto(existente.valor_texto ?? '');
      setDesag(Object.entries(existente.desagregaciones ?? {}).map(([k, v]) => ({ k, v })));
    } else {
      setIdActual(null);
      setIdIndicador('');
      setTipoPeriodo('anual');
      setAnio(ANIOS[0]);
      setSub(1);
      setIdMunicipio(sesion?.id_unidad ?? '');
      setIdLocalidad('');
      setValor('');
      setValorTexto('');
      setDesag([]);
    }
  }, [abierto, idMedicion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (idIndicador) vEquivalenciaPimus(idIndicador).then(setEquivalencias);
    else setEquivalencias([]);
  }, [idIndicador]);

  const indicadoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = catalogo.indicador;
    if (!q) return lista.slice(0, 40);
    return lista.filter((i) => i.id.toLowerCase().includes(q) || i.clave.toLowerCase().includes(q) || i.nombre.toLowerCase().includes(q)).slice(0, 40);
  }, [busqueda, catalogo.indicador]);

  const localidades = useMemo(
    () => (idMunicipio ? catalogo.unidad_territorial.filter((u) => u.id_padre === idMunicipio).sort((a, b) => a.nom_loc.localeCompare(b.nom_loc, 'es')) : []),
    [idMunicipio, catalogo.unidad_territorial],
  );

  if (!abierto) return null;

  const actual = idActual ? api.mediciones.find((m) => m.id === idActual) : null;
  const editable = !actual || ['borrador', 'rechazado'].includes(actual.estado);
  const evidencias = actual ? api.evidencias.filter((e) => e.id_medicion === actual.id && e.vigente) : [];
  const indicador = idIndicador ? catalogo.indicadores.get(idIndicador) : null;
  const dictamen = actual?.estado === 'rechazado' ? ultimoDictamenDe(actual.id, api.dictamenes) : null;
  const ambitoFijo = !!sesion?.id_unidad;
  const pimusMunicipio = equivalencias.filter((e) => e.instrumento?.id_unidad_ambito === idMunicipio);

  const faltantes = [];
  if (!idIndicador) faltantes.push('el indicador');
  if (!(idLocalidad || idMunicipio)) faltantes.push('el municipio');
  if (valor === '' && !valorTexto.trim()) faltantes.push('un valor (numérico o cualitativo)');

  /** Guarda como borrador. Devuelve la fila o null si falló (el motivo queda en `error`). */
  const guardar = async ({ silencioso = false } = {}) => {
    setError('');
    setAviso('');
    if (faltantes.length) {
      setError(`Falta ${faltantes.join(', ')}.`);
      return null;
    }
    setGuardando(true);
    try {
      const desagregaciones = Object.fromEntries(desag.filter((d) => d.k.trim()).map((d) => [d.k.trim(), d.v]));
      const m = await guardarMedicionApi({
        id: idActual,
        id_indicador: idIndicador,
        id_unidad: idLocalidad || idMunicipio,
        tipo_periodo: tipoPeriodo,
        anio,
        sub,
        valor,
        valor_texto: valorTexto,
        desagregaciones,
      });
      setIdActual(m.id);
      if (!silencioso) setAviso('Medición guardada como borrador. Adjunte una evidencia para poder enviarla.');
      onGuardada?.(m.id);
      return m;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setGuardando(false);
    }
  };

  const subir = async (archivo) => {
    if (!archivo) return;
    setError('');
    setAviso('');
    // Se valida ANTES de guardar o subir nada: no se crea un borrador por un archivo inválido.
    const invalido = validarArchivoEvidencia(archivo);
    if (invalido) {
      setError(`«${archivo.name}»: ${invalido} Solo PDF, JPG o PNG de hasta ${EVIDENCIA_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    let id = idActual;
    if (!id) {
      const m = await guardar({ silencioso: true });
      if (!m) return;
      id = m.id;
    }
    setSubiendo(true);
    try {
      await subirEvidencia(id, archivo, tipoDoc);
      await api.recargar();
      setAviso(`Evidencia «${archivo.name}» adjuntada; su huella SHA-256 quedó registrada.${evidencias.length ? ' La anterior quedó como reemplazada.' : ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const enviar = async () => {
    const m = await guardar({ silencioso: true });
    if (!m) return;
    setEnviando(true);
    try {
      await enviarMedicionApi(m.id);
      onGuardada?.(m.id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="modal-drawer-overlay" onClick={onClose}></div>
      <div className="modal-drawer cap-cajon" style={{ '--ancho-cajon': '520px' }}>
        <div className="modal-drawer-header" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--per-principal) 45%, var(--per-superficie)) 0%, var(--per-superficie) 55%, var(--per-fondo) 100%)', color: 'var(--per-texto)' }}>
          <div>
            <span className="cap-cajon__rot">{actual ? 'Revisión del dato' : 'Nuevo registro'}</span>
            <h3 className="cap-cajon__tit" style={{ color: 'var(--per-texto)' }}>
              {actual ? 'Dato de indicador' : 'Capturar dato de indicador'}
            </h3>
            <span className="cap-cajon__sub" style={{ color: 'color-mix(in srgb, var(--per-texto) 78%, transparent)' }}>
              {editable
                ? 'Completa los pasos 1 a 5 con el documento que respalda el dato. Puedes guardar como borrador y seguir después; al enviarlo a revisión ya no se podrá editar.'
                : 'Consulta del dato enviado. Aquí ya no se puede editar.'}
            </span>
          </div>
          <button className="btn-close-drawer" style={{ color: 'var(--per-texto)' }} onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-drawer-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {dictamen?.comentario && (
            <div className="aviso aviso-error"><strong>Devuelta por el administrador:</strong> {dictamen.comentario}</div>
          )}
          {!editable && <div className="aviso aviso-info">Esta medición está en «{actual.estado}» y ya no se puede editar.</div>}

          {/* 1. Indicador */}
          <div className="form-group">
            <label>1. Indicador <span style={{ color: '#EF4444' }}>*</span></label>
            {indicador ? (
              <div className="aviso aviso-info" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span><strong>{indicador.id}</strong> · {indicador.nombre}<br /><small>{indicador.variable}</small></span>
                {editable && <button type="button" className="btn-base btn-tertiary" style={{ width: 'auto', height: 28 }} onClick={() => setIdIndicador('')}>Cambiar</button>}
              </div>
            ) : (
              <>
                <div className="capa-buscador" style={{ margin: 0 }}>
                  <Search size={14} />
                  <input autoFocus placeholder="Buscar por ID (Im18), clave o nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                </div>
                <div className="cap-cajon__lista">
                  <table className="tabla-sesim">
                    <tbody>
                      {indicadoresFiltrados.map((i) => (
                        <tr key={i.id} className="clic" onClick={() => setIdIndicador(i.id)}>
                          <td className="cap-cajon__id">{i.id}</td>
                          <td>{i.nombre}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="cap-cajon__cuenta">{indicadoresFiltrados.length} {indicadoresFiltrados.length === 1 ? 'indicador' : 'indicadores'} · desplázate para ver más</p>
              </>
            )}
            {pimusMunicipio.length > 0 && (
              <div className="aviso aviso-info" style={{ marginTop: 6 }}>
                <strong>Su PIMUS lo mide como (F15):</strong>
                {pimusMunicipio.map((e, i) => (
                  <div key={i}>«{e.matriz?.indicador_origen}» · {e.correspondencia}{e.matriz?.meta ? ` · meta: ${e.matriz.meta}` : ''}</div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Periodo */}
          <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label>2. Periodo</label>
              <select className="form-input" disabled={!editable} value={tipoPeriodo} onChange={(e) => { setTipoPeriodo(e.target.value); setSub(1); }}>
                <option value="anual">Anual</option>
                <option value="semestral">Semestral</option>
                <option value="trimestral">Trimestral</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label>Año</label>
              <select className="form-input" disabled={!editable} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label>Corte</label>
              <select className="form-input" disabled={!editable || tipoPeriodo === 'anual'} value={sub} onChange={(e) => setSub(Number(e.target.value))}>
                {tipoPeriodo === 'anual' ? <option value={1}>—</option> : SUBPERIODOS[tipoPeriodo].map((n) => <option key={n} value={n}>{tipoPeriodo === 'semestral' ? `S${n}` : tipoPeriodo === 'trimestral' ? `T${n}` : `M${String(n).padStart(2, '0')}`}</option>)}
              </select>
            </div>
          </div>

          {/* 3. Unidad territorial */}
          <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label>3. Municipio <span style={{ color: '#EF4444' }}>*</span></label>
              <select className="form-input" disabled={!editable || ambitoFijo} value={idMunicipio} onChange={(e) => { setIdMunicipio(e.target.value); setIdLocalidad(''); }}>
                <option value="">Seleccione…</option>
                {catalogo.municipios.map((u) => <option key={u.id} value={u.id}>{u.nom_mun} ({u.id})</option>)}
              </select>
            </div>
            <div>
              <label>Localidad (opcional)</label>
              <select className="form-input" disabled={!editable || !idMunicipio} value={idLocalidad} onChange={(e) => setIdLocalidad(e.target.value)}>
                <option value="">Total del municipio</option>
                {localidades.map((u) => <option key={u.id} value={u.id}>{u.nom_loc}</option>)}
              </select>
            </div>
          </div>

          {/* 4. Valor */}
          <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <div>
              <label>4. Valor numérico</label>
              <input className="form-input" type="number" step="any" disabled={!editable} value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <label>Valor cualitativo / nota</label>
              <input className="form-input" disabled={!editable} value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} placeholder="Si el indicador no es numérico" />
            </div>
          </div>

          <div className="form-group">
            <label>Desagregaciones (sexo, edad, modo…)</label>
            {desag.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input className="form-input" placeholder="Dimensión (p. ej. mujeres)" disabled={!editable} value={d.k} onChange={(e) => setDesag(desag.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                <input className="form-input" placeholder="Valor" disabled={!editable} value={d.v} onChange={(e) => setDesag(desag.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
                {editable && <button type="button" className="btn-base btn-tertiary" style={{ width: 36 }} onClick={() => setDesag(desag.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
              </div>
            ))}
            {editable && <button type="button" className="btn-base btn-tertiary" style={{ width: 'auto' }} onClick={() => setDesag([...desag, { k: '', v: '' }])}><Plus size={14} /> Agregar desagregación</button>}
          </div>

          {/* 5. Evidencia */}
          <div className="form-group">
            <label>5. Evidencia documental <span style={{ color: '#EF4444' }}>*</span> <small style={{ fontWeight: 400 }}>(al menos una para enviar)</small></label>
            {evidencias.map((ev) => (
              <div key={ev.id} className="evidencia-item" style={{ marginBottom: 6 }}>
                <div className="evidencia-item-cab">
                  <strong><FileCheck2 size={14} style={{ verticalAlign: -2 }} /> {nombreEvidencia(ev)}</strong>
                </div>
                <span style={{ fontSize: 'var(--t-nota)', color: 'var(--text-secondary)' }}>{ev.tipo_documento} · evidencia vigente</span>
                <span className="dato-mono" style={{ fontSize: 'var(--t-nota)' }}>SHA-256 {ev.hash_archivo}</span>
              </div>
            ))}
            {editable && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="form-input" style={{ maxWidth: 170 }} value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t}>{t}</option>)}
                </select>
                <label className="btn-base btn-secondary" style={{ cursor: ocupado ? 'not-allowed' : 'pointer', width: 'auto', opacity: ocupado ? 0.6 : 1 }}>
                  {subiendo ? <Loader2 size={15} className="girando" /> : <UploadCloud size={15} />} {subiendo ? 'Subiendo evidencia…' : evidencias.length ? 'Reemplazar archivo' : 'Adjuntar archivo'}
                  <input type="file" hidden disabled={ocupado} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            )}
            {editable && <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)' }}>Solo PDF, JPG o PNG de hasta 10 MB. Los datos geoespaciales se cargan como capa, no como evidencia.</small>}
          </div>

          {error && <div className="aviso aviso-error">{error}</div>}
          {aviso && !error && <div className="aviso aviso-ok">{aviso}</div>}
        </div>

        {editable && (
          <div className="modal-drawer-footer">
            <button className="btn-base btn-secondary" style={{ width: 'auto' }} disabled={ocupado} aria-busy={guardando} onClick={() => guardar()}>
              {guardando ? <Loader2 size={15} className="girando" /> : <Save size={15} />} {guardando ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              className="btn-base btn-primary"
              style={{ width: 'auto' }}
              disabled={ocupado || evidencias.length === 0}
              aria-busy={enviando}
              title={evidencias.length === 0 ? 'Adjunte al menos una evidencia' : ''}
              onClick={enviar}
            >
              {enviando ? <Loader2 size={15} className="girando" /> : <Send size={15} />} {enviando ? 'Enviando…' : actual?.estado === 'rechazado' ? 'Reenviar a revisión' : 'Enviar a revisión'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
