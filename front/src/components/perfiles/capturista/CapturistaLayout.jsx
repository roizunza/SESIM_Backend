import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Send, Pencil, Loader2 } from 'lucide-react';
import CapturistaSidebar from './CapturistaSidebar';
import MedicionModal from './MedicionModal';
import MapaPerfil from '../comun/MapaPerfil';
import DetalleMedicion from '../comun/DetalleMedicion';
import { useCatalogoOperativo } from '../comun/useCatalogoOperativo';
import RechazosPanel from '../comun/RechazosPanel';
import RecorridoGeovisor, { recorridoVisto, marcarRecorrido } from '../../geovisor/RecorridoGeovisor';
import { pendientesRechazo } from '../../../lib/sesim/catalogoApi';
import PanelFab from '../comun/PanelFab';
import { usePanelLateral } from '../../../lib/sesim/usePanelLateral';
import { useSesion } from '../../../lib/sesim/sesion';
import { useMediciones, enviarMedicionApi } from '../../../lib/sesim/medicionesApi';
import '../comun/Comun.css';

/**
 * Perfil CAPTURISTA (Tabla 3): escribe solo en medicion_indicador (borrador)
 * y evidencia_medicion; lee catálogos y SUS mediciones.
 *
 * Flujo (sección 1.5, pasos 2–4): captura → evidencia → envío a revisión.
 * Si el administrador rechaza, la medición vuelve con comentario y el
 * capturista la corrige y reenvía.
 *
 * La carga de cartografía y de instrumentos ya NO está aquí: escribir en
 * `capa` es atribución del Administrador.
 */

/** Guía de primera visita (mismo recorrido con foco que el geovisor). Cada `sel` es una zona real; si no está a la vista el paso se omite. */
const PASOS_GUIA = [
  { id: 'nuevo', sel: '.cap-nuevo', titulo: 'Captura el dato de un indicador', texto: 'Aquí empieza todo: eliges el indicador, el periodo y el municipio, registras el valor y adjuntas el documento que lo respalda.', items: [
    { marca: '1', texto: 'Guarda como borrador cuando quieras, sin perder nada.' },
    { marca: '2', texto: 'Adjunta una evidencia: PDF, JPG o PNG de hasta 10 MB.' },
    { marca: '3', texto: 'Envíala a revisión; ya no podrás editarla mientras se revisa.' }] },
  { id: 'abrir-panel', sel: '.cap-toggle', selMovil: '.panel-fab', titulo: 'Abre o pliega tu panel', texto: 'Este botón muestra tu panel completo, con nombres, o lo deja como una barra de íconos para tener más espacio de trabajo.' },
  { id: 'pestanas', sel: '.cap-pestanas', titulo: 'Tu trabajo, en dos pestañas', texto: '«Indicadores» reúne los datos que capturas (el ícono de barras). «Capas e instrumentos» (el ícono de capas) muestra lo cartográfico que fue rechazado, con plazo para atenderlo.' },
  { id: 'cola', sel: '.cap-carpeta, .cap-pestanas--riel', titulo: 'Lo primero, lo devuelto', texto: 'Las mediciones que el administrador devolvió salen arriba, con su comentario. Después van los borradores, lo que está en revisión y, al final, el historial.', items: [
    { marca: '⮌', texto: 'Devuelta: corrígela y reenvíala.' }, { marca: '✎', texto: 'Borrador: falta enviarla.' }, { marca: '⧗', texto: 'En revisión: solo esperar.' }] },
  { id: 'bitacora', sel: '.cap-bitacora', titulo: 'Tu bitácora', texto: 'Cada cosa que haces queda registrada: quién, qué y cuándo. Aquí puedes consultarla.' },
  { id: 'guia', sel: '.cap-guia-btn', titulo: 'Vuelve cuando quieras', texto: 'Con el botón «?» de tu panel abres de nuevo esta guía.' },
];

const CapturistaLayout = () => {
  const sesion = useSesion();
  const api = useMediciones();
  const { catalogo, error } = useCatalogoOperativo();
  const [panelAbierto, setPanelAbierto, esMovil] = usePanelLateral();
  const [modal, setModal] = useState({ abierto: false, id: null });
  const [seleccion, setSeleccion] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [rechazos, setRechazos] = useState(false);
  const [rechazosCapas, setRechazosCapas] = useState([]);
  const [enviandoId, setEnviandoId] = useState(null);
  const claveGuia = `sesim.capturista.recorrido.v1.${sesion?.id ?? 'anon'}`;
  const [guia, setGuia] = useState(() => !recorridoVisto(claveGuia));

  const cargarRechazos = useCallback(() => {
    pendientesRechazo().then((r) => { if (Array.isArray(r)) setRechazosCapas(r); }).catch(() => {});
  }, []);
  useEffect(() => { cargarRechazos(); }, [cargarRechazos]);

  // La RLS ya limita al capturista a SUS mediciones.
  const mias = api.mediciones;
  const periodosPorId = useMemo(() => new Map(api.periodos.map((p) => [p.id, p])), [api.periodos]);
  const seleccionada = mias.find((m) => m.id === seleccion);
  const tieneEvidencia = (id) => api.evidencias.some((e) => e.id_medicion === id && e.vigente);

  const abrir = (id) => {
    setErrorAccion('');
    // Un clic siempre abre la ficha; desde ahí se edita o se envía.
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

  const cerrarGuia = () => { marcarRecorrido(claveGuia); setGuia(false); };

  return (
    <div className={`dashboard-fullscreen-container cap-contenedor${!esMovil && !panelAbierto ? ' cap-contenedor--riel' : ''}`}>
      <MapaPerfil resaltarUnidad={seleccionada?.id_unidad} />

      <PanelFab abierto={panelAbierto} esMovil={esMovil} onAbrir={() => setPanelAbierto(true)} onCerrar={() => setPanelAbierto(false)} etiqueta="Mis mediciones" />

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
          onNueva={() => { setModal({ abierto: true, id: null }); if (esMovil) setPanelAbierto(false); }}
          onSeleccionar={abrir}
          onRechazos={() => { setRechazos(true); if (esMovil) setPanelAbierto(false); }}
          onGuia={() => { setGuia(true); }}
        />
      </div>

      {rechazos && <RechazosPanel sesion={sesion} onClose={() => { setRechazos(false); cargarRechazos(); }} onCambio={cargarRechazos} />}

      {error && <div className="aviso aviso-error cap-aviso-flotante">No se pudo cargar el catálogo: {error}</div>}
      {api.error && (
        <div className="aviso aviso-error cap-aviso-flotante cap-aviso-flotante--2">
          No se pudieron leer sus mediciones: {api.error}
          <button type="button" className="btn-base btn-secondary" style={{ width: 'auto', height: 28 }} onClick={() => api.recargar()}>Reintentar</button>
        </div>
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
          catalogo={catalogo}
          onClose={() => setModal({ abierto: false, id: null })}
          onGuardada={(id) => setSeleccion(id)}
        />
      )}

      <RecorridoGeovisor
        abierto={guia}
        onCerrar={cerrarGuia}
        pasos={PASOS_GUIA}
        titulo="Guía del capturista"
        etiqueta="Guía del capturista"
        encabezado="Captura, corrige y envía tus mediciones"
        intro="Te mostramos dónde capturar, dónde ver lo que te devolvieron y cómo seguir tu trabajo, en {total} pasos de menos de un minuto."
        recordatorio={<>Siempre podrás volver con el botón <b>?</b> de tu panel.</>}
      />
    </div>
  );
};

export default CapturistaLayout;
