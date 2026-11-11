import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, LogOut, Route, PanelLeftOpen, PanelLeftClose, Eye, Library, ArrowRight, CircleHelp, ChartColumn,
  Layers, RefreshCw, Hourglass, BadgeCheck, Globe2, FileEdit, FileText, Lock,
} from 'lucide-react';
import { cerrarSesion } from '../../../lib/sesim/sesion';
import { backend } from '../../../lib/sesim/supabase';
import { Fila } from '../capturista/CapturistaSidebar';
import '../capturista/Capturista.css';
import '../administradora/AdminPerfil.css';
import '../administradora/VisorCampos.css';
import './Auditor.css';

/**
 * Panel del Auditor: el mismo diseño del Capturista y de la administración, en la paleta gris (perfiles-tema.css).
 * Solo observa: ninguna acción cambia datos. Las devoluciones y sus plazos se consultan en la Bitácora (filtro «Devoluciones»). Tres pestañas (Capas, Instrumentos, Indicadores) y, en cada una,
 * dos categorías: «Público» (lo que ya ve la ciudadanía) y «Uso interno» (todo lo demás, con su estado en cada fila).
 */
const ESTATUS = { borrador: 'Borrador', revision: 'En revisión', vigente_admin: 'Uso interno (validada)', vigente_publico: 'Publicada' };
const ORDEN_ESTATUS = ['revision', 'vigente_admin', 'borrador'];

function Segmento({ valor, onCambio, nPublico, nInterno }) {
  return (
    <div className="aud-seg" role="group" aria-label="Público o uso interno">
      <button type="button" aria-pressed={valor === 'publico'} onClick={() => onCambio('publico')}><Globe2 size={14} aria-hidden="true" /> Público <span>{nPublico}</span></button>
      <button type="button" aria-pressed={valor === 'interno'} onClick={() => onCambio('interno')}><Lock size={14} aria-hidden="true" /> Uso interno <span>{nInterno}</span></button>
    </div>
  );
}

function PanelCapas({ capasTodas, onVerCapa, onAbrirCapas }) {
  const [vista, setVista] = useState('publico');
  const publicas = useMemo(() => capasTodas.filter((c) => c.estatus === 'vigente_publico'), [capasTodas]);
  const internas = useMemo(() => capasTodas.filter((c) => c.estatus !== 'vigente_publico').sort((a, b) => {
    const pa = a.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente' ? -1 : ORDEN_ESTATUS.indexOf(a.estatus);
    const pb = b.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente' ? -1 : ORDEN_ESTATUS.indexOf(b.estatus);
    return pa - pb || a.id.localeCompare(b.id, 'es');
  }), [capasTodas]);
  const lista = vista === 'publico' ? publicas : internas;
  return (
    <div className="cap-mesa">
      <p className="cap-ayuda">Tú observas: no validas, publicas ni devuelves nada.</p>
      <Segmento valor={vista} onCambio={setVista} nPublico={publicas.length} nInterno={internas.length} />
      <p className="aud-seg-nota">{vista === 'publico' ? 'Lo que ya ve la ciudadanía en el geovisor.' : 'Todo lo que aún no es público: en revisión, validado para uso interno, con actualización propuesta o en borrador.'}</p>
      {capasTodas.length === 0 && <p className="cap-vacio">Cargando las capas…</p>}
      {lista.map((c) => {
        const prop = c.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente';
        const Icono = prop ? RefreshCw : c.estatus === 'vigente_publico' ? Globe2 : c.estatus === 'revision' ? Hourglass : c.estatus === 'vigente_admin' ? BadgeCheck : FileEdit;
        return <Fila key={c.id} Icono={Icono} tipo="Capa" titulo={c.id} detalle={c.titulo} estado={prop ? 'Actualización propuesta' : ESTATUS[c.estatus] ?? c.estatus} onClick={() => onVerCapa(c.id)} />;
      })}
      <button type="button" className="cap-ver-todo" onClick={onAbrirCapas}>Abrir las capas del mapa <ArrowRight size={13} aria-hidden="true" /></button>
    </div>
  );
}

