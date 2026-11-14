import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Layers, Eye } from 'lucide-react';
import { Catalogo } from '../capturista/CapturistaSidebar';
import { geojsonDeCapa } from '../../../lib/sesim/api';
import AdministradorSidebar from './AdministradorSidebar';
import DictamenCapa from './DictamenCapa';
import TableroTerritorial from './TableroTerritorial';
import InvitacionesPanel from './InvitacionesPanel';
import RechazosPanel from '../comun/RechazosPanel';
import MapaCaptura from '../capturista/MapaCaptura';
import PanelFab from '../comun/PanelFab';
import { pendientesRechazo } from '../../../lib/sesim/catalogoApi';
import { cargarArbolCapas } from '../../../lib/sesim/capas';
import { CONFIG_INICIAL } from '../../../lib/sesim/estiloCapa';
import { usePanelLateral } from '../../../lib/sesim/usePanelLateral';
import { useSesion } from '../../../lib/sesim/sesion';
import RecorridoGeovisor, { recorridoVisto, marcarRecorrido } from '../../geovisor/RecorridoGeovisor';
import '../capturista/Capturista.css';
import '../comun/Comun.css';
import './AdminPerfil.css';

/**
 * Perfil ADMINISTRADOR y ADMINISTRADOR TITULAR (paleta verde de perfiles-tema.css; mismo diseño que el capturista).
 *  · Dictamina capas: valida, publica o devuelve; aprueba o rechaza actualizaciones de capas vigentes.
 *  · Define la restricción de uso de cada capa (publicar exige «pública»).
 *  · Sigue las devoluciones y sus plazos de 10 días hábiles.
 *  · Solo el Titular: usuarios e invitaciones.
 * Todo viene del servidor (api.* con RLS); ninguna pantalla guarda datos por su cuenta.
 *
 * Pendiente (siguiente bloque): el tablero territorial, que vivirá en el geovisor con datos reales.
 */
const PASOS_GUIA = [
  { id: 'hacer', sel: '.cap-pestanas', titulo: 'Tres pestañas, tres tareas', texto: 'Cada pestaña es una tarea con su propia acción. Tú no subes ni actualizas capas: las dictaminas.', items: [
    { marca: '1', texto: 'Dictaminar: validas, publicas o devuelves lo que envía el equipo, de lo más urgente a lo menos.' },
    { marca: '2', texto: 'Instrumentos: das de alta y envías a revisión; solo el Administrador Titular los dictamina.' },
    { marca: '3', texto: 'Indicadores: das de alta y editas el catálogo. El umbral del semáforo lo fija el Titular.' }] },
  { id: 'accesos', sel: '.adm-accesos', titulo: 'Devoluciones y plazos', texto: 'Aquí ves todo lo que se devolvió, a quién, el motivo y los 10 días hábiles que le quedan. Lo que devolviste y lo que te devolvieron a ti. El Titular además administra usuarios e invitaciones.' },
  { id: 'abrir-panel', sel: '.cap-toggle', selMovil: '.panel-fab', titulo: 'Abre o pliega tu panel', texto: 'Muestra el panel completo o lo deja como barra de íconos para tener más mapa.' },
  { id: 'capas', sel: '.adm-capas-btn', titulo: 'Capas del mapa', texto: 'Junto al zoom y la simbología. Abre el catálogo de capas (Mapa base, Diagnóstico e Indicadores) para encenderlas en el mapa y abrir su ficha. Al dictaminar, la capa se enciende y se centra sola: el mapa siempre queda a la vista.' },
  { id: 'dictaminar', sel: '.adm-grupo, .cap-mesa', titulo: 'Qué espera tu dictamen', texto: 'Se ordena de lo más urgente a lo menos: actualizaciones propuestas a capas vigentes, capas nuevas en revisión y capas validadas que faltan publicar. Toca una para abrir su ficha.' },
  { id: 'ficha', sel: '.cap-mesa', titulo: 'La ficha de cada capa', texto: 'Muestra a qué categoría pertenece (Mapa base, Diagnóstico o Indicadores), en qué estado va y si ya está aprobada, la justificación de quien la envió y el botón «Ver campos y registros»: una ventana que puedes mover, redimensionar y minimizar para no tapar el mapa.' },
  { id: 'reglas', sel: '.cap-pestanas', titulo: 'Reglas que cuida el sistema', texto: 'Cuatro ojos: quien envió una capa no la valida ni la publica. Para publicar, su restricción de uso debe ser «pública». Devolver o rechazar exige un motivo y abre 10 días hábiles para quien debe corregir.' },
  { id: 'herramientas', sel: '.mc-grupo', titulo: 'Herramientas y simbología, juntas', texto: 'Capas del mapa, satélite o mapa claro, acercar, alejar, medir y esta guía van en una sola barra con la simbología debajo. Arrástrala desde el asa de la izquierda (o desde «Simbología») para moverla: viajan juntas.' },
  { id: 'modos', sel: '.adm-modos', titulo: 'Mapa, Tablero y Semáforo', texto: 'Tablero resume lo publicado (indicadores, municipios con dato, capas por estado). Semáforo lista los indicadores con su color y, al elegir uno, pinta los municipios en el mapa. Todo viene del servidor y solo cuenta lo publicado.' },
  { id: 'bitacora', sel: '.cap-bitacora', titulo: 'La bitácora completa', texto: 'Todo lo que pasa en capas, instrumentos, catálogos y cuentas, por día, con filtros por tipo, estado y usuario. Se puede exportar a CSV. Solo se agrega, nunca se edita.' },
  { id: 'guia', sel: '.cap-guia-btn', titulo: 'Vuelve cuando quieras', texto: 'Con el botón «?» abres de nuevo esta guía.' },
];

