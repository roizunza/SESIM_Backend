import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import CapturistaLayout from '../perfiles/capturista/CapturistaLayout';
import AdministradorLayout from '../perfiles/administradora/AdministradorLayout';
import AuditorLayout from '../perfiles/auditora/AuditorLayout';
import { useSesion } from '../../lib/sesim/sesion';
import { registrarAcceso } from '../../lib/sesim/operacion';

/**
 * Enruta al layout de cada perfil canónico (tabla `perfil`):
 *   capturista → CapturistaLayout (captura de mediciones)
 *   administrador / administrador_titular → AdministradorLayout
 *     (el Titular ve además invitaciones y bajas)
 *   auditor → AuditorLayout (solo lectura + hallazgos)
 * Sin sesión, regresa al inicio de sesión.
 */
const AdminMapViewer = () => {
  const sesion = useSesion();
  useEffect(() => {
    if (sesion) registrarAcceso(sesion);
  }, [sesion]);

  if (!sesion) return <Navigate to="/admin" replace />;

  switch (sesion.perfil) {
    case 'administrador':
    case 'administrador_titular':
      return <AdministradorLayout />;
    case 'auditor':
      return <AuditorLayout />;
    case 'capturista':
    default:
      return <CapturistaLayout />;
  }
};

export default AdminMapViewer;
