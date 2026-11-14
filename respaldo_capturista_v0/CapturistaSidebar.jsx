import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, History, LogOut, CircleHelp, CornerUpLeft, PencilLine, Hourglass, ClipboardList, ChartColumn, PanelLeftOpen, PanelLeftClose,
  ShieldCheck, BadgeCheck, Paperclip, Layers,
} from 'lucide-react';
import { cerrarSesion } from '../../../lib/sesim/sesion';
import { nombreUnidad } from '../comun/formato';
import './Capturista.css';

/**
 * Barra lateral del Capturista (rediseño).
 *
 *  · Quién eres: rol, nombre y correo vinculado (sin avatar).
 *  · Una acción principal: «Capturar medición».
 *  · Cola de trabajo en dos pestañas tipo carpeta (mismo patrón que la ficha del Marco jurídico del portal):
 *      Mediciones · Capas e instrumentos (rechazos con plazo de 10 días hábiles).
 *  · Bitácora y cierre de sesión agrupados abajo.
 *
 * El ESTADO no se distingue por color (el semáforo es de los indicadores): cada estado tiene su propio
 * ícono, su estilo de contorno y su texto, y la urgencia se expresa con el ORDEN (lo devuelto va primero).
 *
 * Escritorio: abierta (300 px) o riel de íconos (72 px). Móvil: cajón sobre el mapa.
 */
const GRUPOS_ACTIVOS = [
  { estado: 'rechazado', titulo: 'Rechazadas · por corregir', Icono: CornerUpLeft, marca: 'urgente', etiqueta: 'Rechazada', nota: 'Con comentario del administrador' },
  { estado: 'borrador', titulo: 'Borradores', Icono: PencilLine, marca: 'borrador', etiqueta: 'Borrador', nota: 'Aún no enviados' },
  { estado: 'revision', titulo: 'En revisión', Icono: Hourglass, marca: 'espera', etiqueta: 'En revisión', nota: 'Esperando validación' },
];
const GRUPOS_FIN = [
  { estado: 'vigente_admin', titulo: 'Aprobadas · validadas', Icono: ShieldCheck, marca: 'firme', etiqueta: 'Validada', nota: 'Aprobadas para uso interno' },
  { estado: 'vigente_publico', titulo: 'Aprobadas · publicadas', Icono: BadgeCheck, marca: 'firme', etiqueta: 'Publicada', nota: 'Aprobadas y visibles al público' },
];

function ItemMedicion({ m, grupo, periodosPorId, unidadesPorId, activo, sinEvidencia, onSeleccionar }) {
  const { Icono } = grupo;
  return (
    <button type="button" className={`cap-item${activo ? ' cap-item--activo' : ''}`} onClick={() => onSeleccionar(m.id)} aria-current={activo ? 'true' : undefined}>
      <span className={`cap-marca cap-marca--${grupo.marca}`} aria-hidden="true"><Icono size={16} /></span>
      <span className="cap-item__texto">
        <strong>{m.id_indicador} · {periodosPorId.get(m.id_periodo)?.etiqueta ?? '—'}</strong>
        <span>{nombreUnidad(unidadesPorId, m.id_unidad)}</span>
        <span className="cap-item__estado">
          {grupo.etiqueta}
          {sinEvidencia && <span className="cap-item__alerta"><Paperclip size={12} aria-hidden="true" /> Falta evidencia</span>}
        </span>
      </span>
    </button>
  );
}

