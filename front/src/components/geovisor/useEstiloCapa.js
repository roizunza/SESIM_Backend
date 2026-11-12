import { useMemo } from 'react';
import { estiloPorGeometria } from '../../lib/sesim/simbologia';
import { resolverEstilo } from '../../lib/sesim/estiloCapa';
import { toPathOptions } from '../../lib/leafletSymbology';
import { escalaSimbolo } from '../../lib/sesim/capas';

/** Trazo de contexto cuando la simbología de la capa está apagada: visible, sin protagonismo. */
function estiloNeutro(geom, opacidad) {
  if (geom === 'polygon') return { color: '#7B8189', weight: 0.8, opacity: 0.7 * opacidad, fillColor: '#B9BEC4', fillOpacity: 0.08 * opacidad };
  if (geom === 'point') return { radius: 3, color: '#ffffff', weight: 0.6, fillColor: '#7B8189', fillOpacity: 0.6 * opacidad, opacity: opacidad };
  return { color: '#8A8F96', weight: 1, opacity: 0.6 * opacidad };
}

/**
 * Estilo Leaflet de una capa del catálogo (compartido por CapaSesim y CapaTeselas):
 * `estilo` (neutro / original / por campo) y `estiloLeaflet(feature)` → opciones de trazo.
 */
export function useEstiloCapa(capa, config, opacidad, features) {
  const estilo = useMemo(() => resolverEstilo(capa, config, features), [capa, config, features]);
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
  return { estilo, estiloLeaflet };
}
