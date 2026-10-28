import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, UploadCloud, Trash2, Plus, Send, Save, FileCheck2 } from 'lucide-react';
import {
  useOperacion, guardarMedicion, adjuntarEvidencia, quitarEvidencia, fnTransicionEstado, obtenerOCrearPeriodo,
  TIPOS_DOCUMENTO, ultimoDictamen,
} from '../../../lib/sesim/operacion';
import { vEquivalenciaPimus } from '../../../lib/sesim/api';
import { bytesLegibles } from '../comun/formato';
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
const ANIOS = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i);
const SUBPERIODOS = { anual: [], semestral: [1, 2], trimestral: [1, 2, 3, 4], mensual: Array.from({ length: 12 }, (_, i) => i + 1) };

export default function MedicionModal({ abierto, idMedicion, sesion, catalogo, onClose, onGuardada }) {
  const op = useOperacion();
  const existente = idMedicion ? op.medicion_indicador.find((m) => m.id === idMedicion) : null;
  const periodoExistente = existente ? op.periodo.find((p) => p.id === existente.id_periodo) : null;

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

  // Cargar valores al abrir
  useEffect(() => {
    if (!abierto) return;
    setError('');
    setAviso('');
    setBusqueda('');
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

  const actual = idActual ? op.medicion_indicador.find((m) => m.id === idActual) : null;
  const editable = !actual || ['borrador', 'rechazado'].includes(actual.estado);
  const evidencias = actual ? op.evidencia_medicion.filter((e) => e.id_medicion === actual.id) : [];
  const indicador = idIndicador ? catalogo.indicadores.get(idIndicador) : null;
  const dictamen = actual?.estado === 'rechazado' ? ultimoDictamen(actual.id, op) : null;
  const ambitoFijo = !!sesion?.id_unidad;
  const pimusMunicipio = equivalencias.filter((e) => e.instrumento?.id_unidad_ambito === idMunicipio);

  const guardar = () => {
    setError('');
    setAviso('');
    try {
      const periodo = obtenerOCrearPeriodo({ tipo_periodo: tipoPeriodo, anio, sub: tipoPeriodo === 'anual' ? null : sub });
      const desagregaciones = Object.fromEntries(desag.filter((d) => d.k.trim()).map((d) => [d.k.trim(), d.v]));
      const m = guardarMedicion(sesion, {
        id: idActual,
        id_indicador: idIndicador,
        id_unidad: idLocalidad || idMunicipio,
        id_periodo: periodo.id,
        valor,
        valor_texto: valorTexto,
        desagregaciones,
      });
      setIdActual(m.id);
      setAviso('Medición guardada como borrador. Adjunte al menos una evidencia para poder enviarla.');
      onGuardada?.(m.id);
      return m;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const subir = async (archivo) => {
    if (!archivo) return;
    setError('');
    let id = idActual;
    if (!id) {
      const m = guardar();
      if (!m) return;
      id = m.id;
    }
    setSubiendo(true);
    try {
      await adjuntarEvidencia(sesion, id, archivo, tipoDoc);
      setAviso(`Evidencia «${archivo.name}» adjuntada; su huella SHA-256 quedó registrada.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const enviar = () => {
    const m = guardar();
    if (!m) return;
    try {
      fnTransicionEstado(sesion, m.id, 'revision');
      onGuardada?.(m.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="modal-drawer-overlay" onClick={onClose}></div>
      <div className="modal-drawer" style={{ width: 520 }}>
        <div className="modal-drawer-header">
          <div>
            <h3 style={{ margin: 0, color: 'var(--c-guinda)', fontFamily: 'var(--font-heading)' }}>
              {actual ? 'Medición' : 'Nueva medición'}
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Indicador · periodo · unidad territorial · valor · evidencia
            </span>
          </div>
          <button className="btn-close-drawer" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-drawer-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {dictamen?.datos_nuevos?.comentario && (
            <div className="aviso aviso-error"><strong>Devuelta por el administrador:</strong> {dictamen.datos_nuevos.comentario}</div>
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
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6, marginTop: 6 }}>
                  <table className="tabla-sesim">
                    <tbody>
                      {indicadoresFiltrados.map((i) => (
                        <tr key={i.id} className="clic" onClick={() => setIdIndicador(i.id)}>
                          <td style={{ width: 70, fontWeight: 700, color: 'var(--c-guinda)' }}>{i.id}</td>
                          <td>{i.nombre}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                  <strong><FileCheck2 size={14} style={{ verticalAlign: -2 }} /> {ev.nombre_archivo}</strong>
                  {editable && <button type="button" className="btn-base btn-tertiary" style={{ width: 32, height: 28 }} onClick={() => { try { quitarEvidencia(sesion, ev.id); } catch (err) { setError(err.message); } }}><Trash2 size={13} /></button>}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ev.tipo_documento} · {bytesLegibles(ev.bytes)}</span>
                <span className="dato-mono" style={{ fontSize: 10.5 }}>SHA-256 {ev.hash_archivo}</span>
              </div>
            ))}
            {editable && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="form-input" style={{ maxWidth: 170 }} value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t}>{t}</option>)}
                </select>
                <label className="btn-base btn-secondary" style={{ cursor: 'pointer', width: 'auto', opacity: subiendo ? 0.6 : 1 }}>
                  <UploadCloud size={15} /> {subiendo ? 'Calculando huella…' : 'Adjuntar archivo'}
                  <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            )}
          </div>

          {error && <div className="aviso aviso-error">{error}</div>}
          {aviso && !error && <div className="aviso aviso-ok">{aviso}</div>}
        </div>

        {editable && (
          <div className="modal-drawer-footer">
            <button className="btn-base btn-secondary" style={{ width: 'auto' }} onClick={guardar}><Save size={15} /> Guardar borrador</button>
            <button className="btn-base btn-primary" style={{ width: 'auto' }} disabled={evidencias.length === 0} title={evidencias.length === 0 ? 'Adjunte al menos una evidencia' : ''} onClick={enviar}>
              <Send size={15} /> Enviar a revisión
            </button>
          </div>
        )}
      </div>
    </>
  );
}
