import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, LogOut, PanelLeftOpen, PanelLeftClose, ShieldCheck, Library, ClipboardCheck, RefreshCw, Hourglass, BadgeCheck,
  CornerUpLeft, KeyRound, ArrowRight, CircleHelp, FileText, ChartColumn,
} from 'lucide-react';
import { cerrarSesion } from '../../../lib/sesim/sesion';
import { Fila } from '../capturista/CapturistaSidebar';
import '../capturista/Capturista.css';
import PanelInstrumentos from './PanelInstrumentos';
import PanelIndicadores from './PanelIndicadores';
import './AdminPerfil.css';

/**
 * Panel del Administrador y del Administrador Titular (mismo diseño que el del capturista, en la paleta verde).
 *  · «Por dictaminar»: lo que espera a la administración, de lo más urgente a lo menos:
 *      1) actualizaciones propuestas a capas vigentes, 2) capas nuevas en revisión, 3) capas validadas que faltan publicar.
 *  · «Catálogo»: todas las capas por sus tres categorías; se encienden en el mapa y desde cada una se abre su dictamen.
 *  · Solo el Titular: usuarios e invitaciones.
 * Todo sale del servidor; el panel no guarda nada por su cuenta.
 */
const GRUPOS = [
  { id: 'propuestas', titulo: 'Actualizaciones propuestas', Icono: RefreshCw, nota: 'Una capa vigente con un archivo nuevo esperando tu aprobación. La capa actual sigue publicada.' },
  { id: 'revision', titulo: 'Capas en revisión', Icono: Hourglass, nota: 'Capas nuevas enviadas por el capturista: valídalas o devuélvelas con el motivo.' },
  { id: 'validadas', titulo: 'Validadas, falta publicar', Icono: BadgeCheck, nota: 'Ya son de uso interno. Para publicarlas su restricción de uso debe ser «pública».' },
];

