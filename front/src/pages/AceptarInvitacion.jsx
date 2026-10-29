import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { invitacionVigente, canjearInvitacion } from '../lib/sesim/catalogoApi';
import { PERFILES } from '../lib/sesim/sesion';
import './AceptarInvitacion.css';

/**
 * Pantalla pública a la que llega la persona invitada (/invitacion?token=…).
 * Consulta al servicio de procesos si el enlace sigue vigente, pide nombre y contraseña, y crea la cuenta
 * con el perfil que el Administrador Titular eligió al invitarla. Nadie se auto-registra sin invitación.
 */
export default function AceptarInvitacion() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [estado, setEstado] = useState('verificando'); // verificando | valida | invalida | lista
  const [datos, setDatos] = useState(null);
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [repite, setRepite] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!token) { setEstado('invalida'); return undefined; }
    invitacionVigente(token)
      .then((d) => { if (vivo) { setDatos(d); setEstado('valida'); } })
      .catch(() => { if (vivo) setEstado('invalida'); });
    return () => { vivo = false; };
  }, [token]);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    if (password !== repite) return setError('Las contraseñas no coinciden.');
    setOcupado(true);
    try {
      await canjearInvitacion({ token, password, nombre: nombre.trim() });
      setEstado('lista');
    } catch (err) {
      setError(err.codigo === 'invitacion_no_valida_o_vencida' ? 'La invitación ya no es válida.' : err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="invitacion-pagina">
      <div className="invitacion-tarjeta">
        <h1>Invitación al SESIM</h1>
        {estado === 'verificando' && <p>Verificando el enlace…</p>}
        {estado === 'invalida' && (
          <>
            <p className="aviso aviso-error">Este enlace no es válido: ya se usó, fue revocado o venció. Solicite uno nuevo al Administrador Titular.</p>
            <Link to="/" className="invitacion-volver">Volver al inicio</Link>
          </>
        )}
        {estado === 'valida' && (
          <form onSubmit={enviar}>
            <p>Se creará la cuenta de <strong>{datos?.correo}</strong> con el perfil <strong>{PERFILES[datos?.rol]?.nombre ?? datos?.rol}</strong>.</p>
            <label>Nombre completo<input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="name" /></label>
            <label>Contraseña (mínimo 10 caracteres)<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" /></label>
            <label>Repita la contraseña<input type="password" value={repite} onChange={(e) => setRepite(e.target.value)} required autoComplete="new-password" /></label>
            {error && <div className="aviso aviso-error">{error}</div>}
            <button type="submit" className="btn-base btn-primary" disabled={ocupado || !nombre.trim()}>{ocupado ? 'Creando cuenta…' : 'Crear mi cuenta'}</button>
          </form>
        )}
        {estado === 'lista' && (
          <>
            <p className="aviso aviso-ok">Su cuenta quedó creada. Ya puede iniciar sesión con su correo y su contraseña.</p>
            <Link to="/" className="invitacion-volver">Ir al inicio</Link>
          </>
        )}
      </div>
    </div>
  );
}
