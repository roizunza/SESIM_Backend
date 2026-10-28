import React, { useEffect, useState } from 'react';
import { X, FileCheck2, ShieldCheck, ShieldAlert } from 'lucide-react';
import {
  useOperacion, ETIQUETA_ESTADO, COLOR_ESTADO, vHistorialRegistro, fnVerificarEvidencia, ultimoDictamen, lineaBaseDe,
} from '../../../lib/sesim/operacion';
import { vEquivalenciaPimus } from '../../../lib/sesim/api';
import { fnSemaforo, COLORES_SEMAFORO } from '../../../lib/sesim/semaforo';
import { fechaCorta, nombreUnidad, valorLegible, ACCION_LEGIBLE, bytesLegibles } from './formato';
import './Comun.css';

function Dato({ etiqueta, children, mono }) {
  return (
    <div className="dato">
      <span className="dato-etiqueta">{etiqueta}</span>
      <span className={`dato-valor ${mono ? 'dato-mono' : ''}`}>{children ?? '—'}</span>
    </div>
  );
}

/**
 * Detalle de una medición (Ruta 2 «hecho» + Ruta 3 «confianza»):
 *  · Ficha: qué / cuándo / dónde / quién, valor, semáforo (F04) y cómo mide
 *    lo mismo el PIMUS del municipio (F15).
 *  · Evidencia: documentos con su SHA-256; el auditor puede verificar (F11).
 *  · Historial: línea de tiempo desde la bitácora (F12).
 *
 * `pie` es el bloque de acciones propio de cada perfil.
 */
