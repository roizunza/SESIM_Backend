import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, LogOut, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Settings, BarChart3, Layers, Upload, KeyRound } from 'lucide-react';
import BandejaMediciones from '../comun/BandejaMediciones';
import { cerrarSesion } from '../../../lib/sesim/sesion';
import '../capturista/Capturista.css';
import '../comun/Comun.css';

/**
 * Barra lateral del Administrador / Administrador Titular.
 *  · Control de solicitudes: mediciones en revisión, validadas y publicadas
 *    (el borrador no le llega: es del capturista).
 *  · Catálogo de capas: carga/actualización (antes era del capturista) y las
 *    capas en borrador del catálogo, para revisarlas en el mapa.
 *  · Solo Titular: usuarios e invitaciones.
 */
const AdministradorSidebar = ({
  isSidebarOpen, setIsSidebarOpen, sesion, catalogo, mediciones, periodosPorId, seleccion, onSeleccionar,
  capasBorrador, capaVista, onVerCapa, onCargarCapa, onInvitaciones,
}) => {
  const navigate = useNavigate();
  const [medOpen, setMedOpen] = useState(true);
  const [capasOpen, setCapasOpen] = useState(false);
  const titular = sesion?.perfil === 'administrador_titular';

  return (
    <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`} style={{ backgroundColor: '#183B33' }}>
      <button className="admin-sidebar-toggle" style={{ background: '#102A24' }} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      <div className="admin-profile-section" style={{ borderBottom: 'none', paddingBottom: 16 }}>
        <UserCircle size={64} className="profile-icon" color="#fff" />
        <div className="profile-info">
          <span className="profile-greeting" style={{ fontSize: 16 }}>Bienvenid@<br />{titular ? 'Administrador Titular' : 'Administrador'}</span>
          <span className="user-email">{sesion?.correo}</span>
          <button onClick={() => navigate('/bitacora')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#D97706', fontSize: 12, fontWeight: 'bold', fontStyle: 'italic', cursor: 'pointer', padding: 0, marginTop: 6 }}>
            <Settings size={14} /> Bitácora completa
          </button>
        </div>
      </div>

      <nav className="admin-nav">
        <div className="admin-nav-group">
          <div className="admin-nav-header" style={{ background: '#254E45', padding: '8px 20px', marginBottom: 8 }}>
            <span className="nav-title" style={{ color: '#A7F3D0', fontWeight: 'bold' }}>CONTROL DE SOLICITUDES</span>
          </div>

          <button className={`admin-nav-link ${medOpen ? 'active' : ''}`} onClick={() => setMedOpen(!medOpen)} style={{ background: 'transparent' }}>
            <BarChart3 size={18} />
            <span style={{ fontWeight: 600 }}>Mediciones</span>
            {medOpen ? <ChevronUp size={16} className="nav-chevron" /> : <ChevronDown size={16} className="nav-chevron" />}
          </button>
          {medOpen && catalogo && (
            <BandejaMediciones
              mediciones={mediciones}
              periodosPorId={periodosPorId}
              unidadesPorId={catalogo.unidades}
              seleccion={seleccion}
              onSeleccionar={onSeleccionar}
              estados={['revision', 'vigente_admin', 'vigente_publico', 'rechazado']}
            />
          )}

          <button className={`admin-nav-link ${capasOpen ? 'active' : ''}`} onClick={() => setCapasOpen(!capasOpen)} style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Layers size={18} />
            <span style={{ fontWeight: 600 }}>Catálogo de capas</span>
            {capasOpen ? <ChevronUp size={16} className="nav-chevron" /> : <ChevronDown size={16} className="nav-chevron" />}
          </button>
          {capasOpen && (
            <div className="bandeja-mediciones" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <button className="btn-base btn-white" onClick={onCargarCapa} style={{ width: '100%', justifyContent: 'flex-start', color: '#183B33', margin: '6px 0' }}>
                <Upload size={16} /> Cargar / actualizar capa
              </button>
              <div className="bandeja-grupo-titulo">En borrador <span className="n">{capasBorrador.length}</span></div>
              {capasBorrador.map((c) => (
                <button key={c.id} type="button" className={`bandeja-medicion ${capaVista === c.id ? 'activa' : ''}`} onClick={() => onVerCapa(c.id)} title={c.titulo}>
                  <span className="estado-punto" style={{ background: '#AB9470' }} />
                  <span className="bandeja-medicion-texto">
                    <strong>{c.id}</strong>
                    <span>{c.titulo}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {titular && (
            <button className="admin-nav-link" onClick={onInvitaciones} style={{ background: 'transparent' }}>
              <KeyRound size={18} />
              <span style={{ fontWeight: 600 }}>Usuarios e invitaciones</span>
            </button>
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

export default AdministradorSidebar;
