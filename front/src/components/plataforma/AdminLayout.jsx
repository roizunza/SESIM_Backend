import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import { useSesion, useVerificandoSesion } from '../../lib/sesim/sesion';
import { OPERACION_CONECTADA } from '../../lib/sesim/operacion';

/**
 * Layout de las rutas internas. GUARDIA: sin sesión real (token vigente y
 * perfil activo) no se entra; se manda al inicio de sesión y, al entrar,
 * se regresa a la ruta pedida. El rol que decide la pantalla viene de la
 * sesión (api.mi_perfil), nunca de algo que el usuario pueda escribir.
 */
const AdminLayout = () => {
  const sesion = useSesion();
  const verificando = useVerificandoSesion();
  const location = useLocation();
  if (verificando) return <p role="status" style={{ padding: 24 }}>Verificando sesión…</p>;
  if (!sesion) return <Navigate to="/admin" replace state={{ desde: location.pathname }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header isAdmin={true} />
      {!OPERACION_CONECTADA && (
        <div role="status" style={{ background: '#FFF7E0', color: '#6B5200', borderBottom: '1px solid #E8D48A', fontSize: 12, padding: '4px 24px' }}>
          Acceso real conectado al backend. El módulo de mediciones, evidencias y dictámenes aún trabaja en modo local de este navegador (se conecta en los Ciclos 4 a 8): lo que capture aquí no se guarda en el servidor.
        </div>
      )}
      <main style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
