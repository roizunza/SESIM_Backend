import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Search, FilePlus2, Send, ShieldCheck, Globe2, CornerUpLeft, RefreshCw, PencilLine, UserRound, History,
  ChevronDown, Quote, BookMarked, FileText, KeyRound, Link2, Trash2, Route,
} from 'lucide-react';
import { backend } from '../../../lib/sesim/supabase';
import { useSesion } from '../../../lib/sesim/sesion';
import { fechaCorta } from '../comun/formato';
import '../capturista/MiHistorial.css';
import './BitacoraAdmin.css';

/**
 * Bitácora de la administración (Administrador y Administrador Titular): el registro completo, en una sola línea de tiempo.
 * Es un registro: solo se agrega, nunca se edita. Tres fuentes reales del servidor; la RLS decide qué trae cada una:
 *   · api.bitacora_operativa → capas e instrumentos (altas, envíos, dictámenes, devoluciones, actualizaciones) de TODO el equipo.
 *   · api.bitacora_catalogos → catálogos, vínculos, umbrales e invitaciones. El Administrador no ve las invitaciones; el Titular sí.
 *   · api.bitacora           → cuentas: el Administrador, las de capturistas y la suya; el Titular, todas.
 */
const TIPOS = [
  { id: 'todo', titulo: 'Todo' },
  { id: 'capas', titulo: 'Capas' },
  { id: 'actualizaciones', titulo: 'Actualizaciones' },
  { id: 'devoluciones', titulo: 'Devoluciones' },
  { id: 'instrumentos', titulo: 'Instrumentos' },
  { id: 'catalogos', titulo: 'Catálogos y vínculos' },
  { id: 'cuentas', titulo: 'Cuentas e invitaciones' },
];
const ESTADOS = { borrador: 'Sin enviar', revision: 'En revisión', aprobada: 'Aprobada', devuelta: 'Devuelta' };
const ROL = { capturista: 'Capturista', administrador: 'Administrador', administrador_titular: 'Administrador Titular', auditor: 'Auditor' };
/** [tercera persona, segunda persona (cuando lo hizo quien mira)] */
const CUENTA = { alta: ['creó la cuenta de', 'Creaste la cuenta de'], cambio_rol: ['cambió el rol de la cuenta de', 'Cambiaste el rol de la cuenta de'], cambio_ambito: ['cambió el ámbito de la cuenta de', 'Cambiaste el ámbito de la cuenta de'], baja: ['dio de baja la cuenta de', 'Diste de baja la cuenta de'], reactivacion: ['reactivó la cuenta de', 'Reactivaste la cuenta de'] };
const TABLA = {
  eje_tematico: ['el eje temático', BookMarked], sector: ['el sector', BookMarked], fuente_informacion: ['la fuente de información', BookMarked],
  matriz_instrumento: ['la matriz del instrumento', FileText], indicador_instrumento: ['el vínculo indicador–instrumento', Link2], indicador_eje: ['el vínculo indicador–eje', Link2],
  capa_indicador: ['el vínculo capa–indicador', Link2], invitacion: ['la invitación', KeyRound], indicador: ['el indicador', BookMarked],
};
const VERBO = { INSERT: ['creó', 'Creaste'], UPDATE: ['modificó', 'Modificaste'], DELETE: ['quitó', 'Quitaste'], CAMBIO_ESTADO: ['cambió el estado de', 'Cambiaste el estado de'] };

