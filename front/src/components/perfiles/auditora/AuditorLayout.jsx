import React, { useMemo, useState } from 'react';
import { ClipboardPlus } from 'lucide-react';
import AuditorSidebar from './AuditorSidebar';
import MapaPerfil from '../comun/MapaPerfil';
import DetalleMedicion from '../comun/DetalleMedicion';
import { useCatalogoOperativo } from '../comun/useCatalogoOperativo';
import PanelFab from '../comun/PanelFab';
import { usePanelLateral } from '../../../lib/sesim/usePanelLateral';
import { useSesion } from '../../../lib/sesim/sesion';
import { useOperacion, medicionesVisibles, registrarHallazgo } from '../../../lib/sesim/operacion';
import { nombreUnidad, fechaCorta } from '../comun/formato';
import '../capturista/Capturista.css';
import '../administradora/Admin.css';
import '../comun/Comun.css';
import './Auditor.css';

/**
 * Perfil AUDITOR (Tabla 3): observa sin modificar. Lee todo, incluida la
 * bitácora; su única escritura son los hallazgos de auditoría.
 *  · Historial de cada medición desde la bitácora (F12).
 *  · Verificación de integridad de la evidencia (F11, SHA-256).
 *  · Registro de hallazgos ligados a la medición.
 */
const AuditorLayout = () => {
  const sesion = useSesion();
  const op = useOperacion();
  const { catalogo } = useCatalogoOperativo();
  const [isSidebarOpen, setIsSidebarOpen, esMovil] = usePanelLateral();
  const [seleccion, setSeleccion] = useState(null);
  const [filtro, setFiltro] = useState({ texto: '', desde: '', hasta: '' });
  const [hallazgo, setHallazgo] = useState({ descripcion: '', severidad: 'media' });
  const [error, setError] = useState('');

  const periodosPorId = useMemo(() => new Map(op.periodo.map((p) => [p.id, p])), [op.periodo]);
  const usuarios = useMemo(() => new Map(op.usuario.map((u) => [u.id, u])), [op.usuario]);

  const visibles = useMemo(() => {
    const q = filtro.texto.trim().toLowerCase();
    return medicionesVisibles(sesion, op).filter((m) => {
      const fecha = (m.updated_at ?? m.fecha_captura ?? '').slice(0, 10);
      if (filtro.desde && fecha < filtro.desde) return false;
      if (filtro.hasta && fecha > filtro.hasta) return false;
      if (!q) return true;
      const ind = catalogo?.indicadores.get(m.id_indicador);
      const texto = [m.id_indicador, ind?.nombre, nombreUnidad(catalogo?.unidades, m.id_unidad), usuarios.get(m.usuario_captura)?.correo].join(' ').toLowerCase();
      return texto.includes(q);
    });
  }, [sesion, op, filtro, catalogo, usuarios]);

  const medicion = visibles.find((m) => m.id === seleccion);
  const hallazgosDe = medicion ? op.hallazgo.filter((h) => h.tabla_afectada === 'medicion_indicador' && h.id_registro === medicion.id) : [];

  const guardarHallazgo = () => {
    setError('');
    try {
      registrarHallazgo(sesion, { tabla_afectada: 'medicion_indicador', id_registro: medicion.id, ...hallazgo });
      setHallazgo({ descripcion: '', severidad: 'media' });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="dashboard-fullscreen-container">
      <MapaPerfil resaltarUnidad={medicion?.id_unidad} colorMedicion="#6B7280" />

      <PanelFab abierto={isSidebarOpen} esMovil={esMovil} onAbrir={() => setIsSidebarOpen(true)} onCerrar={() => setIsSidebarOpen(false)} etiqueta="Auditoría" />

      <div className="floating-sidebar-wrapper">
        <AuditorSidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          sesion={sesion}
          catalogo={catalogo}
          mediciones={visibles}
          periodosPorId={periodosPorId}
          seleccion={seleccion}
          onSeleccionar={(id) => { setSeleccion(id); if (esMovil) setIsSidebarOpen(false); }}
          filtro={filtro}
          setFiltro={setFiltro}
          nHallazgos={op.hallazgo.length}
        />
      </div>

      {catalogo && medicion && (
        <DetalleMedicion
          idMedicion={medicion.id}
          catalogo={catalogo}
          puedeVerificar
          onClose={() => setSeleccion(null)}
          pie={
            <>
              {hallazgosDe.map((h) => (
                <div key={h.id} className="aviso aviso-alerta"><strong>Hallazgo ({h.severidad}) · {fechaCorta(h.fecha)}:</strong> {h.descripcion}</div>
              ))}
              <textarea className="textarea-sesim" placeholder="Registrar hallazgo de auditoría…" value={hallazgo.descripcion} onChange={(e) => setHallazgo({ ...hallazgo, descripcion: e.target.value })} />
              <div className="fila-botones">
                <select className="form-input" style={{ maxWidth: 130 }} value={hallazgo.severidad} onChange={(e) => setHallazgo({ ...hallazgo, severidad: e.target.value })}>
                  <option value="baja">Severidad baja</option>
                  <option value="media">Severidad media</option>
                  <option value="alta">Severidad alta</option>
                </select>
                <button className="btn-base btn-primary" onClick={guardarHallazgo}><ClipboardPlus size={15} /> Registrar hallazgo</button>
              </div>
              {error && <div className="aviso aviso-error">{error}</div>}
            </>
          }
        />
      )}
    </div>
  );
};

export default AuditorLayout;
