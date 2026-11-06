import { Link } from 'react-router-dom';
import { useAccesoInstitucional } from '../../lib/sesim/sesion';
import { RUTAS } from '../../lib/rutas';

/**
 * Enlace a un módulo institucional. Con sesión activa es un enlace normal; sin ella:
 *  · sinAcceso="texto"  → el mismo contenido, sin enlace;
 *  · sinAcceso="acceso" → enlace al inicio de sesión, que regresa al destino al entrar;
 *  · sinAcceso="ocultar" → no se muestra.
 */
export default function EnlaceInstitucional({ to, sinAcceso = 'texto', className, children, ...resto }) {
  const acceso = useAccesoInstitucional();
  if (acceso) return <Link to={to} className={className} {...resto}>{children}</Link>;
  if (sinAcceso === 'ocultar') return null;
  if (sinAcceso === 'acceso') {
    return (
      <Link to={RUTAS.acceso} state={{ desde: to }} className={className} {...resto}>
        {children}
        <span className="sr-only"> (requiere acceso institucional)</span>
      </Link>
    );
  }
  return <span className={className ? `${className} enlace-sin-acceso` : undefined}>{children}</span>;
}
