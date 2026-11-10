import { useCallback, useEffect, useMemo, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Send, Pencil, Loader2 } from 'lucide-react';
import CapturistaSidebar from './CapturistaSidebar';
import MedicionModal from './MedicionModal';
import { CAPTURA_MEDICIONES } from './candados';
import CapaCapturaModal from './CapaCapturaModal';
import MapaCaptura from './MapaCaptura';
import DetalleMedicion from '../comun/DetalleMedicion';
import { useCatalogoOperativo } from '../comun/useCatalogoOperativo';
import RechazosCaptura from './RechazosCaptura';
import RecorridoGeovisor, { recorridoVisto, marcarRecorrido } from '../../geovisor/RecorridoGeovisor';
import { pendientesRechazo } from '../../../lib/sesim/catalogoApi';
import { cargarArbolCapas } from '../../../lib/sesim/capas';
import { CONFIG_INICIAL } from '../../../lib/sesim/estiloCapa';
import PanelFab from '../comun/PanelFab';
import { usePanelLateral } from '../../../lib/sesim/usePanelLateral';
import { useSesion } from '../../../lib/sesim/sesion';
import { useMediciones, enviarMedicionApi, ultimoDictamenDe } from '../../../lib/sesim/medicionesApi';
import { construirSimbologia } from '../../../lib/sesim/simbologia';
import '../comun/Comun.css';

/**
 * Perfil CAPTURISTA (Tabla 3). Trabaja en dos frentes, de más a menos frecuente:
 *
 *  1. CAPAS: sube capas nuevas y actualiza las suyas mientras están en borrador (api.fn_guardar_capa) y las envía a
 *     revisión (api.fn_enviar_capa_revision). Todo desde listas; el archivo se revisa en el acto (EPSG:4326 único).
 *  2. MEDICIONES: captura el valor de un indicador aprobado → evidencia → envío a revisión; si se devuelve, corrige
 *     y reenvía (plazo de 10 días hábiles).
 *
 * No da de alta indicadores ni instrumentos (atribución del Administrador).
 * El mapa es propio del perfil (MapaCaptura): simbología en cristal como el geovisor público, acercar/alejar,
 * medir, mapa claro/satélite y guía.
 */

