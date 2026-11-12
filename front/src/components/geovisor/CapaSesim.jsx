import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';
import { CONFIG_INICIAL, cumpleFiltros } from '../../lib/sesim/estiloCapa';
import { toPointLayer } from '../../lib/leafletSymbology';
import { esPorTeselas } from '../../lib/sesim/teselas';
import { useEstiloCapa } from './useEstiloCapa';
import CapaTeselas from './CapaTeselas';
import { escalaSimbolo } from '../../lib/sesim/capas';

/**
 * Dibuja UNA capa del catálogo con su configuración visual:
 *  · `config.simbologia` apagada → trazo neutro (la capa no se apaga);
 *  · `config.estilo` → simbología original del catálogo o derivada de un campo;
 *  · `config.filtros` → solo se dibujan los elementos que cumplen los filtros por atributo;
 *  · `municipio` → solo los elementos de ese municipio (`id_unidad`, Ruta 5 territorial).
 * Ningún elemento se oculta por falta de símbolo: cae al estilo de respaldo.
 */
function CapaGeoJson({ capa, config, opacidad, conEtiqueta, municipio, onSeleccionar, interactivo }) {
  const { datos, error } = useDatosCapa(capa);
  const { estilo, estiloLeaflet } = useEstiloCapa(capa, config, opacidad, datos?.features);

  if (error) {
    console.error(`No se pudo cargar la capa ${capa.id}:`, error);
    return null;
  }
  if (!datos) return null;

  const s = capa.simbologia;
  const punto = (feature, latlng) => {
    if (estilo.tipo === 'original' && s.modo === 'qgis') {
      const simbolo = s.simboloDe(feature.properties);
      if (simbolo) return toPointLayer(simbolo, latlng, opacidad, escalaSimbolo(capa.id, feature.properties?.clasif));
    }
    return L.circleMarker(latlng, estiloLeaflet(feature));
  };

  const onEachFeature = (feature, layer) => {
    if (interactivo && onSeleccionar) layer.on('click', (e) => onSeleccionar({ capa, propiedades: feature.properties, geometria: feature.geometry, latlng: e?.latlng ?? null }));
    const texto = conEtiqueta ? feature.properties?.nombre : null;
    if (texto) layer.bindTooltip(String(texto), { permanent: true, direction: 'center', className: 'capa-etiqueta-mapa' });
    else if (interactivo && feature.properties?.nombre) {
      const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
      layer.bindTooltip(`<strong>${esc(feature.properties.nombre)}</strong><small>${esc(capa.id)}</small>`, { sticky: true, direction: 'top', className: 'gv-hover', opacity: 1 });
    }
  };

  // Cambiar estilo o filtros reconstruye la capa; la opacidad solo reestiliza (setStyle).
  const clave = `${capa.id}|${config.simbologia}|${JSON.stringify(config.estilo)}|${JSON.stringify(config.filtros)}|${municipio}`;
  return (
    <GeoJSON
      key={clave}
      data={datos}
      style={estiloLeaflet}
      pointToLayer={punto}
      filter={(f) => (!municipio || f.properties?.id_unidad === municipio) && cumpleFiltros(f.properties, config.filtros)}
      onEachFeature={onEachFeature}
      interactive={interactivo}
    />
  );
}

/** Capas de hasta 25,000 elementos: GeoJSON. Las pesadas (Ciclo 9) se dibujan por teselas. */
export default function CapaSesim({ capa, config = CONFIG_INICIAL, opacidad = 1, conEtiqueta = false, municipio = '', onSeleccionar, interactivo = true }) {
  const props = { capa, config, opacidad, conEtiqueta, municipio, onSeleccionar, interactivo };
  return esPorTeselas(capa) ? <CapaTeselas {...props} /> : <CapaGeoJson {...props} />;
}
