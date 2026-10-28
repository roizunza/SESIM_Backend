import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut, ChevronLeft, ChevronRight, Search, ClipboardList } from 'lucide-react';
import BandejaMediciones from '../comun/BandejaMediciones';
import { cerrarSesion } from '../../../lib/sesim/sesion';
import '../capturista/Capturista.css';
import '../comun/Comun.css';
import './Auditor.css';

/**
 * Barra lateral del Auditor (solo lectura): búsqueda y rango de fechas sobre
 * las mediciones que ya salieron del borrador, más acceso a la bitácora
 * completa y a sus hallazgos.
 */
const AuditorSidebar = ({ isSidebarOpen, setIsSidebarOpen, sesion, catalogo, mediciones, periodosPorId, seleccion, onSeleccionar, filtro, setFiltro, nHallazgos }) => {
  const navigate = useNavigate();
  const estiloFecha = { width: '100%', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 4, color: '#fff', padding: '6px 8px', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', colorScheme: 'dark' };

  return (
    <aside className={`admin-sidebar auditor-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`} style={{ backgroundColor: '#888B8D' }}>
      <button className="admin-sidebar-toggle" style={{ background: '#53565A' }} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      <div className="admin-profile-section">
        <Eye size={64} className="profile-icon" color="#D1D5DB" />
        <div className="profile-info">
          <span className="profile-greeting">Bienvenid@ Auditor@</span>
          <span className="user-email">{sesion?.correo}</span>
          <button onClick={() => navigate('/bitacora')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#BCA986', fontSize: 12, fontWeight: 'bold', fontStyle: 'italic', cursor: 'pointer', padding: 0, marginTop: 4 }}>
            <ClipboardList size={14} /> Bitácora completa · {nHallazgos} hallazgo(s)
          </button>
        </div>
      </div>

      <nav className="admin-nav">
        <div className="admin-nav-group">
          <div className="sidebar-search-container">
            <div className="search-input-wrapper">
              <Search size={16} color="rgba(255,255,255,0.6)" />
              <input type="text" placeholder="Buscar indicador, municipio o correo" value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
            </div>
          </div>

          <div className="admin-nav-header"><span className="nav-title">ACTIVIDAD</span></div>
          <div style={{ padding: '0 20px', marginBottom: 8, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block', textTransform: 'uppercase' }}>Desde</label>
              <input type="date" style={estiloFecha} value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block', textTransform: 'uppercase' }}>Hasta</label>
              <input type="date" style={estiloFecha} value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
            </div>
          </div>

          {catalogo && (
            <BandejaMediciones
              mediciones={mediciones}
              periodosPorId={periodosPorId}
              unidadesPorId={catalogo.unidades}
              seleccion={seleccion}
              onSeleccionar={onSeleccionar}
              estados={['revision', 'rechazado', 'vigente_admin', 'vigente_publico']}
            />
          )}
        </div>

        <div className="admin-nav-group" style={{ marginTop: 'auto', paddingTop: 20 }}>
          <button className="admin-nav-link text-logout" onClick={() => { cerrarSesion(); navigate('/'); }}>
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </nav>
    </aside>
  );
};

export default AuditorSidebar;
