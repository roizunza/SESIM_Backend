import React, { useCallback, useEffect, useState } from 'react';
import { X, RotateCcw, Send, EyeOff, CalendarOff, Trash2 } from 'lucide-react';
import {
  pendientesRechazo, decidirRechazo, reabrirRechazo, enviarCapaARevision, enviarInstrumentoARevision,
  listarDiasInhabiles, guardarDiaInhabil, quitarDiaInhabil,
} from '../../../lib/sesim/catalogoApi';
import { fechaCorta, fechaDia } from './formato';
import './Comun.css';

/**
 * Rechazos con plazo (ER-4). Cuando la administración rechaza una capa o un instrumento, a quien lo envió le queda
 * aquí un pendiente con 10 días hábiles (lunes a viernes, sin los días inhábiles del calendario) para decidir:
 *  · Retomar: se compromete a corregirlo (sigue en su lista) y puede reenviarlo a revisión.
 *  · Quitar de mi lista: lo descarta (no se borra nada; queda en el historial y un Administrador puede reabrirlo).
 * Pasado el plazo sale solo de su lista (vencida). Administrador y Titular reabren vencidos/descartados;
 * el Auditor solo mira. El Titular además mantiene el calendario de días inhábiles.
 */
const ETIQUETA = { pendiente: 'Pendiente', retomada: 'Retomada', atendida: 'Reenviada', descartada: 'Quitada de la lista', vencida: 'Vencida' };

export default function RechazosPanel({ sesion, onClose, onCambio }) {
  const rol = sesion?.perfil;
  const puedeDecidir = rol === 'capturista' || rol === 'administrador' || rol === 'administrador_titular';
  const puedeReabrir = rol === 'administrador' || rol === 'administrador_titular';
  const [verCerrados, setVerCerrados] = useState(false);
  const [filas, setFilas] = useState([]);
  const [dias, setDias] = useState([]);
  const [fecha, setFecha] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([pendientesRechazo(verCerrados), listarDiasInhabiles()]);
      setFilas(Array.isArray(r) ? r : []);
      setDias(Array.isArray(d) ? d.filter((x) => x.fecha >= new Date().toISOString().slice(0, 10)) : []);
      setError('');
      onCambio?.(Array.isArray(r) ? r.filter((x) => ['pendiente', 'retomada'].includes(x.estado)).length : 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [verCerrados, onCambio]);

  useEffect(() => { cargar(); }, [cargar]);

  const ejecutar = async (fn) => {
    setError('');
    setOcupado(true);
    try { await fn(); await cargar(); } catch (err) { setError(err.message); } finally { setOcupado(false); }
  };

  const reenviar = (f) => ejecutar(() => (f.objeto_tipo === 'capa' ? enviarCapaARevision(f.objeto_id) : enviarInstrumentoARevision(f.objeto_id)));
  const abiertas = (f) => ['pendiente', 'retomada'].includes(f.estado);

  return (
    <div className="panel-completo">
      <div className="panel-completo-cab">
        <h3>{rol === 'capturista' ? 'Mis rechazos por atender' : 'Rechazos y plazos'}</h3>
        <button className="panel-detalle-cerrar" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
      </div>
      <div className="panel-completo-cuerpo">
        <section>
          <p className="text-muted" style={{ marginBottom: 8 }}>
            Cada rechazo da <strong>10 días hábiles</strong> (lunes a viernes, sin días inhábiles) para decidir: retomarlo y corregirlo, o quitarlo de la lista.
            Si el plazo se pasa, sale solo de la lista; nada se borra y un Administrador puede reabrirlo.
          </p>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} /> Ver también los cerrados (reenviados, quitados y vencidos)
          </label>
          {error && <div className="aviso aviso-error" style={{ marginTop: 10 }}>{error}</div>}
        </section>

        <section>
          <table className="tabla-sesim">
            <thead><tr><th>Qué</th><th>Motivo del rechazo</th><th>Rechazó</th><th>Plazo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {cargando && <tr><td colSpan={6} className="text-muted">Cargando…</td></tr>}
              {!cargando && filas.length === 0 && <tr><td colSpan={6} className="text-muted">No hay rechazos {verCerrados ? '' : 'por atender'}.</td></tr>}
              {filas.map((f) => {
                const suyo = f.id_destinatario === sesion?.id;
                return (
                  <tr key={f.id_dictamen}>
                    <td><strong>{f.objeto_id}</strong><br /><small>{f.objeto_tipo === 'capa' ? 'Capa' : 'Instrumento'} · {f.titulo}</small>{rol !== 'capturista' && <><br /><small>Enviado por {f.destinatario ?? '—'}</small></>}</td>
                    <td>{f.motivo}</td>
                    <td>{f.rechazado_por ?? '—'}<br /><small>{fechaCorta(f.rechazado_en)}</small></td>
                    <td>{abiertas(f) ? <>{f.dias_habiles_restantes} {f.dias_habiles_restantes === 1 ? 'día hábil' : 'días hábiles'}<br /><small>hasta {fechaDia(f.fecha_limite)}</small></> : <small>venció {fechaDia(f.fecha_limite)}</small>}</td>
                    <td>{ETIQUETA[f.estado] ?? f.estado}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {puedeDecidir && suyo && f.estado === 'pendiente' && (
                        <>
                          <button className="btn-base btn-primary" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => decidirRechazo(f.id_dictamen, 'retomar'))}><RotateCcw size={13} /> Retomar</button>{' '}
                          <button className="btn-base btn-tertiary" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => decidirRechazo(f.id_dictamen, 'descartar'))}><EyeOff size={13} /> Quitar de mi lista</button>
                        </>
                      )}
                      {puedeDecidir && suyo && f.estado === 'retomada' && (
                        <>
                          <button className="btn-base btn-primary" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => reenviar(f)}><Send size={13} /> Reenviar a revisión</button>{' '}
                          <button className="btn-base btn-tertiary" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => decidirRechazo(f.id_dictamen, 'descartar'))}><EyeOff size={13} /> Quitar</button>
                        </>
                      )}
                      {puedeReabrir && ['vencida', 'descartada'].includes(f.estado) && (
                        <button className="btn-base btn-tertiary" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => reabrirRechazo(f.id_dictamen))}><RotateCcw size={13} /> Reabrir</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {rol === 'administrador_titular' && (
          <section>
            <h4 style={{ marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}><CalendarOff size={16} /> Días inhábiles (además de sábado y domingo)</h4>
            <div className="filtros-fila">
              <label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
              <label>Motivo<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Día de la Revolución" /></label>
              <button className="btn-base btn-primary" style={{ width: 'auto' }} disabled={ocupado || !fecha || !desc.trim()}
                onClick={() => ejecutar(async () => { await guardarDiaInhabil(fecha, desc); setFecha(''); setDesc(''); })}>Agregar</button>
            </div>
            <table className="tabla-sesim" style={{ marginTop: 8 }}>
              <thead><tr><th>Fecha</th><th>Motivo</th><th></th></tr></thead>
              <tbody>
                {dias.length === 0 && <tr><td colSpan={3} className="text-muted">Sin días inhábiles próximos: solo cuentan como no laborables los sábados y domingos.</td></tr>}
                {dias.map((d) => (
                  <tr key={d.fecha}>
                    <td>{fechaDia(d.fecha)}</td><td>{d.descripcion}</td>
                    <td><button className="btn-base btn-peligro" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => quitarDiaInhabil(d.fecha))}><Trash2 size={13} /> Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
