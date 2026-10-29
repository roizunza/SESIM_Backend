import React from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { LogOut, User, History, ShieldCheck, PencilLine, Eye } from 'lucide-react';

const ICONO_PERFIL = { capturista: PencilLine, administrador: ShieldCheck, administrador_titular: ShieldCheck, auditor: Eye };
import { useSesion, cerrarSesion, PERFILES } from '../../lib/sesim/sesion';

export default function Header() {
  const navigate = useNavigate();

  /* Sesión (perfil canónico de la tabla `perfil`) */
  const sesion = useSesion();
  const userRole = sesion?.perfil ?? null;

  const handleImgError = (e) => {
    e.currentTarget.style.display = 'none';
    const placeholder = e.currentTarget.nextElementSibling;
    if (placeholder) placeholder.style.display = 'flex';
  };

  /* Transicion de autenticacion */
  const handleUserAction = () => {
    if (userRole) {
      cerrarSesion();
      navigate('/');
    } else {
      navigate('/admin');
    }
  };

  /* Bitácora: todos los perfiles internos (el capturista ve solo la suya) */
  const handleAbrirBitacora = () => navigate('/bitacora');
  const hasLogAccess = !!userRole;

  return (
    <header className="header" role="banner">
      <div className="header__inner">
        <Link to="/" className="header__logos" aria-label="Ir al inicio">
          <div className="header__logo-box">
            <img src="/gobiernoparatodos.png" alt="Escudo del Estado de Campeche" className="header__logo-img header__logo-img--campeche" onError={handleImgError} />
          </div>
          <div className="header__logo-divider" aria-hidden="true" />
          <div className="header__logo-box">
            <img src="/logocampeche.png" alt="Gobierno para Todos" className="header__logo-img header__logo-img--gobierno" onError={handleImgError} />
          </div>
        </Link>

        {/* Controles de usuario */}
        <div className="hd-user">
          {/* La bitácora se expone solo a perfiles con sesión (el capturista ve la suya) */}
          {hasLogAccess && (
            <>
              <div className="hd-chip" title={sesion?.correo}>
                <span className="hd-chip__ico" aria-hidden="true">{React.createElement(ICONO_PERFIL[userRole] ?? ShieldCheck, { size: 15 })}</span>
                <span className="hd-chip__txt">
                  <span className="hd-chip__rol">{PERFILES[userRole]?.nombre}</span>
                  <span className="hd-chip__mail">{sesion?.correo}</span>
                </span>
              </div>
              <button className="hd-btn" onClick={handleAbrirBitacora} title="Ver historial de actividad" aria-label="Ver historial de actividad">
                <History size={18} />
              </button>
            </>
          )}

          <button
            className={`hd-btn${userRole ? ' hd-btn--salir' : ''}`}
            aria-label={userRole ? 'Cerrar sesión' : 'Iniciar sesión'}
            onClick={handleUserAction}
            title={userRole ? 'Cerrar sesión' : 'Iniciar sesión'}
          >
            {userRole ? <LogOut size={18} /> : <User size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
