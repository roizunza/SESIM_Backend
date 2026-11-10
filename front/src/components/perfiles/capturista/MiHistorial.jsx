import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Search, FilePlus2, Send, ShieldCheck, Globe2, CornerUpLeft, RefreshCw, PencilLine, UserRound, History, ChevronDown, Quote } from 'lucide-react';
import { backend } from '../../../lib/sesim/supabase';
import { fechaCorta } from '../comun/formato';
import './MiHistorial.css';

/**
 * «Mi historial» del Capturista: una sola línea de tiempo de lo que hizo y de lo que la administración decidió sobre lo suyo.
 * No es un tablero: es un registro (solo se agrega, nunca se edita). Dos fuentes reales del servidor, que el capturista no tiene que distinguir:
 *   · api.bitacora_operativa → capas (altas, envíos, dictámenes, devoluciones y actualizaciones)
 *   · api.bitacora          → su cuenta (accesos y cambios de la cuenta)
 * La RLS ya limita todo a lo suyo.
 */
const TIPOS = [
  { id: 'todo', titulo: 'Todo' },
  { id: 'capas', titulo: 'Capas' },
  { id: 'actualizaciones', titulo: 'Actualizaciones' },
  { id: 'devoluciones', titulo: 'Devoluciones' },
  { id: 'cuenta', titulo: 'Mi cuenta' },
];
const ESTADOS = { borrador: 'Sin enviar', revision: 'En revisión', aprobada: 'Aprobada', devuelta: 'Devuelta' };
const CUENTA = { alta: 'Se creó tu cuenta', cambio_rol: 'Cambió el rol de tu cuenta', cambio_ambito: 'Cambió el ámbito de tu cuenta', baja: 'Se dio de baja tu cuenta', reactivacion: 'Se reactivó tu cuenta', acceso: 'Iniciaste sesión' };

