import React from 'react';
import { X, Activity, MapPinned, Gauge } from 'lucide-react';
import { COLORES_SEMAFORO } from '../../../lib/sesim/semaforo';
import { ETIQUETA_ESTADO, COLOR_ESTADO, ESTADOS } from '../../../lib/sesim/operacion';
import '../comun/Comun.css';

/**
 * Tablero del administrador para un indicador y un periodo:
 *  · Mediciones por estado (flujo de aprobación).
 *  · F09 completitud de captura por municipio (lista de faltantes).
 *  · F04 / F05 semáforo por municipio (lo mismo que pinta la coropleta).
 * Todo sale de las mediciones reales; si no hay, lo dice.
 */
export default function DashboardKPIs({ resumen, onClose }) {
  if (!resumen) return null;
  const { indicador, periodo, porEstado, completitud, semaforos } = resumen;
  return (
    <div className="panel-detalle" style={{ width: 380 }}>
      <div className="panel-detalle-header">
        <div>
          <span className="panel-detalle-sup">Tablero · {indicador.id}{periodo ? ` · ${periodo.etiqueta}` : ' · todos los periodos'}</span>
          <h3>{indicador.nombre}</h3>
        </div>
        <button className="panel-detalle-cerrar" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
      </div>
      <div className="panel-detalle-cuerpo">
        <div className="dato">
          <span className="dato-etiqueta"><Activity size={12} /> Mediciones por estado</span>
          {ESTADOS.map((e) => (
            <span key={e} className="semaforo-chip"><i style={{ background: COLOR_ESTADO[e] }} />{ETIQUETA_ESTADO[e]}: {porEstado[e] ?? 0}</span>
          ))}
        </div>
        <div className="dato">
          <span className="dato-etiqueta"><Gauge size={12} /> Completitud de captura (F09)</span>
          <span className="dato-valor" style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-guinda)' }}>{completitud.porcentaje.toFixed(0)} %</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
            {completitud.faltantes.length ? `Sin dato validado: ${completitud.faltantes.map((u) => u.nom_mun).join(', ')}` : 'Los 13 municipios tienen dato validado.'}
          </span>
        </div>
        <div className="dato">
          <span className="dato-etiqueta"><MapPinned size={12} /> Semáforo por municipio (F04 · F05)</span>
          {semaforos.length === 0 && <span className="text-muted">Sin mediciones publicadas para este corte.</span>}
          {semaforos.map((s) => (
            <span key={s.id_unidad} className="semaforo-chip"><i style={{ background: COLORES_SEMAFORO[s.semaforo] }} />{s.nom_mun}: {s.valor ?? '—'} · {s.semaforo}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
