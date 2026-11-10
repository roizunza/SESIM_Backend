import { useCallback, useEffect, useState } from 'react';
import { X, RotateCcw, Send, EyeOff, Clock3, CornerUpLeft, CheckCircle2, ArrowRight, Quote, RefreshCw } from 'lucide-react';
import { pendientesRechazo, decidirRechazo, enviarCapaARevision, enviarInstrumentoARevision } from '../../../lib/sesim/catalogoApi';
import { fechaCorta, fechaDia } from '../comun/formato';
import { CAPTURA_MEDICIONES } from './candados';
import './Rechazos.css';

/**
 * Pantalla «Mis devoluciones» del Capturista.
 * Cuando la administración rechaza algo que enviaste, aquí queda con su motivo y un plazo de 10 días hábiles
 * (lunes a viernes, sin días inhábiles) para decidir:
 *   · Retomar: te comprometes a corregirlo (sigue en tu lista) y puedes reenviarlo.
 *   · Quitar de mi lista: lo descartas (no se borra nada; un Administrador puede reabrirlo).
 * Pasado el plazo sale solo de tu lista. Las mediciones devueltas se corrigen desde su ficha.
 */
const PLAZO = 10;
const TIPO = { capa: 'Capa', instrumento: 'Instrumento', medicion: 'Medición' };
const ESTADO = { pendiente: 'Pendiente de decidir', retomada: 'Retomada · falta reenviar', atendida: 'Reenviada', descartada: 'Quitada de tu lista', vencida: 'Vencida' };

