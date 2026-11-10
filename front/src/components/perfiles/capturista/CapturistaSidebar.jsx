import { CAPTURA_MEDICIONES } from './candados';
import { CATEGORIAS } from './categorias';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, LogOut, CircleHelp, CornerUpLeft, PencilLine, Hourglass, ClipboardList, PanelLeftOpen, PanelLeftClose,
  ShieldCheck, Paperclip, Library, Briefcase, UploadCloud, RefreshCw, Search, ChevronRight, ChartColumn, ArrowRight,
} from 'lucide-react';
import { cerrarSesion } from '../../../lib/sesim/sesion';
import { ESTATUS_CAPA } from '../../../lib/sesim/capas';
import { nombreUnidad } from '../comun/formato';
import './Capturista.css';

/**
 * Panel del Capturista.
 *
 *  · ¿Qué quieres hacer? Tres acciones, cada una con su descripción: Subir capa · Actualizar capa · Capturar medición.
 *  · «Catálogo»: todas las capas por sus tres categorías (Mapa base · Diagnóstico · Indicadores); se encienden en el
 *    mapa y desde cada una se puede subir una actualización.
 *  · «Mi mesa de trabajo»: lo que subes o capturas pasa por estados; se elige el estado y se ve qué es y qué sigue.
 *
 * El ESTADO no se distingue por color: cada uno tiene ícono y texto, y la urgencia se expresa con el ORDEN.
 */

const ESTADOS = [
  { id: 'devuelta', titulo: 'Devueltas', Icono: CornerUpLeft, que: 'La administración pidió correcciones. Tienes 10 días hábiles para retomarlas o quitarlas de tu lista.', sigue: 'Corrige y reenvía.' },
  { id: 'sin_enviar', titulo: 'Sin enviar', Icono: PencilLine, que: 'Las guardaste como borrador y la administración todavía no las ve.', sigue: 'Termínalas y envíalas a revisión.' },
  { id: 'revision', titulo: 'En revisión', Icono: Hourglass, que: 'Ya las enviaste. La administración las está revisando; mientras tanto no se pueden editar.', sigue: 'Esperar el dictamen.' },
  { id: 'aprobada', titulo: 'Aprobadas', Icono: ShieldCheck, que: 'Validadas (uso interno) o publicadas (visibles al público). Ya forman parte del sistema.', sigue: 'Nada: quedan en el historial.' },
];

export function Fila({ Icono, tipo, titulo, detalle, estado, alerta, activo, onClick }) {
  const cuerpo = (
    <>
      <span className="cap-marca" aria-hidden="true"><Icono size={16} /></span>
      <span className="cap-item__texto">
        <span className="cap-tipo">{tipo}</span>
        <strong>{titulo}</strong>
        <span>{detalle}</span>
        <span className="cap-item__estado">{estado}{alerta && <span className="cap-item__alerta">{alerta}</span>}</span>
      </span>
      {onClick && <ArrowRight size={15} aria-hidden="true" className="cap-item__ir" />}
    </>
  );
  return onClick
    ? <button type="button" className={`cap-item${activo ? ' cap-item--activo' : ''}`} onClick={onClick} aria-current={activo ? 'true' : undefined}>{cuerpo}</button>
    : <div className="cap-item cap-item--fijo">{cuerpo}</div>;
}

