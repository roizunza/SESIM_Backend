import React, { useEffect, useLayoutEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import Underfooter from './Underfooter';
import { RUTAS } from '../../lib/rutas';
import AvisoLegal from './AvisoLegal';
import FiltrosProvider from '../../lib/sesim/FiltrosProvider';
import { useAltoCabecera } from '../../lib/useAltoCabecera';
import './Plataforma.css';

/** Cada página nueva se abre desde arriba; los enlaces con ancla (#seccion) los resuelve su página. */
function useInicioDePagina() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
}

/** Tono oscuro (guinda profundo) del portal: Inicio, Tablero y Catálogo; el resto de las páginas se migra por etapas. */
const RUTAS_OSCURAS = new Set(['/', '/tablero-de-seguimiento']);
function useTonoOscuro() {
  const { pathname } = useLocation();
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.toggle('tema-oscuro', RUTAS_OSCURAS.has(pathname));
    return () => raiz.classList.remove('tema-oscuro');
  }, [pathname]);
}

const Plataforma = () => {
  // El menú principal vive dentro de la cabecera: la altura es solo la de la barra flotante.
  useAltoCabecera('.header', '.sin-menu-aparte');
  useInicioDePagina();
  useTonoOscuro();
  const { pathname } = useLocation();
  return (
    <div className="app-container">
      <Header />
      <main className="page-content" id="contenido">
        <FiltrosProvider>
          <Outlet />
        </FiltrosProvider>
      </main>
      {pathname !== '/' && pathname !== '/catalogo' && pathname !== '/tablero-de-seguimiento' && pathname !== RUTAS.acceso && (
        <div className="aviso-pie">
          <AvisoLegal tipo="general" discreto />
        </div>
      )}
      <Footer />
      <Underfooter />
    </div>
  );
};

export default Plataforma;
