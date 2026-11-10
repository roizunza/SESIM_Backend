import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Plus, X, Info, Loader2, BadgeCheck, CornerUpLeft, Send, Lock } from 'lucide-react';
import { backend } from '../../../lib/sesim/supabase';
import { guardarInstrumento, enviarInstrumentoARevision, dictaminarInstrumento } from '../../../lib/sesim/catalogoApi';
import { Fila } from '../capturista/CapturistaSidebar';
import { fechaCorta } from '../comun/formato';
import './VisorCampos.css';

/**
 * Instrumentos de origen (leyes, planes, programas) — pestaña «Instrumentos».
 *  · Administrador y Titular: dan de alta, editan (solo en borrador) y envían a revisión (exige el PDF).
 *  · Solo el Titular dictamina (validar → publicar | rechazar con motivo); cuatro ojos: no resuelve el que envió.
 * Todo va a api.fn_guardar_instrumento / fn_enviar_instrumento_revision / fn_dictaminar_instrumento.
 * PDF: por ahora se registra su ruta o enlace; la carga del archivo llega con el almacenamiento (pendiente, igual que el GeoPackage).
 */
const ESTATUS = { borrador: 'Borrador', revision: 'En revisión', vigente_admin: 'Uso interno', vigente_publico: 'Publicado' };
const VACIO = { clave: '', nombre: '', ambito: 'Estatal', competencia: '', vigencia_desde: '', vigencia_hasta: '', ruta_pdf: '' };

function InstrumentoModal({ inst, titular, onClose, onCambio }) {
  const nuevo = !inst;
  const editable = nuevo || inst.estatus === 'borrador';
  const [f, setF] = useState(() => (inst ? { ...VACIO, ...Object.fromEntries(Object.keys(VACIO).map((k) => [k, inst[k] ?? ''])) } : VACIO));
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const datos = () => ({ ...(inst ? { id: inst.id } : {}), clave: f.clave.trim(), nombre: f.nombre.trim(), ambito: f.ambito, competencia: f.competencia.trim() || null,
    vigencia_desde: f.vigencia_desde || null, vigencia_hasta: f.vigencia_hasta || null, ruta_pdf: f.ruta_pdf.trim() || null });
  const faltan = [!f.clave.trim() && 'clave', f.nombre.trim().length < 5 && 'nombre'].filter(Boolean);

  const ejecutar = async (fn, texto) => {
    setError(''); setOcupado(true);
    try { await fn(); setHecho(texto); onCambio(); } catch (e) { setError(e.message || 'No se pudo completar.'); } finally { setOcupado(false); }
  };
  const guardar = async (enviar) => ejecutar(async () => {
    const r = await guardarInstrumento(datos());
    if (enviar) await enviarInstrumentoARevision(r?.id ?? inst.id);
  }, enviar ? 'Instrumento guardado y enviado a revisión del Titular.' : 'Instrumento guardado como borrador.');

  return (
    <>
      <div className="modal-drawer-overlay" onClick={onClose} />
      <div className="modal-drawer dc-drawer" role="dialog" aria-modal="true" aria-label="Instrumento">
        <div className="modal-drawer-header">
          <div><p className="dc-rotulo">{inst ? <><code>{inst.id}</code> · {ESTATUS[inst.estatus] ?? inst.estatus}</> : 'Instrumento nuevo'}</p><h3 className="dc-titulo">{inst?.nombre ?? 'Alta de instrumento'}</h3></div>
          <button type="button" className="btn-close-drawer" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="modal-drawer-content dc-cuerpo">
          {!editable && <div className="aviso aviso-info"><Lock size={14} aria-hidden="true" /> Está en «{ESTATUS[inst.estatus]}»: solo se edita en borrador. Para corregirlo, el Titular lo devuelve a borrador con un motivo.</div>}
          <label className="dc-campo">Clave<input className="form-input" value={f.clave} onChange={set('clave')} disabled={!editable} placeholder="Ej. PEMUS" /></label>
          <label className="dc-campo">Nombre<input className="form-input" value={f.nombre} onChange={set('nombre')} disabled={!editable} /></label>
          <label className="dc-campo">Ámbito<select className="form-input" value={f.ambito} onChange={set('ambito')} disabled={!editable}><option>Federal</option><option>Estatal</option><option>Municipal</option></select></label>
          <label className="dc-campo">Competencia<input className="form-input" value={f.competencia} onChange={set('competencia')} disabled={!editable} placeholder="Dependencia que lo emite" /></label>
          <div className="vi-doble">
            <label className="dc-campo">Vigencia desde<input type="date" className="form-input" value={f.vigencia_desde ?? ''} onChange={set('vigencia_desde')} disabled={!editable} /></label>
            <label className="dc-campo">Vigencia hasta<input type="date" className="form-input" value={f.vigencia_hasta ?? ''} onChange={set('vigencia_hasta')} disabled={!editable} /></label>
          </div>
          <label className="dc-campo">PDF del instrumento (ruta o enlace) <small>Obligatorio para enviarlo a revisión.</small><input className="form-input" value={f.ruta_pdf} onChange={set('ruta_pdf')} disabled={!editable} placeholder="https://…/instrumento.pdf" /></label>
          <p className="dc-nota"><Info size={14} aria-hidden="true" /> La carga del archivo PDF directamente a la plataforma queda pendiente del almacenamiento; mientras tanto se registra su ruta.</p>

          {hecho && <div className="aviso aviso-ok" role="status">{hecho}</div>}
          {error && <div className="aviso aviso-error" role="alert">{error}</div>}

          {editable && !hecho && (
            <div className="dc-botones">
              <button type="button" className="btn-base btn-secondary" disabled={ocupado || faltan.length > 0} onClick={() => guardar(false)}>{ocupado ? <Loader2 size={15} className="spin" /> : null} Guardar borrador</button>
              <button type="button" className="btn-base btn-primary" disabled={ocupado || faltan.length > 0 || !f.ruta_pdf.trim()} title={f.ruta_pdf.trim() ? '' : 'Falta el PDF'} onClick={() => guardar(true)}><Send size={15} aria-hidden="true" /> Guardar y enviar a revisión</button>
            </div>
          )}

          {inst && !hecho && ['revision', 'vigente_admin'].includes(inst.estatus) && (
            titular ? (
              <section className="dc-bloque" aria-label="Dictamen del Titular">
                <h4>Dictamen (solo Titular)</h4>
                <label className="dc-campo">Motivo o comentario <small>Obligatorio solo si lo devuelves.</small><textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
                <div className="dc-botones">
                  <button type="button" className="btn-base btn-primary" disabled={ocupado} onClick={() => ejecutar(() => dictaminarInstrumento(inst.id, inst.estatus === 'revision' ? 'validar' : 'publicar', motivo || null), inst.estatus === 'revision' ? 'Instrumento validado (uso interno).' : 'Instrumento publicado.')}><BadgeCheck size={15} aria-hidden="true" /> {inst.estatus === 'revision' ? 'Validar' : 'Publicar'}</button>
                  <button type="button" className="btn-base btn-tertiary dc-devolver" disabled={ocupado || !motivo.trim()} onClick={() => ejecutar(() => dictaminarInstrumento(inst.id, 'rechazar', motivo), 'Instrumento devuelto a borrador.')}><CornerUpLeft size={15} aria-hidden="true" /> Devolver</button>
                </div>
              </section>
            ) : <div className="aviso aviso-info"><Info size={14} aria-hidden="true" /> Solo el Administrador Titular dictamina instrumentos.</div>
          )}
          {inst?.estatus === 'vigente_publico' && titular && !hecho && (
            <button type="button" className="btn-base btn-tertiary dc-devolver" disabled={ocupado || !motivo.trim()} onClick={() => ejecutar(() => dictaminarInstrumento(inst.id, 'rechazar', motivo), 'Instrumento devuelto a borrador.')}>Retirar de publicación (escribe el motivo arriba)</button>
          )}
          {inst?.estatus === 'vigente_publico' && titular && !hecho && <label className="dc-campo">Motivo<textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>}
        </div>
      </div>
    </>
  );
}

