import React from 'react';
import { ESTADOS, ETIQUETA_ESTADO, COLOR_ESTADO } from '../../../lib/sesim/operacion';
import { nombreUnidad } from './formato';
import './Comun.css';

/**
 * Bandeja de mediciones agrupada por los 5 estados (sección 1.6). La lista
 * ya llega filtrada por lo que el perfil puede ver (medicionesVisibles).
 *
 * props: mediciones, periodosPorId, unidadesPorId, seleccion, onSeleccionar,
 *        estados (subconjunto/orden a mostrar)
 */
export default function BandejaMediciones({ mediciones, periodosPorId, unidadesPorId, seleccion, onSeleccionar, estados = ESTADOS }) {
  return (
    <div className="bandeja-mediciones">
      {estados.map((estado) => {
        const lista = mediciones.filter((m) => m.estado === estado).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
        return (
          <div key={estado}>
            <div className="bandeja-grupo-titulo">
              {ETIQUETA_ESTADO[estado]} <span className="n">{lista.length}</span>
            </div>
            {lista.length === 0 && <span className="bandeja-vacia">Sin mediciones</span>}
            {lista.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`bandeja-medicion ${seleccion === m.id ? 'activa' : ''}`}
                onClick={() => onSeleccionar(m.id)}
                title={`${m.id_indicador} · ${nombreUnidad(unidadesPorId, m.id_unidad)}`}
              >
                <span className="estado-punto" style={{ background: COLOR_ESTADO[m.estado] }} />
                <span className="bandeja-medicion-texto">
                  <strong>{m.id_indicador} · {periodosPorId.get(m.id_periodo)?.etiqueta ?? '—'}</strong>
                  <span>{nombreUnidad(unidadesPorId, m.id_unidad)}</span>
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
