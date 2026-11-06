import { Navigate, useLocation } from 'react-router-dom';

/** Redirección que conserva los parámetros de la dirección anterior (?indicador=, ?mun=…). */
export default function Redirigir({ a, ancla = '' }) {
  const { search } = useLocation();
  return <Navigate to={`${a}${search}${ancla ? `#${ancla}` : ''}`} replace />;
}
