import React, { useEffect, useMemo, useState } from 'react';
import { Send, Pencil, Trash2 } from 'lucide-react';
import CapturistaSidebar from './CapturistaSidebar';
import MedicionModal from './MedicionModal';
import MapaPerfil from '../comun/MapaPerfil';
import DetalleMedicion from '../comun/DetalleMedicion';
import { useCatalogoOperativo } from '../comun/useCatalogoOperativo';
import RechazosPanel from '../comun/RechazosPanel';
import { pendientesRechazo } from '../../../lib/sesim/catalogoApi';
import PanelFab from '../comun/PanelFab';
import { usePanelLateral } from '../../../lib/sesim/usePanelLateral';
import { useSesion } from '../../../lib/sesim/sesion';
import { useOperacion, medicionesVisibles, fnTransicionEstado, eliminarBorrador } from '../../../lib/sesim/operacion';
import '../comun/Comun.css';

/**
 * Perfil CAPTURISTA (Tabla 3): escribe solo en medicion_indicador (borrador)
 * y evidencia_medicion; lee catálogos y SUS mediciones.
 *
 * Flujo (sección 1.5, pasos 2–4): captura → evidencia → envío a revisión.
 * Si el administrador rechaza, la medición vuelve con comentario y el
 * capturista la corrige y reenvía.
 *
 * La carga de cartografía y de instrumentos ya NO está aquí: escribir en
 * `capa` es atribución del Administrador.
 */
const CapturistaLayout = () => {
  const sesion = useSesion();
  const op = useOperacion();
  const { catalogo, error } = useCatalogoOperativo();
  const [isSidebarOpen, setIsSidebarOpen, esMovil] = usePanelLateral();
  const [modal, setModal] = useState({ abierto: false, id: null });
  const [seleccion, setSeleccion] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [rechazos, setRechazos] = useState(false);
  const [nRechazos, setNRechazos] = useState(0);

  useEffect(() => {
    let vivo = true;
    pendientesRechazo().then((r) => { if (vivo && Array.isArray(r)) setNRechazos(r.length); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const mias = useMemo(() => medicionesVisibles(sesion, op), [sesion, op]);
  const periodosPorId = useMemo(() => new Map(op.periodo.map((p) => [p.id, p])), [op.periodo]);
  const seleccionada = mias.find((m) => m.id === seleccion);

  const abrir = (id) => {
    setErrorAccion('');
    const m = mias.find((x) => x.id === id);
    if (m && ['borrador', 'rechazado'].includes(m.estado)) setModal({ abierto: true, id });
    setSeleccion(id);
    if (esMovil) setIsSidebarOpen(false);
  };

  const enviar = (id) => {
    setErrorAccion('');
    try {
      fnTransicionEstado(sesion, id, 'revision');
    } catch (err) {
      setErrorAccion(err.message);
    }
  };

  return (
    <div className="dashboard-fullscreen-container">
      <MapaPerfil resaltarUnidad={seleccionada?.id_unidad} />

      <PanelFab abierto={isSidebarOpen} esMovil={esMovil} onAbrir={() => setIsSidebarOpen(true)} onCerrar={() => setIsSidebarOpen(false)} etiqueta="Mis mediciones" />

      <div className="floating-sidebar-wrapper">
        <CapturistaSidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          sesion={sesion}
          catalogo={catalogo}
          mediciones={mias}
          periodosPorId={periodosPorId}
          seleccion={seleccion}
          onNueva={() => { setModal({ abierto: true, id: null }); if (esMovil) setIsSidebarOpen(false); }}
          onSeleccionar={abrir}
          onRechazos={() => { setRechazos(true); if (esMovil) setIsSidebarOpen(false); }}
          nRechazos={nRechazos}
        />
      </div>

      {rechazos && <RechazosPanel sesion={sesion} onClose={() => setRechazos(false)} onCambio={setNRechazos} />}

      {error && <div className="aviso aviso-error" style={{ position: 'absolute', top: 24, right: 24, zIndex: 1200 }}>No se pudo cargar el catálogo: {error}</div>}

      {catalogo && seleccionada && !modal.abierto && (
        <DetalleMedicion
          idMedicion={seleccionada.id}
          catalogo={catalogo}
          onClose={() => setSeleccion(null)}
          pie={
            ['borrador', 'rechazado'].includes(seleccionada.estado) ? (
              <>
                {errorAccion && <div className="aviso aviso-error">{errorAccion}</div>}
                <div className="fila-botones">
                  <button className="btn-base btn-secondary" onClick={() => setModal({ abierto: true, id: seleccionada.id })}><Pencil size={14} /> Editar</button>
                  {seleccionada.estado === 'borrador' && (
                    <button className="btn-base btn-tertiary" onClick={() => { eliminarBorrador(sesion, seleccionada.id); setSeleccion(null); }}><Trash2 size={14} /> Eliminar</button>
                  )}
                  <button className="btn-base btn-primary" onClick={() => enviar(seleccionada.id)}><Send size={14} /> {seleccionada.estado === 'rechazado' ? 'Reenviar' : 'Enviar a revisión'}</button>
                </div>
              </>
            ) : null
          }
        />
      )}

      {catalogo && (
        <MedicionModal
          abierto={modal.abierto}
          idMedicion={modal.id}
          sesion={sesion}
          catalogo={catalogo}
          onClose={() => setModal({ abierto: false, id: null })}
          onGuardada={(id) => setSeleccion(id)}
        />
      )}
    </div>
  );
};

export default CapturistaLayout;
