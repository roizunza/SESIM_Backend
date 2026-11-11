import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Layers, Eye } from 'lucide-react';
import { Catalogo } from '../capturista/CapturistaSidebar';
import { geojsonDeCapa } from '../../../lib/sesim/api';
import AuditorSidebar from './AuditorSidebar';
import DictamenCapa from '../administradora/DictamenCapa';
import TableroTerritorial from '../administradora/TableroTerritorial';
import MapaCaptura from '../capturista/MapaCaptura';
import PanelFab from '../comun/PanelFab';
import { cargarArbolCapas } from '../../../lib/sesim/capas';
import { CONFIG_INICIAL } from '../../../lib/sesim/estiloCapa';
import { usePanelLateral } from '../../../lib/sesim/usePanelLateral';
import { useSesion } from '../../../lib/sesim/sesion';
import RecorridoGeovisor, { recorridoVisto, marcarRecorrido } from '../../geovisor/RecorridoGeovisor';
import '../capturista/Capturista.css';
import '../comun/Comun.css';
import '../administradora/AdminPerfil.css';

/**
 * Perfil AUDITOR (paleta gris de perfiles-tema.css; mismo diseño que el capturista y la administración).
 * Solo observa: no sube, no dictamina, no aprueba ni da de baja nada, y no registra hallazgos a mano.
 *  · Mapa con todas las capas (también las que aún no son públicas), con la misma barra de herramientas y simbología.
 *  · Tablero y Semáforo con los datos publicados.
 *  · Ficha de cada capa en consulta; devoluciones y plazos en consulta; bitácora completa.
 * Todo viene del servidor (api.* con RLS); nada se guarda en el navegador.
 */
const PASOS_GUIA = [
  { id: 'rol', sel: '.cap-pestanas', titulo: 'Tú observas, no decides', texto: 'Ves lo mismo que la administración, pero sin botones para aprobar, devolver, publicar ni dar de baja. Tu valor es que todo quede a la vista y registrado.', items: [
    { marca: '1', texto: 'Capas, Instrumentos e Indicadores. En cada pestaña: «Público» (lo que ve la ciudadanía) y «Uso interno» (todo lo demás, con su estado).' }] },
  { id: 'accesos', sel: '.adm-accesos', titulo: 'Trazabilidad', texto: 'La vida de una capa, un instrumento o un indicador, de principio a fin: quién lo subió, quién lo revisó, qué se devolvió y a qué está vinculado. Las devoluciones y sus plazos están en la Bitácora, con el filtro «Devoluciones».' },
  { id: 'abrir-panel', sel: '.cap-toggle', selMovil: '.panel-fab', titulo: 'Abre o pliega tu panel', texto: 'Muestra el panel completo o lo deja como barra de íconos para tener más mapa.' },
  { id: 'capas', sel: '.adm-capas-btn', titulo: 'Capas del mapa', texto: 'Junto al zoom y la simbología. Abre el catálogo para encender capas y abrir su ficha. Al abrir una capa se enciende y se centra sola.' },
  { id: 'herramientas', sel: '.mc-grupo', titulo: 'Herramientas y simbología, juntas', texto: 'Capas, satélite o mapa claro, acercar, alejar, medir y esta guía van en una sola barra con la simbología debajo. Arrástrala desde el asa de la izquierda: viajan juntas.' },
  { id: 'modos', sel: '.adm-modos', titulo: 'Mapa, Tablero y Semáforo', texto: 'Tablero resume lo publicado. Semáforo lista los indicadores con su color y, al elegir uno, pinta los municipios en el mapa. Solo cuenta lo publicado.' },
  { id: 'bitacora', sel: '.cap-bitacora', titulo: 'La bitácora completa', texto: 'Capas, instrumentos, catálogos, cuentas e invitaciones, por día, con filtros por tipo, estado y usuario. Se puede exportar a CSV. Solo se agrega, nunca se edita.' },
  { id: 'guia', sel: '.cap-guia-btn', titulo: 'Vuelve cuando quieras', texto: 'Con el botón «?» abres de nuevo esta guía.' },
];

