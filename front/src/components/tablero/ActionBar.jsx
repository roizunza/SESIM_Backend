import { useEffect, useRef, useState } from 'react';
import { BarChart3, Columns2, Download, FileText, MapPinned, RotateCcw, Table2 } from 'lucide-react';

/**
 * Barra de acciones del tablero. No guarda estado propio: todo lo que muestra y
 * dispara proviene del estado global de filtros que recibe el contenedor.
 */
export default function ActionBar({ vista, onVista, comparando, onComparar, nFiltros, onReiniciar, onPdf, onCsv, onGeojson, onReportar, puedeDescargar }) {
  const [menu, setMenu] = useState(false);
  const raiz = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const fuera = (e) => !raiz.current?.contains(e.target) && setMenu(false);
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const elegir = (accion) => () => {
    setMenu(false);
    accion();
  };

  return (
    <div className="action-bar" role="toolbar" aria-label="Acciones del tablero">
      <div className="action-bar__grupo" role="group" aria-label="Tipo de vista">
        <button type="button" className={`ab-btn${vista === 'grafica' ? ' ab-btn--activo' : ''}`} aria-pressed={vista === 'grafica'} onClick={() => onVista('grafica')}>
          <BarChart3 size={16} aria-hidden="true" /> Gráfica
        </button>
        <button type="button" className={`ab-btn${vista === 'tabla' ? ' ab-btn--activo' : ''}`} aria-pressed={vista === 'tabla'} onClick={() => onVista('tabla')}>
          <Table2 size={16} aria-hidden="true" /> Tabla
        </button>
      </div>

      <button type="button" className={`ab-btn${comparando ? ' ab-btn--activo' : ''}`} aria-pressed={comparando} onClick={onComparar}>
        <Columns2 size={16} aria-hidden="true" /> Comparar periodos
      </button>

      <span className="action-bar__separador" aria-hidden="true" />

      <button type="button" className="ab-btn" onClick={onPdf}>
        <FileText size={16} aria-hidden="true" /> Exportar reporte PDF
      </button>

      <div className="ab-menu" ref={raiz}>
        <button type="button" className="ab-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} disabled={!puedeDescargar} title={puedeDescargar ? undefined : 'No hay datos en el corte actual'}>
          <Download size={16} aria-hidden="true" /> Descargar dataset
        </button>
        {menu && (
          <div className="ab-menu__lista" role="menu">
            <button type="button" role="menuitem" onClick={elegir(onCsv)}>Mediciones filtradas (CSV)</button>
            <button type="button" role="menuitem" onClick={elegir(onGeojson)}>Coropleta municipal (GeoJSON)</button>
          </div>
        )}
      </div>

      <button type="button" className="ab-btn" onClick={onReportar}>
        <MapPinned size={16} aria-hidden="true" /> Reportar punto crítico
      </button>

      <button type="button" className="ab-btn ab-btn--reset" onClick={onReiniciar} disabled={!nFiltros} aria-label={`Borrar filtros (${nFiltros} activos)`}>
        <RotateCcw size={16} aria-hidden="true" /> Borrar filtros{nFiltros ? ` (${nFiltros})` : ''}
      </button>
    </div>
  );
}
