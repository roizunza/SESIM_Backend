import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartColumn, Plus, X, Info, Loader2, BadgeCheck, CornerUpLeft, Trash2, RotateCcw } from 'lucide-react';
import { backend } from '../../../lib/sesim/supabase';
import { tablas } from '../../../lib/sesim/api';
import { guardarIndicador } from '../../../lib/sesim/catalogoApi';
import { Fila } from '../capturista/CapturistaSidebar';
import './VisorCampos.css';

/**
 * Indicadores — pestaña «Indicadores». Administrador y Titular dan de alta y editan (api.fn_guardar_indicador).
 * Un indicador no se aprueba sin tendencia o valor de meta (lo exige la base). El umbral del semáforo lo fija solo el Titular.
 */
const MIR = ['Fin', 'Propósito', 'Componentes', 'Actividades'];
const VACIO = { id: '', nombre: '', id_eje: '', id_sector: '', id_fuente: '', variable: '', meta: '', tendencia: '', valor_meta: '', linea_base: '', anio_linea_base: '', nivel_mir: 'Actividades', responsable: '', estatus_aprobado: false, activo: true };
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function IndicadorModal({ ind, cat, titular, onClose, onCambio }) {
  const nuevo = !ind;
  const [f, setF] = useState(() => (ind ? Object.fromEntries(Object.keys(VACIO).map((k) => [k, ind[k] ?? VACIO[k]])) : VACIO));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const aprobado = !!ind?.estatus_aprobado;
  const dePrueba = ind?.activo === false;
  const bloqueado = !titular && aprobado; // el Administrador no toca un indicador ya aprobado
  const faltaMeta = !f.tendencia && f.valor_meta === '';
  const listo = f.id.trim() && f.nombre.trim().length >= 5 && f.id_eje && f.id_sector && f.id_fuente;

  const guardar = async (cambio = {}, texto = 'Indicador guardado. Quedó en la bitácora.') => {
    setError(''); setOcupado(true);
    try {
      await guardarIndicador({ id: f.id.trim(), nombre: f.nombre.trim(), id_eje: num(f.id_eje), id_sector: num(f.id_sector), id_fuente: num(f.id_fuente),
        variable: f.variable.trim() || null, meta: f.meta.trim() || null, tendencia: f.tendencia || null, valor_meta: num(f.valor_meta), linea_base: num(f.linea_base),
        anio_linea_base: num(f.anio_linea_base), nivel_mir: f.nivel_mir, responsable: f.responsable.trim() || null, estatus_aprobado: cambio.estatus_aprobado ?? aprobado, activo: cambio.activo ?? !dePrueba });
      setHecho(texto); onCambio();
    } catch (e) { setError(e.message || 'No se pudo guardar.'); } finally { setOcupado(false); }
  };

  return (
    <>
      <div className="modal-drawer-overlay" onClick={onClose} />
      <div className="modal-drawer dc-drawer" role="dialog" aria-modal="true" aria-label="Indicador">
        <div className="modal-drawer-header">
          <div><p className="dc-rotulo">{ind ? <code>{ind.id}</code> : 'Indicador nuevo'}</p><h3 className="dc-titulo">{ind?.nombre ?? 'Alta de indicador'}</h3></div>
          <button type="button" className="btn-close-drawer" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="modal-drawer-content dc-cuerpo">
          <label className="dc-campo">Código<input className="form-input" value={f.id} onChange={set('id')} disabled={!nuevo} placeholder="Ej. Accgir07" /></label>
          <label className="dc-campo">Nombre<textarea rows={2} className="form-input" disabled={bloqueado} value={f.nombre} onChange={set('nombre')} /></label>
          <div className="vi-doble">
            <label className="dc-campo">Eje<select className="form-input" disabled={bloqueado} value={f.id_eje} onChange={set('id_eje')}><option value="">Elige…</option>{cat.ejes.map((e) => <option key={e.id} value={e.id}>Eje {e.numero_eje} · {e.nombre}</option>)}</select></label>
            <label className="dc-campo">Sector<select className="form-input" disabled={bloqueado} value={f.id_sector} onChange={set('id_sector')}><option value="">Elige…</option>{cat.sectores.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
          </div>
          <label className="dc-campo">Fuente de información<select className="form-input" disabled={bloqueado} value={f.id_fuente} onChange={set('id_fuente')}><option value="">Elige…</option>{cat.fuentes.map((e) => <option key={e.id} value={e.id}>{e.siglas ? `${e.siglas} · ` : ''}{e.nombre}</option>)}</select></label>
          <label className="dc-campo">Variable que mide<input className="form-input" disabled={bloqueado} value={f.variable} onChange={set('variable')} /></label>
          <label className="dc-campo">Meta (texto)<input className="form-input" disabled={bloqueado} value={f.meta} onChange={set('meta')} /></label>
          <div className="vi-doble">
            <label className="dc-campo">Tendencia<select className="form-input" disabled={bloqueado} value={f.tendencia} onChange={set('tendencia')}><option value="">Sin definir</option><option>Ascendente</option><option>Descendente</option></select></label>
            <label className="dc-campo">Valor de la meta<input type="number" step="any" className="form-input" disabled={bloqueado} value={f.valor_meta} onChange={set('valor_meta')} /></label>
          </div>
          <div className="vi-doble">
            <label className="dc-campo">Línea base<input type="number" step="any" className="form-input" disabled={bloqueado} value={f.linea_base} onChange={set('linea_base')} /></label>
            <label className="dc-campo">Año de la línea base<input type="number" className="form-input" disabled={bloqueado} value={f.anio_linea_base} onChange={set('anio_linea_base')} /></label>
          </div>
          <div className="vi-doble">
            <label className="dc-campo">Nivel MIR<select className="form-input" disabled={bloqueado} value={f.nivel_mir} onChange={set('nivel_mir')}>{MIR.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="dc-campo">Responsable<input className="form-input" disabled={bloqueado} value={f.responsable} onChange={set('responsable')} /></label>
          </div>
          {bloqueado && <div className="aviso aviso-info"><Info size={14} aria-hidden="true" /> Ya está aprobado: solo el Administrador Titular lo modifica o lo da de baja.</div>}
          {!titular && !aprobado && ind && <div className="aviso aviso-info"><Info size={14} aria-hidden="true" /> Sin aprobar: queda a la espera del Administrador Titular, que lo dictamina.</div>}
          {hecho && <div className="aviso aviso-ok" role="status">{hecho}</div>}
          {error && <div className="aviso aviso-error" role="alert">{error}</div>}
          {!bloqueado && !hecho && (
            <div className="dc-botones"><button type="button" className="btn-base btn-primary" disabled={ocupado || !listo} onClick={() => guardar()}>{ocupado ? <Loader2 size={15} className="spin" /> : null} Guardar indicador</button></div>
          )}
          {titular && ind && !hecho && (
            <section className="dc-bloque" aria-label="Dictamen del Titular">
              <h4>Dictamen (solo Titular)</h4>
              <p className="dc-nota"><Info size={14} aria-hidden="true" /> {aprobado ? 'Aprobado: se mide y se muestra.' : 'Sin aprobar: aún no se mide ni se muestra. Para aprobarlo necesita tendencia o valor de meta.'}{dePrueba ? ' Está de baja.' : ''}</p>
              <div className="dc-botones">
                {!aprobado && <button type="button" className="btn-base btn-primary" disabled={ocupado || !listo || faltaMeta || dePrueba} title={faltaMeta ? 'Falta la tendencia o el valor de la meta' : ''} onClick={() => guardar({ estatus_aprobado: true }, 'Indicador aprobado. Ya se mide y se muestra.')}><BadgeCheck size={15} aria-hidden="true" /> Aprobar indicador</button>}
                {aprobado && <button type="button" className="btn-base btn-tertiary dc-devolver" disabled={ocupado} onClick={() => guardar({ estatus_aprobado: false }, 'Aprobación retirada: el indicador volvió a «sin aprobar».')}><CornerUpLeft size={15} aria-hidden="true" /> Retirar aprobación</button>}
                {!dePrueba && <button type="button" className="btn-base btn-tertiary dc-devolver" disabled={ocupado} onClick={() => guardar({ activo: false }, 'Indicador dado de baja.')}><Trash2 size={15} aria-hidden="true" /> Dar de baja</button>}
                {dePrueba && <button type="button" className="btn-base btn-secondary" disabled={ocupado} onClick={() => guardar({ activo: true }, 'Indicador reactivado.')}><RotateCcw size={15} aria-hidden="true" /> Reactivar</button>}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

export default function PanelIndicadores({ titular = false, inicial, onCambio: avisar, onCerrar }) {
  const [filas, setFilas] = useState(null);
  const [cat, setCat] = useState({ ejes: [], sectores: [], fuentes: [] });
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(inicial);
  const cargar = useCallback(() => {
    backend.leer('indicador', { query: 'select=*&order=id' }).then((r) => { setFilas(r); setError(''); avisar?.(); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    cargar();
    tablas(['eje_tematico', 'sector', 'fuente_informacion']).then((t) => setCat({ ejes: t.eje_tematico, sectores: t.sector, fuentes: t.fuente_informacion })).catch(() => {});
  }, [cargar]);
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (filas ?? []).filter((i) => !t || `${i.id} ${i.nombre}`.toLowerCase().includes(t)).sort((a, b) => Number(!!a.estatus_aprobado) - Number(!!b.estatus_aprobado) || String(a.id).localeCompare(String(b.id), 'es', { numeric: true }));
  }, [filas, q]);

  return (
    <div className="cap-mesa">
      <p className="cap-ayuda">Catálogo de indicadores. {titular ? 'Tú los apruebas y das de baja; el Administrador los sube.' : 'Tú los subes; los aprueba el Administrador Titular.'}</p>
      <button type="button" className="cap-ver-todo" onClick={() => setAbierto(null)}><Plus size={14} aria-hidden="true" /> Nuevo indicador</button>
      <input type="search" className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar indicador…" aria-label="Buscar indicador" />
      {error && <p className="cap-vacio">No se pudo leer: {error}</p>}
      {!filas && !error && <p className="cap-vacio">Cargando…</p>}
      {lista.map((i) => (
        <Fila key={i.id} Icono={ChartColumn} tipo="Indicador" titulo={i.id} detalle={i.nombre} estado={i.activo === false ? 'De baja' : i.estatus_aprobado ? 'Aprobado' : 'Sin aprobar'} onClick={() => setAbierto(i)} />
      ))}
      {abierto !== undefined && <IndicadorModal key={abierto?.id ?? 'nuevo'} ind={abierto} cat={cat} titular={titular} onClose={() => { setAbierto(undefined); onCerrar?.(); }} onCambio={cargar} />}
    </div>
  );
}
