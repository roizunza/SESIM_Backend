import { useId, useMemo, useState } from 'react';
import { CircleMarker } from 'react-leaflet';
import { Send, Download } from 'lucide-react';
import Drawer from '../plataforma/Drawer';
import EstadoCarga from '../plataforma/EstadoCarga';
import MapCanvas from './MapCanvas';
import { rpcOpcional } from '../../lib/sesim/api';
import { featureEnPunto } from '../../lib/sesim/tablero';
import { descargar, sufijoFecha } from '../../lib/sesim/descargas';
import { tokenCss } from './formato';

const CATEGORIAS = ['Seguridad vial', 'Infraestructura peatonal', 'Infraestructura ciclista', 'Transporte público', 'Señalización', 'Otro'];
const VACIO = { categoria: '', descripcion: '', contacto: '' };

/**
 * Formulario de reporte ciudadano con georreferenciación por clic en el mapa.
 * El municipio se deduce del punto con los polígonos oficiales (unidad_territorial_geom).
 */
export default function ReportarPuntoCritico({ abierto, onCerrar, geojson }) {
  const [punto, setPunto] = useState(null);
  const [campos, setCampos] = useState(VACIO);
  const [envio, setEnvio] = useState({ estado: 'inicial', mensaje: '' });
  const ids = { cat: useId(), desc: useId(), cont: useId() };

  const municipio = useMemo(() => {
    if (!punto || !geojson) return null;
    return featureEnPunto(geojson, [punto.lng, punto.lat])?.properties ?? null;
  }, [punto, geojson]);

  const reporte = punto && {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(punto.lng.toFixed(6)), Number(punto.lat.toFixed(6))] },
    properties: { ...campos, id_unidad: municipio?.id ?? null, fecha: new Date().toISOString() },
  };

  const valido = punto && municipio && campos.categoria && campos.descripcion.trim().length >= 10;

  const cerrar = () => {
    setPunto(null);
    setCampos(VACIO);
    setEnvio({ estado: 'inicial', mensaje: '' });
    onCerrar();
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!valido) return;
    setEnvio({ estado: 'enviando', mensaje: '' });
    try {
      await rpcOpcional('puntoCritico', { p_datos: reporte });
      setEnvio({ estado: 'ok', mensaje: 'Reporte recibido. Gracias por contribuir a una movilidad más segura.' });
    } catch (err) {
      setEnvio({ estado: err.codigo === 'sin_servicio' ? 'sin_servicio' : 'error', mensaje: err.message });
    }
  };

  const set = (k) => (e) => setCampos((c) => ({ ...c, [k]: e.target.value }));

  return (
    <Drawer abierto={abierto} onCerrar={cerrar} titulo="Reportar punto crítico" subtitulo="Participación ciudadana" ancho={640}>
      {envio.estado === 'ok' ? (
        <EstadoCarga estado="vacio" titulo="Reporte enviado" mensaje={envio.mensaje} accion={{ etiqueta: 'Cerrar', onClick: cerrar }} />
      ) : (
        <form className="form-reporte" onSubmit={enviar} noValidate>
          <p className="ficha-texto">Haga clic en el mapa para ubicar el punto. Puede acercarse con los botones + y −.</p>
          <MapCanvas geojson={geojson} onClicMapa={setPunto} alto={280} titulo="Mapa para ubicar el punto crítico" mostrarLeyenda={false}>
            {punto && <CircleMarker center={punto} radius={9} pathOptions={{ color: tokenCss('--c-guinda-dk', '#691C32'), fillColor: tokenCss('--c-guinda', '#9F2241'), fillOpacity: 0.9 }} />}
          </MapCanvas>
          <p className="form-reporte__ubicacion" aria-live="polite">
            {!punto && 'Sin ubicación seleccionada.'}
            {punto && municipio && `Ubicación: ${municipio.nombre} (${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)})`}
            {punto && !municipio && 'El punto está fuera del Estado de Campeche; elija otro.'}
          </p>

          <label htmlFor={ids.cat}>Tipo de incidencia *</label>
          <select id={ids.cat} value={campos.categoria} onChange={set('categoria')} required>
            <option value="">Seleccione…</option>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>

          <label htmlFor={ids.desc}>Descripción * <small>(mínimo 10 caracteres)</small></label>
          <textarea id={ids.desc} rows={4} value={campos.descripcion} onChange={set('descripcion')} required maxLength={1000} />

          <label htmlFor={ids.cont}>Correo de contacto <small>(opcional)</small></label>
          <input id={ids.cont} type="email" value={campos.contacto} onChange={set('contacto')} autoComplete="email" />

          {envio.estado === 'error' && <EstadoCarga estado="error" titulo="No se pudo enviar el reporte" mensaje={envio.mensaje} compacto />}
          {envio.estado === 'sin_servicio' && (
            <EstadoCarga
              estado="error"
              titulo="El servicio de reportes aún no está disponible"
              mensaje="Descargue el reporte en GeoJSON para entregarlo a SEDUMOP por los canales oficiales."
              accion={{ etiqueta: 'Descargar reporte (GeoJSON)', onClick: () => descargar(`reporte_punto_critico_${sufijoFecha()}.geojson`, JSON.stringify(reporte, null, 1), 'application/geo+json') }}
              compacto
            />
          )}

          <div className="form-reporte__acciones">
            <button type="submit" className="btn-base btn-primary" disabled={!valido || envio.estado === 'enviando'}>
              <Send size={16} aria-hidden="true" /> {envio.estado === 'enviando' ? 'Enviando…' : 'Enviar reporte'}
            </button>
            {reporte && envio.estado !== 'sin_servicio' && (
              <button type="button" className="btn-base btn-tertiary" onClick={() => descargar(`reporte_punto_critico_${sufijoFecha()}.geojson`, JSON.stringify(reporte, null, 1), 'application/geo+json')}>
                <Download size={16} aria-hidden="true" /> Guardar copia
              </button>
            )}
          </div>
        </form>
      )}
    </Drawer>
  );
}
