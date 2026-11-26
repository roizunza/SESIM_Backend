import { useCallback, useEffect, useState } from 'react';
import { X, UserCheck, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import { capasReclamables, reclamarCapa } from '../../../lib/sesim/catalogoApi';
import '../comun/Comun.css';
import './CapaCaptura.css';

/**
 * Reclamar una capa sin dueño (Bloque A, F-01).
 *
 * Son borradores que se sembraron con la carga inicial y nadie dio de alta: no tienen Capturista. Cualquier Capturista puede
 * reclamar uno; el primero que lo pide se queda con él (si dos lo piden a la vez, el segundo recibe un aviso). Una capa que
 * ya tiene Capturista nunca aparece aquí ni se puede reclamar. La lista y el reclamo los decide la base de datos, no esta pantalla.
 */
export default function ReclamarCapaModal({ onClose, onReclamada }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(null);
  const [hecho, setHecho] = useState('');

  const cargar = useCallback(() => {
    setError('');
    capasReclamables().then((r) => setLista(Array.isArray(r) ? r : [])).catch((e) => { setLista([]); setError(e.message); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const reclamar = async (id) => {
    setError(''); setOcupado(id);
    try {
      await reclamarCapa(id);
      setHecho(`La capa ${id} ahora es tuya: la encuentras en «Mi mesa de trabajo → Sin enviar». Súbele su archivo y envíala a revisión.`);
      onReclamada?.(id);
    } catch (e) {
      setError(e.message);
      cargar();                 // si otra persona la reclamó antes, la lista se actualiza
    } finally { setOcupado(null); }
  };

  return (
    <>
      <div className="modal-drawer-overlay" onClick={onClose} />
      <div className="modal-drawer cc-drawer" role="dialog" aria-modal="true" aria-labelledby="rc-titulo">
        <div className="modal-drawer-header">
          <h3 id="rc-titulo" className="cc-titulo">Reclamar una capa sin dueño</h3>
          <button type="button" className="btn-close-drawer" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="modal-drawer-content cc-cuerpo">
          {hecho ? (
            <div className="cc-hecho">
              <CheckCircle2 size={40} aria-hidden="true" />
              <p>{hecho}</p>
              <button type="button" className="btn-base btn-primary" onClick={onClose}>Listo</button>
            </div>
          ) : (
            <>
              <div className="cc-aviso cc-aviso--info"><Info size={16} aria-hidden="true" /><span>Estas capas están en <b>borrador</b> y todavía no tienen Capturista. Al reclamar una te conviertes en su responsable: solo tú podrás editarla y enviarla a revisión. Si otra persona la reclama primero, se te avisa.</span></div>
              {lista === null && <p className="cc-veredicto" role="status"><Loader2 size={16} className="girando" aria-hidden="true" /> Buscando capas sin dueño…</p>}
              {lista && lista.length === 0 && !error && <p className="cc-intro">No hay capas sin dueño en este momento.</p>}
              {lista && lista.length > 0 && (
                <ul className="cc-reclamables">
                  {lista.map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong><code>{c.id}</code> · {c.titulo}</strong>
                        <small>{c.tipo_geometria ?? 'Sin tipo'} · {Number(c.n_geometrias ?? 0).toLocaleString('es-MX')} geometrías cargadas{c.responsable ? ` · custodio: ${c.responsable}` : ''}</small>
                      </div>
                      <button type="button" className="btn-base btn-primary" disabled={ocupado !== null} aria-busy={ocupado === c.id} onClick={() => reclamar(c.id)}>
                        {ocupado === c.id ? <Loader2 size={14} className="girando" aria-hidden="true" /> : <UserCheck size={14} aria-hidden="true" />} Reclamar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && <div className="cc-aviso cc-aviso--error" role="alert"><XCircle size={16} aria-hidden="true" /><span>{error}</span></div>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