const isoLocal = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const dia = (iso) => isoLocal(new Date(iso));
const etiquetaDia = (d) => {
  if (d === isoLocal(new Date())) return 'Hoy';
  if (d === isoLocal(new Date(Date.now() - 864e5))) return 'Ayer';
  const [a, m, n] = d.split('-').map(Number);
  return new Date(a, m - 1, n).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const hora = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

/** Quién hizo el evento. Si es la persona que mira, la frase va en segunda persona («Creaste…»). */
const quienDe = (id, nombre, rol, yo) => ({ id: id ?? null, yo: !!id && id === yo, nombre: nombre || 'Sistema', rol: ROL[rol] ?? null });
const dice = (q, tercera, segunda) => (q.yo ? segunda : `${q.nombre} ${tercera}`);

/** api.bitacora_operativa → evento. Capas e instrumentos de todo el equipo. */
function deOperativa(r, yo) {
  const esInst = r.tabla === 'instrumento_origen';
  const q = quienDe(r.actor_id_usuario, r.actor_nombre, r.rol, yo);
  const obj = esInst ? 'el instrumento' : 'la capa';
  const t = r.titulo && r.titulo !== r.recurso_id ? ` · ${r.titulo}` : '';
  const nuevos = r.datos_nuevos?.metadatos_extra ?? {}; const previos = r.datos_previos?.metadatos_extra ?? {};
  const base = { id: `o-${r.id}`, cuando: r.creado_en, ref: r.recurso_id, titulo: r.titulo, ficha: r.ficha_tecnica, archivo: r.archivos?.principal, quien: q };
  const tipoBase = esInst ? 'instrumentos' : 'capas';
  const v = (tercera, segunda) => `${dice(q, tercera, segunda)} ${obj} ${r.recurso_id}${t}`;
  if (!esInst && nuevos.actualizacion_pendiente && !previos.actualizacion_pendiente) {
    const p = nuevos.actualizacion_pendiente;
    return { ...base, tipo: 'actualizaciones', Icono: RefreshCw, estado: 'revision', frase: `${dice(q, 'propuso', 'Propusiste')} actualizar ${r.recurso_id}${t}`, detalle: `${p.motivo} · ${p.n_elementos_antes ?? '—'} → ${p.n_elementos} elementos`, nota: p.justificacion, notaDe: 'Justificación' };
  }
  if (!esInst && nuevos.ultima_actualizacion_rechazada && !previos.ultima_actualizacion_rechazada) {
    const p = nuevos.ultima_actualizacion_rechazada;
    return { ...base, tipo: 'devoluciones', Icono: CornerUpLeft, estado: 'devuelta', frase: `${dice(q, 'rechazó', 'Rechazaste')} la actualización de ${r.recurso_id}${t}`, nota: p.motivo_rechazo, notaDe: 'Motivo' };
  }
  if (!esInst && nuevos.ultima_actualizacion && JSON.stringify(nuevos.ultima_actualizacion) !== JSON.stringify(previos.ultima_actualizacion)) {
    return { ...base, tipo: 'actualizaciones', Icono: ShieldCheck, estado: 'aprobada', frase: `${dice(q, 'aprobó', 'Aprobaste')} la actualización de ${r.recurso_id}${t}`, detalle: `${nuevos.ultima_actualizacion.n_elementos} elementos · corte ${nuevos.ultima_actualizacion.fecha_corte}` };
  }
  switch (r.operacion) {
    case 'nuevo': return { ...base, tipo: tipoBase, Icono: FilePlus2, estado: 'borrador', frase: v('creó', 'Creaste') };
    case 'envio': return { ...base, tipo: tipoBase, Icono: Send, estado: 'revision', frase: `${v('envió', 'Enviaste')} a revisión` };
    case 'aprobacion': return { ...base, tipo: tipoBase, Icono: ShieldCheck, estado: 'aprobada', frase: v('validó', 'Validaste'), nota: r.comentario_admin, notaDe: 'Comentario' };
    case 'publicacion': return { ...base, tipo: tipoBase, Icono: Globe2, estado: 'aprobada', frase: v('publicó', 'Publicaste'), nota: r.comentario_admin, notaDe: 'Comentario' };
    case 'rechazo': return { ...base, tipo: 'devoluciones', Icono: CornerUpLeft, estado: 'devuelta', frase: v('devolvió', 'Devolviste'), nota: r.comentario_admin, notaDe: 'Motivo' };
    case 'despublicacion': return { ...base, tipo: tipoBase, Icono: PencilLine, estado: 'borrador', frase: `${dice(q, 'retiró', 'Retiraste')} del público ${obj} ${r.recurso_id}${t}`, nota: r.comentario_admin, notaDe: 'Motivo' };
    case 'baja': return { ...base, tipo: tipoBase, Icono: Trash2, estado: 'borrador', frase: v('dio de baja', 'Diste de baja') };
    default: return { ...base, tipo: tipoBase, Icono: PencilLine, estado: r.estatus === 'revision' ? 'revision' : r.estatus?.startsWith('vigente') ? 'aprobada' : 'borrador', frase: `${dice(q, 'editó', 'Editaste')} la ficha de ${r.recurso_id}${t}` };
  }
}

/** api.bitacora_catalogos → evento. */
function deCatalogo(r, yo) {
  const q = quienDe(r.actor_id_usuario, r.actor_nombre, r.rol, yo);
  const [cosa, Icono] = TABLA[r.tabla] ?? [`un registro de ${r.tabla}`, BookMarked];
  const esInv = r.tabla === 'invitacion';
  const nombre = r.titulo && r.titulo !== r.recurso_id ? ` «${r.titulo}»` : ` ${String(r.recurso_id).replace('|', ' ↔ ')}`;
  const [tercera, segunda] = VERBO[r.accion] ?? VERBO.UPDATE;
  return { id: `k-${r.id}`, cuando: r.creado_en, tipo: esInv ? 'cuentas' : 'catalogos', Icono, estado: null, quien: q, ref: r.recurso_id, titulo: r.titulo, frase: `${dice(q, tercera, segunda)} ${cosa}${nombre}` };
}

/** api.bitacora → evento de cuenta. */
function deCuenta(b, yo) {
  const q = quienDe(b.actor_id_usuario, b.actor_nombre, b.actor_rol, yo);
  const sobre = b.objetivo_id_usuario === yo ? 'tu cuenta' : (b.objetivo_nombre || 'una cuenta');
  const [tercera, segunda] = CUENTA[b.accion] ?? ['hizo un cambio en la cuenta de', 'Hiciste un cambio en la cuenta de'];
  const frase = b.accion === 'acceso' ? `${dice(q, 'inició', 'Iniciaste')} sesión` : `${dice(q, tercera, segunda)} ${sobre}`;
  return { id: `u-${b.id}`, cuando: b.creado_en, tipo: 'cuentas', Icono: UserRound, estado: null, quien: q, frase, ref: b.objetivo_nombre };
}

export default function BitacoraAdmin() {
  const navigate = useNavigate();
  const sesion = useSesion();
  const yo = sesion?.id;
  const auditor = sesion?.perfil === 'auditor';
  const titular = sesion?.perfil === 'administrador_titular' || auditor;
  const [eventos, setEventos] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [errores, setErrores] = useState([]);
  const [tipo, setTipo] = useState('todo');
  const [estado, setEstado] = useState('');
  const [persona, setPersona] = useState('');
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [op, cat, cta] = await Promise.allSettled([
        backend.leer('bitacora_operativa', { query: 'select=*&order=creado_en.desc&limit=800' }),
        backend.leer('bitacora_catalogos', { query: 'select=*&order=creado_en.desc&limit=800' }),
        backend.rest('bitacora', { query: 'order=creado_en.desc&limit=400' }),
      ]);
      if (!vivo) return;
      const lista = []; const fallas = [];
      if (op.status === 'fulfilled') lista.push(...op.value.map((r) => deOperativa(r, yo))); else fallas.push(`capas e instrumentos (${op.reason?.message})`);
      if (cat.status === 'fulfilled') lista.push(...cat.value.map((r) => deCatalogo(r, yo))); else fallas.push(`catálogos (${cat.reason?.message})`);
      if (cta.status === 'fulfilled') lista.push(...cta.value.map((r) => deCuenta(r, yo))); else fallas.push(`cuentas (${cta.reason?.message})`);
      setEventos(lista.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando))));
      setErrores(fallas);
    })();
    // Lista de usuarios: la RLS decide quién se ve (el Titular ve todas las cuentas; el Administrador, capturistas y la suya).
    backend.leer('perfil', { query: 'select=*&order=nombre' })
      .then((r) => { if (vivo && Array.isArray(r)) setUsuarios(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [yo]);

  const personas = useMemo(() => {
    const m = new Map();
    usuarios.forEach((u0) => { const u = { ...u0, id: u0.id_usuario ?? u0.id }; m.set(u.id, u.id === yo ? 'Yo' : `${u.nombre}${ROL[u.rol] ? ` · ${ROL[u.rol]}` : ''}${u.activo === false ? ' (baja)' : ''}`); });
    (eventos ?? []).forEach((e) => { if (e.quien.id) m.set(e.quien.id, e.quien.yo ? 'Yo' : `${e.quien.nombre}${e.quien.rol ? ` · ${e.quien.rol}` : ''}`); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [eventos, usuarios, yo]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (eventos ?? []).filter((e) => (tipo === 'todo' || e.tipo === tipo) && (!estado || e.estado === estado) && (!persona || e.quien.id === persona)
      && (!t || [e.frase, e.ref, e.titulo, e.nota, e.quien.nombre].join(' ').toLowerCase().includes(t)));
  }, [eventos, tipo, estado, persona, q]);
  const cuenta = (id) => (eventos ?? []).filter((e) => id === 'todo' || e.tipo === id).length;
  const dias = useMemo(() => {
    const m = new Map();
    visibles.forEach((e) => { const d = dia(e.cuando); m.set(d, [...(m.get(d) ?? []), e]); });
    return [...m.entries()];
  }, [visibles]);

  const exportar = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['fecha,tipo,estado,quien,perfil,evento,referencia,nota', ...visibles.map((e) => [e.cuando, e.tipo, ESTADOS[e.estado] ?? '', e.quien.nombre, e.quien.rol, e.frase, e.ref, e.nota].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bitacora_administracion_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="mh mh--verde">
      <header className="mh-cab">
        <button type="button" className="mh-volver" onClick={() => navigate('/admin-visor')}><ArrowLeft size={16} /> Regresar al mapa</button>
        <div className="mh-tit">
          <h2><History size={22} aria-hidden="true" /> {auditor ? 'Bitácora de auditoría' : 'Bitácora de la administración'}</h2>
          <p>{titular ? 'Todo lo que pasa en el sistema.' : 'Todo lo que hace el equipo.'} Es un registro.</p>
        </div>
        {(auditor || sesion?.perfil === 'administrador_titular') && <button type="button" className="mh-volver" onClick={() => navigate('/trazabilidad')}><Route size={16} /> Ver la trazabilidad</button>}
      </header>

      <div className="mh-cuerpo">
        <aside className="mh-filtros" aria-label="Filtros de la bitácora">
          <div className="mh-chips" role="tablist" aria-label="Tipo de evento">
            {TIPOS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tipo === t.id} className={`mh-chip${tipo === t.id ? ' mh-chip--act' : ''}`} onClick={() => setTipo(t.id)}>
                {t.titulo} <span>{cuenta(t.id)}</span>
              </button>
            ))}
          </div>
          <label className="mh-buscar"><Search size={16} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar en la bitácora" /></label>
          <label className="mh-estado">Usuario
            <select value={persona} onChange={(e) => setPersona(e.target.value)}>
              <option value="">Todas</option>
              {personas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </label>
          <label className="mh-estado">Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button type="button" className="mh-exportar" onClick={exportar} disabled={!visibles.length}><Download size={15} /> Exportar CSV</button>
          <p className="mh-alcance">{auditor ? 'Como Auditor ves todo, incluidas las invitaciones y las cuentas, solo para consulta: no modificas nada.' : titular ? 'Como Titular ves todo, incluidas las invitaciones y las cuentas de la administración.' : 'No incluye las invitaciones ni las cuentas de la administración: son del Titular.'}</p>
        </aside>

        <div className="mh-feed">
          {errores.length > 0 && <div className="aviso aviso-error" role="alert">No se pudo leer del servidor: {errores.join('; ')}.</div>}
          {!eventos && <p className="mh-vacio">Cargando la bitácora…</p>}
          {eventos && visibles.length === 0 && <p className="mh-vacio">{eventos.length === 0 ? 'Aún no hay movimientos registrados.' : 'Ningún movimiento coincide con el filtro.'}</p>}

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
                          {hora(e.cuando)}{e.quien.rol ? ` · ${e.quien.rol}` : ''}
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
                                <dt>Restricción de uso</dt><dd>{e.ficha.restriccionUso ?? '—'}</dd>
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
