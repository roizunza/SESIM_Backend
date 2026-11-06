import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { RUTAS } from '../../lib/rutas';

const ENTRADAS = [
  { etiqueta: 'Inicio', ruta: RUTAS.inicio, fin: true },
  { etiqueta: 'Tablero de seguimiento', corta: 'Tablero', ruta: RUTAS.tableroPublico },
  { etiqueta: 'Geovisor', ruta: RUTAS.geovisor },
  { etiqueta: 'Catálogo de instrumentos', corta: 'Catálogo', ruta: RUTAS.catalogo },
];

export default function Navbar() {
  const lista = useRef(null);
  const { pathname } = useLocation();

  // En pantallas angostas el menú se desplaza: la entrada activa siempre queda a la vista.
  useEffect(() => {
    lista.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    <nav className="navbar" aria-label="Menú principal">
      <div className="navbar__inner">
        <ul className="navbar__nav" ref={lista}>
          {ENTRADAS.map(({ etiqueta, corta, ruta, fin }) => (
            <li key={ruta}>
              <NavLink to={ruta} end={fin} className={({ isActive }) => `navbar__link${isActive ? ' navbar__link--active' : ''}`}>
                {corta ? (
                  <>
                    <span className="navbar__larga">{etiqueta}</span>
                    <span className="navbar__corta" aria-hidden="true">{corta}</span>
                  </>
                ) : etiqueta}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
