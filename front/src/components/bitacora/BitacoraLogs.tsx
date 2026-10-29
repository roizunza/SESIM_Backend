import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, FileText,
  Map, Download, Search, LayoutList, Table as TableIcon, AlertTriangle,
  UploadCloud, Layers, X, FileCheck
} from 'lucide-react';
import { useSesion } from '../../lib/sesim/sesion';
import { cargarBitacoraOperativa, ETIQUETA_ESTATUS_SESIM } from '../../lib/sesim/bitacoraOperativa';
import './bitacora-logs.css';

/**
 * Bitácora de cambios de cartografía e instrumentos (Ciclo 5).
 * Homologada desde el front del Ciclo 5 (TSX): los datos salen de `api.bitacora_operativa` (migración 218),
 * no de datos de muestra, y el estatus que se muestra es el del modelo SESIM (ver bitacoraOperativa.js).
 */
interface FichaTecnicaLog {
  fuente: string; responsable: string; escala: string; periodicidad: string; monitor: string;
  instrumentoOrigen: string; fecha: string; horizonte: string; ejeEvaluacion: string; restriccionUso?: string | null;
}
interface ArchivosLog { principal?: string; estilo?: string; documento?: string; geojson?: string }
export interface BitacoraLogItem {
  id: number | string; recursoId?: string; userId: string; actorNombre?: string; title: string;
  tipo: 'cartografia' | 'instrumento'; operacion: string; rol: string; date: string; creadoEn?: string;
  status: 'borrador' | 'en_revision' | 'aprobado' | 'rechazado'; estatusSesim?: string;
  comentarioAdmin: string | null; fichaTecnica: FichaTecnicaLog; archivos: ArchivosLog;
}

