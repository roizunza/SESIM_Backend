import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import './EstadoCarga.css';

/**
 * Los tres estados límite de una vista: cargando, error y vacío.
 * `accion` = { etiqueta, onClick } para reintentar o limpiar filtros.
 */
export default function EstadoCarga({ estado, titulo, mensaje, accion, compacto = false }) {
  const Icono = estado === 'error' ? AlertTriangle : estado === 'vacio' ? Inbox : Loader2;
  const rol = estado === 'error' ? 'alert' : 'status';
  return (
    <div className={`estado-carga estado-carga--${estado}${compacto ? ' estado-carga--compacto' : ''}`} role={rol} aria-live="polite" aria-busy={estado === 'cargando'}>
      <Icono size={compacto ? 18 : 26} aria-hidden="true" className={estado === 'cargando' ? 'estado-carga__giro' : undefined} />
      <div>
        {titulo && <p className="estado-carga__titulo">{titulo}</p>}
        {mensaje && <p className="estado-carga__mensaje">{mensaje}</p>}
        {accion && (
          <button type="button" className="estado-carga__accion" onClick={accion.onClick}>
            {accion.etiqueta}
          </button>
        )}
      </div>
    </div>
  );
}

export function Esqueleto({ alto = 120, ancho = '100%', etiqueta = 'Cargando' }) {
  return <span className="esqueleto" style={{ height: alto, width: ancho }} aria-label={etiqueta} role="img" />;
}
