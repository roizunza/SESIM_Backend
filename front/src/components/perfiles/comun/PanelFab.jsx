import React from 'react';
import { PanelLeftOpen } from 'lucide-react';

/**
 * Solo móvil: botón flotante que abre el panel lateral y fondo que lo cierra.
 * En escritorio no pinta nada (el panel tiene su propia pestaña de colapso).
 */
const PanelFab = ({ abierto, esMovil, onAbrir, onCerrar, etiqueta = 'Panel' }) => {
  if (!esMovil) return null;
  return abierto ? (
    <div className="panel-backdrop" onClick={onCerrar} aria-hidden="true" />
  ) : (
    <button type="button" className="panel-fab" onClick={onAbrir} aria-label={`Abrir ${etiqueta.toLowerCase()}`}>
      <PanelLeftOpen size={18} /> {etiqueta}
    </button>
  );
};

export default PanelFab;
