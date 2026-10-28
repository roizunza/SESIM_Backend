import React, { useState } from 'react';
import { CheckCircle, XCircle, Globe } from 'lucide-react';
import { fnTransicionEstado, operacionActual } from '../../../lib/sesim/operacion';
import '../comun/Comun.css';

/**
 * Acciones de dictamen del Administrador / Administrador Titular sobre una
 * medición (paso 4 y 5 del flujo, sección 1.5), vía F10:
 *   revision      → Validar (vigente_admin)   requiere ≥ 1 evidencia
 *                 → Rechazar (rechazado)      requiere comentario
 *   vigente_admin → Publicar (vigente_publico)
 *                 → Rechazar
 * Se monta como pie de <DetalleMedicion>.
 */
const PanelDictamen = ({ medicion, sesion }) => {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');

  if (!medicion || !['revision', 'vigente_admin'].includes(medicion.estado)) {
    return medicion?.estado === 'vigente_publico'
      ? <div className="aviso aviso-ok">Publicada: ya la leen el tablero público, el geovisor, los cubos OLAP y el acceso MCP.</div>
      : null;
  }

  const n = operacionActual().evidencia_medicion.filter((e) => e.id_medicion === medicion.id).length;

  const ejecutar = (estado) => {
    setError('');
    try {
      fnTransicionEstado(sesion, medicion.id, estado, comentario);
      setComentario('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <textarea className="textarea-sesim" placeholder="Comentario (obligatorio para rechazar)…" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      {error && <div className="aviso aviso-error">{error}</div>}
      <div className="fila-botones">
        <button className="btn-base btn-peligro" onClick={() => ejecutar('rechazado')}><XCircle size={15} /> Rechazar</button>
        {medicion.estado === 'revision' ? (
          <button className="btn-base btn-exito" disabled={n === 0} title={n === 0 ? 'Sin evidencia no se puede validar' : ''} onClick={() => ejecutar('vigente_admin')}>
            <CheckCircle size={15} /> Validar
          </button>
        ) : (
          <button className="btn-base btn-azul" onClick={() => ejecutar('vigente_publico')}><Globe size={15} /> Publicar</button>
        )}
      </div>
    </>
  );
};

export default PanelDictamen;
