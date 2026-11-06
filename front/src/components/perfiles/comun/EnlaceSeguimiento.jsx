import { useNavigate } from 'react-router-dom';
import { ChartColumn } from 'lucide-react';
import { RUTAS } from '../../../lib/rutas';

/** Acceso de la barra lateral institucional al módulo de seguimiento de proyectos e indicadores. */
export default function EnlaceSeguimiento() {
  const navigate = useNavigate();
  return (
    <button type="button" className="admin-nav-link enlace-seguimiento" onClick={() => navigate(RUTAS.seguimiento)}>
      <ChartColumn size={18} aria-hidden="true" />
      <span>Seguimiento de proyectos e indicadores</span>
    </button>
  );
}