/** Pestaña «Catálogo»: las capas por sus tres categorías. */
export function Catalogo({ arbol, activas, onAlternarCapa, onActualizarCapa, AccionIcono = RefreshCw, accionTitulo = (id) => `Actualizar la capa ${id}`, ayudaAccion = 'pulsa el botón ↻ para subir su versión nueva' }) {
  const [cat, setCat] = useState('mapa_base');
  const [q, setQ] = useState('');
  const [abiertos, setAbiertos] = useState(() => new Set());
  const consulta = q.trim().toLowerCase();
  if (!arbol) return <p className="cap-vacio">Cargando el catálogo de capas…</p>;
  const actual = CATEGORIAS.find((c) => c.id === cat);
  const categoria = arbol.categorias.find((c) => c.id === cat);
  const coincide = (c) => !consulta || c.id.toLowerCase().includes(consulta) || c.titulo.toLowerCase().includes(consulta);
  const grupos = (categoria?.grupos ?? []).map((g) => ({ ...g, capas: g.capas.filter(coincide) })).filter((g) => g.capas.length);
  const alternar = (id) => setAbiertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="cap-explorar">
      <div className="cap-segmentos" role="tablist" aria-label="Categoría de capas">
        {CATEGORIAS.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'cap-segmento cap-segmento--act' : 'cap-segmento'} onClick={() => setCat(c.id)}><c.Icono size={14} aria-hidden="true" /> {c.titulo}</button>
        ))}
      </div>
      <p className="cap-ayuda">{actual.ayuda} Enciende una capa para verla en el mapa o {ayudaAccion}.</p>
      <label className="cap-buscador">
        <Search size={16} aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o clave" aria-label="Buscar capa por nombre o clave" />
      </label>
      {grupos.length === 0 && <p className="cap-vacio">No hay capas que coincidan.</p>}
      {grupos.map((g) => {
        const abierto = consulta ? true : abiertos.has(g.id);
        const nOn = g.capas.filter((c) => activas.has(c.id)).length;
        return (
          <div key={g.id} className="cap-gr">
            <button type="button" className="cap-gr__cab" aria-expanded={abierto} onClick={() => alternar(g.id)}>
              <ChevronRight size={15} aria-hidden="true" style={{ transform: abierto ? 'rotate(90deg)' : 'none' }} />
              <span>{g.etiqueta}</span>
              <span className="cap-gr__n">{nOn > 0 ? `${nOn}/` : ''}{g.capas.length}</span>
            </button>
            {abierto && g.capas.map((c) => (
              <div key={c.id} className="cap-capa">
                <label className="cap-capa__sel">
                  <input type="checkbox" role="switch" checked={activas.has(c.id)} onChange={() => onAlternarCapa(c.id)} />
                  <span className="cap-capa__txt">
                    <strong>{c.titulo}</strong>
                    <small>{c.id}{c.estatus !== 'vigente_publico' && <span className="cap-capa__est"> · {ESTATUS_CAPA[c.estatus] ?? c.estatus}</span>}</small>
                  </span>
                </label>
                <button type="button" className="cap-capa__act" onClick={() => onActualizarCapa(c.id)} title={accionTitulo(c.id)} aria-label={accionTitulo(c.id)}><AccionIcono size={15} aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Pestaña «Mi mesa de trabajo»: se elige el estado y se ve qué significa y qué sigue. */
function Mesa({ lista, onAbrirRechazos }) {
  const [elegido, setElegido] = useState(null);
  const cuenta = (id) => lista[id].length;
  const primero = ESTADOS.find((e) => cuenta(e.id) > 0)?.id ?? 'devuelta';
  const sel = elegido ?? primero;
  const est = ESTADOS.find((e) => e.id === sel);
  return (
    <>
      <p className="cap-ayuda">Todo lo que subes pasa por estos estados. Elige uno para ver qué significa y qué sigue.</p>
      <div className="cap-estados" role="tablist" aria-label="Estado del trabajo">
        {ESTADOS.map(({ id, titulo, Icono }) => (
          <button key={id} type="button" role="tab" aria-selected={sel === id} className={`cap-estadobtn${sel === id ? ' cap-estadobtn--act' : ''}${id === 'devuelta' && cuenta(id) > 0 ? ' cap-estadobtn--urgente' : ''}`} onClick={() => setElegido(id)}>
            <Icono size={16} aria-hidden="true" />
            <span className="cap-estadobtn__n">{cuenta(id)}</span>
            <span className="cap-estadobtn__t">{titulo}</span>
          </button>
        ))}
      </div>
      <div className="cap-estadonota" role="tabpanel">
        <p><b>{est.titulo}.</b> {est.que}</p>
        <p className="cap-estadonota__sigue"><ArrowRight size={13} aria-hidden="true" /> {est.sigue}</p>
      </div>
      {lista[sel].length === 0 && <p className="cap-vacio">No tienes nada en «{est.titulo.toLowerCase()}».</p>}
      {lista[sel].map((f) => <Fila key={f.clave} {...f} />)}
      {sel === 'devuelta' && cuenta('devuelta') > 0 && <button type="button" className="cap-ver-todo" onClick={onAbrirRechazos}>Abrir la pantalla de devoluciones</button>}
    </>
  );
}

export default function CapturistaSidebar({
  abierto, setAbierto, esMovil, sesion, catalogo, mediciones, periodosPorId, evidencias = [], seleccion,
  rechazosCapas = [], capasMias = [], arbol, activas, onAlternarCapa,
  onSubirCapa, onActualizarCapa, onNueva, onSeleccionar, onRechazos, onGuia, pestanaInicial = 'catalogo',
}) {
  const navigate = useNavigate();
  const [pestana, setPestana] = useState(pestanaInicial);
  const unidades = catalogo?.unidades;
  const conEvidencia = useMemo(() => new Set(evidencias.filter((e) => e.vigente).map((e) => e.id_medicion)), [evidencias]);

  // Capas y mediciones se reparten en los mismos estados.
  const lista = useMemo(() => {
    const L = { devuelta: [], sin_enviar: [], revision: [], aprobada: [] };
    rechazosCapas.forEach((r) => L.devuelta.push({
      clave: `r-${r.id_dictamen}`, Icono: CornerUpLeft, tipo: r.objeto_tipo === 'capa' ? 'Capa' : r.objeto_tipo === 'medicion' ? 'Medición' : 'Instrumento', titulo: r.objeto_id, detalle: r.titulo,
      estado: r.estado === 'retomada' ? 'Retomada: falta reenviar' : 'Pendiente de decidir', alerta: r.dias_habiles_restantes != null ? `${r.dias_habiles_restantes} ${r.dias_habiles_restantes === 1 ? 'día hábil' : 'días hábiles'}` : null, onClick: onRechazos,
    }));
    capasMias.filter((c) => c.estatus === 'borrador').forEach((c) => L.sin_enviar.push({ clave: `c-${c.id}`, Icono: PencilLine, tipo: 'Capa', titulo: c.id, detalle: c.titulo, estado: 'Borrador · continuar', onClick: () => onActualizarCapa(c.id) }));
    capasMias.filter((c) => c.estatus === 'revision').forEach((c) => L.revision.push({ clave: `c-${c.id}`, Icono: Hourglass, tipo: 'Capa', titulo: c.id, detalle: c.titulo, estado: 'En revisión' }));
    const med = (m, Icono, estado, extra = {}) => ({ clave: `m-${m.id}`, Icono, tipo: 'Medición', titulo: `${m.id_indicador} · ${periodosPorId.get(m.id_periodo)?.etiqueta ?? '—'}`, detalle: nombreUnidad(unidades, m.id_unidad), estado, activo: seleccion === m.id, onClick: () => onSeleccionar(m.id), ...extra });
    mediciones.forEach((m) => {
      if (m.estado === 'rechazado') L.devuelta.push(med(m, CornerUpLeft, 'Devuelta · corregir'));
      else if (m.estado === 'borrador') L.sin_enviar.push(med(m, PencilLine, 'Borrador', !conEvidencia.has(m.id) ? { alerta: <><Paperclip size={12} aria-hidden="true" /> Falta evidencia</> } : {}));
      else if (m.estado === 'revision') L.revision.push(med(m, Hourglass, 'En revisión'));
      else L.aprobada.push(med(m, ShieldCheck, m.estado === 'vigente_publico' ? 'Publicada' : 'Validada'));
    });
    return L;
  }, [rechazosCapas, capasMias, mediciones, periodosPorId, unidades, conEvidencia, seleccion, onRechazos, onActualizarCapa, onSeleccionar]);
  const nAtender = lista.devuelta.length + lista.sin_enviar.length;
  const salir = () => { cerrarSesion(); navigate('/'); };

  if (esMovil && !abierto) return null;

  /* ---------- Riel (escritorio, plegado) ---------- */
  if (!esMovil && !abierto) {
    return (
      <aside className="cap-barra cap-barra--riel" aria-label="Panel del capturista (plegado)">
        <span className="cap-insignia" aria-hidden="true"><ClipboardList size={24} /></span>
        <button type="button" className="cap-riel__btn cap-riel__btn--activo cap-subir" onClick={() => onSubirCapa()} disabled={!catalogo} title="Subir capa" aria-label="Subir capa"><UploadCloud size={20} /></button>
        <button type="button" className="cap-riel__btn cap-actualizar" onClick={() => onActualizarCapa()} disabled={!catalogo} title="Actualizar capa" aria-label="Actualizar capa"><RefreshCw size={20} /></button>
        {CAPTURA_MEDICIONES && <button type="button" className="cap-riel__btn cap-nuevo-med" onClick={onNueva} disabled={!catalogo} title="Capturar medición" aria-label="Capturar medición"><ChartColumn size={20} /></button>}
        <button type="button" className="cap-riel__btn cap-toggle" onClick={() => setAbierto(true)} title="Abrir mi panel" aria-label="Abrir mi panel"><PanelLeftOpen size={20} /></button>
        <div className="cap-pestanas cap-pestanas--riel">
          <button type="button" className="cap-riel__btn" onClick={() => { setPestana('catalogo'); setAbierto(true); }} title="Catálogo de capas" aria-label="Catálogo de capas"><Library size={20} /></button>
          <button type="button" className="cap-riel__btn" onClick={() => { setPestana('mesa'); setAbierto(true); }} title={`Mi mesa de trabajo · por atender: ${nAtender}`} aria-label={`Mi mesa de trabajo, por atender: ${nAtender}`}>
            <Briefcase size={20} />{nAtender > 0 && <span className="cap-riel__n">{nAtender}</span>}
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
      <header className="cap-cab cap-cab--compacta">
        <div className="cap-cab__fila">
          <span className="cap-insignia" aria-hidden="true"><ClipboardList size={22} /></span>
          <span className="cap-cab__id">
            <span className="cap-rol">Capturista</span>
            <strong className="cap-nombre">{sesion?.nombre || 'Sin nombre registrado'}</strong>
          </span>
          <button type="button" className="cap-icono cap-toggle" onClick={() => setAbierto(false)} title={esMovil ? 'Cerrar panel' : 'Plegar panel'} aria-label={esMovil ? 'Cerrar panel' : 'Plegar panel'}><PanelLeftClose size={20} /></button>
        </div>
      </header>

      <div className="cap-hacer">
        <h2 className="cap-hacer__tit">¿Qué quieres hacer?</h2>
        <button type="button" className="cap-accion-card cap-accion-card--principal cap-subir" onClick={() => onSubirCapa()} disabled={!catalogo}>
          <UploadCloud size={20} aria-hidden="true" />
          <span><strong>Subir capa</strong><small>Agrega una capa a un grupo o indicador que ya existe.</small></span>
        </button>
        <button type="button" className="cap-accion-card cap-actualizar" onClick={() => onActualizarCapa()} disabled={!catalogo}>
          <RefreshCw size={20} aria-hidden="true" />
          <span><strong>Actualizar capa</strong><small>Sube la versión nueva de una capa y justifica el cambio.</small></span>
        </button>
        {CAPTURA_MEDICIONES && (
        <button type="button" className="cap-accion-card cap-nuevo-med" onClick={onNueva} disabled={!catalogo}>
          <ChartColumn size={20} aria-hidden="true" />
          <span><strong>Capturar medición</strong><small>Registra el valor de un indicador por municipio y periodo.</small></span>
        </button>
        )}
      </div>

      <div className="cap-cola">
        <div className="cap-pestanas cap-pestanas--carpeta" role="tablist" aria-label="Panel de trabajo">
          <button type="button" role="tab" aria-selected={pestana === 'catalogo'} className={`cap-pestana${pestana === 'catalogo' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('catalogo')}>
            <Library size={16} aria-hidden="true" className="cap-pestana__ico" /> Catálogo
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'mesa'} className={`cap-pestana${pestana === 'mesa' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('mesa')}>
            <Briefcase size={16} aria-hidden="true" className="cap-pestana__ico" /> Mi mesa de trabajo {nAtender > 0 && <span className="cap-pestana__n" aria-label={`${nAtender} por atender`}>{nAtender}</span>}
          </button>
        </div>

        <div className={`cap-carpeta cap-carpeta--${pestana === 'catalogo' ? 'explorar' : 'mesa'}`} role="tabpanel">
          {pestana === 'catalogo' && <Catalogo arbol={arbol} activas={activas} onAlternarCapa={onAlternarCapa} onActualizarCapa={onActualizarCapa} />}
          {pestana === 'mesa' && <div className="cap-mesa"><Mesa lista={lista} onAbrirRechazos={onRechazos} /></div>}
        </div>
      </div>

      <footer className="cap-pie cap-pie--fila">
        <button type="button" className="cap-mini cap-bitacora" onClick={() => navigate('/bitacora')}><History size={16} aria-hidden="true" /> Bitácora</button>
        <button type="button" className="cap-mini cap-guia-btn" onClick={onGuia}><CircleHelp size={16} aria-hidden="true" /> Guía</button>
        <button type="button" className="cap-mini" onClick={salir}><LogOut size={16} aria-hidden="true" /> Salir</button>
      </footer>
    </aside>
  );
}