function PanelTabla({ tabla, query, Icono, tipo, esPublico, titulo, detalle, estado, ayuda, notaPublico, notaInterno, vacio }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState('publico');
  const [q, setQ] = useState('');
  useEffect(() => {
    backend.leer(tabla, { query }).then(setFilas).catch((e) => setError(e.message));
  }, [tabla, query]);
  const buscadas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (filas ?? []).filter((f) => !t || `${titulo(f)} ${detalle(f)}`.toLowerCase().includes(t));
  }, [filas, q, titulo, detalle]);
  const publicas = buscadas.filter(esPublico);
  const internas = buscadas.filter((f) => !esPublico(f));
  const lista = vista === 'publico' ? publicas : internas;
  return (
    <div className="cap-mesa">
      <p className="cap-ayuda">{ayuda}</p>
      <Segmento valor={vista} onCambio={setVista} nPublico={publicas.length} nInterno={internas.length} />
      <p className="aud-seg-nota">{vista === 'publico' ? notaPublico : notaInterno}</p>
      <input type="search" className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar" />
      {error && <p className="cap-vacio">No se pudo leer: {error}</p>}
      {!filas && !error && <p className="cap-vacio">Cargando…</p>}
      {filas && lista.length === 0 && <p className="cap-vacio">{vacio}</p>}
      {lista.map((f) => <Fila key={f.id} Icono={Icono} tipo={tipo} titulo={titulo(f)} detalle={detalle(f)} estado={estado(f)} />)}
    </div>
  );
}

const PanelInstrumentos = () => (
  <PanelTabla tabla="instrumento_origen" query="select=*&order=id" Icono={FileText} tipo="Instrumento"
    esPublico={(i) => i.estatus === 'vigente_publico' && i.activo !== false}
    titulo={(i) => i.clave || i.id} detalle={(i) => i.nombre}
    estado={(i) => `${ESTATUS[i.estatus] ?? i.estatus}${i.activo === false ? ' · de baja' : ''}`}
    ayuda="Leyes, planes y programas de los que salen los indicadores."
    notaPublico="Instrumentos publicados." notaInterno="En borrador, en revisión, validados o dados de baja."
    vacio="No hay instrumentos en esta categoría." />
);

const PanelIndicadores = () => (
  <PanelTabla tabla="indicador" query="select=id,nombre,estatus_aprobado,activo&order=id" Icono={ChartColumn} tipo="Indicador"
    esPublico={(i) => i.estatus_aprobado && i.activo !== false}
    titulo={(i) => i.id} detalle={(i) => i.nombre}
    estado={(i) => (i.activo === false ? 'De baja' : i.estatus_aprobado ? 'Aprobado' : 'Sin aprobar')}
    ayuda="Catálogo de indicadores. Los aprueba el Titular."
    notaPublico="Aprobados y activos: se miden y se muestran." notaInterno="Sin aprobar o dados de baja."
    vacio="No hay indicadores en esta categoría." />
);

