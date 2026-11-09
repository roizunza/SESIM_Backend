import { useEffect, useMemo, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';
import { geojsonUnidades, tabla } from '../../lib/sesim/api';
import { COLOR_POBLACION, poblacionPorElemento, rangoPoblacion } from '../../lib/sesim/poblacion';

/**
 * Loc02 con pesos espaciales por población: radio y opacidad crecen con el rango de habitantes
 * (`RANGOS_POBLACION`). Con la simbología apagada, puntos neutros. Al hacer clic, la ficha recibe
 * la localidad censal ligada (`cvegeo`) y su población.
 */
export default function CapaPoblacion({ capa, opacidad = 1, simbologia = true, municipio = '', onSeleccionar, interactivo = true }) {
  const { datos } = useDatosCapa(capa);
  const [censo, setCenso] = useState(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([geojsonUnidades('localidades'), tabla('unidad_territorial')])
      .then(([fc, unidades]) => vivo && setCenso({ localidades: fc.features, unidades }))
      .catch(() => vivo && setCenso({ localidades: [], unidades: [] }));
    return () => {
      vivo = false;
    };
  }, []);

  const pesos = useMemo(() => (datos && censo ? poblacionPorElemento(datos.features, censo.localidades, censo.unidades) : null), [datos, censo]);
  if (!datos || !pesos) return null;

  const estilo = (f) => {
    const r = rangoPoblacion(pesos.get(f.properties.id)?.pob ?? 0);
    return simbologia
      ? { radius: r.radio, color: '#ffffff', weight: 0.5, opacity: opacidad, fillColor: COLOR_POBLACION, fillOpacity: r.opacidad * opacidad }
      : { radius: 2.5, color: '#ffffff', weight: 0.5, opacity: opacidad, fillColor: '#7B8189', fillOpacity: 0.6 * opacidad };
  };

  return (
    <GeoJSON
      key={`${capa.id}|${simbologia}|${opacidad}|${municipio}`}
      data={datos}
      filter={(f) => !municipio || f.properties?.id_unidad === municipio}
      pointToLayer={(f, latlng) => L.circleMarker(latlng, estilo(f))}
      onEachFeature={(f, capaLeaflet) => {
        const peso = pesos.get(f.properties.id);
        if (!interactivo) return;
        capaLeaflet.bindTooltip(`${f.properties.nombre} · ${peso ? `${peso.pob.toLocaleString('es-MX')} hab.` : 'sin dato censal'}`, { direction: 'top' });
        if (onSeleccionar) capaLeaflet.on('click', () => onSeleccionar({ capa, propiedades: { ...f.properties, cvegeo: peso?.cvegeo ?? null, pob_tot: peso?.pob ?? null } }));
      }}
    />
  );
}