function Plazo({ f }) {
  const n = Math.max(0, Math.min(PLAZO, Number(f.dias_habiles_restantes ?? 0)));
  const pct = Math.round((n / PLAZO) * 100);
  const poco = n <= 3;
  return (
    <div className={`rc-plazo${poco ? ' rc-plazo--poco' : ''}`}>
      <div className="rc-plazo__txt"><Clock3 size={14} aria-hidden="true" /> <b>{n} {n === 1 ? 'día hábil' : 'días hábiles'}</b> <span>· vence el {fechaDia(f.fecha_limite)}</span></div>
      <div className="rc-plazo__barra" role="progressbar" aria-valuemin={0} aria-valuemax={PLAZO} aria-valuenow={n} aria-label="Días hábiles restantes"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function RechazosCaptura({ sesion, onClose, onCambio, medicionesDevueltas = [], onAbrirMedicion, capas = [], onProponer }) {
  const [verCerrados, setVerCerrados] = useState(false);
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await pendientesRechazo(verCerrados);
      setFilas(Array.isArray(r) ? r : []);
      setError('');
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [verCerrados, onCambio]);
  useEffect(() => { cargar(); }, [cargar]);

  const ejecutar = async (fn) => {
    setError(''); setOcupado(true);
    try { await fn(); await cargar(); } catch (err) { setError(err.message); } finally { setOcupado(false); }
  };
  const reenviar = (f) => ejecutar(() => (f.objeto_tipo === 'capa' ? enviarCapaARevision(f.objeto_id) : enviarInstrumentoARevision(f.objeto_id)));
  // Si lo devuelto es la actualización de una capa ya vigente (no un borrador), se corrige proponiendo de nuevo.
  const esActualizacion = (f) => f.objeto_tipo === 'capa' && ['vigente_admin', 'vigente_publico'].includes(capas.find((c) => c.id === f.objeto_id)?.estatus);
  const abierta = (f) => ['pendiente', 'retomada'].includes(f.estado);
  const suyas = filas.filter((f) => f.id_destinatario === sesion?.id || !f.id_destinatario);
  const nPend = suyas.filter((f) => f.estado === 'pendiente').length;
  const nRet = suyas.filter((f) => f.estado === 'retomada').length;

  return (
    <div className="panel-completo rc">
      <div className="rc-cab">
        <div>
          <h2><CornerUpLeft size={22} aria-hidden="true" /> Mis devoluciones</h2>
          <p>Lo que la administración te regresó para corregir. Cada devolución te da <b>{PLAZO} días hábiles</b> (lunes a viernes, sin días inhábiles) para decidir.</p>
        </div>
        <button type="button" className="rc-cerrar" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
      </div>

      <div className="rc-cuerpo">
        <dl className="rc-resumen" aria-label="Resumen">
          <div><dt>Por decidir</dt><dd>{nPend}</dd></div>
          <div><dt>Retomadas</dt><dd>{nRet}</dd></div>
          {CAPTURA_MEDICIONES && <div><dt>Mediciones devueltas</dt><dd>{medicionesDevueltas.length}</dd></div>}
        </dl>

        <ol className="rc-como" aria-label="Cómo funciona">
          <li><b>1 · Lee el motivo</b><span>Dice qué debes corregir.</span></li>
          <li><b>2 · Decide</b><span>Retomarla o quitarla de tu lista.</span></li>
          <li><b>3 · Reenvía</b><span>Corrige y manda de nuevo a revisión.</span></li>
        </ol>

        {error && <div className="aviso aviso-error" role="alert">{error}</div>}

        <h3 className="rc-sec">Capas</h3>
        {cargando && <p className="rc-vacio">Cargando…</p>}
        {!cargando && suyas.length === 0 && <p className="rc-vacio"><CheckCircle2 size={18} aria-hidden="true" /> No tienes capas ni instrumentos devueltos {verCerrados ? '' : 'por atender'}.</p>}
        {suyas.map((f) => (
          <article key={f.id_dictamen} className={`rc-card${abierta(f) ? '' : ' rc-card--cerrada'}`}>
            <header>
              <span className="rc-tipo">{TIPO[f.objeto_tipo] ?? f.objeto_tipo}</span>
              <code>{f.objeto_id}</code>
              <strong>{f.titulo}</strong>
              <span className="rc-estado">{f.estado === 'retomada' && esActualizacion(f) ? 'Retomada · falta proponer de nuevo' : (ESTADO[f.estado] ?? f.estado)}</span>
            </header>
            <blockquote><Quote size={14} aria-hidden="true" /> <p>{f.motivo}</p><footer>{f.rechazado_por ?? 'Administración'} · {fechaCorta(f.rechazado_en)}</footer></blockquote>
            {abierta(f) ? <Plazo f={f} /> : <p className="rc-cierre">Venció o se cerró el {fechaDia(f.fecha_limite)}.</p>}
            <div className="rc-acciones">
              {f.estado === 'pendiente' && (
                <>
                  <button type="button" className="btn-base btn-primary" disabled={ocupado} onClick={() => ejecutar(() => decidirRechazo(f.id_dictamen, 'retomar'))}><RotateCcw size={14} /> Retomar y corregir</button>
                  <button type="button" className="btn-base btn-tertiary" disabled={ocupado} onClick={() => ejecutar(() => decidirRechazo(f.id_dictamen, 'descartar'))}><EyeOff size={14} /> Quitar de mi lista</button>
                </>
              )}
              {f.estado === 'retomada' && (
                <>
                  {esActualizacion(f)
                    ? <button type="button" className="btn-base btn-primary" disabled={ocupado} onClick={() => onProponer?.(f.objeto_id)}><RefreshCw size={14} /> Proponer de nuevo</button>
                    : <button type="button" className="btn-base btn-primary" disabled={ocupado} onClick={() => reenviar(f)}><Send size={14} /> Reenviar a revisión</button>}
                  <button type="button" className="btn-base btn-tertiary" disabled={ocupado} onClick={() => ejecutar(() => decidirRechazo(f.id_dictamen, 'descartar'))}><EyeOff size={14} /> Quitar</button>
                </>
              )}
            </div>
          </article>
        ))}
        <label className="rc-cerrados"><input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} /> Ver también las cerradas (reenviadas, quitadas y vencidas)</label>

        {CAPTURA_MEDICIONES && (
          <>
        <h3 className="rc-sec">Mediciones devueltas</h3>
        {medicionesDevueltas.length === 0 && <p className="rc-vacio"><CheckCircle2 size={18} aria-hidden="true" /> No tienes mediciones devueltas.</p>}
        {medicionesDevueltas.map(({ id, titulo, detalle, motivo, quien, cuando }) => (
          <article key={id} className="rc-card">
            <header><span className="rc-tipo">Medición</span><code>{titulo}</code><strong>{detalle}</strong><span className="rc-estado">Devuelta · corregir</span></header>
            {motivo && <blockquote><Quote size={14} aria-hidden="true" /> <p>{motivo}</p><footer>{quien ?? 'Administración'}{cuando ? ` · ${fechaCorta(cuando)}` : ''}</footer></blockquote>}
            <div className="rc-acciones"><button type="button" className="btn-base btn-primary" onClick={() => onAbrirMedicion?.(id)}>Abrir y corregir <ArrowRight size={14} /></button></div>
          </article>
        ))}
          </>
        )}
      </div>
    </div>
  );
}
