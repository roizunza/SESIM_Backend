import React from 'react';

export default function Underfooter() {
  return (
    <div className="underfooter">
      <div className="underfooter__inner">
        <p className="underfooter__copy">
          © 2026 Gobierno del Estado de Campeche. Todos los derechos reservados.
        </p>
        <nav className="underfooter__social" aria-label="Redes sociales">
          <a href="#" className="underfooter__social-link" aria-label="Facebook del Gobierno de Campeche">
            Facebook
          </a>
          <span aria-hidden="true" style={{ color: 'rgba(255,255,255,0.25)' }}>|</span>
          <a href="#" className="underfooter__social-link" aria-label="X del Gobierno de Campeche">
            X
          </a>
          <span aria-hidden="true" style={{ color: 'rgba(255,255,255,0.25)' }}>|</span>
          <a href="#" className="underfooter__social-link" aria-label="YouTube del Gobierno de Campeche">
            YouTube
          </a>
        </nav>
      </div>
    </div>
  );
}
