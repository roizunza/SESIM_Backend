import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDatosCapa } from '../../lib/sesim/useDatosCapa';
import { cumpleFiltros } from '../../lib/sesim/estiloCapa';
import { cabecerasTeselas, cargarVectorGrid, urlTeselas } from '../../lib/sesim/teselas';
import { useEstiloCapa } from './useEstiloCapa';

const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * Capa pesada (> 25,000 elementos) por teselas vectoriales. Conserva lo que hace CapaSesim:
 *  · simbología del catálogo, por campo o neutra (la opacidad se aplica a toda la capa);
 *  · filtros por atributo y filtro por municipio (`id_unidad`): el elemento que no cumple no se dibuja ni responde al clic;
 *  · clic → `onSeleccionar({ capa, propiedades, geometria, latlng })` (la geometría es el punto clicado: la tesela
 *    no trae el trazo completo) y tooltip con el nombre.
 * La simbología por campo y las listas de valores de los filtros necesitan los atributos de toda la capa: solo
 * entonces se descarga (una vez) el archivo completo, igual que hoy.
 */
export default function CapaTeselas({ capa, config, opacidad = 1, municipio = '', onSeleccionar, interactivo = true }) {
  const mapa = useMap();
  const porCampo = !!config.simbologia && config.estilo?.modo !== 'original';
  const { datos } = useDatosCapa(capa, porCampo);
  const { estiloLeaflet } = useEstiloCapa(capa, config, 1, datos?.features);
  const alSeleccionar = useRef(onSeleccionar);
  alSeleccionar.current = onSeleccionar;
  const capaRef = useRef(null);

  const clave = `${capa.id}|${config.simbologia}|${JSON.stringify(config.estilo)}|${JSON.stringify(config.filtros)}|${municipio}|${datos ? 1 : 0}|${interactivo}`;
  useEffect(() => {
    let vivo = true;
    let vg = null;
    let tip = null;
    cargarVectorGrid().then((fabrica) => {
      if (!vivo) return;
      const estiloDe = (props) => {
        if (municipio && props.id_unidad !== municipio) return [];
        if (!cumpleFiltros(props, config.filtros)) return [];
        return estiloLeaflet({ properties: props });
      };
      vg = fabrica.protobuf(urlTeselas(capa.id), {
        rendererFactory: L.canvas.tile,
        interactive: interactivo,
        vectorTileLayerStyles: { capa: estiloDe },
        fetchOptions: { get headers() { return cabecerasTeselas(); } },
        pane: 'overlayPane',
      });
      if (interactivo) {
        vg.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          const p = e.layer?.properties ?? {};
          const ll = e.latlng;
          alSeleccionar.current?.({ capa, propiedades: p, geometria: { type: 'Point', coordinates: [ll.lng, ll.lat] }, latlng: ll });
        });
        vg.on('mouseover', (e) => {
          const p = e.layer?.properties ?? {};
          if (!p.nombre) return;
          tip ??= L.tooltip({ sticky: true, direction: 'top', className: 'gv-hover', opacity: 1 });
          tip.setLatLng(e.latlng).setContent(`<strong>${esc(p.nombre)}</strong><small>${esc(capa.id)}</small>`);
          mapa.openTooltip(tip);
        });
        vg.on('mouseout', () => { if (tip) mapa.closeTooltip(tip); });
      }
      vg.setOpacity(opacidad);
      vg.addTo(mapa);
      capaRef.current = vg;
    }).catch((err) => console.error(`No se pudieron cargar las teselas de ${capa.id}:`, err));
    return () => {
      vivo = false;
      if (tip) mapa.closeTooltip(tip);
      if (vg) mapa.removeLayer(vg);
      capaRef.current = null;
    };
    // El estilo, los filtros y el municipio reconstruyen la capa (clave); la opacidad solo la reaplica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, clave]);

  useEffect(() => { capaRef.current?.setOpacity(opacidad); }, [opacidad]);
  return null;
}
