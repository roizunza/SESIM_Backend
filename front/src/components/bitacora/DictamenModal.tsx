import { useState } from 'react';
import { X, CheckCircle, XCircle, Globe } from 'lucide-react';
import { dictaminarCapa, dictaminarInstrumento } from '../../lib/sesim/catalogoApi';

/**
 * Dictamen de una capa o de un instrumento desde la bitácora (Ciclo 4).
 *   revision      -> Validar (vigente_admin)  |  Rechazar (vuelve a borrador, con motivo)
 *   vigente_admin -> Publicar (vigente_publico) | Rechazar
 * El servidor decide: capas, Administrador y Titular; instrumentos, solo el Titular (D-16). Cuatro ojos: quien envió
 * a revisión no valida ni publica. El mensaje de error del servidor se muestra tal cual.
 */
export interface DictamenObjetivo {
  tipo: 'cartografia' | 'instrumento';
  recursoId: string;
  titulo: string;
  estatus: string;
}

export default function DictamenModal({
  objetivo, onClose, onHecho,
}: { objetivo: DictamenObjetivo; onClose: () => void; onHecho: () => void }) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const esInstrumento = objetivo.tipo === 'instrumento';

  const decidir = async (decision: 'validar' | 'publicar' | 'rechazar') => {
    setError('');
    if (decision === 'rechazar' && !comentario.trim()) {
      setError('Para rechazar escriba el motivo: lo verá quien envió el registro.');
      return;
    }
    setOcupado(true);
    try {
      const nota = comentario.trim() || null;
      if (esInstrumento) await dictaminarInstrumento(objetivo.recursoId, decision, nota);
      else await dictaminarCapa(objetivo.recursoId, decision, nota);
      onHecho();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="dictamen-overlay" role="dialog" aria-modal="true" aria-label="Determinar dictamen">
      <div className="dictamen-caja">
        <div className="dictamen-cab">
          <div>
            <h3>Determinar dictamen</h3>
            <small>{esInstrumento ? 'Instrumento' : 'Capa'} · {objetivo.recursoId} · {objetivo.titulo}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <p className="dictamen-estado">
          Estatus actual: <strong>{objetivo.estatus === 'revision' ? 'En revisión' : 'Validado por la administración'}</strong>
          {esInstrumento && <> · Solo el Administrador Titular dictamina instrumentos.</>}
        </p>
        <textarea
          placeholder="Comentario (obligatorio para rechazar)…"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={4}
        />
        {error && <div className="dictamen-error">{error}</div>}
        <div className="dictamen-botones">
          <button type="button" className="dictamen-rechazar" disabled={ocupado} onClick={() => decidir('rechazar')}>
            <XCircle size={15} /> Rechazar
          </button>
          {objetivo.estatus === 'revision' ? (
            <button type="button" className="dictamen-validar" disabled={ocupado} onClick={() => decidir('validar')}>
              <CheckCircle size={15} /> Validar
            </button>
          ) : (
            <button type="button" className="dictamen-publicar" disabled={ocupado} onClick={() => decidir('publicar')}>
              <Globe size={15} /> Publicar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
