import { useMemo } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';
import { estiloPorGeometria } from '../../lib/sesim/simbologia';
import { CONFIG_INICIAL, cumpleFiltros, resolverEstilo } from '../../lib/sesim/estiloCapa';
import { toPathOptions, toPointLayer } from '../../lib/leafletSymbology';
import { escalaSimbolo } from '../../lib/sesim/capas';

/** Trazo de contexto cuando la simbología de la capa está apagada: visible, sin protagonismo. */
function estiloNeutro(geom, opacidad) {
  if (geom === 'polygon') return { color: '#7B8189', weight: 0.8, opacity: 0.7 * opacidad, fillColor: '#B9BEC4', fillOpacity: 0.08 * opacidad };
  if (geom === 'point') return { radius: 3, color: '#ffffff', weight: 0.6, fillColor: '#7B8189', fillOpacity: 0.6 * opacidad, opacity: opacidad };
  return { color: '#8A8F96', weight: 1, opacity: 0.6 * opacidad };
}

/**
 * Dibuja UNA capa del catálogo con su configuración visual:
 *  · `config.simbologia` apagada → trazo neutro (la capa no se apaga);
 *  · `config.estilo` → simbología original del catálogo o derivada de un campo;
 *  · `config.filtros` → solo se dibujan los elementos que cumplen los filtros por atributo;
 *  · `municipio` → solo los elementos de ese municipio (`id_unidad`, Ruta 5 territorial).
 * Ningún elemento se oculta por falta de símbolo: cae al estilo de respaldo.
 */
export default function CapaSesim({ capa, config = CONFIG_INICIAL, opacidad = 1, conEtiqueta = false, municipio = '', onSeleccionar, interactivo = true }) {
  const { datos, error } = useDatosCapa(capa);
  const estilo = useMemo(() => resolverEstilo(capa, config, datos?.features), [capa, config, datos]);
  const pathDe = useMemo(() => {
    const s = capa.simbologia;
    return (props) => {
      if (estilo.tipo === 'neutro') return estiloNeutro(capa.geom, opacidad);
      if (estilo.tipo === 'campo') return estiloPorGeometria(estilo.colorDe(props), capa.geom, opacidad);
      if (s.modo === 'qgis') {
        const simbolo = s.simboloDe(props);
        if (simbolo) return toPathOptions(simbolo, opacidad);
      }
      return estiloPorGeometria(s.colorDe(props), capa.geom, opacidad);
    };
  }, [capa, estilo, opacidad]);
  const estiloLeaflet = useMemo(
    () => (f) => {
      const ruta = pathDe(f.properties);
      return ruta.radius ? { ...ruta, radius: ruta.radius * escalaSimbolo(capa.id, f.properties?.clasif) } : ruta;
    },
    [pathDe, capa.id],
  );

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
