import React, { useCallback, useEffect, useState } from 'react';
import { X, KeyRound, UserX, UserCheck, Copy } from 'lucide-react';
import { PERFILES } from '../../../lib/sesim/sesion';
import {
  listarUsuarios, listarInvitaciones, emitirInvitacion, revocarInvitacion, darDeBajaUsuario, reactivarUsuario, enlaceInvitacion,
} from '../../../lib/sesim/catalogoApi';
import { fechaCorta } from '../comun/formato';
import '../comun/Comun.css';

/**
 * Exclusivo del ADMINISTRADOR TITULAR (Tabla 3 y F16). Opera contra el servidor (Ciclo 4):
 *  · emitir invitaciones (api.fn_emitir_invitacion): el token se muestra UNA vez; la base solo guarda su SHA-256,
 *  · revocarlas antes de usarse,
 *  · dar de baja y reactivar cuentas (baja lógica: bloquea el acceso y queda en la bitácora de cuentas).
 * La persona invitada abre el enlace (/invitacion), elige su contraseña y su cuenta nace con el rol de la invitación.
 */
export default function InvitacionesPanel({ sesion, onClose }) {
  const [correo, setCorreo] = useState('');
  const [rol, setRol] = useState('capturista');
  const [emitida, setEmitida] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [invitaciones, setInvitaciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const nombreRol = (r) => PERFILES[r]?.nombre ?? r;

  const cargar = useCallback(async () => {
    try {
      const [inv, usr] = await Promise.all([listarInvitaciones(), listarUsuarios()]);
      setInvitaciones(Array.isArray(inv) ? inv : []);
      setUsuarios(Array.isArray(usr) ? usr : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const ejecutar = async (fn) => {
    setError('');
    setOcupado(true);
    try {
      await fn();
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const emitir = () => ejecutar(async () => {
    setEmitida(null);
    setCopiado(false);
    const r = await emitirInvitacion(correo, rol);
    setEmitida(r);
    setCorreo('');
  });

  const enlace = emitida ? enlaceInvitacion(emitida.token) : '';
  const copiar = async () => {
    try { await navigator.clipboard?.writeText(enlace); setCopiado(true); } catch { setCopiado(false); }
  };

  return (
    <div className="panel-completo">
      <div className="panel-completo-cab">
        <h3>Usuarios e invitaciones</h3>
        <button className="panel-detalle-cerrar" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
      </div>
      <div className="panel-completo-cuerpo">
        <section>
          <h4 style={{ marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}><KeyRound size={16} /> Emitir invitación (F16)</h4>
          <div className="filtros-fila">
            <label>Correo institucional<input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="persona@campeche.gob.mx" /></label>
            <label>Perfil
              <select value={rol} onChange={(e) => setRol(e.target.value)}>
                {Object.values(PERFILES).map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
              </select>
            </label>
            <button className="btn-base btn-primary" style={{ width: 'auto' }} disabled={ocupado || !correo} onClick={emitir}>Generar enlace</button>
          </div>
          {emitida && (
            <div className="aviso aviso-ok" style={{ marginTop: 10 }}>
              Envíe este enlace a <strong>{emitida.correo_destino}</strong>. Es de un solo uso, vence el {fechaCorta(emitida.expira_en)} y no se volverá a mostrar (el servidor solo guarda su huella):
              <div className="token-mostrado" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ wordBreak: 'break-all' }}>{enlace}</span>
                <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={copiar} title="Copiar"><Copy size={14} /></button>
              </div>
              {copiado && <small>Copiado.</small>}
            </div>
          )}
          {error && <div className="aviso aviso-error" style={{ marginTop: 10 }}>{error}</div>}
        </section>

        <section>
          <h4 style={{ marginBottom: 8 }}>Invitaciones emitidas</h4>
          <table className="tabla-sesim">
            <thead><tr><th>Correo</th><th>Perfil</th><th>Emitida</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {!cargando && invitaciones.length === 0 && <tr><td colSpan={6} className="text-muted">Sin invitaciones.</td></tr>}
              {cargando && <tr><td colSpan={6} className="text-muted">Cargando…</td></tr>}
              {invitaciones.map((i) => (
                <tr key={i.id}>
                  <td>{i.correo_destino}</td>
                  <td>{nombreRol(i.rol)}</td>
                  <td>{fechaCorta(i.created_at)}</td>
                  <td>{fechaCorta(i.expira_en)}</td>
                  <td>{i.estado}</td>
                  <td>{i.estado === 'vigente' && <button className="btn-base btn-tertiary" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => revocarInvitacion(i.id))}>Revocar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h4 style={{ marginBottom: 8 }}>Usuarios</h4>
          <table className="tabla-sesim">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id_usuario}>
                  <td>{u.nombre}</td>
                  <td>{u.correo ?? '—'}</td>
                  <td>{nombreRol(u.rol)}</td>
                  <td>{fechaCorta(u.ultimo_acceso)}</td>
                  <td>{u.activo ? 'Activo' : 'Baja'}</td>
                  <td>
                    {u.id_usuario !== sesion.id && (u.activo ? (
                      <button className="btn-base btn-peligro" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => darDeBajaUsuario(u.id_usuario))}><UserX size={13} /> Dar de baja</button>
                    ) : (
                      <button className="btn-base btn-tertiary" style={{ width: 'auto', height: 26 }} disabled={ocupado} onClick={() => ejecutar(() => reactivarUsuario(u.id_usuario))}><UserCheck size={13} /> Reactivar</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
