import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, LogOut, ChevronLeft, ChevronRight, Plus, History } from 'lucide-react';
import BandejaMediciones from '../comun/BandejaMediciones';
import { cerrarSesion } from '../../../lib/sesim/sesion';
import './Capturista.css';

/**
 * Barra lateral del Capturista: botón «Capturar medición» y bandeja de SUS
 * mediciones por estado (borrador, en revisión, rechazado, validado, publicado).
 */
const CapturistaSidebar = ({ isSidebarOpen, setIsSidebarOpen, sesion, catalogo, mediciones, periodosPorId, seleccion, onNueva, onSeleccionar }) => {
  const navigate = useNavigate();
  const ambito = sesion?.id_unidad && catalogo ? catalogo.unidades.get(sesion.id_unidad)?.nom_mun : null;

  return (
    <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
      <button className="admin-sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title={isSidebarOpen ? 'Ocultar panel' : 'Mostrar panel'}>
        {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      <div className="admin-profile-section">
        <UserCircle size={64} className="profile-icon" />
        <div className="profile-info">
          <span className="profile-greeting">Bienvenid@</span>
          <span className="profile-role">Capturista{ambito ? ` · ${ambito}` : ''}</span>
          <span className="user-email">{sesion?.correo}</span>
          <button
            onClick={() => navigate('/bitacora')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#BCA986', fontSize: 12, fontWeight: 'bold', fontStyle: 'italic', cursor: 'pointer', padding: 0, marginTop: 4 }}
          >
            <History size={14} /> Mi bitácora
          </button>
        </div>
      </div>

      <nav className="admin-nav">
        <div className="admin-nav-group">
          <div className="admin-nav-header" style={{ marginBottom: 8 }}>
            <span className="nav-title">CAPTURA</span>
          </div>
          <div style={{ padding: '0 20px', marginBottom: 16 }}>
            <button className="btn-base btn-white" onClick={onNueva} disabled={!catalogo} style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', color: '#9F2241', padding: '10px 16px' }}>
              <Plus size={18} /> Capturar medición
            </button>
          </div>

          <div className="admin-nav-header" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
            <span className="nav-title">MIS MEDICIONES</span>
          </div>
          {catalogo && (
            <BandejaMediciones
              mediciones={mediciones}
              periodosPorId={periodosPorId}
              unidadesPorId={catalogo.unidades}
              seleccion={seleccion}
              onSeleccionar={onSeleccionar}
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

export default CapturistaSidebar;
