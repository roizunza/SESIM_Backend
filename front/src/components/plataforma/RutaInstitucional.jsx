import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSesion, useVerificandoSesion } from '../../lib/sesim/sesion';
import { RUTAS } from '../../lib/rutas';
import EstadoCarga from './EstadoCarga';

/**
 * Guardia de los módulos institucionales dentro del portal: sin sesión activa se envía al
 * inicio de sesión y, al entrar, se regresa a la ruta pedida (con sus parámetros).
 */
export default function RutaInstitucional({ children }) {
  const sesion = useSesion();
  const verificando = useVerificandoSesion();
  const { pathname, search } = useLocation();
  if (verificando) return <EstadoCarga estado="cargando" mensaje="Verificando sesión…" />;
  if (!sesion) return <Navigate to={RUTAS.acceso} replace state={{ desde: `${pathname}${search}` }} />;
  return children ?? <Outlet />;
}