const AdministradorLayout = () => {
  const sesion = useSesion();
  const [panelAbierto, setPanelAbierto, esMovil] = usePanelLateral();
  const [arbol, setArbol] = useState(null);
  const [errorArbol, setErrorArbol] = useState('');
  const [version, setVersion] = useState(0);
  const [activas, setActivas] = useState(() => new Set());
  const [configPorCapa, setConfigPorCapa] = useState({});
  const [dictamen, setDictamen] = useState(null); // id de la capa abierta
  const [rechazos, setRechazos] = useState(false);
  const [nRechazos, setNRechazos] = useState(0);
  const [invitaciones, setInvitaciones] = useState(false);
  const [mapa, setMapa] = useState(null);
  const [capasAbiertas, setCapasAbiertas] = useState(false);
  const [modo, setModo] = useState('mapa'); // 'mapa' | 'tablero' | 'semaforo'
  const [coloresUnidad, setColoresUnidad] = useState(null);
  const claveGuia = `sesim.administracion.recorrido.v1.${sesion?.id ?? 'anon'}`;
  const [guia, setGuia] = useState(() => !recorridoVisto(claveGuia));
  const cerrarGuia = () => { marcarRecorrido(claveGuia); setGuia(false); };

  const contarRechazos = useCallback(() => {
    pendientesRechazo().then((r) => { if (Array.isArray(r)) setNRechazos(r.length); }).catch(() => {});
  }, []);
  useEffect(() => { contarRechazos(); }, [contarRechazos]);

  useEffect(() => {
    let vivo = true;
    cargarArbolCapas({ incluirBorrador: true })
      .then((a) => { if (vivo) { setArbol(a); setErrorArbol(''); } })
      .catch((e) => { if (vivo) setErrorArbol(e.message); });
    return () => { vivo = false; };
  }, [version]);

  const capasTodas = useMemo(() => (arbol ? [...arbol.capasPorId.values()] : []), [arbol]);
  const capasEnMapa = useMemo(() => [...activas].map((id) => arbol?.capasPorId.get(id)).filter(Boolean), [activas, arbol]);
  const configDe = useCallback((id) => configPorCapa[id] ?? CONFIG_INICIAL, [configPorCapa]);
  const capaAbierta = dictamen ? arbol?.capasPorId.get(dictamen) ?? null : null;

  const alternarCapa = (id) => setActivas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarSimbologia = (id) => setConfigPorCapa((p) => ({ ...p, [id]: { ...configDe(id), simbologia: !configDe(id).simbologia } }));
  const alternarCategoria = (idCat, visible) => setConfigPorCapa((p) => {
    const n = { ...p };
    capasEnMapa.forEach((c) => { if (c.categoria === idCat) n[c.id] = { ...(p[c.id] ?? CONFIG_INICIAL), simbologia: visible }; });
    return n;
  });
  const cerrar = () => { if (esMovil) setPanelAbierto(false); };

  // Al abrir una capa para dictaminar se enciende en el mapa y se centra, dejando libres el panel y la ficha.
  const verEnMapa = useCallback(async (id) => {
    setActivas((s) => new Set([...s, id]));
    const capa = arbol?.capasPorId.get(id);
    if (!capa || !mapa) return;
    try {
      const gj = await geojsonDeCapa(capa);
      const b = L.geoJSON(gj).getBounds();
      if (b.isValid()) mapa.flyToBounds(b, { paddingTopLeft: [esMovil ? 20 : (panelAbierto ? 480 : 110), 90], paddingBottomRight: [esMovil ? 20 : 520, 70], duration: 1, maxZoom: 14 });
    } catch { /* capa sin geometría cargada todavía: solo se enciende */ }
  }, [arbol, mapa, esMovil, panelAbierto]);
  const abrirDictamen = (id) => { setModo('mapa'); setDictamen(id); setCapasAbiertas(false); cerrar(); verEnMapa(id); };
  const cambiarModo = (m) => { setModo(m); if (m !== 'mapa') { setDictamen(null); setCapasAbiertas(false); cerrar(); } };
  const nPendientes = useMemo(() => capasTodas.filter((c) => c.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente' || c.estatus === 'revision' || c.estatus === 'vigente_admin').length, [capasTodas]);

  return (
    <div className={`dashboard-fullscreen-container cap-contenedor adm-contenedor${!esMovil && !panelAbierto ? ' cap-contenedor--riel' : ''}`}>
      <MapaCaptura
        capas={capasEnMapa}
        capasDibujo={capasEnMapa}
        configDe={configDe}
        onAlternarCapa={alternarSimbologia}
        onAlternarCategoria={alternarCategoria}
        panelAbierto={panelAbierto && !esMovil}
        onMapa={setMapa}
        agrupar
        coloresUnidad={coloresUnidad}
        extraHerramientas={(
          <button type="button" className="adm-capas-btn" aria-expanded={capasAbiertas} onClick={() => setCapasAbiertas((v) => !v)} title="Capas del mapa" aria-label="Capas del mapa">
            <Layers size={18} aria-hidden="true" />{activas.size > 0 && <span className="adm-n">{activas.size}</span>}
          </button>
        )}
        panelCapas={capasAbiertas && (
          <div className="cap-barra adm-capas-card" role="dialog" aria-label="Capas del mapa">
            <Catalogo arbol={arbol} activas={activas} onAlternarCapa={alternarCapa} onActualizarCapa={abrirDictamen}
              AccionIcono={Eye} accionTitulo={(id) => `Abrir la ficha y el dictamen de ${id}`} ayudaAccion="pulsa el ojo para abrir su ficha y dictaminarla" />
          </div>
        )}
        onGuia={() => setGuia(true)}
        rotuloGuia="la guía de la administración"
        textoVacio="Aquí aparecerán los colores de lo que veas en el mapa. Enciende una capa con el botón de capas de esta barra o ábrela desde «Dictaminar» y pulsa «Ver la capa en el mapa»."
      />

      <div className="adm-modos" role="group" aria-label="Modo de la vista">
        <button type="button" aria-pressed={modo === 'mapa'} onClick={() => cambiarModo('mapa')}>Mapa</button>
        <button type="button" aria-pressed={modo === 'tablero'} onClick={() => cambiarModo(modo === 'tablero' ? 'mapa' : 'tablero')}>Tablero</button>
        <button type="button" aria-pressed={modo === 'semaforo'} onClick={() => cambiarModo(modo === 'semaforo' ? 'mapa' : 'semaforo')}>Semáforo</button>
      </div>

      <PanelFab abierto={panelAbierto} esMovil={esMovil} onAbrir={() => setPanelAbierto(true)} onCerrar={() => setPanelAbierto(false)} etiqueta="Mi panel" />

      <div className="floating-sidebar-wrapper">
        <AdministradorSidebar
          abierto={panelAbierto}
          setAbierto={setPanelAbierto}
          esMovil={esMovil}
          sesion={sesion}
          arbol={arbol}
          capasTodas={capasTodas}
          activas={activas}
          onAlternarCapa={alternarCapa}
          nRechazos={nRechazos}
          onDictaminar={abrirDictamen}
          onAbrirCapas={() => { setCapasAbiertas(true); cerrar(); }}
          onRechazos={() => { setRechazos(true); cerrar(); }}
          onInvitaciones={() => { setInvitaciones(true); cerrar(); }}
          onGuia={() => setGuia(true)}
        />
      </div>

      {capaAbierta && (
        <DictamenCapa
          key={capaAbierta.id + capaAbierta.estatus}
          capa={capaAbierta}
          onClose={() => setDictamen(null)}
          onHecho={() => { setVersion((v) => v + 1); contarRechazos(); }}
          onVerEnMapa={verEnMapa}
        />
      )}

      {modo !== 'mapa' && <TableroTerritorial key={modo} modo={modo} capas={capasTodas} pendientes={nPendientes} onCerrar={() => cambiarModo('mapa')} onColores={setColoresUnidad} />}

      {rechazos && <RechazosPanel sesion={sesion} onClose={() => { setRechazos(false); contarRechazos(); }} onCambio={setNRechazos} />}
      {invitaciones && sesion?.perfil === 'administrador_titular' && <InvitacionesPanel sesion={sesion} onClose={() => setInvitaciones(false)} />}

      <RecorridoGeovisor
        abierto={guia}
        onCerrar={cerrarGuia}
        pasos={PASOS_GUIA}
        titulo={sesion?.perfil === 'administrador_titular' ? 'Guía del Administrador Titular' : 'Guía del administrador'}
        etiqueta="Guía de la administración"
        encabezado="Dictamina, publica y mantén el catálogo"
        intro="Te mostramos cómo dictaminar capas, qué puedes dar de alta, las reglas que cuida el sistema y dónde queda todo registrado, en {total} pasos."
        recordatorio={<>Siempre podrás volver con el botón <b>?</b> de tu panel o del mapa.</>}
      />

      {errorArbol && <div className="aviso aviso-error cap-aviso-flotante">No se pudo cargar el catálogo: {errorArbol}</div>}
    </div>
  );
};

export default AdministradorLayout;