const isoLocal = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const dia = (iso) => isoLocal(new Date(iso));
const etiquetaDia = (d) => {
  const hoy = new Date(); const ayer = new Date(Date.now() - 864e5);
  if (d === isoLocal(hoy)) return 'Hoy';
  if (d === isoLocal(ayer)) return 'Ayer';
  const [a, m, n] = d.split('-').map(Number);
  return new Date(a, m - 1, n).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const hora = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

/** Una fila de api.bitacora_operativa -> evento con frase, tipo y estado. */
function deCapa(r) {
  const nuevos = r.datos_nuevos?.metadatos_extra ?? {}; const previos = r.datos_previos?.metadatos_extra ?? {};
  const t = r.titulo && r.titulo !== r.recurso_id ? ` · ${r.titulo}` : '';
  const base = { id: `c-${r.id}`, cuando: r.creado_en, ref: r.recurso_id, titulo: r.titulo, ficha: r.ficha_tecnica, archivo: r.archivos?.principal, quien: r.rol === 'capturista' ? 'Tú' : 'Administración' };
  if (nuevos.actualizacion_pendiente && !previos.actualizacion_pendiente) {
    const p = nuevos.actualizacion_pendiente;
    return { ...base, tipo: 'actualizaciones', Icono: RefreshCw, estado: 'revision', frase: `Propusiste actualizar ${r.recurso_id}${t}`, detalle: `${p.motivo} · ${p.n_elementos_antes ?? '—'} → ${p.n_elementos} elementos`, nota: p.justificacion, notaDe: 'Tu justificación' };
  }
  if (nuevos.ultima_actualizacion_rechazada && !previos.ultima_actualizacion_rechazada) {
    const p = nuevos.ultima_actualizacion_rechazada;
    return { ...base, tipo: 'devoluciones', Icono: CornerUpLeft, estado: 'devuelta', frase: `La administración devolvió tu actualización de ${r.recurso_id}${t}`, nota: p.motivo_rechazo, notaDe: 'Motivo', detalle: 'Tienes 10 días hábiles para decidir en «Mis devoluciones».' };
  }
  if (nuevos.ultima_actualizacion && JSON.stringify(nuevos.ultima_actualizacion) !== JSON.stringify(previos.ultima_actualizacion)) {
    return { ...base, tipo: 'actualizaciones', Icono: ShieldCheck, estado: 'aprobada', frase: `Se aprobó la actualización de ${r.recurso_id}${t}`, detalle: `${nuevos.ultima_actualizacion.n_elementos} elementos · corte ${nuevos.ultima_actualizacion.fecha_corte}` };
  }
  switch (r.operacion) {
    case 'nuevo': return { ...base, tipo: 'capas', Icono: FilePlus2, estado: 'borrador', frase: `Creaste la capa ${r.recurso_id}${t}` };
    case 'envio': return { ...base, tipo: 'capas', Icono: Send, estado: 'revision', frase: `Enviaste ${r.recurso_id}${t} a revisión` };
    case 'aprobacion': return { ...base, tipo: 'capas', Icono: ShieldCheck, estado: 'aprobada', frase: `La administración validó ${r.recurso_id}${t}`, nota: r.comentario_admin, notaDe: 'Comentario' };
    case 'publicacion': return { ...base, tipo: 'capas', Icono: Globe2, estado: 'aprobada', frase: `Se publicó ${r.recurso_id}${t}`, nota: r.comentario_admin, notaDe: 'Comentario' };
    case 'rechazo': return { ...base, tipo: 'devoluciones', Icono: CornerUpLeft, estado: 'devuelta', frase: `La administración devolvió ${r.recurso_id}${t}`, nota: r.comentario_admin, notaDe: 'Motivo', detalle: 'Tienes 10 días hábiles para decidir en «Mis devoluciones».' };
    case 'despublicacion': return { ...base, tipo: 'capas', Icono: PencilLine, estado: 'borrador', frase: `Se retiró del público ${r.recurso_id}${t}` };
    case 'baja': return { ...base, tipo: 'capas', Icono: PencilLine, estado: 'borrador', frase: `Se dio de baja ${r.recurso_id}${t}` };
    default: return { ...base, tipo: 'capas', Icono: PencilLine, estado: r.estatus === 'revision' ? 'revision' : r.estatus?.startsWith('vigente') ? 'aprobada' : 'borrador', frase: `Editaste la ficha de ${r.recurso_id}${t}` };
  }
}
const deCuenta = (b) => ({ id: `u-${b.id}`, cuando: b.creado_en, tipo: 'cuenta', Icono: UserRound, estado: null, frase: CUENTA[b.accion] ?? 'Cambio en tu cuenta', quien: b.actor_nombre && b.actor_nombre !== b.objetivo_nombre ? b.actor_nombre : 'Tú' });

export default function MiHistorial() {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState(null);
  const [errores, setErrores] = useState([]);
  const [tipo, setTipo] = useState('todo');
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [capas, cuenta] = await Promise.allSettled([
        backend.leer('bitacora_operativa', { query: 'select=*&order=creado_en.desc&limit=500' }),
        backend.rest('bitacora', { query: 'order=creado_en.desc&limit=200' }),
      ]);
      if (!vivo) return;
      const lista = []; const fallas = [];
      if (capas.status === 'fulfilled') lista.push(...capas.value.map(deCapa)); else fallas.push(`capas (${capas.reason?.message})`);
      if (cuenta.status === 'fulfilled') lista.push(...cuenta.value.map(deCuenta)); else fallas.push(`cuenta (${cuenta.reason?.message})`);
      setEventos(lista.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando))));
      setErrores(fallas);
    })();
    return () => { vivo = false; };
  }, []);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (eventos ?? []).filter((e) => (tipo === 'todo' || e.tipo === tipo) && (!estado || e.estado === estado)
      && (!t || [e.frase, e.ref, e.titulo, e.nota].join(' ').toLowerCase().includes(t)));
  }, [eventos, tipo, estado, q]);
  const cuenta = (id) => (eventos ?? []).filter((e) => id === 'todo' || e.tipo === id).length;
  const dias = useMemo(() => {
    const m = new Map();
    visibles.forEach((e) => { const d = dia(e.cuando); m.set(d, [...(m.get(d) ?? []), e]); });
    return [...m.entries()];
  }, [visibles]);

  const exportar = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['fecha,tipo,estado,evento,referencia,nota', ...visibles.map((e) => [e.cuando, e.tipo, ESTADOS[e.estado] ?? '', e.frase, e.ref, e.nota].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `mi_historial_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="mh">
      <header className="mh-cab">
        <button type="button" className="mh-volver" onClick={() => navigate('/admin-visor')}><ArrowLeft size={16} /> Regresar al mapa</button>
        <div className="mh-tit">
          <h2><History size={22} aria-hidden="true" /> Mi bitácora</h2>
          <p>Todo lo que has hecho y lo que la administración decidió sobre tu trabajo. Es un registro.</p>
        </div>
      </header>

      <div className="mh-cuerpo">
        <aside className="mh-filtros" aria-label="Filtros del historial">
          <div className="mh-chips" role="tablist" aria-label="Tipo de evento">
            {TIPOS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tipo === t.id} className={`mh-chip${tipo === t.id ? ' mh-chip--act' : ''}`} onClick={() => setTipo(t.id)}>
                {t.titulo} <span>{cuenta(t.id)}</span>
              </button>
            ))}
          </div>
          <label className="mh-buscar"><Search size={16} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar en mi historial" /></label>
          <label className="mh-estado">Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button type="button" className="mh-exportar" onClick={exportar} disabled={!visibles.length}><Download size={15} /> Exportar CSV</button>
        </aside>

        <div className="mh-feed">
        {errores.length > 0 && <div className="aviso aviso-error" role="alert">No se pudo leer del servidor: {errores.join('; ')}.</div>}
        {!eventos && <p className="mh-vacio">Cargando tu historial…</p>}
        {eventos && visibles.length === 0 && <p className="mh-vacio">{eventos.length === 0 ? 'Aún no hay movimientos. Cuando subas, envíes o actualices una capa aparecerá aquí.' : 'Ningún movimiento coincide con el filtro.'}</p>}

        {dias.map(([d, lista]) => (
          <section key={d} className="mh-dia" aria-label={etiquetaDia(d)}>
            <h3>{etiquetaDia(d)}</h3>
            <ol>
              {lista.map((e) => {
                const abre = abierto === e.id;
                return (
                  <li key={e.id} className={`mh-ev${e.estado ? ` mh-ev--${e.estado}` : ''}`}>
                    <span className="mh-ico" aria-hidden="true"><e.Icono size={16} /></span>
                    <div className="mh-ev__cuerpo">
                      <p className="mh-frase">{e.frase}</p>
                      <p className="mh-meta">
                        {hora(e.cuando)} · {e.quien}
                        {e.estado && <span className="mh-estado-pill">{ESTADOS[e.estado]}</span>}
                      </p>
                      {e.nota && <blockquote><Quote size={13} aria-hidden="true" /><p>{e.nota}</p><footer>{e.notaDe}</footer></blockquote>}
                      {e.detalle && <p className="mh-det">{e.detalle}</p>}
                      {e.ficha && (
                        <>
                          <button type="button" className="mh-mas" aria-expanded={abre} onClick={() => setAbierto(abre ? null : e.id)}>Ver ficha <ChevronDown size={14} style={{ transform: abre ? 'rotate(180deg)' : 'none' }} /></button>
                          {abre && (
                            <dl className="mh-ficha">
                              <dt>Fuente</dt><dd>{e.ficha.fuente}</dd>
                              <dt>Custodio</dt><dd>{e.ficha.responsable}</dd>
                              <dt>Periodicidad</dt><dd>{e.ficha.periodicidad ?? '—'}</dd>
                              <dt>Fecha de corte</dt><dd>{e.ficha.fecha ?? '—'}</dd>
                              <dt>Archivo</dt><dd>{e.archivo ?? '—'}</dd>
                              <dt>Registrado</dt><dd>{fechaCorta(e.cuando)}</dd>
                            </dl>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        </div>
      </div>
    </div>
  );
}