/** Guía de primera visita (mismo recorrido con foco que el geovisor). Cada `sel` es una zona real; si no está a la vista el paso se omite. */
const PASOS_GUIA_TODOS = [
  { id: 'hacer', sel: '.cap-hacer', titulo: CAPTURA_MEDICIONES ? 'Tres cosas que puedes hacer' : 'Dos cosas que puedes hacer', texto: CAPTURA_MEDICIONES ? 'Subir una capa, actualizar una que ya existe o capturar la medición de un indicador. Cada botón dice qué hace.' : 'Subir una capa nueva o actualizar una que ya existe. Cada botón dice qué hace.', items: [
    { marca: '1', texto: 'Subir capa: la agregas a un grupo o indicador que ya existe, nunca de la nada.' },
    { marca: '2', texto: 'Actualizar capa: subes la versión nueva y explicas el cambio. Si la capa ya está vigente, tu cambio se manda como propuesta y la administración lo dictamina.' },
    ...(CAPTURA_MEDICIONES ? [{ marca: '3', texto: 'Capturar medición: el valor de un indicador por municipio y periodo.' }] : [])] },
  { id: 'archivo', sel: '.cap-subir', titulo: 'El archivo, siempre GeoPackage', texto: 'Solo se acepta un GeoPackage (.gpkg) de hasta 50 MB, en EPSG:4326 y con una sola capa de elementos. El sistema lo revisa al instante y, si no pasa, te dice qué corregir. Los campos con asterisco (*) son obligatorios.' },
  { id: 'abrir-panel', sel: '.cap-toggle', selMovil: '.panel-fab', titulo: 'Abre o pliega tu panel', texto: 'Muestra tu panel completo o lo deja como una barra de íconos para tener más mapa.' },
  { id: 'pestanas', sel: '.cap-pestanas', titulo: 'Dos pestañas: Catálogo y Mi mesa de trabajo', texto: 'Catálogo es para explorar y elegir capas; Mi mesa de trabajo es para saber qué está pendiente de ti. Cambia entre una y otra cuando quieras.' },
  { id: 'categorias', sel: '.cap-segmentos', titulo: 'El catálogo, en tres categorías', texto: 'Cada capa pertenece a una categoría. Al subir o actualizar eliges la misma, así que el orden es siempre el mismo.', items: [
    { marca: '1', texto: 'Mapa base: la referencia territorial (límites, vialidades, localidades).' },
    { marca: '2', texto: 'Diagnóstico: capas que describen un tema o problema, agrupadas por grupo.' },
    { marca: '3', texto: 'Indicadores: capas ligadas a un indicador; una capa puede ligarse a varios.' }] },
  { id: 'capas', sel: '.cap-capa', titulo: 'Enciende capas y actualízalas', texto: 'Marca la casilla para ver la capa en el mapa; su simbología aparece en la leyenda. El botón ↻ de la derecha abre «Actualizar capa» ya con esa capa elegida.' },
  { id: 'estados', sel: '.cap-estados, .cap-pestanas', titulo: 'Mi mesa de trabajo: los estados', texto: 'Tu trabajo pasa por estos estados. Elige uno para ver qué significa y qué sigue.', items: [
    { marca: '⮌', texto: 'Devueltas: la administración pidió correcciones; tienes 10 días hábiles para atenderlas.' }, { marca: '✎', texto: 'Sin enviar: borradores; puedes continuarlos y enviarlos a revisión.' }, { marca: '⧗', texto: 'En revisión: solo esperar el dictamen.' }, { marca: '✓', texto: 'Aprobadas: ya forman parte del sistema.' }] },
  { id: 'devueltas', sel: '.cap-ver-todo, .cap-estados', titulo: 'Cuando algo se devuelve', texto: 'En «Devueltas» ves el motivo y los días hábiles que te quedan. Si era una capa nueva, la corriges y la reenvías; si era una actualización de una capa vigente, propones el cambio de nuevo. La capa vigente sigue publicada mientras tanto.' },
  { id: 'herramientas', sel: '.mc-herramientas', titulo: 'Herramientas del mapa', texto: 'En este orden: cambiar entre satélite y mapa claro, acercar, alejar, medir distancias y abrir esta guía.' },
  { id: 'simbologia', sel: '.leyenda-flotante, .mc-leyenda-vacia', titulo: 'Simbología', texto: 'Muestra los colores de lo que tienes en el mapa, incluida la capa que estás subiendo. Puedes arrastrarla y apagar la de una capa o categoría.' },
  { id: 'bitacora', sel: '.cap-bitacora', titulo: 'Tu bitácora', texto: 'Es tu historial: cada cosa que haces y cada decisión de la administración sobre tu trabajo, por día. Puedes filtrarlo, buscar y exportarlo a CSV. Solo se agrega, nunca se edita.' },
  { id: 'guia', sel: '.cap-guia-btn', titulo: 'Vuelve cuando quieras', texto: 'Con el botón «?» abres de nuevo esta guía.' },
];

const PASOS_GUIA = PASOS_GUIA_TODOS;

const COLOR_PREVIA = '#9F2241';
const estiloVistaPrevia = { color: COLOR_PREVIA, weight: 2, fillColor: COLOR_PREVIA, fillOpacity: 0.25 };

