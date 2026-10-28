import { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { geojsonDeCapa } from '../../lib/sesim/api';
import { estiloPorGeometria } from '../../lib/sesim/simbologia';
import { toPathOptions, toPointLayer } from '../../lib/leafletSymbology';

/**
 * Dibuja UNA capa del catálogo (`capa` enriquecida por cargarArbolCapas):
 * pide su GeoJSON ligero recién al montarse (carga perezosa) y lo pinta con
 * la simbología que resolvió `construirSimbologia` (QGIS, categórica o
 * única). Un elemento sin símbolo resuelto cae al estilo de respaldo: nunca
 * se oculta.
 *
 * Al hacer clic en un elemento entrega `{ capa, propiedades }` — las
 * propiedades son las llaves del modelo: id (capa_vector.id), nombre,
 * clasif, cve_mun, id_unidad.
 */
export default function CapaSesim({ capa, opacidad = 1, conEtiqueta = false, onSeleccionar }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelado = false;
    geojsonDeCapa(capa)
      .then((d) => !cancelado && setData(d))
      .catch((e) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [capa]);

  if (error) {
    console.error(`No se pudo cargar la capa ${capa.id}:`, error);
    return null;
  }
  if (!data) return null;

  const s = capa.simbologia;
  const respaldo = (props) => estiloPorGeometria(s.colorDe(props), capa.geom, opacidad);

  const estilo = (feature) => {
    if (s.modo === 'qgis') {
      const simbolo = s.simboloDe(feature.properties);
      if (simbolo) return toPathOptions(simbolo, opacidad);
    }
    return respaldo(feature.properties);
  };

  const punto = (feature, latlng) => {
    if (s.modo === 'qgis') {
      const simbolo = s.simboloDe(feature.properties);
      if (simbolo) return toPointLayer(simbolo, latlng, opacidad);
    }
    return L.circleMarker(latlng, respaldo(feature.properties));
  };

  const onEachFeature = (feature, layer) => {
    if (onSeleccionar) layer.on('click', () => onSeleccionar({ capa, propiedades: feature.properties }));
    const texto = conEtiqueta ? feature.properties?.nombre : null;
    if (texto) {
      layer.bindTooltip(String(texto), { permanent: true, direction: 'center', className: 'capa-etiqueta-mapa' });
    }
  };

  return <GeoJSON key={capa.id} data={data} style={estilo} pointToLayer={punto} onEachFeature={onEachFeature} />;
}
