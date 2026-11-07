import React, { useEffect, useState } from 'react';
import { X, FileCheck2, ShieldCheck, ShieldAlert, ExternalLink } from 'lucide-react';
import {
  useOperacion, ETIQUETA_ESTADO, COLOR_ESTADO, vHistorialRegistro, fnVerificarEvidencia, ultimoDictamen, lineaBaseDe,
} from '../../../lib/sesim/operacion';
import { vEquivalenciaPimus } from '../../../lib/sesim/api';
import { backend } from '../../../lib/sesim/supabase';
import { useSesion } from '../../../lib/sesim/sesion';
import { useMediciones, ultimoDictamenDe, nombreEvidencia } from '../../../lib/sesim/medicionesApi';
import { abrirEvidencia } from '../../../lib/sesim/catalogoApi';
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
 * `real` = true lee de la API (Ciclo 8); sin él usa la operación local (perfiles aún no conectados).
 */
export default function DetalleMedicion({ idMedicion, catalogo, puedeVerificar = false, onClose, pie, real = false }) {
  const op = useOperacion();
  const api = useMediciones();
  const sesion = useSesion();
  const [historialReal, setHistorialReal] = useState([]);
  const [tab, setTab] = useState('ficha');
  const [equivalencias, setEquivalencias] = useState([]);
  const [verificacion, setVerificacion] = useState({});

  const m = (real ? api.mediciones : op.medicion_indicador).find((x) => x.id === idMedicion);
  const indicador = m ? catalogo.indicadores.get(m.id_indicador) : null;
  const unidad = m ? catalogo.unidades.get(m.id_unidad) : null;
  const idMunicipio = unidad ? (unidad.nivel === 'municipio' ? unidad.id : unidad.id_padre) : null;

  useEffect(() => {
    if (!m) return;
    vEquivalenciaPimus(m.id_indicador).then(setEquivalencias);
  }, [m?.id_indicador]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!real || !idMedicion) return undefined;
    let vivo = true;
    backend
      .leer('bitacora_cambio', { query: `tabla_afectada=in.(medicion_indicador,evidencia_medicion)&select=*&order=fecha.desc` })
      .then((filas) => vivo && setHistorialReal(filas.filter((b) => b.id_registro === idMedicion || b.datos_nuevos?.id_medicion === idMedicion || b.datos_previos?.id_medicion === idMedicion)))
      .catch(() => vivo && setHistorialReal([]));
    return () => { vivo = false; };
  }, [real, idMedicion, m?.estado, api.evidencias.length]);

  useEffect(() => {
    setTab('ficha');
    setVerificacion({});
  }, [idMedicion]);

  if (!m) return null;

  const periodo = (real ? api.periodos : op.periodo).find((p) => p.id === m.id_periodo);
  const evidencias = real ? api.evidencias.filter((e) => e.id_medicion === m.id) : op.evidencia_medicion.filter((e) => e.id_medicion === m.id);
  const historial = real ? historialReal : vHistorialRegistro('medicion_indicador', m.id, op);
  const dictamenCrudo = real ? ultimoDictamenDe(m.id, api.dictamenes) : ultimoDictamen(m.id, op);
  const comentarioRechazo = real ? dictamenCrudo?.comentario : dictamenCrudo?.datos_nuevos?.comentario;
  const usuarios = real ? new Map(sesion ? [[sesion.id, { correo: 'usted' }]] : []) : new Map(op.usuario.map((u) => [u.id, u]));
  const quien = (id) => usuarios.get(id)?.correo ?? (real ? String(id ?? 'sistema').slice(0, 8) : id);
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
            {m.estado === 'rechazado' && comentarioRechazo && (
              <div className="aviso aviso-error"><strong>Motivo del rechazo:</strong> {comentarioRechazo}</div>
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
            <Dato etiqueta="Capturó">{quien(m.usuario_captura)} · {fechaCorta(m.fecha_captura)}</Dato>
            {m.usuario_validacion && <Dato etiqueta="Validó">{quien(m.usuario_validacion)} · {fechaCorta(m.fecha_validacion)}</Dato>}
            {equivMunicipio.length > 0 && (
              <div className="dato">
                <span className="dato-etiqueta">Cómo lo mide su instrumento (F15)</span>
                {equivMunicipio.map((e, i) => (
                  <span key={i} className="dato-valor" style={{ fontSize: 'var(--t-nota)' }}>
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
                    <strong><FileCheck2 size={14} style={{ verticalAlign: -2 }} /> {real ? nombreEvidencia(ev) : ev.nombre_archivo}</strong>
                    <span style={{ fontSize: 'var(--t-nota)', color: 'var(--text-secondary)' }}>{real ? (ev.vigente ? 'Vigente' : 'Reemplazada') : `${ev.tipo_documento} · ${bytesLegibles(ev.bytes)}`}</span>
                  </div>
                  <Dato etiqueta="SHA-256 (hash_archivo)" mono>{ev.hash_archivo}</Dato>
                  <Dato etiqueta="Ruta">{ev.url_archivo}</Dato>
                  {real && (
                    <button type="button" className="btn-base btn-secondary" style={{ justifyContent: 'center' }} onClick={async () => { try { window.open(await abrirEvidencia(ev), '_blank', 'noopener'); } catch (err) { setVerificacion((prev) => ({ ...prev, [ev.id]: { error: err.message } })); } }}>
                      <ExternalLink size={14} /> Abrir archivo
                    </button>
                  )}
                  <span style={{ fontSize: 'var(--t-nota)', color: 'var(--text-secondary)' }}>Subido {fechaCorta(ev.fecha_subida)}</span>
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
                  <span>{b.id_usuario ? quien(b.id_usuario) : 'sistema'}{b.perfil ? ` · ${b.perfil}` : ''}</span>
                  <span>{fechaCorta(b.fecha)}</span>
                </div>
                <div className="lt-accion">
                  {b.tabla_afectada === 'evidencia_medicion' ? `Evidencia: ${ACCION_LEGIBLE[b.accion] ?? b.accion}` : ACCION_LEGIBLE[b.accion] ?? b.accion}
                  {(b.accion === 'cambio de estado' || b.accion === 'CAMBIO_ESTADO') && ` · ${ETIQUETA_ESTADO[b.datos_previos?.estado]} → ${ETIQUETA_ESTADO[b.datos_nuevos?.estado]}`}
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