export default function PanelInstrumentos({ titular }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(undefined); // undefined = cerrado, null = nuevo, objeto = existente
  const cargar = useCallback(() => {
    backend.leer('instrumento_origen', { query: 'select=*&order=id' }).then((r) => { setFilas(r); setError(''); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const orden = useMemo(() => [...(filas ?? [])].sort((a, b) => ['revision', 'borrador', 'vigente_admin', 'vigente_publico'].indexOf(a.estatus) - ['revision', 'borrador', 'vigente_admin', 'vigente_publico'].indexOf(b.estatus) || a.id.localeCompare(b.id, 'es', { numeric: true })), [filas]);

  return (
    <div className="cap-mesa">
      <p className="cap-ayuda">Leyes, planes y programas de los que salen los indicadores. {titular ? 'Tú los dictaminas.' : 'Los dictamina el Administrador Titular.'}</p>
      <button type="button" className="cap-ver-todo" onClick={() => setAbierto(null)}><Plus size={14} aria-hidden="true" /> Nuevo instrumento</button>
      {error && <p className="cap-vacio">No se pudo leer: {error}</p>}
      {!filas && !error && <p className="cap-vacio">Cargando…</p>}
      {orden.map((i) => (
        <Fila key={i.id} Icono={FileText} tipo="Instrumento" titulo={i.clave || i.id} detalle={i.nombre} estado={`${ESTATUS[i.estatus] ?? i.estatus}${i.activo === false ? ' · baja' : ''}`} onClick={() => setAbierto(i)} />
      ))}
      {filas && !filas.length && <p className="cap-vacio">Aún no hay instrumentos.</p>}
      {abierto !== undefined && <InstrumentoModal key={abierto?.id ?? 'nuevo'} inst={abierto} titular={titular} onClose={() => setAbierto(undefined)} onCambio={cargar} />}
    </div>
  );
}