export default function BitacoraLogs({ embebido = false }: { embebido?: boolean }) {
  const { userId } = useParams();
  const navigate = useNavigate();
  const sesion = useSesion();
  const role = sesion?.perfil ?? null;
  const isAuditor = role === 'auditor';
  const isAdministrador = role === 'administrador' || role === 'administrador_titular';
  const isCapturista = role === 'capturista';
  const [logsData, setLogsData] = useState<BitacoraLogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargarBitacoraOperativa()
      .then((rows: BitacoraLogItem[]) => { if (vivo) { setLogsData(rows); setErrorCarga(''); } })
      .catch((e: Error) => { if (vivo) setErrorCarga(e.message || 'No se pudo leer la bitácora del servidor.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [sesion?.id]);

  // Función para extraer solo la fecha sin la hora
  const getSoloFecha = (dateStr?: string | null) => {
    if (!dateStr || typeof dateStr !== 'string') return '';
    return dateStr.split(',')[0].trim();
  };

  // Helper para mostrar badge de operación según rol/acción
  const getOperacionBadge = (operacion: string) => {
    switch (operacion) {
      case 'nuevo':
        return <span className="badge-operacion op-nuevo">Nuevo registro</span>;
      case 'actualizacion':
        return <span className="badge-operacion op-actualizacion">Actualización</span>;
      case 'envio':
        return <span className="badge-operacion op-actualizacion">Envió a revisión</span>;
      case 'publicacion':
        return <span className="badge-operacion" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#1D4ED8', fontWeight: '600', border: '1px solid rgba(37, 99, 235, 0.25)' }}>Publicó</span>;
      case 'despublicacion':
        return <span className="badge-operacion" style={{ background: 'rgba(107, 114, 128, 0.12)', color: '#374151', fontWeight: '600', border: '1px solid rgba(107, 114, 128, 0.25)' }}>Despublicó</span>;
      case 'baja':
        return <span className="badge-operacion" style={{ background: 'rgba(107, 114, 128, 0.12)', color: '#374151', fontWeight: '600', border: '1px solid rgba(107, 114, 128, 0.25)' }}>Baja</span>;
      case 'aprobacion':
        return (
          <span 
            className="badge-operacion" 
            style={{ 
              background: 'rgba(5, 150, 105, 0.12)', 
              color: '#047857', 
              fontWeight: '600',
              border: '1px solid rgba(5, 150, 105, 0.25)' 
            }}
          >
            Aprobó
          </span>
        );
      case 'rechazo':
        return (
          <span 
            className="badge-operacion" 
            style={{ 
              background: 'rgba(220, 38, 38, 0.12)', 
              color: '#991B1B', 
              fontWeight: '600',
              border: '1px solid rgba(220, 38, 38, 0.25)' 
            }}
          >
            Rechazó
          </span>
        );
      default:
        return <span className="badge-operacion" style={{ textTransform: 'capitalize' }}>{operacion}</span>;
    }
  };

  // Estados de Filtros y Vistas
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDay, setFilterDay] = useState('todos');
  const [filterMonth, setFilterMonth] = useState('todos');
  const [filterYear, setFilterYear] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [monitorFilter, setMonitorFilter] = useState('todos');
  const [rolFilter, setRolFilter] = useState('todos');
  const [viewMode, setViewMode] = useState('table'); // 'table' es la opción predeterminada
  const [selectedLog, setSelectedLog] = useState<BitacoraLogItem | null>(null);

  // El botón de dictamen solo aplica al evento más reciente de cada recurso (el que dejó la capa en revisión hoy).
  // (no se usa `new Map`: en este archivo `Map` es el icono de lucide-react)
  const ultimoPorRecurso = useMemo(() => {
    const m: Record<string, BitacoraLogItem> = {};
    for (const l of logsData) {
      const k = `${l.tipo}:${l.recursoId}`;
      if (!m[k] || String(l.creadoEn) > String(m[k].creadoEn)) m[k] = l;
    }
    return m;
  }, [logsData]);
  const esEstadoActual = (l: BitacoraLogItem) => ultimoPorRecurso[`${l.tipo}:${l.recursoId}`]?.id === l.id;

  // Cálculos de KPIs
  const totalRegistros = logsData.length;
  const enRevisionCount = logsData.filter(l => l.status === 'en_revision').length;
  const aprobadosCount = logsData.filter(l => l.status === 'aprobado').length;
  const rechazadosCount = logsData.filter(l => l.status === 'rechazado').length;

  // Manejador para toggle interactivo de los botones KPI
  const handleToggleKpi = (targetStatus: string) => {
    if (targetStatus === 'todos') {
      setStatusFilter('todos');
    } else if (statusFilter === targetStatus) {
      setStatusFilter('todos');
    } else {
      setStatusFilter(targetStatus);
    }
  };

  // Filtrado reactivo de registros
  const filteredLogs = useMemo(() => {
    return logsData.filter(log => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch = !q ||
        log.title.toLowerCase().includes(q) ||
        (log.userId && log.userId.toLowerCase().includes(q)) ||
        (log.rol && log.rol.toLowerCase().includes(q)) ||
        (log.operacion && log.operacion.toLowerCase().includes(q)) ||
        (log.tipo && log.tipo.toLowerCase().includes(q)) ||
        (log.fichaTecnica?.fuente && log.fichaTecnica.fuente.toLowerCase().includes(q)) ||
        (log.fichaTecnica?.instrumentoOrigen && log.fichaTecnica.instrumentoOrigen.toLowerCase().includes(q));

      // Filtrado por partes de fecha
      let matchDate = true;
      if (filterDay !== 'todos' && !(log.date.startsWith(filterDay + ' ') || log.date.startsWith(parseInt(filterDay, 10) + ' '))) matchDate = false;
      if (filterMonth !== 'todos' && !log.date.includes(filterMonth)) matchDate = false;
      if (filterYear !== 'todos' && !log.date.includes(filterYear)) matchDate = false;

      // El Auditor ve todo (Alcances; RLS de core.bitacora_cambio): no se le oculta ningún estatus en la pantalla.

      const matchTipo = tipoFilter === 'todos' || log.tipo === tipoFilter;
      const matchStatus = statusFilter === 'todos' || log.status === statusFilter;
      const matchMonitor = isAuditor || monitorFilter === 'todos' || log.fichaTecnica?.monitor === monitorFilter;
      const matchRol = rolFilter === 'todos' || log.rol === rolFilter;

      return matchSearch && matchDate && matchTipo && matchStatus && matchMonitor && matchRol;
    });
  }, [logsData, searchTerm, filterDay, filterMonth, filterYear, tipoFilter, statusFilter, monitorFilter, rolFilter, isAuditor]);

  // Función para exportar a CSV
  const handleExportCSV = () => {
    const headers = (isAuditor || isAdministrador)
      ? "ID_Usuario,Rol,Operacion,Tipo,Recurso_Archivo,Fecha,Estatus,Dictamen\n"
      : "ID,Titulo,Tipo,Operacion,Fecha,Estatus,Fuente,Monitor,InstrumentoOrigen\n";
    const rows = filteredLogs.map(l => 
      (isAuditor || isAdministrador)
        ? `"${l.userId || l.id}","${l.rol}","${l.operacion}","${l.tipo}","${l.title}","${getSoloFecha(l.date)}","${l.status}","${l.status === 'rechazado' ? 'Dictamen de Rechazo' : '-'}"`
        : `"${l.id}","${l.title}","${l.tipo}","${l.operacion}","${l.date}","${l.status}","${l.fichaTecnica?.fuente || ''}","${l.fichaTecnica?.monitor || ''}","${l.fichaTecnica?.instrumentoOrigen || ''}"`
    ).join("\n");

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', isAuditor ? `bitacora_auditoria_sesim_2026.csv` : (isAdministrador ? `bitacora_administracion_sesim_2026.csv` : `bitacora_capturista_${userId || 'sesim'}_2026.csv`));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para descargar el dictamen oficial de rechazo en PDF
  const handleDownloadDictamenPdf = (log: BitacoraLogItem) => {
    const content = `GOBIERNO DEL ESTADO DE CAMPECHE
SISTEMA ESTATAL DE ORDENAMIENTO TERRITORIAL Y DESARROLLO URBANO (SEOTDU)
UNIDAD DE VALIDACIÓN INSTITUCIONAL Y REVISIÓN TERRITORIAL

DICTAMEN TÉCNICO DE RECHAZO ADMINISTRATIVO
Folio de Dictamen: DIC-RECH-${log.id}-2026
Fecha y Hora de Emisión: ${log.date}

DATOS DEL RECURSO AUDITADO:
================================================================================
Nombre / Archivo: ${log.title}
Tipo de Recurso: ${log.tipo === 'cartografia' ? 'Geometría (.GeoJSON / PostGIS)' : 'Instrumento Normativo (.PDF)'}
Institución Fuente: ${log.fichaTecnica?.fuente || 'No especificada'}
Unidad Responsable: ${log.fichaTecnica?.responsable || 'No especificada'}
Monitor Asignado: ${log.fichaTecnica?.monitor || 'No asignado'}
Instrumento Normativo: ${log.fichaTecnica?.instrumentoOrigen || 'No especificado'}
Año / Ejercicio: ${log.fichaTecnica?.fecha || '2026'}

MOTIVO TÉCNICO DE RECHAZO EMITIDO POR LA ADMINISTRADORA:
================================================================================
"${log.comentarioAdmin || 'Inconsistencia con la normativa técnica aplicable.'}"

DISPOSICIONES TÉCNICAS DERIVADAS:
================================================================================
1. El archivo no cumplió con las especificaciones mínimas de integridad o estructura tabular requeridas.
2. De conformidad con las reglas de SESIM, la capa regresa al estatus BORRADOR con este motivo registrado en la bitácora; no se elimina y su historial se conserva.
3. El Capturista deberá corregir las inconsistencias señaladas y generar un nuevo registro con los archivos subsanados.

--------------------------------------------------------------------------------
Dictamen emitido y firmado digitalmente por:
Administración General de Información Territorial - SEOTDU Campeche`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Dictamen_Rechazo_${log.title}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aprobado':
        return <span className="status-pill aprobado"><CheckCircle size={13} /> Aprobado</span>;
      case 'en_revision':
        return <span className="status-pill en_revision"><Clock size={13} /> En Revisión</span>;
      case 'rechazado':
        return <span className="status-pill rechazado"><XCircle size={13} /> Requiere Corrección</span>;
      default:
        return <span className="status-pill borrador"><Clock size={13} /> Borrador</span>;
    }
  };

  return (
    <div className={`bitacora-page${embebido ? ' embebido' : ''}`}>
      
      {/* 1. Header Ejecutivo */}
      <div className="bitacora-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button 
            className="btn-base btn-primary" 
            onClick={() => navigate('/admin-visor')} 
            style={{ width: 'auto', height: '32px', padding: '0 12px', fontSize: '12px', flexShrink: 0 }}
          >
            <ArrowLeft size={13} /> Regresar
          </button>

          <div className="bitacora-header-info">
            <h2>
              {isAuditor || isAdministrador ? 'Bitácora de Loggs' : 'Historial de Actividades'}
              <span className="bitacora-user-badge">
                {isAuditor ? 'Auditoría Institucional' : (isAdministrador ? 'Control de Administración Global' : (userId ? `Capturista ID: ${userId}` : 'Historial de Operaciones'))}
              </span>
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary, #6B7280)', fontSize: '13px' }}>
              {isAuditor
                ? 'Registro histórico de acciones dentro del sistema de los diferentes tipos de usuarios institucionales.'
                : isAdministrador
                ? 'Registro integral de operaciones, revisiones y dictámenes institucionales de todos los usuarios.'
                : 'Registro y estatus de cartografías e instrumentos normativos procesados por el usuario.'}
            </p>
          </div>
        </div>

        <div className="bitacora-header-actions">
          <button 
            className="btn-base btn-secondary" 
            onClick={handleExportCSV}
            style={{ width: 'auto', height: '34px', padding: '0 12px', fontSize: '12px' }}
          >
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* 2. Barra de Filtros y Búsqueda */}
      <div className="bitacora-filter-bar">
        {/* 1.- Buscador con botón de limpiar X */}
        <div className="filter-search-wrap">
          <Search size={16} className="filter-search-icon" />
          <input 
            type="text"
            className="filter-search-input"
            placeholder={isAuditor || isAdministrador ? "Buscar ID, Rol, Cartografia o instrumento" : "Buscar por capa, archivo o instrumento de origen..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              type="button" 
              className="filter-search-clear" 
              onClick={() => setSearchTerm('')} 
              title="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-select-group">
          {/* 2.- Filtros de Fecha */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <select className="filter-select" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={{ padding: '8px', minWidth: '60px' }}>
              <option value="todos">Día</option>
              {[...Array(31)].map((_, i) => (
                <option key={i+1} value={(i+1).toString().padStart(2, '0')}>{i+1}</option>
              ))}
            </select>
            <select className="filter-select" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ padding: '8px', minWidth: '80px' }}>
              <option value="todos">Mes</option>
              <option value="Ene">Ene</option>
              <option value="Feb">Feb</option>
              <option value="Mar">Mar</option>
              <option value="Abr">Abr</option>
              <option value="May">May</option>
              <option value="Jun">Jun</option>
              <option value="Jul">Jul</option>
              <option value="Ago">Ago</option>
              <option value="Sep">Sep</option>
              <option value="Oct">Oct</option>
              <option value="Nov">Nov</option>
              <option value="Dic">Dic</option>
            </select>
            <select className="filter-select" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ padding: '8px', minWidth: '70px' }}>
              <option value="todos">Año</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
          </div>

          {/* 3.- Filtro de Rol: Visible para Auditor y Administrador */}
          {(isAuditor || isAdministrador) && (
            <select 
              className="filter-select" 
              value={rolFilter} 
              onChange={(e) => setRolFilter(e.target.value)}
            >
              <option value="todos">Todos los roles</option>
              <option value="capturista">Capturista</option>
              <option value="administrador">Administrador</option>
              <option value="administrador_titular">Administrador Titular</option>
            </select>
          )}

          {/* 4.- Filtro de Tipo */}
          <select 
            className="filter-select" 
            value={tipoFilter} 
            onChange={(e) => setTipoFilter(e.target.value)}
          >
            <option value="todos">Todos los Tipos</option>
            <option value="cartografia">Geometría (.GeoJSON)</option>
            <option value="instrumento">Instrumentos (.PDF)</option>
          </select>

          {/* 5.- Filtro de Estatus */}
          <select 
            className="filter-select" 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="todos">Todos los Estatus</option>
            <option value="aprobado">Aprobados</option>
            <option value="en_revision">En Revisión</option>
            <option value="rechazado">Rechazados</option>
            <option value="borrador">Borradores</option>
          </select>

          {/* 6.- Filtro de Monitores: Inmediatamente después de los Estatus (Capturista y Administrador) */}
          {!isAuditor && (
            <select 
              className="filter-select" 
              value={monitorFilter} 
              onChange={(e) => setMonitorFilter(e.target.value)}
            >
              <option value="todos">Todos los Monitores</option>
              <option value="mapa_base">Mapa Base</option>
              <option value="ordenamiento_territorial">Ordenamiento Territorial</option>
              <option value="ambiental">Ambiental</option>
              <option value="social">Social</option>
              <option value="infraestructura">Infraestructura</option>
              <option value="economico">Económico</option>
            </select>
          )}

          {/* 7.- Botones de toggle de vista: Solo para Capturista */}
          {isCapturista && (
            <div className="view-toggle-buttons">
              <button 
                className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Vista Tabular"
              >
                <TableIcon size={15} /> Tabla
              </button>
              <button 
                className={`btn-view-toggle ${viewMode === 'feed' ? 'active' : ''}`}
                onClick={() => setViewMode('feed')}
                title="Vista de Línea de Tiempo"
              >
                <LayoutList size={15} /> Feed
              </button>
            </div>
          )}
        </div>
      </div>

      {cargando && <p role="status" style={{ margin: '0 0 12px', color: 'var(--text-secondary, #6B7280)' }}>Cargando la bitácora del servidor…</p>}
      {errorCarga && <p role="alert" className="admin-login-error" style={{ margin: '0 0 12px' }}>No se pudo leer la bitácora del servidor: {errorCarga}</p>}
      {!cargando && !errorCarga && logsData.length === 0 && (
        <p role="status" style={{ margin: '0 0 12px', color: 'var(--text-secondary, #6B7280)' }}>
          Aún no hay cambios registrados. Aparecerán aquí cuando se envíe, valide, rechace o publique una capa o un instrumento.
        </p>
      )}

      {/* 3. Tarjetas de Métricas KPIs (Visibles para Capturista / Administradora, ocultas para Auditor) */}
      {!isAuditor && (
        <div className="bitacora-kpi-grid">
          <button 
            className={`bitacora-kpi-card ${statusFilter === 'todos' ? 'active-todos' : ''}`}
            onClick={() => handleToggleKpi('todos')}
            type="button"
            title="Ver todos los registros"
          >
            <div className="kpi-icon-wrap kpi-total"><UploadCloud size={18} /></div>
            <div className="kpi-details">
              <span className="kpi-value">{totalRegistros}</span>
              <span className="kpi-label">Total de Cargas</span>
            </div>
          </button>

          <button 
            className={`bitacora-kpi-card ${statusFilter === 'en_revision' ? 'active-revision' : ''}`}
            onClick={() => handleToggleKpi('en_revision')}
            type="button"
            title="Filtrar por En Revisión"
          >
            <div className="kpi-icon-wrap kpi-revision"><Clock size={18} /></div>
            <div className="kpi-details">
              <span className="kpi-value">{enRevisionCount}</span>
              <span className="kpi-label">En Revisión Administrativa</span>
            </div>
          </button>

          <button 
            className={`bitacora-kpi-card ${statusFilter === 'aprobado' ? 'active-aprobado' : ''}`}
            onClick={() => handleToggleKpi('aprobado')}
            type="button"
            title="Filtrar por Aprobados"
          >
            <div className="kpi-icon-wrap kpi-aprobado"><CheckCircle size={18} /></div>
            <div className="kpi-details">
              <span className="kpi-value">{aprobadosCount}</span>
              <span className="kpi-label">Aprobados y Publicados</span>
            </div>
          </button>

          <button 
            className={`bitacora-kpi-card ${statusFilter === 'rechazado' ? 'active-rechazado' : ''}`}
            onClick={() => handleToggleKpi('rechazado')}
            type="button"
            title="Filtrar por Requieren Corrección"
          >
            <div className="kpi-icon-wrap kpi-rechazado"><AlertTriangle size={18} /></div>
            <div className="kpi-details">
              <span className="kpi-value">{rechazadosCount}</span>
              <span className="kpi-label">Requieren Corrección</span>
            </div>
          </button>
        </div>
      )}

      {/* 4. Layout Principal: Tabla 100% para Auditor y Administrador, o división 68%/32% con Ficha Técnica para Capturista */}
      <div className={`bitacora-content-layout ${isAuditor || isAdministrador ? 'full-width' : ''}`}>
        
        {/* Columna de Feed o Tabla */}
        <div>
          {filteredLogs.length === 0 ? (
            <div className="empty-state-box">
              <Layers size={40} style={{ opacity: 0.4, margin: '0 auto 12px', display: 'block' }} />
              <h4 style={{ margin: '0 0 6px 0', color: 'var(--text-primary)' }}>No se encontraron registros</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>Ajuste los filtros o el término de búsqueda para consultar la bitácora.</p>
            </div>
          ) : isCapturista && viewMode === 'feed' ? (
            <div className="bitacora-feed">
              {filteredLogs.map(log => {
                const isSelected = selectedLog?.id === log.id;
                return (
                  <div 
                    key={log.id} 
                    className={`bitacora-card ${isSelected ? 'selected' : ''} status-${log.status}`}
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className="card-top-row">
                      <div className="card-badges-left">
                        {log.tipo === 'cartografia' ? (
                          <span className="badge-tipo badge-cartografia"><Map size={12} /> Geometría</span>
                        ) : (
                          <span className="badge-tipo badge-instrumento"><FileText size={12} /> Instrumento</span>
                        )}
                        <span className="badge-operacion">
                          {log.operacion === 'nuevo' ? 'Nuevo registro' : (log.operacion === 'actualizacion' ? 'Actualización' : log.operacion)}
                        </span>
                      </div>
                      <span className="card-date"><Clock size={12} /> Fecha de Captura: {log.date}</span>
                    </div>

                    <h4 className="card-title">
                      {log.title}
                    </h4>

                    <div className="card-metadata-summary">
                      <span>Fuente: <strong>{log.fichaTecnica?.fuente}</strong></span>
                      <span>Monitor: <strong>{log.fichaTecnica?.monitor?.replace('_', ' ')}</strong></span>
                      <span>Escala: <strong>{log.fichaTecnica?.escala}</strong></span>
                      <span>Instrumento Normativo: <strong>{log.fichaTecnica?.instrumentoOrigen}</strong></span>
                    </div>

                    {log.status === 'rechazado' && log.comentarioAdmin && (
                      <div className="admin-reject-callout">
                        <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: '12px', color: '#991B1B', display: 'block', marginBottom: '2px' }}>
                            Observación de la Administradora:
                          </strong>
                          <p>{log.comentarioAdmin}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadDictamenPdf(log);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              marginTop: '6px',
                              padding: '4px 8px',
                              background: '#FFFFFF',
                              border: '1px solid #FCA5A5',
                              borderRadius: '4px',
                              color: '#991B1B',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            <Download size={12} /> Descargar Dictamen de Rechazo
                          </button>
                        </div>
                      </div>
                    )}

                    {log.status === 'aprobado' && (
                      <div className="admin-approved-callout">
                        <CheckCircle size={15} color="#059669" style={{ flexShrink: 0 }} />
                        <span>Subida o Actualización aprobada</span>
                      </div>
                    )}

                    <div className="card-bottom-actions">
                      <div>{getStatusBadge(log.status)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : isAdministrador ? (
            /* Modo Tabla para Administrador (9 columnas: ID, Rol, Tipo, Recurso/Archivo, Monitor, Fuente, Fecha, Estatus, Dictamen) */
            <div className="bitacora-table-container">
              <table className="bitacora-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Rol</th>
                    <th>Acción</th>
                    <th>Tipo</th>
                    <th>Recurso / Archivo</th>
                    <th>Monitor</th>
                    <th>Fuente</th>
                    <th>Fecha</th>
                    <th>Estatus</th>
                    <th style={{ textAlign: 'center' }}>Dictamen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id}>
                      {/* 1. ID */}
                      <td>
                        <span className="bitacora-user-id">
                          {log.userId || `USR-00${log.id}`}
                        </span>
                      </td>

                      {/* 2. Rol */}
                      <td>
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: (log.rol === 'administrador' || log.rol === 'administrador_titular') ? 'rgba(105, 28, 50, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: (log.rol === 'administrador' || log.rol === 'administrador_titular') ? 'var(--c-guinda, #691C32)' : '#047857'
                        }}>
                          {log.rol === 'administrador_titular' ? 'Admin. Titular' : log.rol === 'administrador' ? 'Administrador' : 'Capturista'}
                        </span>
                      </td>

                      {/* 2b. Acción */}
                      <td>{getOperacionBadge(log.operacion)}</td>

                      {/* 3. Tipo */}
                      <td>
                        {log.tipo === 'cartografia' ? (
                          <span className="badge-tipo badge-cartografia" style={{ fontSize: '10px' }}>Geometría</span>
                        ) : (
                          <span className="badge-tipo badge-instrumento" style={{ fontSize: '10px' }}>PDF</span>
                        )}
                      </td>

                      {/* 4. Recurso / Archivo */}
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {log.tipo === 'cartografia' ? <Map size={15} color="#4F46E5" /> : <FileText size={15} color="#DC2626" />}
                          <span>{log.title}</span>
                        </div>
                      </td>

                      {/* 5. Monitor */}
                      <td style={{ textTransform: 'capitalize', fontSize: '12px' }}>
                        {log.fichaTecnica?.monitor ? log.fichaTecnica.monitor.replace('_', ' ') : '-'}
                      </td>

                      {/* 6. Fuente */}
                      <td style={{ fontSize: '12px' }}>
                        {log.fichaTecnica?.fuente || '-'}
                      </td>

                      {/* 7. Fecha */}
                      <td style={{ color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {getSoloFecha(log.date)}
                      </td>

                      {/* 8. Estatus */}
                      <td>
                        {getStatusBadge(log.status)}
                      </td>

                      {/* 9. Dictamen */}
                      <td style={{ textAlign: 'center' }}>
                        {log.status === 'en_revision' && esEstadoActual(log) ? (
                          <button
                            type="button"
                            disabled
                            onClick={() => navigate('/admin-visor')}
                            title="El dictamen de capas e instrumentos se conecta al servidor en el Ciclo 4 (api.fn_dictaminar)"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              background: 'var(--c-guinda, #691C32)',
                              border: 'none',
                              borderRadius: '4px',
                              color: '#FFFFFF',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'not-allowed',
                              opacity: 0.55,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <FileCheck size={12} /> Determinar Dictamen
                          </button>
                        ) : log.status === 'rechazado' ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadDictamenPdf(log)}
                            title="Descargar Dictamen de Rechazo"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              background: '#FFFFFF',
                              border: '1px solid #FCA5A5',
                              borderRadius: '4px',
                              color: '#991B1B',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            <Download size={11} /> Dictamen
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isAuditor ? (
            /* Modo Tabla Extendido para Auditor (8 columnas requeridas) */
            <div className="bitacora-table-container">
              <table className="bitacora-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Rol</th>
                    <th>Operación</th>
                    <th>Tipo</th>
                    <th>Recurso / Archivo</th>
                    <th>Fecha</th>
                    <th>Estatus</th>
                    <th style={{ textAlign: 'center' }}>Dictamen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id}>
                      {/* 1. ID de Usuario */}
                      <td>
                        <span className="bitacora-user-id">
                          {log.userId || `USR-00${log.id}`}
                        </span>
                      </td>

                      {/* 2. Rol: Capturista o Administrador */}
                      <td>
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: (log.rol === 'administrador' || log.rol === 'administrador_titular') ? 'rgba(105, 28, 50, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: (log.rol === 'administrador' || log.rol === 'administrador_titular') ? 'var(--c-guinda, #691C32)' : '#047857'
                        }}>
                          {log.rol === 'administrador_titular' ? 'Admin. Titular' : log.rol === 'administrador' ? 'Administrador' : 'Capturista'}
                        </span>
                      </td>

                      {/* 3. Operación */}
                      <td>
                        {getOperacionBadge(log.operacion)}
                      </td>

                      {/* 4. Tipo */}
                      <td>
                        {log.tipo === 'cartografia' ? (
                          <span className="badge-tipo badge-cartografia" style={{ fontSize: '10px' }}>Geometría</span>
                        ) : (
                          <span className="badge-tipo badge-instrumento" style={{ fontSize: '10px' }}>PDF</span>
                        )}
                      </td>

                      {/* 5. Recurso / Archivo */}
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {log.tipo === 'cartografia' ? <Map size={15} color="#4F46E5" /> : <FileText size={15} color="#DC2626" />}
                          <span>{log.title}</span>
                        </div>
                      </td>

                      {/* 6. Fecha (Solo fecha) */}
                      <td style={{ color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {getSoloFecha(log.date)}
                      </td>

                      {/* 7. Estatus */}
                      <td>
                        {getStatusBadge(log.status)}
                      </td>

                      {/* 8. Acciones */}
                      <td style={{ textAlign: 'center' }}>
                        {log.status === 'rechazado' ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadDictamenPdf(log)}
                            title="Descargar Dictamen de Rechazo"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              background: '#FFFFFF',
                              border: '1px solid #FCA5A5',
                              borderRadius: '4px',
                              color: '#991B1B',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            <Download size={11} /> Dictamen
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Modo Tabla Tradicional para Capturista (Interactiva con selección) */
            <div className="bitacora-table-container">
              <table className="bitacora-table">
                <thead>
                  <tr>
                    <th>Recurso</th>
                    <th>Acción</th>
                    <th>Tipo</th>
                    <th>Monitor</th>
                    <th>Fuente</th>
                    <th>Fecha de Captura</th>
                    <th>Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr 
                      key={log.id} 
                      className={selectedLog?.id === log.id ? 'selected' : ''}
                      onClick={() => setSelectedLog(log)}
                    >
                      <td style={{ fontWeight: '600' }}>{log.title}</td>
                      <td>{getOperacionBadge(log.operacion)}</td>
                      <td>
                        {log.tipo === 'cartografia' ? (
                          <span className="badge-tipo badge-cartografia" style={{ fontSize: '10px' }}><Map size={11} /> Geometría</span>
                        ) : (
                          <span className="badge-tipo badge-instrumento" style={{ fontSize: '10px' }}><FileText size={11} /> PDF</span>
                        )}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{log.fichaTecnica.monitor.replace('_', ' ')}</td>
                      <td>{log.fichaTecnica.fuente}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{log.date}</td>
                      <td>{getStatusBadge(log.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel Lateral de Ficha Técnica (Activo exclusivamente para Capturista) */}
        {isCapturista && (
          <aside className="bitacora-detail-panel">
            {selectedLog ? (
              <>
                <div className="detail-header">
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '0.05em' }}>
                    Ficha Técnica Institucional
                  </span>
                  <h3 title={selectedLog.title}>{selectedLog.title}</h3>
                  <div>{getStatusBadge(selectedLog.status)}</div>
                </div>

                <div className="detail-meta-list">
                  <div className="detail-meta-item">
                    <strong>Tipo de Recurso:</strong>
                    <span style={{ textTransform: 'capitalize' }}>{selectedLog.tipo === 'cartografia' ? 'Geometría' : 'Instrumento'}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Fecha de Captura:</strong>
                    <span>{selectedLog.date}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Operación:</strong>
                    <span style={{ textTransform: 'capitalize' }}>
                      {selectedLog.operacion === 'nuevo' ? 'Nuevo registro' : (selectedLog.operacion === 'actualizacion' ? 'Actualización' : (selectedLog.operacion === 'aprobacion' ? 'Aprobó (uso interno)' : (selectedLog.operacion === 'rechazo' ? 'Rechazó' : (selectedLog.operacion === 'envio' ? 'Envió a revisión' : (selectedLog.operacion === 'publicacion' ? 'Publicó' : selectedLog.operacion)))))}
                    </span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Estatus en SESIM:</strong>
                    <span>{ETIQUETA_ESTATUS_SESIM[selectedLog.estatusSesim ?? ''] ?? selectedLog.estatusSesim ?? '—'}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Institución Fuente:</strong>
                    <span>{selectedLog.fichaTecnica.fuente}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Responsable:</strong>
                    <span>{selectedLog.fichaTecnica.responsable}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Escala Territorial:</strong>
                    <span>{selectedLog.fichaTecnica.escala}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Periodicidad:</strong>
                    <span>{selectedLog.fichaTecnica.periodicidad}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Monitor Asignado:</strong>
                    <span style={{ textTransform: 'capitalize' }}>{selectedLog.fichaTecnica.monitor.replace('_', ' ')}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Instrumento Normativo:</strong>
                    <span>{selectedLog.fichaTecnica.instrumentoOrigen}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Año / Fecha:</strong>
                    <span>{selectedLog.fichaTecnica.fecha}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Horizonte:</strong>
                    <span style={{ textTransform: 'capitalize' }}>{selectedLog.fichaTecnica.horizonte}</span>
                  </div>
                  <div className="detail-meta-item">
                    <strong>Eje de Evaluación:</strong>
                    <span style={{ textTransform: 'capitalize' }}>{selectedLog.fichaTecnica.ejeEvaluacion}</span>
                  </div>
                </div>

                {/* Archivos Asociados */}
                <div className="detail-files-box">
                  <h4>Archivos enviados</h4>
                  {selectedLog.archivos.principal && (
                    <div className="detail-file-item">
                      <Map size={14} color="#4F46E5" /> <span>{selectedLog.archivos.principal}</span>
                    </div>
                  )}
                  {selectedLog.archivos.estilo && (
                    <div className="detail-file-item">
                      <FileText size={14} color="#059669" /> <span>{selectedLog.archivos.estilo}</span>
                    </div>
                  )}
                  {selectedLog.archivos.documento && (
                    <div className="detail-file-item">
                      <FileText size={14} color="#DC2626" /> <span>{selectedLog.archivos.documento}</span>
                    </div>
                  )}
                </div>

                {selectedLog.status === 'rechazado' && selectedLog.comentarioAdmin && (
                  <div className="admin-reject-callout" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '11px', color: '#991B1B', display: 'block' }}>Motivo de Rechazo:</strong>
                        <p style={{ fontSize: '11px', margin: '2px 0 0', color: '#7F1D1D' }}>{selectedLog.comentarioAdmin}</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleDownloadDictamenPdf(selectedLog)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        background: '#FFFFFF',
                        border: '1px solid #FCA5A5',
                        borderRadius: '4px',
                        color: '#991B1B',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        width: 'fit-content',
                        marginTop: '4px'
                      }}
                    >
                      <Download size={13} /> Descargar Dictamen de Rechazo (.PDF)
                    </button>
                  </div>
                )}

                {selectedLog.status === 'aprobado' && (
                  <div className="admin-approved-callout" style={{ marginBottom: '16px' }}>
                    <CheckCircle size={16} color="#059669" style={{ flexShrink: 0 }} />
                    <span>Subida o Actualización aprobada</span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-secondary)' }}>
                <p>Seleccione un registro para inspeccionar su ficha técnica.</p>
              </div>
            )}
          </aside>
        )}

      </div>

    </div>
  );
}