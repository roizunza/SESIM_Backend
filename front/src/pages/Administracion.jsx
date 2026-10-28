import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { autenticar, activarSesion, descartarCandidata, useSesion, useVerificandoSesion } from '../lib/sesim/sesion';
import { registrarAcceso } from '../lib/sesim/operacion';
import './Administracion.css';

/*
 * Inicio de sesión REAL: correo y contraseña se validan contra GoTrue
 * (Supabase Auth) y el rol sale de la base (`api.mi_perfil`), no de la
 * contraseña ni de lo que escriba el usuario. Las cuentas las da de alta el
 * Administrador Titular (alta directa); nadie se auto-registra.
 *
 * Orden: 1) se validan credenciales y perfil; 2) se muestran las políticas de
 * uso; 3) solo al ACEPTAR se activa la sesión. Cancelar revoca la sesión
 * recién creada.
 */
const Administracion = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [candidata, setCandidata] = useState(null);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const sesion = useSesion();
  const verificando = useVerificandoSesion();

  if (verificando) return <p role="status" style={{ padding: 24 }}>Verificando sesión…</p>;
  // Ya hay sesión válida: no se vuelve a mostrar el formulario.
  if (sesion && !candidata) return <Navigate to={location.state?.desde ?? '/admin-visor'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      setCandidata(await autenticar(email, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleAcceptPolicies = () => {
    const s = activarSesion(candidata);
    registrarAcceso(s);
    setCandidata(null);
    setPassword('');
    navigate(location.state?.desde ?? '/admin-visor', { replace: true });
  };

  const handleCancelPolicies = async () => {
    /* La sesión recién creada se revoca: el usuario permanece en el login */
    await descartarCandidata(candidata);
    setCandidata(null);
    setPassword('');
  };

  const showPoliciesModal = !!candidata;

  return (
    <div className="admin-container">
      <div className="admin-login-card">
        <h1 className="admin-login-title">Inicio de Sesión</h1>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              type="email"
              id="email"
              className="form-input"
              placeholder="ejemplo@gobcampeche.com.mx"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="form-input"
                placeholder="contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="admin-login-error" role="alert">{error}</p>}

          <button type="submit" className="admin-login-submit" disabled={enviando}>
            {enviando ? 'Verificando…' : 'Entrar'}
          </button>
          <p className="admin-login-ayuda">
            Las cuentas las da de alta el Administrador Titular. Si no tiene una, solicítela a la Secretaría.
          </p>
        </form>
      </div>

      {/* Renderizado condicional del modal de politicas */}
      {showPoliciesModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">SESIM - Sistema Estatal de Seguimiento a indicadores de Movilidad y Seguridad vial</h2>
            <h3 className="modal-subtitle">Políticas de uso del sitio</h3>
            
            <div className="modal-text">
              <p>
                La información geoespacial y estadística gestionada en este módulo de la plataforma del Gobierno del Estado de Campeche se encuentra en actualización continua por parte de las unidades administrativas competentes. Debido a la naturaleza dinámica del sistema, los datos pueden contener diferencias en relación al tema o característica que representa.
              </p>
              <p>
               Para fines de estandarización, todas las capas espaciales han sido reproyectadas al sistema EPSG 4326. Es responsabilidad estricta del usuario verificar la exactitud, integridad y vigencia de la información antes de realizar cualquier análisis o alteración en el sistema.
              </p>
              <p>
                Si selecciona la opción <strong>Aceptar</strong> ingresará al SESIM. Si selecciona <strong>Cancelar</strong> permanecerá en la página de inicio de sesión.
              </p>
            </div>

            <div className="modal-actions">
              <button className="modal-btn modal-btn-accept" onClick={handleAcceptPolicies}>
                Aceptar
              </button>
              <button className="modal-btn modal-btn-cancel" onClick={handleCancelPolicies}>
                Cancelar
              </button>
            
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Administracion;