export function clasificarPendientes(capas) {
  const g = { propuestas: [], revision: [], validadas: [] };
  capas.forEach((c) => {
    if (c.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente') g.propuestas.push(c);
    else if (c.estatus === 'revision') g.revision.push(c);
    else if (c.estatus === 'vigente_admin') g.validadas.push(c);
  });
  return g;
}

export default function AdministradorSidebar({
  abierto, setAbierto, esMovil, sesion, catalogo, arbol, activas, onAlternarCapa, capasTodas = [],
  nRechazos = 0, onDictaminar, onRechazos, onInvitaciones, onGuia, onAbrirCapas,
}) {
  const navigate = useNavigate();
  const titular = sesion?.perfil === 'administrador_titular';
  const [pestana, setPestana] = useState('dictaminar');
  const pendientes = useMemo(() => clasificarPendientes(capasTodas), [capasTodas]);
  const nPend = pendientes.propuestas.length + pendientes.revision.length + pendientes.validadas.length;
  const salir = () => { cerrarSesion(); navigate('/'); };
  if (esMovil && !abierto) return null;

  if (!esMovil && !abierto) {
    return (
      <aside className="cap-barra cap-barra--riel" aria-label="Panel de la administración (plegado)">
        <span className="cap-insignia" aria-hidden="true"><ShieldCheck size={24} /></span>
        <button type="button" className="cap-riel__btn cap-riel__btn--activo" onClick={() => { setPestana('dictaminar'); setAbierto(true); }} title={`Por dictaminar: ${nPend}`} aria-label={`Por dictaminar, ${nPend}`}>
          <ClipboardCheck size={20} />{nPend > 0 && <span className="cap-riel__n">{nPend}</span>}
        </button>
        <button type="button" className="cap-riel__btn" onClick={onRechazos} title="Devoluciones y plazos" aria-label="Devoluciones y plazos"><CornerUpLeft size={20} />{nRechazos > 0 && <span className="cap-riel__n">{nRechazos}</span>}</button>
        {titular && <button type="button" className="cap-riel__btn" onClick={onInvitaciones} title="Usuarios e invitaciones" aria-label="Usuarios e invitaciones"><KeyRound size={20} /></button>}
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
    <aside className="cap-barra cap-barra--abierta" aria-label="Panel de la administración">
      <header className="cap-cab cap-cab--compacta">
        <div className="cap-cab__fila">
          <span className="cap-insignia" aria-hidden="true"><ShieldCheck size={22} /></span>
          <span className="cap-cab__id">
            <span className="cap-rol">{titular ? 'Administrador Titular' : 'Administrador'}</span>
            <strong className="cap-nombre">{sesion?.nombre || 'Sin nombre registrado'}</strong>
          </span>
          <button type="button" className="cap-icono cap-toggle" onClick={() => setAbierto(false)} title={esMovil ? 'Cerrar panel' : 'Plegar panel'} aria-label={esMovil ? 'Cerrar panel' : 'Plegar panel'}><PanelLeftClose size={20} /></button>
        </div>
      </header>

      <div className="adm-accesos" role="group" aria-label="Accesos">
        <button type="button" className="adm-acceso" onClick={onRechazos} title="Lo que devolviste y los 10 días hábiles de quien debe corregirlo; también lo que te devolvieron a ti">
          <CornerUpLeft size={16} aria-hidden="true" /> Devoluciones y plazos{nRechazos > 0 && <span className="adm-acceso__n">{nRechazos}</span>}
        </button>
        {titular && (
          <button type="button" className="adm-acceso" onClick={onInvitaciones} title="Invita, da de baja o reactiva cuentas (solo el Titular)">
            <KeyRound size={16} aria-hidden="true" /> Usuarios
          </button>
        )}
      </div>

      <div className="cap-cola">
        <div className="cap-pestanas cap-pestanas--carpeta adm-cuatro" role="tablist" aria-label="Panel de trabajo">
          <button type="button" role="tab" aria-selected={pestana === 'dictaminar'} className={`cap-pestana${pestana === 'dictaminar' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('dictaminar')}>
            <ClipboardCheck size={16} aria-hidden="true" className="cap-pestana__ico" /> Dictaminar {nPend > 0 && <span className="cap-pestana__n" aria-label={`${nPend} pendientes`}>{nPend}</span>}
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'instrumentos'} className={`cap-pestana${pestana === 'instrumentos' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('instrumentos')}>
            <FileText size={16} aria-hidden="true" className="cap-pestana__ico" /> Instrumentos
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'indicadores'} className={`cap-pestana${pestana === 'indicadores' ? ' cap-pestana--activa' : ''}`} onClick={() => setPestana('indicadores')}>
            <ChartColumn size={16} aria-hidden="true" className="cap-pestana__ico" /> Indicadores
          </button>
        </div>

        <div className={`cap-carpeta cap-carpeta--mesa`} role="tabpanel">
          {pestana === 'instrumentos' && <PanelInstrumentos titular={titular} />}
          {pestana === 'indicadores' && <PanelIndicadores />}
          {pestana === 'dictaminar' && (
            <div className="cap-mesa">
              <p className="cap-ayuda">Lo que espera a la administración. Nada se aprueba solo: cada paso queda en la bitácora con tu nombre.</p>
              {nPend === 0 && <p className="cap-vacio">No hay nada por dictaminar. Cuando el equipo envíe una capa o proponga una actualización aparecerá aquí.</p>}
              {GRUPOS.map(({ id, titulo, Icono, nota }) => pendientes[id].length > 0 && (
                <section key={id} className="adm-grupo" aria-label={titulo}>
                  <h3 className="adm-grupo__tit">{titulo} <span>{pendientes[id].length}</span></h3>
                  <p className="adm-grupo__nota">{nota}</p>
                  {pendientes[id].map((c) => (
                    <Fila key={c.id} Icono={Icono} tipo="Capa" titulo={c.id} detalle={c.titulo}
                      estado={id === 'propuestas' ? 'Propuesta pendiente' : id === 'revision' ? 'En revisión' : 'Validada'} onClick={() => onDictaminar(c.id)} />
                  ))}
                </section>
              ))}
              <button type="button" className="cap-ver-todo" onClick={onAbrirCapas}>Abrir las capas del mapa <ArrowRight size={13} aria-hidden="true" /></button>
            </div>
          )}
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
