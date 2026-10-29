import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { useSesion, PERFILES } from '../lib/sesim/sesion';
import { useOperacion, bitacoraVisible, ETIQUETA_ESTADO } from '../lib/sesim/operacion';
import { fechaCorta, ACCION_LEGIBLE } from '../components/perfiles/comun/formato';
import BitacoraCuentas from '../components/perfiles/comun/BitacoraCuentas';
import BitacoraLogs from '../components/bitacora/BitacoraLogs';
import '../components/perfiles/comun/Comun.css';

/**
 * Bitácora (TRANSVERSAL · tabla `bitacora`, solo inserciones).
 * Visibilidad: el capturista ve sus propios eventos; administradores y
 * auditor, la bitácora completa (Tabla 3). El auditor ve también los
 * hallazgos registrados.
 *
 * Pestaña «Cambios»: trazabilidad de capas e instrumentos leída de `api.bitacora_operativa` (Ciclo 5, migración 218).
 * Con backend será `GET /api/bitacora` filtrada por RLS; las columnas son
 * las del diccionario (tabla_afectada, id_registro, accion, datos_previos,
 * datos_nuevos, ip_origen, fecha).
 */
export default function BitacoraPagina() {
  const sesion = useSesion();
  const op = useOperacion();
  const navigate = useNavigate();
  const [f, setF] = useState({ tabla: '', accion: '', texto: '', desde: '', hasta: '' });
  const [vista, setVista] = useState('cambios');

  const usuarios = useMemo(() => new Map(op.usuario.map((u) => [u.id, u])), [op.usuario]);
  const filas = useMemo(() => {
    if (!sesion) return [];
    const q = f.texto.trim().toLowerCase();
    return bitacoraVisible(sesion, op)
      .filter((b) => (!f.tabla || b.tabla_afectada === f.tabla) && (!f.accion || b.accion === f.accion))
      .filter((b) => (!f.desde || b.fecha.slice(0, 10) >= f.desde) && (!f.hasta || b.fecha.slice(0, 10) <= f.hasta))
      .filter((b) => !q || [b.id_registro, usuarios.get(b.id_usuario)?.correo, JSON.stringify(b.datos_nuevos)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [sesion, op, f, usuarios]);

  if (!sesion) return <Navigate to="/admin" replace />;
  const tablas = Array.from(new Set(op.bitacora.map((b) => b.tabla_afectada))).sort();
  const veHallazgos = sesion.perfil !== 'capturista';

  const describir = (b) => {
    if (b.accion === 'cambio de estado') return `${ETIQUETA_ESTADO[b.datos_previos?.estado]} → ${ETIQUETA_ESTADO[b.datos_nuevos?.estado]}${b.datos_nuevos?.comentario ? ` · «${b.datos_nuevos.comentario}»` : ''}`;
    if (b.tabla_afectada === 'evidencia_medicion') return (b.datos_nuevos ?? b.datos_previos)?.nombre_archivo ?? '';
    if (b.tabla_afectada === 'medicion_indicador') return `${(b.datos_nuevos ?? b.datos_previos)?.id_indicador ?? ''} · ${(b.datos_nuevos ?? b.datos_previos)?.id_unidad ?? ''}`;
    if (b.tabla_afectada === 'indicador') return `línea base = ${b.datos_nuevos?.linea_base}`;
    if (b.tabla_afectada === 'usuario') return b.datos_nuevos?.correo ?? '';
    if (b.tabla_afectada === 'invitacion') return b.datos_nuevos?.correo_destino ?? (b.datos_nuevos?.usada_en ? 'Invitación canjeada (cuenta creada)' : b.datos_nuevos?.revocada ? 'Invitación revocada' : '');
    if (b.tabla_afectada === 'hallazgo') return b.datos_nuevos?.descripcion ?? '';
    if (b.tabla_afectada === 'periodo') return b.datos_nuevos?.etiqueta ?? '';
    return '';
  };

  const exportar = () => {
    const blob = new Blob([JSON.stringify(filas, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sesim_bitacora_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="panel-completo sin-sidebar" style={{ position: 'relative', inset: 'auto', margin: 24, flex: 1 }}>
      <div className="panel-completo-cab">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-base btn-tertiary" style={{ width: 'auto' }} onClick={() => navigate('/admin-visor')}><ArrowLeft size={15} /> Regresar</button>
          <h3>{sesion.perfil === 'capturista' ? 'Mi bitácora' : 'Bitácora completa'} · {PERFILES[sesion.perfil].nombre}</h3>
        </div>
        <div className="fila-botones" style={{ flex: 'none' }}>
          <button className={`btn-base ${vista === 'cambios' ? 'btn-primary' : 'btn-tertiary'}`} style={{ width: 'auto' }} onClick={() => setVista('cambios')}>Cambios (servidor)</button>
          <button className={`btn-base ${vista === 'cuentas' ? 'btn-primary' : 'btn-tertiary'}`} style={{ width: 'auto' }} onClick={() => setVista('cuentas')}>Cuentas (servidor)</button>
          <button className={`btn-base ${vista === 'bitacora' ? 'btn-primary' : 'btn-tertiary'}`} style={{ width: 'auto' }} onClick={() => setVista('bitacora')}>Operación · local ({filas.length})</button>
          {veHallazgos && (
            <button className={`btn-base ${vista === 'hallazgos' ? 'btn-primary' : 'btn-tertiary'}`} style={{ width: 'auto' }} onClick={() => setVista('hallazgos')}>Hallazgos · local ({op.hallazgo.length})</button>
          )}
          {vista !== 'cuentas' && vista !== 'cambios' && <button className="btn-base btn-secondary" style={{ width: 'auto' }} onClick={exportar}><Download size={15} /> Exportar</button>}
        </div>
      </div>
      <div className="panel-completo-cuerpo">
        {vista === 'cambios' && <BitacoraLogs embebido />}
        {vista === 'cuentas' && <BitacoraCuentas />}
        {vista === 'bitacora' && (
          <>
            <div className="filtros-fila">
              <label>Tabla
                <select value={f.tabla} onChange={(e) => setF({ ...f, tabla: e.target.value })}>
                  <option value="">Todas</option>
                  {tablas.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label>Acción
                <select value={f.accion} onChange={(e) => setF({ ...f, accion: e.target.value })}>
                  <option value="">Todas</option>
                  {Object.keys(ACCION_LEGIBLE).map((a) => <option key={a} value={a}>{ACCION_LEGIBLE[a]}</option>)}
                </select>
              </label>
              <label>Desde<input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
              <label>Hasta<input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
              <label>Buscar<input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="ID, correo, contenido" /></label>
            </div>
            <table className="tabla-sesim">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Tabla</th><th>Acción</th><th>Registro</th><th>Detalle</th></tr></thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={6} className="text-muted">Sin eventos registrados.</td></tr>}
                {filas.map((b) => (
                  <tr key={b.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(b.fecha)}</td>
                    <td>{usuarios.get(b.id_usuario)?.correo ?? 'sistema'}{b.perfil ? <><br /><small>{b.perfil}</small></> : null}</td>
                    <td><code>{b.tabla_afectada}</code></td>
                    <td>{ACCION_LEGIBLE[b.accion] ?? b.accion}</td>
                    <td className="dato-mono" style={{ maxWidth: 160 }}>{b.id_registro}</td>
                    <td>{describir(b)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {vista === 'hallazgos' && (
          <table className="tabla-sesim">
            <thead><tr><th>Fecha</th><th>Auditor</th><th>Severidad</th><th>Registro</th><th>Descripción</th></tr></thead>
            <tbody>
              {op.hallazgo.length === 0 && <tr><td colSpan={5} className="text-muted">Sin hallazgos.</td></tr>}
              {[...op.hallazgo].reverse().map((h) => (
                <tr key={h.id}>
                  <td>{fechaCorta(h.fecha)}</td>
                  <td>{usuarios.get(h.id_usuario)?.correo}</td>
                  <td>{h.severidad}</td>
                  <td className="dato-mono">{h.tabla_afectada} · {h.id_registro}</td>
                  <td>{h.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