const CapturistaLayout = () => {
  const sesion = useSesion();
  const api = useMediciones();
  const { catalogo, error } = useCatalogoOperativo();
  const [panelAbierto, setPanelAbierto, esMovil] = usePanelLateral();
  const [modal, setModal] = useState({ abierto: false, id: null });
  const [modalCapa, setModalCapa] = useState(null); // { modo, id, n }
  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [mapa, setMapa] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [rechazos, setRechazos] = useState(false);
  const [rechazosCapas, setRechazosCapas] = useState([]);
  const [enviandoId, setEnviandoId] = useState(null);
  const [arbol, setArbol] = useState(null);
  const [errorArbol, setErrorArbol] = useState('');
  const [version, setVersion] = useState(0);
  const [activas, setActivas] = useState(() => new Set());
  const [configPorCapa, setConfigPorCapa] = useState({});
  const claveGuia = `sesim.capturista.recorrido.v4.${sesion?.id ?? 'anon'}`;
  const [guia, setGuia] = useState(() => !recorridoVisto(claveGuia));

  const cargarRechazos = useCallback(() => {
    pendientesRechazo().then((r) => { if (Array.isArray(r)) setRechazosCapas(r); }).catch(() => {});
  }, []);
  useEffect(() => { cargarRechazos(); }, [cargarRechazos]);

  // La RLS ya limita al capturista: ve lo validado/publicado y SUS borradores.
  useEffect(() => {
    let vivo = true;
    cargarArbolCapas({ incluirBorrador: true })
      .then((a) => { if (vivo) { setArbol(a); setErrorArbol(''); } })
      .catch((e) => { if (vivo) setErrorArbol(e.message); });
    return () => { vivo = false; };
  }, [version]);

  const capasTodas = useMemo(() => (arbol ? [...arbol.capasPorId.values()] : []), [arbol]);
  const capasMias = useMemo(() => capasTodas.filter((c) => ['borrador', 'revision'].includes(c.estatus)), [capasTodas]);
  const catalogoCapas = useMemo(() => (catalogo ? { ...catalogo, capa: capasTodas } : null), [catalogo, capasTodas]);
  const capasEnMapa = useMemo(() => [...activas].map((id) => arbol?.capasPorId.get(id)).filter(Boolean), [activas, arbol]);
  // La capa que se está subiendo también aparece en la simbología.
  const capaPrevia = useMemo(() => {
    if (!vistaPrevia) return null;
    const c = vistaPrevia.capa;
    return { ...c, colorBase: COLOR_PREVIA, simbologia: construirSimbologia({ titulo: c.titulo, clases: [] }, null, COLOR_PREVIA) };
  }, [vistaPrevia]);
  const capasLeyenda = useMemo(() => (capaPrevia ? [...capasEnMapa.filter((c) => c.id !== capaPrevia.id), capaPrevia] : capasEnMapa), [capasEnMapa, capaPrevia]);
  const configDe = useCallback((id) => configPorCapa[id] ?? CONFIG_INICIAL, [configPorCapa]);

  const alternarCapa = (id) => setActivas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarSimbologia = (id) => setConfigPorCapa((p) => ({ ...p, [id]: { ...configDe(id), simbologia: !configDe(id).simbologia } }));
  const alternarCategoria = (idCat, visible) => setConfigPorCapa((p) => {
    const n = { ...p };
    capasLeyenda.forEach((c) => { if (c.categoria === idCat) n[c.id] = { ...(p[c.id] ?? CONFIG_INICIAL), simbologia: visible }; });
    return n;
  });

  // La RLS ya limita al capturista a SUS mediciones.
  const mias = CAPTURA_MEDICIONES ? api.mediciones : [];
  const periodosPorId = useMemo(() => new Map(api.periodos.map((p) => [p.id, p])), [api.periodos]);
  const seleccionada = mias.find((m) => m.id === seleccion);
  const devueltas = useMemo(() => mias.filter((m) => m.estado === 'rechazado').map((m) => {
    const d = ultimoDictamenDe(m.id, api.dictamenes);
    return { id: m.id, titulo: `${m.id_indicador} · ${periodosPorId.get(m.id_periodo)?.etiqueta ?? '—'}`, detalle: catalogo?.unidades?.get(m.id_unidad)?.nombre ?? m.id_unidad, motivo: d?.comentario ?? d?.motivo ?? null, quien: d?.revisor ?? null, cuando: d?.fecha ?? null };
  }), [mias, api.dictamenes, periodosPorId, catalogo]);
  const tieneEvidencia = (id) => api.evidencias.some((e) => e.id_medicion === id && e.vigente);

  const abrir = (id) => {
    setErrorAccion('');
    setSeleccion(id);
    if (esMovil) setPanelAbierto(false);
  };

  const enviar = async (id) => {
    setErrorAccion('');
    setEnviandoId(id);
    try {
      await enviarMedicionApi(id);
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setEnviandoId(null);
    }
  };

  const abrirCapa = (modo, id) => {
    setModalCapa({ modo, id: typeof id === 'string' ? id : null, n: Date.now() });
    if (esMovil) setPanelAbierto(false);
  };

  const mostrarVistaPrevia = ({ capa, geojson }) => {
    setVistaPrevia({ capa, geojson });
    try { mapa?.flyToBounds(L.geoJSON(geojson).getBounds(), { padding: [60, 60], duration: 1 }); } catch { /* sin geometría */ }
  };

  const cerrarGuia = () => { marcarRecorrido(claveGuia); setGuia(false); };

  return (
    <div className={`dashboard-fullscreen-container cap-contenedor${!esMovil && !panelAbierto ? ' cap-contenedor--riel' : ''}`}>
      <MapaCaptura
        capas={capasLeyenda}
        capasDibujo={capasEnMapa}
        configDe={configDe}
        onAlternarCapa={alternarSimbologia}
        onAlternarCategoria={alternarCategoria}
        resaltarUnidad={seleccionada?.id_unidad}
        onMapa={setMapa}
        onGuia={() => setGuia(true)}
        panelAbierto={panelAbierto && !esMovil}
      >
        {vistaPrevia && (
          <GeoJSON
            key={vistaPrevia.capa.id + (vistaPrevia.geojson.features?.length ?? 0)}
            data={vistaPrevia.geojson}
            style={estiloVistaPrevia}
            pointToLayer={(f, ll) => L.circleMarker(ll, { radius: 5, ...estiloVistaPrevia, fillOpacity: 0.7 })}
          />
        )}
      </MapaCaptura>

      <PanelFab abierto={panelAbierto} esMovil={esMovil} onAbrir={() => setPanelAbierto(true)} onCerrar={() => setPanelAbierto(false)} etiqueta="Mi panel" />

      <div className="floating-sidebar-wrapper">
        <CapturistaSidebar
          abierto={panelAbierto}
          setAbierto={setPanelAbierto}
          esMovil={esMovil}
          sesion={sesion}
          catalogo={catalogo}
          mediciones={mias}
          periodosPorId={periodosPorId}
          evidencias={api.evidencias}
          seleccion={seleccion}
          rechazosCapas={rechazosCapas}
          capasMias={capasMias}
          arbol={arbol}
          activas={activas}
          onAlternarCapa={alternarCapa}
          onSubirCapa={() => abrirCapa('nueva')}
          onActualizarCapa={(id) => abrirCapa('actualizar', id)}
          onNueva={() => { setModal({ abierto: true, id: null }); if (esMovil) setPanelAbierto(false); }}
          onSeleccionar={abrir}
          onRechazos={() => { setRechazos(true); if (esMovil) setPanelAbierto(false); }}
          onGuia={() => { setGuia(true); }}
        />
      </div>

      {rechazos && (
        <RechazosCaptura
          sesion={sesion}
          onClose={() => { setRechazos(false); cargarRechazos(); }}
          onCambio={cargarRechazos}
          medicionesDevueltas={devueltas}
          onAbrirMedicion={(id) => { setRechazos(false); abrir(id); }}
          capas={capasTodas}
          onProponer={(id) => { setRechazos(false); abrirCapa('actualizar', id); }}
        />
      )}

      {vistaPrevia && (
        <button type="button" className="btn-base btn-secondary cap-quitar-previa" onClick={() => setVistaPrevia(null)}>Quitar vista previa de {vistaPrevia.capa.id}{vistaPrevia.parcial ? ` (se muestran ${vistaPrevia.geojson.features.length.toLocaleString('es-MX')} de ${vistaPrevia.n.toLocaleString('es-MX')} elementos)` : ''}</button>
      )}

      {(error || errorArbol) && <div className="aviso aviso-error cap-aviso-flotante">No se pudo cargar el catálogo: {error || errorArbol}</div>}
      {CAPTURA_MEDICIONES && api.error && (
        <div className="aviso aviso-error cap-aviso-flotante cap-aviso-flotante--2">
          No se pudieron leer sus mediciones: {api.error}
          <button type="button" className="btn-base btn-secondary" style={{ width: 'auto', height: 28 }} onClick={() => api.recargar()}>Reintentar</button>
        </div>
      )}

      {catalogoCapas && modalCapa && (
        <CapaCapturaModal
          key={modalCapa.n}
          modo={modalCapa.modo}
          capaInicial={modalCapa.id ? capasTodas.find((c) => c.id === modalCapa.id) ?? null : null}
          catalogo={catalogoCapas}
          onClose={() => setModalCapa(null)}
          onGuardada={() => { setVersion((v) => v + 1); cargarRechazos(); }}
          onVistaPrevia={mostrarVistaPrevia}
        />
      )}

      {catalogo && seleccionada && !modal.abierto && (
        <DetalleMedicion
          idMedicion={seleccionada.id}
          catalogo={catalogo}
          real
          onClose={() => setSeleccion(null)}
          pie={
            ['borrador', 'rechazado'].includes(seleccionada.estado) ? (
              <>
                {errorAccion && <div className="aviso aviso-error">{errorAccion}</div>}
                <div className="fila-botones">
                  <button type="button" className="btn-base btn-secondary" onClick={() => setModal({ abierto: true, id: seleccionada.id })}><Pencil size={14} /> Editar</button>
                  <button
                    type="button"
                    className="btn-base btn-primary"
                    disabled={enviandoId === seleccionada.id || !tieneEvidencia(seleccionada.id)}
                    aria-busy={enviandoId === seleccionada.id}
                    title={tieneEvidencia(seleccionada.id) ? '' : 'Adjunte una evidencia (Editar) para poder enviarla'}
                    onClick={() => enviar(seleccionada.id)}
                  >
                    {enviandoId === seleccionada.id ? <Loader2 size={14} className="girando" /> : <Send size={14} />} {enviandoId === seleccionada.id ? 'Enviando…' : seleccionada.estado === 'rechazado' ? 'Reenviar' : 'Enviar a revisión'}
                  </button>
                </div>
              </>
            ) : null
          }
        />
      )}

      {catalogo && (
        <MedicionModal
          abierto={modal.abierto}
          idMedicion={modal.id}
          sesion={sesion}
          catalogo={catalogoCapas ?? catalogo}
          onClose={() => setModal({ abierto: false, id: null })}
          onGuardada={(id) => setSeleccion(id)}
          onVerCapa={(id) => setActivas((x) => new Set([...x, id]))}
        />
      )}

      <RecorridoGeovisor
        abierto={guia}
        onCerrar={cerrarGuia}
        pasos={PASOS_GUIA}
        titulo="Guía del capturista"
        etiqueta="Guía del capturista"
        encabezado="Sube capas, corrige y envía tu trabajo"
        intro="Te mostramos cómo subir y actualizar capas, cómo se organiza el catálogo, qué hacer con lo que te devuelven y dónde queda tu historial, en {total} pasos."
        recordatorio={<>Siempre podrás volver con el botón <b>?</b> de tu panel o del mapa.</>}
      />
    </div>
  );
};

export default CapturistaLayout;
