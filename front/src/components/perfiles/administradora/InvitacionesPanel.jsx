import React, { useState } from 'react';
import { X, KeyRound, UserX, Copy } from 'lucide-react';
import { useOperacion, fnEmitirInvitacion, revocarInvitacion, estadoInvitacion, darDeBaja } from '../../../lib/sesim/operacion';
import { PERFILES } from '../../../lib/sesim/sesion';
import { fechaCorta } from '../comun/formato';
import '../comun/Comun.css';

/**
 * Exclusivo del ADMINISTRADOR TITULAR (Tabla 3 y F16):
 *  · emitir invitaciones (token de un solo uso; se guarda solo su SHA-256),
 *  · revocarlas antes de usarse,
 *  · dar de baja usuarios (usuario.fecha_baja / id_usuario_baja).
 */
export default function InvitacionesPanel({ sesion, onClose }) {
  const op = useOperacion();
  const [correo, setCorreo] = useState('');
  const [idPerfil, setIdPerfil] = useState(1);
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');

  const perfilPorId = new Map(Object.values(PERFILES).map((p) => [p.id_perfil, p]));
  const usuarios = new Map(op.usuario.map((u) => [u.id, u]));

  const emitir = async () => {
    setError('');
    setToken(null);
    try {
      const r = await fnEmitirInvitacion(sesion, { correo_destino: correo, id_perfil: idPerfil });
      setToken(r);
      setCorreo('');
    } catch (err) {
      setError(err.message);
    }
  };

  const ejecutar = (fn) => {
    setError('');
    try {
      fn();
    } catch (err) {
      setError(err.message);
    }
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
              <select value={idPerfil} onChange={(e) => setIdPerfil(Number(e.target.value))}>
                {Object.values(PERFILES).map((p) => <option key={p.id_perfil} value={p.id_perfil}>{p.nombre}</option>)}
              </select>
            </label>
            <button className="btn-base btn-primary" style={{ width: 'auto' }} onClick={emitir}>Generar token</button>
          </div>
          {token && (
            <div className="aviso aviso-ok" style={{ marginTop: 10 }}>
              Copie y envíe este token a <strong>{token.invitacion.correo_destino}</strong>. Es de un solo uso, vence el {fechaCorta(token.invitacion.expira_en)} y no se volverá a mostrar (solo se guarda su huella):
              <div className="token-mostrado" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{token.token}</span>
                <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => navigator.clipboard?.writeText(token.token)} title="Copiar"><Copy size={14} /></button>
              </div>
            </div>
          )}
          {error && <div className="aviso aviso-error" style={{ marginTop: 10 }}>{error}</div>}
        </section>

        <section>
          <h4 style={{ marginBottom: 8 }}>Invitaciones emitidas</h4>
          <table className="tabla-sesim">
            <thead><tr><th>Correo</th><th>Perfil</th><th>Emitida</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {op.invitacion.length === 0 && <tr><td colSpan={6} className="text-muted">Sin invitaciones.</td></tr>}
              {[...op.invitacion].reverse().map((i) => {
                const st = estadoInvitacion(i);
                return (
                  <tr key={i.id}>
                    <td>{i.correo_destino}</td>
                    <td>{perfilPorId.get(i.id_perfil)?.nombre}</td>
                    <td>{fechaCorta(i.created_at)}</td>
                    <td>{fechaCorta(i.expira_en)}</td>
                    <td>{st}{i.id_usuario_creado ? ` · ${usuarios.get(i.id_usuario_creado)?.correo ?? ''}` : ''}</td>
                    <td>{st === 'vigente' && <button className="btn-base btn-tertiary" style={{ width: 'auto', height: 26 }} onClick={() => ejecutar(() => revocarInvitacion(sesion, i.id))}>Revocar</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section>
          <h4 style={{ marginBottom: 8 }}>Usuarios</h4>
          <table className="tabla-sesim">
            <thead><tr><th>Correo</th><th>Perfil</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {op.usuario.map((u) => (
                <tr key={u.id}>
                  <td>{u.correo}</td>
                  <td>{perfilPorId.get(u.id_perfil)?.nombre}</td>
                  <td>{fechaCorta(u.ultimo_acceso)}</td>
                  <td>{u.activo === false ? `Baja · ${fechaCorta(u.fecha_baja)}` : 'Activo'}</td>
                  <td>
                    {u.activo !== false && u.id !== sesion.id && (
                      <button className="btn-base btn-peligro" style={{ width: 'auto', height: 26 }} onClick={() => ejecutar(() => darDeBaja(sesion, u.id))}><UserX size={13} /> Dar de baja</button>
                    )}
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
