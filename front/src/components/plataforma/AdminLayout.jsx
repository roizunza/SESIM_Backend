import React, { useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import RolBar from './RolBar';
import { useTablasApilables } from '../../lib/sesim/useTablasApilables';
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
  const raiz = useRef(null);
  useTablasApilables(raiz);
  if (verificando) return <p role="status" style={{ padding: 24 }}>Verificando sesión…</p>;
  if (!sesion) return <Navigate to="/admin" replace state={{ desde: location.pathname }} />;

  return (
    <div className="app-shell" ref={raiz} data-rol={sesion.perfil} style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <Header isAdmin={true} />
      <RolBar sesion={sesion} />
      {!OPERACION_CONECTADA && (
        <div role="status" className="modo-local">
          <span>Acceso real conectado al backend. Usuarios, invitaciones, catálogos, capas e instrumentos ya operan contra el servidor (Ciclo 4). Las mediciones y sus evidencias aún trabajan en modo local de este navegador (se conectan en los Ciclos 6 a 8): lo que capture aquí no se guarda en el servidor.</span>
        </div>
      )}
      <main style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
