import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

/* Layout publico y sus vistas */
import Plataforma from './components/plataforma/Plataforma';
import Inicio from './pages/Inicio';
import MapViewer from './components/geovisor/MapViewer';
import MonitoreoIndicadores from './pages/MonitoreoIndicadores';
import Administracion from './pages/Administracion';
import EstadoCarga from './components/plataforma/EstadoCarga';
import Redirigir from './components/plataforma/Redirigir';
import RutaInstitucional from './components/plataforma/RutaInstitucional';
import { RUTAS, SECCIONES_INICIO } from './lib/rutas';

/* Módulos de consulta (se cargan bajo demanda); el seguimiento es solo para usuarios institucionales */
const Seguimiento = lazy(() => import('./pages/Seguimiento'));
const TableroSeguimiento = lazy(() => import('./pages/TableroSeguimiento'));
const CatalogoInstrumentos = lazy(() => import('./pages/CatalogoInstrumentos'));
const TableroIndicadores = lazy(() => import('./pages/TableroIndicadores'));
const SeguimientoProyectos = lazy(() => import('./pages/SeguimientoProyectos'));

const diferido = (Pagina) => (
  <Suspense fallback={<EstadoCarga estado="cargando" mensaje="Cargando módulo…" />}>
    <Pagina />
  </Suspense>
);

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
        <Route path="catalogo" element={diferido(CatalogoInstrumentos)} />
        <Route path="tablero-de-seguimiento" element={diferido(TableroSeguimiento)} />
        <Route path="seguimiento" element={<RutaInstitucional>{diferido(Seguimiento)}</RutaInstitucional>}>
          <Route index element={<Redirigir a={RUTAS.indicadores} />} />
          <Route path="indicadores" element={<MonitoreoIndicadores />} />
          <Route path="tablero" element={diferido(TableroIndicadores)} />
          <Route path="proyectos" element={diferido(SeguimientoProyectos)} />
        </Route>
        <Route path="admin" element={<Administracion />} />
      </Route>

      <Route path="/admin-visor" element={<AdminLayout />}>
        <Route index element={<AdminMapViewer />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route path="/bitacora" element={<BitacoraPagina />} />
      </Route>

      {/* Rutas anteriores: se redirigen a las nuevas conservando sus parámetros */}
      <Route path="/vision" element={<Redirigir a={RUTAS.inicio} ancla={SECCIONES_INICIO.vision} />} />
      <Route path="/marco-juridico" element={<Redirigir a={RUTAS.inicio} ancla={SECCIONES_INICIO.marco} />} />
      <Route path="/tablero" element={<Redirigir a={RUTAS.tablero} />} />
      <Route path="/monitoreo" element={<Redirigir a={RUTAS.indicadores} />} />
      <Route path="/proyectos" element={<Redirigir a={RUTAS.proyectos} />} />
      <Route path="/admin-control" element={<Navigate to="/admin-visor" replace />} />
      <Route path="/logs/*" element={<Navigate to="/bitacora" replace />} />
    </Routes>
  );
}

export default App;
