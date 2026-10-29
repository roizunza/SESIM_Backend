import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

/* Layout publico y sus vistas */
import Plataforma from './components/plataforma/Plataforma';
import Inicio from './pages/Inicio';
import MapViewer from './components/geovisor/MapViewer';
import MonitoreoIndicadores from './pages/MonitoreoIndicadores';
import Administracion from './pages/Administracion';

/* Layout administrativo y sus vistas */
import AdminLayout from './components/plataforma/AdminLayout';
import AdminMapViewer from './components/geovisor/AdminMapViewer';

/* Bitácora (tabla `bitacora`, visible según perfil) */
import BitacoraPagina from './pages/BitacoraPagina';

/* Canje de invitación (pública: la persona aún no tiene cuenta) */
import AceptarInvitacion from './pages/AceptarInvitacion';

function App() {
  return (
    <Routes>
      <Route path="/invitacion" element={<AceptarInvitacion />} />
      <Route path="/" element={<Plataforma />}>
        <Route index element={<Inicio />} />
        <Route path="geovisor" element={<MapViewer />} />
        <Route path="monitoreo" element={<MonitoreoIndicadores />} />
        <Route path="admin" element={<Administracion />} />
      </Route>

      <Route path="/admin-visor" element={<AdminLayout />}>
        <Route index element={<AdminMapViewer />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route path="/bitacora" element={<BitacoraPagina />} />
      </Route>

      {/* Rutas anteriores: se redirigen a las nuevas */}
      <Route path="/admin-control" element={<Navigate to="/admin-visor" replace />} />
      <Route path="/logs/*" element={<Navigate to="/bitacora" replace />} />
    </Routes>
  );
}

export default App;
