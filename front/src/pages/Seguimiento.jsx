import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, ListChecks, FolderKanban, X, Activity } from 'lucide-react';
import { useCatalogo } from '../lib/sesim/useCatalogo';
import { useFiltros, filtrosActivos } from '../lib/sesim/filtrosGlobales';
import { RUTAS } from '../lib/rutas';
import './Seguimiento.css';

const SUBMODULOS = [
  { a: RUTAS.indicadores, icono: ListChecks, titulo: 'Indicadores', texto: 'Fichas, trazabilidad y semáforo' },
  { a: RUTAS.tablero, icono: BarChart3, titulo: 'Tablero', texto: 'KPI, mapa, gráficas y comparativos' },
  { a: RUTAS.proyectos, icono: FolderKanban, titulo: 'Proyectos y reportes', texto: 'Cartera, series y datos integrados' },
];

/** Resumen legible del corte compartido por las tres vistas, con acceso directo a quitar cada filtro. */
function ResumenCorte() {
  const { filtros, fijar, comparar, reiniciar } = useFiltros();
  const { datos } = useCatalogo(['unidad_territorial', 'periodo', 'eje_tematico']);
  if (!filtrosActivos(filtros) || !datos) return null;
  const mun = (id) => datos.unidad_territorial.find((u) => u.id === id)?.nom_mun ?? id;
  const per = (id) => datos.periodo.find((p) => String(p.id) === String(id))?.etiqueta ?? id;
  const chips = [
    filtros.municipio && { k: 'municipio', t: mun(filtros.municipio), quitar: () => fijar('municipio', '') },
    (filtros.periodoDesde || filtros.periodoHasta) && {
      k: 'periodo',
      t: `${filtros.periodoDesde ? per(filtros.periodoDesde) : 'inicio'} – ${filtros.periodoHasta ? per(filtros.periodoHasta) : 'último'}`,
      quitar: () => { fijar('periodoDesde', ''); fijar('periodoHasta', ''); },
    },
    filtros.eje && { k: 'eje', t: `Eje ${datos.eje_tematico.find((e) => String(e.id) === String(filtros.eje))?.numero_eje ?? filtros.eje}`, quitar: () => fijar('eje', '') },
    filtros.tipoUsuario && { k: 'usuario', t: `Usuario: ${filtros.tipoUsuario.replace('_', ' ')}`, quitar: () => fijar('tipoUsuario', '') },
    filtros.jerarquiaVial && { k: 'vial', t: `Vía ${filtros.jerarquiaVial}`, quitar: () => fijar('jerarquiaVial', '') },
    filtros.indicador && { k: 'indicador', t: `Indicador ${filtros.indicador}`, quitar: () => fijar('indicador', '') },
    filtros.comparar.activo && { k: 'comparar', t: filtros.comparar.modo === 'municipio' ? `Comparando con ${filtros.comparar.municipio ? mun(filtros.comparar.municipio) : 'el estado'}` : 'Comparando periodos', quitar: () => comparar({ activo: false }) },
  ].filter(Boolean);

  return (
    <div className="corte" role="status" aria-live="polite">
      <span className="corte__etiqueta">Corte activo</span>
      <ul>
        {chips.map((c) => (
          <li key={c.k}>
            <span>{c.t}</span>
            <button type="button" onClick={c.quitar} aria-label={`Quitar filtro ${c.t}`}><X size={13} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="corte__limpiar" onClick={reiniciar}>Borrar todo</button>
    </div>
  );
}

/**
 * Módulo «Seguimiento de proyectos e indicadores»: una sola cabecera y navegación para
 * Indicadores, Tablero y Proyectos, que comparten el estado global de filtros.
 */
export default function Seguimiento() {
  return (
    <div className="seguimiento">
      <header className="seguimiento__cabecera">
        <span className="seguimiento__antetitulo"><Activity size={13} aria-hidden="true" /> Seguimiento</span>
        <h1>Seguimiento de proyectos e indicadores</h1>
        <p>Resultados publicados y validados del SESIM. Los filtros que elija se conservan al cambiar de vista.</p>
      </header>

      <nav className="seguimiento__vistas" aria-label="Vistas de seguimiento">
        {SUBMODULOS.map(({ a, icono: Icono, titulo, texto }) => (
          <NavLink key={a} to={a} className={({ isActive }) => `seguimiento__vista${isActive ? ' seguimiento__vista--activa' : ''}`}>
            <span className="seguimiento__vista-icono" aria-hidden="true"><Icono size={20} /></span>
            <span>
              <strong>{titulo}</strong>
              <small>{texto}</small>
            </span>
          </NavLink>
        ))}
      </nav>

      <ResumenCorte />

      <Outlet />
    </div>
  );
}
