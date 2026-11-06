import { useEffect, useState } from 'react';

const CIRCUNFERENCIA = 40075016.686;
const PIXEL_ESTANDAR_M = 0.00028;
const ANCHO_MAX = 90;

function redondo(n) {
  const p = 10 ** Math.floor(Math.log10(n));
  const d = n / p;
  return (d >= 5 ? 5 : d >= 2 ? 2 : 1) * p;
}
const significativas = (n) => {
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
};

/** Metros por píxel en la latitud del centro (Web Mercator). */
const metrosPorPixel = (mapa) => (CIRCUNFERENCIA * Math.cos((mapa.getCenter().lat * Math.PI) / 180)) / 2 ** (mapa.getZoom() + 8);

/**
 * Escala gráfica y numérica del mapa. La numérica usa el tamaño de píxel estándar de OGC
 * (0.28 mm), por lo que es aproximada y depende de la pantalla.
 */
export default function EscalaMapa({ mapa, desplazada }) {
  const [escala, setEscala] = useState(null);
  useEffect(() => {
    if (!mapa) return undefined;
    const medir = () => {
      const mpp = metrosPorPixel(mapa);
      const distancia = redondo(mpp * ANCHO_MAX);
      setEscala({ ancho: Math.round(distancia / mpp), distancia, denominador: significativas(mpp / PIXEL_ESTANDAR_M) });
    };
    medir();
    mapa.on('zoomend moveend', medir);
    return () => mapa.off('zoomend moveend', medir);
  }, [mapa]);
  if (!escala) return null;
  const etiqueta = escala.distancia >= 1000 ? `${(escala.distancia / 1000).toLocaleString('es-MX')} km` : `${escala.distancia} m`;
  return (
    <div className={`escala-mapa${desplazada ? ' escala-mapa--desplazada' : ''}`} aria-label={`Escala aproximada 1:${escala.denominador.toLocaleString('es-MX')}; la barra mide ${etiqueta}`}>
      <span className="escala-mapa__barra" style={{ width: escala.ancho }} aria-hidden="true"><i /><i /></span>
      <span className="escala-mapa__texto">{etiqueta}</span>
      <span className="escala-mapa__sep" aria-hidden="true">·</span>
      <span className="escala-mapa__texto" title="Escala aproximada (píxel estándar 0.28 mm)">1:{escala.denominador.toLocaleString('es-MX')}</span>
    </div>
  );
}
