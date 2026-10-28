import React, { useEffect, useState } from 'react';
import { backend } from '../../../lib/sesim/supabase';
import { fechaCorta } from './formato';

const ETIQUETA = {
  alta: 'Alta de cuenta',
  cambio_rol: 'Cambio de rol',
  cambio_ambito: 'Cambio de ámbito',
  baja: 'Baja',
  reactivacion: 'Reactivación',
};

function detalle(b) {
  const d = b.detalle ?? {};
  if (b.accion === 'cambio_rol') return `${d.rol_anterior} → ${d.rol_nuevo}`;
  if (b.accion === 'alta') return `rol ${d.rol}${d.dependencia ? ` · ${d.dependencia}` : ''}`;
  if (b.accion === 'cambio_ambito') return `${d.ambito_anterior} → ${d.ambito_nuevo}`;
  return '';
}

/**
 * Bitácora de CUENTAS, leída del servidor (`api.bitacora`). Lo que se ve lo
 * decide la RLS según el rol: el capturista solo lo suyo, el administrador
 * las cuentas de capturistas, el auditor y el titular según sus políticas.
 */
export default function BitacoraCuentas() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    backend
      .rest('bitacora', { query: 'order=creado_en.desc&limit=200' })
      .then((d) => vivo && setFilas(d))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, []);

  if (error) return <p className="admin-login-error" role="alert">No se pudo leer la bitácora del servidor: {error}</p>;
  if (!filas) return <p className="text-muted">Cargando bitácora del servidor…</p>;

  return (
    <table className="tabla-sesim">
      <thead><tr><th>Fecha</th><th>Quién lo hizo</th><th>Cuenta afectada</th><th>Acción</th><th>Detalle</th></tr></thead>
      <tbody>
        {filas.length === 0 && <tr><td colSpan={5} className="text-muted">Sin eventos de cuentas.</td></tr>}
        {filas.map((b) => (
          <tr key={b.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(b.creado_en)}</td>
            <td>{b.actor_nombre ?? 'sistema'}{b.actor_rol ? <><br /><small>{b.actor_rol}</small></> : null}</td>
            <td>{b.objetivo_nombre ?? b.objetivo_id_usuario}<br /><small>{b.objetivo_rol}</small></td>
            <td>{ETIQUETA[b.accion] ?? b.accion}</td>
            <td>{detalle(b)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