export default function CapturistaSidebar({
  abierto, setAbierto, esMovil, sesion, catalogo, mediciones, periodosPorId, evidencias = [], seleccion,
  rechazosCapas = [], onNueva, onSeleccionar, onRechazos, onGuia,
}) {
  const navigate = useNavigate();
  const [pestana, setPestana] = useState('mediciones');

  const porEstado = useMemo(() => {
    const mapa = new Map();
    mediciones.forEach((m) => mapa.set(m.estado, [...(mapa.get(m.estado) ?? []), m]));
    return mapa;
  }, [mediciones]);
  const conEvidencia = useMemo(() => new Set(evidencias.filter((e) => e.vigente).map((e) => e.id_medicion)), [evidencias]);

  const nDevueltas = porEstado.get('rechazado')?.length ?? 0;
  const nBorradores = porEstado.get('borrador')?.length ?? 0;
  const nAtender = nDevueltas + nBorradores;
  const unidades = catalogo?.unidades;
  const salir = () => { cerrarSesion(); navigate('/'); };

  // En móvil, cerrada = fuera de la pantalla (la abre el botón flotante «Mis mediciones»).
  if (esMovil && !abierto) return null;

  /* ---------- Riel de cristal (escritorio, plegado) ---------- */
  if (!esMovil && !abierto) {
    return (
      <aside className="cap-barra cap-barra--riel" aria-label="Panel del capturista (plegado)">
        <span className="cap-insignia" aria-hidden="true"><ClipboardList size={24} /></span>
        <button type="button" className="cap-riel__btn cap-riel__btn--activo cap-nuevo" onClick={onNueva} disabled={!catalogo} title="Capturar medición" aria-label="Capturar medición"><Plus size={20} /></button>
        <button type="button" className="cap-riel__btn cap-toggle" onClick={() => setAbierto(true)} title="Abrir mi panel" aria-label="Abrir mi panel"><PanelLeftOpen size={20} /></button>
        <div className="cap-pestanas cap-pestanas--riel">
          <button type="button" className="cap-riel__btn" onClick={() => { setPestana('mediciones'); setAbierto(true); }} title={`Indicadores por atender: ${nAtender}`} aria-label={`Mediciones de indicadores por atender: ${nAtender}`}>
            <ChartColumn size={20} />{nAtender > 0 && <span className="cap-riel__n">{nAtender}</span>}
          </button>
          <button type="button" className="cap-riel__btn" onClick={() => { setPestana('capas'); setAbierto(true); }} title={`Capas e instrumentos por atender: ${rechazosCapas.length}`} aria-label={`Capas e instrumentos por atender: ${rechazosCapas.length}`}>
            <Layers size={20} />{rechazosCapas.length > 0 && <span className="cap-riel__n">{rechazosCapas.length}</span>}
          </button>
        </div>
        <span className="cap-riel__sep" />
        <button type="button" className="cap-riel__btn cap-bitacora" onClick={() => navigate('/bitacora')} title="Mi bitácora" aria-label="Mi bitácora"><History size={20} /></button>
        <button type="button" className="cap-riel__btn cap-guia-btn" onClick={onGuia} title="Guía del capturista" aria-label="Guía del capturista"><CircleHelp size={20} /></button>
        <button type="button" className="cap-riel__btn" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={20} /></button>
      </aside>
    );
  }

  /* ---------- Panel abierto ---------- */
  return (
    <aside className="cap-barra cap-barra--abierta" aria-label="Panel del capturista">
      <header className="cap-cab">
        <div className="cap-cab__fila">
          <span className="cap-insignia" aria-hidden="true"><ClipboardList size={24} /></span>
          <span className="cap-cab__id">
            <span className="cap-rol">Capturista</span>
            <strong className="cap-nombre">{sesion?.nombre || 'Sin nombre registrado'}</strong>
          </span>
          <button type="button" className="cap-icono cap-toggle" onClick={() => setAbierto(false)} title={esMovil ? 'Cerrar panel' : 'Plegar panel'} aria-label={esMovil ? 'Cerrar panel' : 'Plegar panel'}><PanelLeftClose size={20} /></button>
        </div>
        <span className="cap-correo">{sesion?.correo}</span>
      </header>

      <div className="cap-accion">
        <button type="button" className="cap-nuevo" onClick={onNueva} disabled={!catalogo}><span className="cap-nuevo__ico" aria-hidden="true"><Plus size={18} /></span> Capturar medición</button>
      </div>

      <div className="cap-cola">
        <div className="cap-pestanas cap-pestanas--carpeta" role="tablist" aria-label="Cola de trabajo">
          <button type="button" role="tab" aria-selected={pestana === 'mediciones'} className={`cap-pestana${pestana === 'mediciones' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('mediciones')}>
            <ChartColumn size={16} aria-hidden="true" className="cap-pestana__ico" /> Indicadores {nAtender > 0 && <span className="cap-pestana__n" aria-label={`${nAtender} por atender`}>{nAtender}</span>}
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'capas'} className={`cap-pestana${pestana === 'capas' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('capas')}>
            <Layers size={16} aria-hidden="true" className="cap-pestana__ico" /> Capas e instrumentos {rechazosCapas.length > 0 && <span className="cap-pestana__n" aria-label={`${rechazosCapas.length} por atender`}>{rechazosCapas.length}</span>}
          </button>
        </div>

        <div className={`cap-carpeta cap-carpeta--${pestana}`} role="tabpanel">
          {pestana === 'mediciones' && (
            <>
              {mediciones.length === 0 && (
                <p className="cap-vacio">Aún no has capturado datos de indicadores. Pulsa <strong>Capturar medición</strong> para empezar.</p>
              )}
              {[...GRUPOS_ACTIVOS, ...GRUPOS_FIN].map((g) => {
                const lista = porEstado.get(g.estado) ?? [];
                return (
                  <section key={g.estado} className={`cap-grupo${g.marca === 'urgente' && lista.length > 0 ? ' cap-grupo--urgente' : ''}`}>
                    <h3 className="cap-grupo__tit"><span>{g.titulo}</span><span className="cap-grupo__n">{lista.length}</span></h3>
                    <p className="cap-grupo__nota">{lista.length === 0 ? 'Ninguna por ahora' : g.nota}</p>
                    {lista.map((m) => (
                      <ItemMedicion key={m.id} m={m} grupo={g} periodosPorId={periodosPorId} unidadesPorId={unidades} activo={seleccion === m.id} sinEvidencia={m.estado === 'borrador' && !conEvidencia.has(m.id)} onSeleccionar={onSeleccionar} />
                    ))}
                  </section>
                );
              })}
            </>
          )}

          {pestana === 'capas' && (
            <>
              <p className="cap-grupo__nota cap-grupo__nota--libre">Cada rechazo de una capa o de un instrumento da <strong>10 días hábiles</strong> para retomarlo o quitarlo de tu lista.</p>
              {rechazosCapas.length === 0 && <p className="cap-vacio">No tienes rechazos de capas ni de instrumentos por atender.</p>}
              {rechazosCapas.map((r) => (
                <button type="button" key={r.id_dictamen} className="cap-item" onClick={onRechazos}>
                  <span className="cap-marca cap-marca--urgente" aria-hidden="true"><CornerUpLeft size={16} /></span>
                  <span className="cap-item__texto">
                    <strong>{r.objeto_id}</strong>
                    <span>{r.objeto_tipo === 'capa' ? 'Capa' : 'Instrumento'} · {r.titulo}</span>
                    <span className="cap-item__estado">
                      {r.estado === 'retomada' ? 'Retomada: falta reenviar' : 'Pendiente de decidir'}
                      {r.dias_habiles_restantes != null && <span className="cap-item__alerta">{r.dias_habiles_restantes} {r.dias_habiles_restantes === 1 ? 'día hábil' : 'días hábiles'}</span>}
                    </span>
                  </span>
                </button>
              ))}
              <button type="button" className="cap-ver-todo" onClick={onRechazos}>Ver detalle y decidir</button>
            </>
          )}
        </div>
      </div>

      <footer className="cap-pie">
        <button type="button" className="cap-enlace cap-bitacora" onClick={() => navigate('/bitacora')}><span className="cap-enlace__ico" aria-hidden="true"><History size={17} /></span> Mi bitácora</button>
        <button type="button" className="cap-enlace cap-guia-btn" onClick={onGuia}><span className="cap-enlace__ico" aria-hidden="true"><CircleHelp size={17} /></span> Guía del capturista</button>
        <button type="button" className="cap-enlace" onClick={salir}><span className="cap-enlace__ico" aria-hidden="true"><LogOut size={17} /></span> Cerrar sesión</button>
      </footer>
    </aside>
  );
}