const AuditorLayout = () => {
  const sesion = useSesion();
  const [panelAbierto, setPanelAbierto, esMovil] = usePanelLateral();
  const [arbol, setArbol] = useState(null);
  const [errorArbol, setErrorArbol] = useState('');
  const [activas, setActivas] = useState(() => new Set());
  const [configPorCapa, setConfigPorCapa] = useState({});
  const [ficha, setFicha] = useState(null);
  const [mapa, setMapa] = useState(null);
  const [capasAbiertas, setCapasAbiertas] = useState(false);
  const [modo, setModo] = useState('mapa');
  const [coloresUnidad, setColoresUnidad] = useState(null);
  const claveGuia = `sesim.auditoria.recorrido.v1.${sesion?.id ?? 'anon'}`;
  const [guia, setGuia] = useState(() => !recorridoVisto(claveGuia));
  const cerrarGuia = () => { marcarRecorrido(claveGuia); setGuia(false); };

  useEffect(() => {
    let vivo = true;
    cargarArbolCapas({ incluirBorrador: true })
      .then((a) => { if (vivo) { setArbol(a); setErrorArbol(''); } })
      .catch((e) => { if (vivo) setErrorArbol(e.message); });
    return () => { vivo = false; };
  }, []);

  const capasTodas = useMemo(() => (arbol ? [...arbol.capasPorId.values()] : []), [arbol]);
  const capasEnMapa = useMemo(() => [...activas].map((id) => arbol?.capasPorId.get(id)).filter(Boolean), [activas, arbol]);
  const configDe = useCallback((id) => configPorCapa[id] ?? CONFIG_INICIAL, [configPorCapa]);
  const capaAbierta = ficha ? arbol?.capasPorId.get(ficha) ?? null : null;

  const alternarCapa = (id) => setActivas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarSimbologia = (id) => setConfigPorCapa((p) => ({ ...p, [id]: { ...configDe(id), simbologia: !configDe(id).simbologia } }));
  const alternarCategoria = (idCat, visible) => setConfigPorCapa((p) => {
    const n = { ...p };
    capasEnMapa.forEach((c) => { if (c.categoria === idCat) n[c.id] = { ...(p[c.id] ?? CONFIG_INICIAL), simbologia: visible }; });
    return n;
  });
  const cerrar = () => { if (esMovil) setPanelAbierto(false); };

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
  const abrirFicha = (id) => { setModo('mapa'); setFicha(id); setCapasAbiertas(false); cerrar(); verEnMapa(id); };
  const cambiarModo = (m) => { setModo(m); if (m !== 'mapa') { setFicha(null); setCapasAbiertas(false); cerrar(); } };
  const nFlujo = useMemo(() => capasTodas.filter((c) => c.metadatos_extra?.actualizacion_pendiente?.estado === 'pendiente' || c.estatus === 'revision' || c.estatus === 'vigente_admin').length, [capasTodas]);

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
            <Catalogo arbol={arbol} activas={activas} onAlternarCapa={alternarCapa} onActualizarCapa={abrirFicha}
              AccionIcono={Eye} accionTitulo={(id) => `Abrir la ficha de ${id} (consulta)`} ayudaAccion="pulsa el ojo para abrir su ficha en consulta" />
          </div>
        )}
        onGuia={() => setGuia(true)}
        rotuloGuia="la guía de auditoría"
        textoVacio="Aquí aparecerán los colores de lo que veas en el mapa. Enciende una capa con el botón de capas de esta barra o ábrela desde el panel."
      />

      <div className="adm-modos" role="group" aria-label="Modo de la vista">
        <button type="button" aria-pressed={modo === 'mapa'} onClick={() => cambiarModo('mapa')}>Mapa</button>
        <button type="button" aria-pressed={modo === 'tablero'} onClick={() => cambiarModo(modo === 'tablero' ? 'mapa' : 'tablero')}>Tablero</button>
        <button type="button" aria-pressed={modo === 'semaforo'} onClick={() => cambiarModo(modo === 'semaforo' ? 'mapa' : 'semaforo')}>Semáforo</button>
      </div>

      <PanelFab abierto={panelAbierto} esMovil={esMovil} onAbrir={() => setPanelAbierto(true)} onCerrar={() => setPanelAbierto(false)} etiqueta="Mi panel" />

      <div className="floating-sidebar-wrapper">
        <AuditorSidebar
          abierto={panelAbierto}
          setAbierto={setPanelAbierto}
          esMovil={esMovil}
          sesion={sesion}
          capasTodas={capasTodas}
          onVerCapa={abrirFicha}
          onAbrirCapas={() => { setCapasAbiertas(true); cerrar(); }}
          onGuia={() => setGuia(true)}
        />
      </div>

      {capaAbierta && <DictamenCapa key={capaAbierta.id + capaAbierta.estatus} capa={capaAbierta} soloLectura onClose={() => setFicha(null)} onVerEnMapa={verEnMapa} />}

      {modo !== 'mapa' && <TableroTerritorial key={modo} modo={modo} capas={capasTodas} pendientes={nFlujo} soloLectura onCerrar={() => cambiarModo('mapa')} onColores={setColoresUnidad} />}

      <RecorridoGeovisor
        abierto={guia}
        onCerrar={cerrarGuia}
        pasos={PASOS_GUIA}
        titulo="Guía del Auditor"
        etiqueta="Guía de auditoría"
        encabezado="Observa todo, sin modificar nada"
        intro="Te mostramos qué puedes consultar y dónde queda registrado todo lo que hace el equipo, en {total} pasos."
        recordatorio={<>Siempre podrás volver con el botón <b>?</b> de tu panel o del mapa.</>}
      />

      {errorArbol && <div className="aviso aviso-error cap-aviso-flotante">No se pudo cargar el catálogo: {errorArbol}</div>}
    </div>
  );
};

export default AuditorLayout;
