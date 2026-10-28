import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const navItems = [
    { label: 'Inicio', path: '/' },
    { label: 'Geovisualizador', path: '/geovisor' },
    { label: 'Monitoreo de Indicadores', path: '/monitoreo' }
  ];

  return (
    <nav className="navbar" role="navigation" aria-label="Menú principal">
      <div className="navbar__inner">
        <ul className="navbar__nav" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {navItems.map((item) => (
            <li key={item.path}>
              <button
                className={`navbar__link${isActive(item.path) ? ' navbar__link--active' : ''}`}
                onClick={() => navigate(item.path)}
                aria-current={isActive(item.path) ? 'page' : undefined}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}