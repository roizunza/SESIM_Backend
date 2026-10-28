import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { basemapLayer } from 'esri-leaflet';

/**
 * Mapa base servido por Esri ArcGIS Online vía `esri-leaflet`, en vez de los
 * tiles de CARTO/OSM que traía el visor. `esri-leaflet` 3.x exporta
 * `basemapLayer` como función suelta (ya no engancha `L.esri` como
 * namespace global, a diferencia de la v2), y react-leaflet no trae un
 * componente propio para consumirla — así que su ciclo de vida se gestiona a
 * mano con `useMap()`: se agrega al montar (o al cambiar `type`) y se quita
 * al desmontar, para no dejar tiles huérfanos sobre el mapa.
 *
 * Cada mapa base de Esri trae su propia capa "Labels" (topónimos, límites):
 * sin ella "Imagery" queda muda y "Gray" pierde las referencias que hacían
 * legible el fondo claro.
 */
const ESRI_BASEMAPS = {
  claro: 'Gray', // Reemplaza el "Mapa Claro" de CARTO/OSM
  satelite: 'Imagery', // Antes era una URL de tiles a mano; ahora la sirve esri-leaflet
};

const EsriBasemap = ({ type, opacity = 1 }) => {
  const map = useMap();
  const capasRef = useRef({ base: null, labels: null });

  useEffect(() => {
    const clave = ESRI_BASEMAPS[type] ?? ESRI_BASEMAPS.claro;

    const base = basemapLayer(clave);
    const labels = basemapLayer(`${clave}Labels`);
    base.addTo(map);
    labels.addTo(map);
    capasRef.current = { base, labels };

    return () => {
      base.remove();
      labels.remove();
      capasRef.current = { base: null, labels: null };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, type]);

  // La opacidad se aplica por separado del efecto de arriba: cambia mucho más
  // seguido (cada vez que se activa/desactiva un Eje Estratégico) y no debe
  // recrear las capas del mapa base cada vez.
  useEffect(() => {
    capasRef.current.base?.setOpacity(opacity);
    capasRef.current.labels?.setOpacity(opacity);
  }, [opacity]);

  return null;
};

export default EsriBasemap;
