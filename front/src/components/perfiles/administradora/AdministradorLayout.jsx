import React, { useEffect, useMemo, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { Download, Play, Map as MapIcon, X, SlidersHorizontal, ChevronUp } from 'lucide-react';
import AdministradorSidebar from './AdministradorSidebar';
import DashboardKPIs from './DashboardKPIs';
import PanelDictamen from './PanelDictamen';
import CapaCargaModal from './CapaCargaModal';
import InvitacionesPanel from './InvitacionesPanel';
import RechazosPanel from '../comun/RechazosPanel';
import { pendientesRechazo } from '../../../lib/sesim/catalogoApi';
import MapaPerfil from '../comun/MapaPerfil';
import DetalleMedicion from '../comun/DetalleMedicion';
import { useCatalogoOperativo } from '../comun/useCatalogoOperativo';
import CapaSesim from '../../geovisor/CapaSesim';
import CapaMetadataModal from '../../geovisor/CapaMetadataModal';
import { cargarArbolCapas } from '../../../lib/sesim/capas';
import PanelFab from '../comun/PanelFab';
import { usePanelLateral } from '../../../lib/sesim/usePanelLateral';
import { useSesion } from '../../../lib/sesim/sesion';
import { useOperacion, medicionesVisibles, fnCompletitudCaptura, lineaBaseDe, ESTADOS } from '../../../lib/sesim/operacion';
import { fnSemaforo, COLORES_SEMAFORO } from '../../../lib/sesim/semaforo';
import { nombreUnidad } from '../comun/formato';
import '../capturista/Capturista.css';
import './Admin.css';
import '../comun/Comun.css';

/**
 * Perfil ADMINISTRADOR y ADMINISTRADOR TITULAR (Tabla 3).
 *  · Valida, rechaza (con comentario) y publica mediciones (F10).
 *  · Mantiene el catálogo de capas: carga nuevas y revisa las que están en
 *    borrador (14 en el dataset v4).
 *  · Tablero por indicador/periodo: completitud (F09), semáforo (F04) y
 *    coropleta municipal (F05).
 *  · Solo el Titular: invitaciones (F16) y bajas de usuario.
 */
const AdministradorLayout = () => {
  const sesion = useSesion();
  const op = useOperacion();
  const { catalogo } = useCatalogoOperativo();
  const [isSidebarOpen, setIsSidebarOpen, esMovil] = usePanelLateral();
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [seleccion, setSeleccion] = useState(null);
  const [arbol, setArbol] = useState(null);
  const [capaVista, setCapaVista] = useState(null);
  const [fichaCapa, setFichaCapa] = useState(null);
  const [cargada, setCargada] = useState(null); // { capa, geojson } de CapaCargaModal
  const [modalCarga, setModalCarga] = useState(false);
  const [invitaciones, setInvitaciones] = useState(false);
  const [rechazos, setRechazos] = useState(false);
  const [nRechazos, setNRechazos] = useState(0);
  useEffect(() => {
    let vivo = true;
    pendientesRechazo().then((r) => { if (vivo && Array.isArray(r)) setNRechazos(r.length); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const [filtro, setFiltro] = useState({ instrumento: '', eje: '', indicador: '', periodo: '' });
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    cargarArbolCapas({ incluirBorrador: true }).then(setArbol).catch(() => setArbol(null));
  }, []);

  const visibles = useMemo(() => medicionesVisibles(sesion, op), [sesion, op]);
  const periodosPorId = useMemo(() => new Map(op.periodo.map((p) => [p.id, p])), [op.periodo]);
  const medicion = visibles.find((m) => m.id === seleccion);
  const capasBorrador = useMemo(() => (arbol ? Array.from(arbol.capasPorId.values()).filter((c) => c.estatus !== 'vigente_publico') : []), [arbol]);
  const capaCatalogo = capaVista && arbol ? arbol.capasPorId.get(capaVista) : null;

  const indicadoresFiltrados = useMemo(() => {
    if (!catalogo) return [];
    let lista = catalogo.indicador;
    if (filtro.eje) lista = lista.filter((i) => String(i.id_eje) === filtro.eje);
    if (filtro.instrumento) {
      const ids = new Set(catalogo.indicador_instrumento.filter((v) => v.id_instrumento === filtro.instrumento).map((v) => v.id_indicador));
      lista = lista.filter((i) => ids.has(i.id));
    }
    return lista;
  }, [catalogo, filtro.eje, filtro.instrumento]);

  /** F05 + F04 + F09 para el indicador/periodo elegidos. */
  const generar = () => {
    if (!catalogo || !filtro.indicador) return;
    const indicador = catalogo.indicadores.get(filtro.indicador);
    const periodo = filtro.periodo ? periodosPorId.get(Number(filtro.periodo)) : null;
    const delIndicador = op.medicion_indicador.filter((m) => m.id_indicador === indicador.id && (!periodo || m.id_periodo === periodo.id));
    const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, delIndicador.filter((m) => m.estado === e).length]));
    const lb = lineaBaseDe(indicador, op);
    const publicadas = delIndicador.filter((m) => m.estado === 'vigente_publico' && m.id_unidad.length === 5);
    // Por municipio, la medición publicada más reciente del corte.
    const porMunicipio = new Map();
    for (const m of publicadas) {
      const prev = porMunicipio.get(m.id_unidad);
      if (!prev || (periodosPorId.get(m.id_periodo)?.fecha_inicio ?? '') > (periodosPorId.get(prev.id_periodo)?.fecha_inicio ?? '')) porMunicipio.set(m.id_unidad, m);
    }
    const semaforos = Array.from(porMunicipio.values()).map((m) => ({
      id_unidad: m.id_unidad,
      nom_mun: nombreUnidad(catalogo.unidades, m.id_unidad),
      valor: m.valor,
      semaforo: fnSemaforo({ valor: m.valor, linea_base: lb.linea_base, valor_meta: indicador.valor_meta, tendencia: indicador.tendencia }),
    }));
    setResumen({
      indicador,
      periodo,
      porEstado,
      completitud: fnCompletitudCaptura(indicador.id, periodo?.id, catalogo.municipios, op),
      semaforos,
      coropleta: new Map(semaforos.map((s) => [s.id_unidad, COLORES_SEMAFORO[s.semaforo]])),
    });
    setSeleccion(null);
  };

  /** Exporta a CSV las mediciones visibles del filtro (columnas del diccionario). */
  const exportarCsv = () => {
    const filas = visibles.filter((m) => (!filtro.indicador || m.id_indicador === filtro.indicador) && (!filtro.periodo || m.id_periodo === Number(filtro.periodo)));
    const cols = ['id', 'id_indicador', 'id_unidad', 'id_periodo', 'periodo', 'valor', 'valor_texto', 'estado', 'usuario_captura', 'usuario_validacion', 'fecha_captura', 'fecha_validacion'];
    const esc = (v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
    const csv = [cols.join(','), ...filas.map((m) => cols.map((c) => esc(c === 'periodo' ? periodosPorId.get(m.id_periodo)?.etiqueta : m[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sesim_mediciones_${filtro.indicador || 'todas'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const leyenda = resumen ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <strong style={{ fontSize: 12 }}>{resumen.indicador.id} · semáforo por municipio</strong>
      {['verde', 'amarillo', 'rojo', 'mejora', 'estable', 'retrocede', 'sin línea base'].map((s) => (
        <span key={s} className="semaforo-chip"><i style={{ background: COLORES_SEMAFORO[s] }} />{s}</span>
      ))}
      <button className="btn-base btn-tertiary" style={{ height: 28, marginTop: 4 }} onClick={() => setResumen(null)}><X size={13} /> Quitar coropleta</button>
    </div>
  ) : capaCatalogo || cargada ? (
    <span style={{ fontSize: 12 }}>Vista previa: <strong>{(capaCatalogo ?? cargada.capa).id}</strong> · {(capaCatalogo ?? cargada.capa).titulo} (borrador)</span>
  ) : null;

  return (
    <div className="dashboard-fullscreen-container con-banner">
      <MapaPerfil resaltarUnidad={medicion?.id_unidad} coropleta={resumen?.coropleta} simbologia={leyenda}>
        {capaCatalogo && <CapaSesim capa={capaCatalogo} onSeleccionar={setFichaCapa} />}
        {cargada && <GeoJSON key={cargada.capa.id + cargada.capa.titulo} data={cargada.geojson} style={{ color: '#F59E0B', weight: 2, fillColor: '#F59E0B', fillOpacity: 0.3 }} pointToLayer={(f, ll) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1, fillColor: '#F59E0B', fillOpacity: 0.9 })} />}
      </MapaPerfil>

      <PanelFab abierto={isSidebarOpen} esMovil={esMovil} onAbrir={() => setIsSidebarOpen(true)} onCerrar={() => setIsSidebarOpen(false)} etiqueta="Solicitudes" />

      <div className="floating-sidebar-wrapper">
        <AdministradorSidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          sesion={sesion}
          catalogo={catalogo}
          mediciones={visibles}
          periodosPorId={periodosPorId}
          seleccion={seleccion}
          onSeleccionar={(id) => { setSeleccion(id); setResumen(null); if (esMovil) setIsSidebarOpen(false); }}
          capasBorrador={capasBorrador}
          capaVista={capaVista}
          onVerCapa={(id) => { setCapaVista(capaVista === id ? null : id); setCargada(null); }}
          onCargarCapa={() => { setModalCarga(true); if (esMovil) setIsSidebarOpen(false); }}
          onInvitaciones={() => { setInvitaciones(true); if (esMovil) setIsSidebarOpen(false); }}
          onRechazos={() => { setRechazos(true); if (esMovil) setIsSidebarOpen(false); }}
          nRechazos={nRechazos}
        />
      </div>

      {catalogo && medicion && (
        <DetalleMedicion
          idMedicion={medicion.id}
          catalogo={catalogo}
          onClose={() => setSeleccion(null)}
          pie={<PanelDictamen medicion={medicion} sesion={sesion} />}
        />
      )}

      {resumen && !medicion && <DashboardKPIs resumen={resumen} onClose={() => setResumen(null)} />}

      {fichaCapa && <CapaMetadataModal datos={fichaCapa} onClose={() => setFichaCapa(null)} />}

      <CapaCargaModal isOpen={modalCarga} onClose={() => setModalCarga(false)} catalogo={catalogo} onVerificar={(r) => { setCargada(r); setCapaVista(null); }} />

      {rechazos && <RechazosPanel sesion={sesion} onClose={() => setRechazos(false)} onCambio={setNRechazos} />}
      {invitaciones && sesion?.perfil === 'administrador_titular' && <InvitacionesPanel sesion={sesion} onClose={() => setInvitaciones(false)} />}

      <div className={`fullwidth-bottom-banner${filtrosAbiertos ? ' abierto' : ''}`} style={{ left: !esMovil && isSidebarOpen ? '280px' : '0', transition: 'left 0.3s ease' }}>
        <button type="button" className="banner-handle" onClick={() => setFiltrosAbiertos(!filtrosAbiertos)} aria-expanded={filtrosAbiertos}>
          <span><SlidersHorizontal size={15} /> Filtros y tablero</span>
          <ChevronUp size={16} style={{ transform: filtrosAbiertos ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        <div className="banner-filter-row">
          <div className="filter-group">
            <label>Instrumento de origen</label>
            <select value={filtro.instrumento} onChange={(e) => setFiltro({ ...filtro, instrumento: e.target.value, indicador: '' })}>
              <option value="">Todos</option>
              {catalogo?.instrumento_origen.map((i) => <option key={i.id} value={i.id}>{i.clave}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Eje temático</label>
            <select value={filtro.eje} onChange={(e) => setFiltro({ ...filtro, eje: e.target.value, indicador: '' })}>
              <option value="">Todos</option>
              {catalogo?.eje_tematico.map((e) => <option key={e.id} value={e.id}>{e.numero_eje}. {e.nombre}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Indicador ({indicadoresFiltrados.length})</label>
            <select value={filtro.indicador} onChange={(e) => setFiltro({ ...filtro, indicador: e.target.value })}>
              <option value="">Seleccione indicador…</option>
              {indicadoresFiltrados.map((i) => <option key={i.id} value={i.id}>{i.id} · {i.nombre}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Periodo</label>
            <select value={filtro.periodo} onChange={(e) => setFiltro({ ...filtro, periodo: e.target.value })}>
              <option value="">Todos</option>
              {op.periodo.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </select>
          </div>
          <div className="filter-buttons-column">
            <button className="btn-base btn-primary" onClick={generar} disabled={!filtro.indicador}><Play size={16} fill="currentColor" /> Generar</button>
            {filtro.indicador
              ? <Link className="btn-base btn-secondary" style={{ textDecoration: 'none' }} to={`/geovisor?indicador=${filtro.indicador}`}><MapIcon size={16} /> Ver capas (F06)</Link>
              : <button className="btn-base btn-secondary" disabled><MapIcon size={16} /> Ver capas (F06)</button>}
            <button className="btn-base btn-tertiary" onClick={exportarCsv}><Download size={16} /> Exportar CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdministradorLayout;