export default function DetalleMedicion({ idMedicion, catalogo, puedeVerificar = false, onClose, pie }) {
  const op = useOperacion();
  const [tab, setTab] = useState('ficha');
  const [equivalencias, setEquivalencias] = useState([]);
  const [verificacion, setVerificacion] = useState({});

  const m = op.medicion_indicador.find((x) => x.id === idMedicion);
  const indicador = m ? catalogo.indicadores.get(m.id_indicador) : null;
  const unidad = m ? catalogo.unidades.get(m.id_unidad) : null;
  const idMunicipio = unidad ? (unidad.nivel === 'municipio' ? unidad.id : unidad.id_padre) : null;

  useEffect(() => {
    if (!m) return;
    vEquivalenciaPimus(m.id_indicador).then(setEquivalencias);
  }, [m?.id_indicador]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTab('ficha');
    setVerificacion({});
  }, [idMedicion]);

  if (!m) return null;

  const periodo = op.periodo.find((p) => p.id === m.id_periodo);
  const evidencias = op.evidencia_medicion.filter((e) => e.id_medicion === m.id);
  const historial = vHistorialRegistro('medicion_indicador', m.id, op);
  const dictamen = ultimoDictamen(m.id, op);
  const usuarios = new Map(op.usuario.map((u) => [u.id, u]));
  const lb = lineaBaseDe(indicador, op);
  const semaforo = fnSemaforo({ valor: m.valor, linea_base: lb.linea_base, valor_meta: indicador?.valor_meta, tendencia: indicador?.tendencia });
  const equivMunicipio = equivalencias.filter((e) => e.instrumento?.id_unidad_ambito === idMunicipio || e.instrumento?.ambito === 'Estatal');

  const verificar = async (ev, archivo) => {
    if (!archivo) return;
    try {
      const r = await fnVerificarEvidencia(ev.id, archivo);
      setVerificacion((prev) => ({ ...prev, [ev.id]: r }));
    } catch (err) {
      setVerificacion((prev) => ({ ...prev, [ev.id]: { error: err.message } }));
    }
  };

  return (
    <div className="panel-detalle" role="dialog" aria-label="Detalle de la medición">
      <div className="panel-detalle-header">
        <div>
          <span className="panel-detalle-sup">Medición · {m.id_indicador} · {periodo?.etiqueta}</span>
          <h3>{indicador?.nombre ?? m.id_indicador}</h3>
          <span className="estado-chip" style={{ background: COLOR_ESTADO[m.estado], marginTop: 6 }}>{ETIQUETA_ESTADO[m.estado]}</span>
        </div>
        <button className="panel-detalle-cerrar" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
      </div>

      <div className="panel-detalle-tabs">
        <button className={tab === 'ficha' ? 'activa' : ''} onClick={() => setTab('ficha')}>Ficha</button>
        <button className={tab === 'evidencia' ? 'activa' : ''} onClick={() => setTab('evidencia')}>Evidencia ({evidencias.length})</button>
        <button className={tab === 'historial' ? 'activa' : ''} onClick={() => setTab('historial')}>Historial</button>
      </div>

      <div className="panel-detalle-cuerpo">
        {tab === 'ficha' && (
          <>
            {m.estado === 'rechazado' && dictamen?.datos_nuevos?.comentario && (
              <div className="aviso aviso-error"><strong>Motivo del rechazo:</strong> {dictamen.datos_nuevos.comentario}</div>
            )}
            <Dato etiqueta="Unidad territorial">{nombreUnidad(catalogo.unidades, m.id_unidad)} ({m.id_unidad})</Dato>
            <Dato etiqueta="Periodo">{periodo ? `${periodo.etiqueta} · ${periodo.fecha_inicio} a ${periodo.fecha_fin}` : '—'}</Dato>
            <Dato etiqueta="Valor">{valorLegible(m)}</Dato>
            {m.valor !== null && m.valor_texto && <Dato etiqueta="Nota cualitativa">{m.valor_texto}</Dato>}
            {m.desagregaciones && (
              <Dato etiqueta="Desagregaciones">
                {Object.entries(m.desagregaciones).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </Dato>
            )}
            <Dato etiqueta="Variable que se mide">{indicador?.variable}</Dato>
            <Dato etiqueta="Meta / tendencia">{[indicador?.meta, indicador?.tendencia].filter(Boolean).join(' · ') || '—'}</Dato>
            <div className="dato">
              <span className="dato-etiqueta">Semáforo (si se publica)</span>
              <span className="semaforo-chip"><i style={{ background: COLORES_SEMAFORO[semaforo] }} />{semaforo}{lb.linea_base !== null ? ` · línea base ${lb.linea_base}${lb.anio_linea_base ? ` (${lb.anio_linea_base})` : ''}` : ''}</span>
            </div>
            <Dato etiqueta="Capturó">{usuarios.get(m.usuario_captura)?.correo ?? m.usuario_captura} · {fechaCorta(m.fecha_captura)}</Dato>
            {m.usuario_validacion && <Dato etiqueta="Validó">{usuarios.get(m.usuario_validacion)?.correo ?? m.usuario_validacion} · {fechaCorta(m.fecha_validacion)}</Dato>}
            {equivMunicipio.length > 0 && (
              <div className="dato">
                <span className="dato-etiqueta">Cómo lo mide su instrumento (F15)</span>
                {equivMunicipio.map((e, i) => (
                  <span key={i} className="dato-valor" style={{ fontSize: 12 }}>
                    <strong>{e.instrumento?.clave}</strong> · {e.correspondencia}
                    {e.matriz ? ` — «${e.matriz.indicador_origen}» (${e.matriz.clave_oe ?? 's/c'})` : ''}
                  </span>
                ))}
              </div>
            )}
            <Dato etiqueta="ID de la medición" mono>{m.id}</Dato>
          </>
        )}

        {tab === 'evidencia' && (
          <>
            {evidencias.length === 0 && <div className="aviso aviso-alerta">Sin evidencia: la medición no puede enviarse ni validarse (se requiere ≥ 1).</div>}
            {evidencias.map((ev) => {
              const r = verificacion[ev.id];
              return (
                <div key={ev.id} className="evidencia-item">
                  <div className="evidencia-item-cab">
                    <strong><FileCheck2 size={14} style={{ verticalAlign: -2 }} /> {ev.nombre_archivo}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ev.tipo_documento} · {bytesLegibles(ev.bytes)}</span>
                  </div>
                  <Dato etiqueta="SHA-256 (hash_archivo)" mono>{ev.hash_archivo}</Dato>
                  <Dato etiqueta="Ruta">{ev.url_archivo}</Dato>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Subido {fechaCorta(ev.fecha_subida)}</span>
                  {puedeVerificar && (
                    <label className="btn-base btn-secondary" style={{ cursor: 'pointer', justifyContent: 'center' }}>
                      <ShieldCheck size={14} /> Verificar integridad (F11)
                      <input type="file" hidden onChange={(e) => verificar(ev, e.target.files?.[0])} />
                    </label>
                  )}
                  {r?.error && <div className="aviso aviso-error">{r.error}</div>}
                  {r && !r.error && (
                    <div className={`aviso ${r.coincide ? 'aviso-ok' : 'aviso-error'}`}>
                      {r.coincide ? <><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> El archivo coincide con la huella registrada.</> : <><ShieldAlert size={14} style={{ verticalAlign: -2 }} /> El archivo NO coincide: posible alteración. Hash calculado: <span className="dato-mono">{r.hash_calculado}</span></>}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === 'historial' && (
          <ul className="linea-tiempo">
            {historial.map((b) => (
              <li key={b.id}>
                <div className="lt-cab">
                  <span>{usuarios.get(b.id_usuario)?.correo ?? 'sistema'}{b.perfil ? ` · ${b.perfil}` : ''}</span>
                  <span>{fechaCorta(b.fecha)}</span>
                </div>
                <div className="lt-accion">
                  {b.tabla_afectada === 'evidencia_medicion' ? `Evidencia: ${ACCION_LEGIBLE[b.accion] ?? b.accion}` : ACCION_LEGIBLE[b.accion] ?? b.accion}
                  {b.accion === 'cambio de estado' && ` · ${ETIQUETA_ESTADO[b.datos_previos?.estado]} → ${ETIQUETA_ESTADO[b.datos_nuevos?.estado]}`}
                </div>
                {b.datos_nuevos?.comentario && <div className="lt-coment">«{b.datos_nuevos.comentario}»</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pie && <div className="panel-detalle-pie">{pie}</div>}
    </div>
  );
}