export default function AuditorSidebar({
  abierto, setAbierto, esMovil, sesion, capasTodas = [], onVerCapa, onGuia, onAbrirCapas,
}) {
  const navigate = useNavigate();
  const [pestana, setPestana] = useState('capas');
  const salir = () => { cerrarSesion(); navigate('/'); };
  if (esMovil && !abierto) return null;

  if (!esMovil && !abierto) {
    return (
      <aside className="cap-barra cap-barra--riel" aria-label="Panel de auditoría (plegado)">
        <span className="cap-insignia" aria-hidden="true"><Eye size={24} /></span>
        <button type="button" className="cap-riel__btn cap-riel__btn--activo" onClick={() => { setPestana('capas'); setAbierto(true); }} title="Capas" aria-label="Capas"><Layers size={20} /></button>
        <button type="button" className="cap-riel__btn" onClick={() => navigate('/trazabilidad')} title="Trazabilidad" aria-label="Trazabilidad"><Route size={20} /></button>
        <button type="button" className="cap-riel__btn cap-toggle" onClick={() => setAbierto(true)} title="Abrir mi panel" aria-label="Abrir mi panel"><PanelLeftOpen size={20} /></button>
        <div className="cap-pestanas cap-pestanas--riel">
          <button type="button" className="cap-riel__btn" onClick={onAbrirCapas} title="Capas del mapa" aria-label="Capas del mapa"><Library size={20} /></button>
          <button type="button" className="cap-riel__btn" onClick={() => { setPestana('instrumentos'); setAbierto(true); }} title="Instrumentos" aria-label="Instrumentos"><FileText size={20} /></button>
          <button type="button" className="cap-riel__btn" onClick={() => { setPestana('indicadores'); setAbierto(true); }} title="Indicadores" aria-label="Indicadores"><ChartColumn size={20} /></button>
        </div>
        <span className="cap-riel__sep" />
        <button type="button" className="cap-riel__btn cap-bitacora" onClick={() => navigate('/bitacora')} title="Bitácora" aria-label="Bitácora"><History size={20} /></button>
        {onGuia && <button type="button" className="cap-riel__btn cap-guia-btn" onClick={onGuia} title="Guía" aria-label="Guía"><CircleHelp size={20} /></button>}
        <button type="button" className="cap-riel__btn" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={20} /></button>
      </aside>
    );
  }

  return (
    <aside className="cap-barra cap-barra--abierta" aria-label="Panel de auditoría">
      <header className="cap-cab cap-cab--compacta">
        <div className="cap-cab__fila">
          <span className="cap-insignia" aria-hidden="true"><Eye size={22} /></span>
          <span className="cap-cab__id">
            <span className="cap-rol">Auditor</span>
            <strong className="cap-nombre">{sesion?.nombre || 'Sin nombre registrado'}</strong>
          </span>
          <button type="button" className="cap-icono cap-toggle" onClick={() => setAbierto(false)} title={esMovil ? 'Cerrar panel' : 'Plegar panel'} aria-label={esMovil ? 'Cerrar panel' : 'Plegar panel'}><PanelLeftClose size={20} /></button>
        </div>
      </header>

      <div className="adm-accesos" role="group" aria-label="Accesos">
        <button type="button" className="adm-acceso" onClick={() => navigate('/trazabilidad')} title="La vida de una capa, un instrumento o un indicador, de principio a fin">
          <Route size={16} aria-hidden="true" /> Trazabilidad
        </button>
      </div>

      <div className="cap-cola">
        <div className="cap-pestanas cap-pestanas--carpeta adm-cuatro" role="tablist" aria-label="Panel de consulta">
          <button type="button" role="tab" aria-selected={pestana === 'capas'} className={`cap-pestana${pestana === 'capas' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('capas')}>
            <Layers size={16} aria-hidden="true" className="cap-pestana__ico" /> Capas
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'instrumentos'} className={`cap-pestana${pestana === 'instrumentos' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('instrumentos')}>
            <FileText size={16} aria-hidden="true" className="cap-pestana__ico" /> Instrumentos
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'indicadores'} className={`cap-pestana${pestana === 'indicadores' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('indicadores')}>
            <ChartColumn size={16} aria-hidden="true" className="cap-pestana__ico" /> Indicadores
          </button>
        </div>

        <div className="cap-carpeta cap-carpeta--mesa" role="tabpanel">
          {pestana === 'capas' && <PanelCapas capasTodas={capasTodas} onVerCapa={onVerCapa} onAbrirCapas={onAbrirCapas} />}
          {pestana === 'instrumentos' && <PanelInstrumentos />}
          {pestana === 'indicadores' && <PanelIndicadores />}
        </div>
      </div>

      <footer className="cap-pie cap-pie--fila">
        <button type="button" className="cap-mini cap-bitacora" onClick={() => navigate('/bitacora')}><History size={16} aria-hidden="true" /> Bitácora</button>
        {onGuia && <button type="button" className="cap-mini cap-guia-btn" onClick={onGuia}><CircleHelp size={16} aria-hidden="true" /> Guía</button>}
        <button type="button" className="cap-mini" onClick={salir}><LogOut size={16} aria-hidden="true" /> Salir</button>
      </footer>
    </aside>
  );
}
