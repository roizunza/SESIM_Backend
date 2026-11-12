import React, { useEffect, useRef, useState } from 'react';
import StreetLinesBackground from '../plataforma/StreetLinesBackground';
import { prefiereMenosMovimiento } from '../../lib/useRevelar';
import './MapaHeroVivo.css';

/*
 * Mapa en vivo de la portada: relieve de Campeche con la red vial por jerarquía.
 *
 *  · MapLibre GL JS (código abierto; Mapbox GL exige token y licencia propia).
 *  · Relieve: teselas raster-dem «Terrarium» (por omisión, AWS Terrain Tiles; sin llave). Se cambia con
 *    VITE_SESIM_DEM_URL, p. ej. a un PMTiles propio, sin tocar este archivo.
 *  · Color por altitud (mar claro → tierra verde), sombreado y terreno 3D, todo con colores de la paleta
 *    (tokens --mapa-* de MapaHeroVivo.css, resueltos aquí a rgba para MapLibre).
 *  · Red vial real: /sesim/hero/red_vial.json (scripts/datos/07_exportar_red_hero.py):
 *    a = primaria (federal y de cuota), b = secundaria (estatal), c = local.
 *  · Cámara que recorre el estado; la red se dibuja poco a poco por jerarquía (line-gradient), «respira» y late en
 *    ondas desde Campeche y Carmen; anillos tenues en las localidades y un sol que mueve el sombreado.
 *    Todo es decorativo (no son datos en vivo) y se pausa fuera de pantalla y con «reducir movimiento». Si el relieve no carga o no hay WebGL, se muestra el trazo de calles de respaldo.
 */
const ENV = import.meta.env ?? {};
const URL_DEM = ENV.VITE_SESIM_DEM_URL || 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const URL_RED = '/sesim/hero/red_vial.json';
const URL_EXTERIOR = '/sesim/hero/exterior_difuminado.png'; // scripts/datos/08_exportar_exterior_difuminado.py
const ESQUINAS = [[-95, 22.6], [-87, 22.6], [-87, 16.2], [-95, 16.2]]; // NO, NE, SE, SO (deben coincidir con el script 08)
const URL_URBANO = '/sesim/capas/Loc01.geojson';   // localidades urbanas (polígonos)
const URL_RURAL = '/sesim/capas/Loc02.geojson';    // localidades rurales (puntos)
const EXAGERACION = 7;

// Cámara: cada parada se mantiene un momento y luego viaja a la siguiente (c: [lon, lat], z, b: rumbo, p: inclinación).
const RECORRIDO = [
  { c: [-90.55, 19.0], z: 6.85, b: -8, p: 46 },   // el estado completo
  { c: [-90.45, 19.6], z: 7.6, b: 16, p: 62 },    // Campeche – Champotón – Hopelchén
  { c: [-90.2, 18.4], z: 7.4, b: 6, p: 60 },      // Escárcega – Calakmul
  { c: [-91.25, 18.7], z: 7.5, b: -22, p: 60 },   // Laguna de Términos y Carmen
];
const VIAJE_S = 16;
const PAUSA_S = 3;

// El dibujo de la red: cada jerarquía arranca y dura distinto (segundos); luego «respira» y, al cierre del ciclo, se desvanece y vuelve a dibujarse.
const DIBUJO = { a: { ini: 0, dur: 7 }, b: { ini: 3, dur: 8 }, c: { ini: 5.5, dur: 9 } };
const CICLO_S = 84;
const DESVANECE_S = 6;

// «Latido»: una onda suave de luz sale de Campeche y de Carmen y recorre la red (decorativo, no son datos en vivo).
const ORIGENES = [[-90.534, 19.845], [-91.84, 18.65]];
const LATIDO = { periodo: 11, alcanceKm: 340, bandas: 8, anchoBandaKm: 40, trozoGrados: 0.16 };
// Anillos tenues que nacen de las localidades urbanas más grandes.
const ANILLOS = { periodo: 9, cuantas: 140 };
// El sol del sombreado se desplaza despacio (grados de azimut alrededor de 315°).
const SOL = { centro: 315, amplitud: 40, periodo: 100 };

const TOKENS = [
  'mapa-azul', 'mapa-mar-hondo', 'mapa-gris', 'mapa-t1', 'mapa-t2', 'mapa-t3', 'mapa-t4',
  'mapa-sombra', 'mapa-luz', 'mapa-velo', 'mapa-via', 'mapa-via-luz', 'mapa-urbano',
];

const conAlfa = (rgba, a) => rgba.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${a})`);

/** Degradado a lo largo de la línea: dibujada de 0 a p con una punta más clara; p ≥ 1 = línea completa. */
function degradado(color, luz, p) {
  const nada = conAlfa(color, 0);
  const base = ['interpolate', ['linear'], ['line-progress']];
  if (p >= 0.999) return [...base, 0, color, 1, color];
  if (p <= 0.001) return [...base, 0, nada, 1, nada];
  const paradas = [0, color];
  const cola = p - 0.1;
  if (cola > 0.002) paradas.push(cola, color);
  paradas.push(p, luz);
  if (p < 0.998) paradas.push(p + 0.001, nada, 1, nada);
  return [...base, ...paradas];
}

/** Resuelve tokens CSS (incluye color-mix) a rgba(), que es lo que entiende el estilo de MapLibre. */
function resolverColores(raiz) {
  const sonda = document.createElement('i');
  raiz.appendChild(sonda);
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1;
  const g = lienzo.getContext('2d', { willReadFrequently: true });
  const salida = {};
  for (const nombre of TOKENS) {
    sonda.style.background = `var(--${nombre})`;
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = getComputedStyle(sonda).backgroundColor;
    g.fillRect(0, 0, 1, 1);
    const [r, gg, b, a] = g.getImageData(0, 0, 1, 1).data;
    salida[nombre] = `rgba(${r},${gg},${b},${(a / 255).toFixed(3)})`;
  }
  sonda.remove();
  return salida;
}

const aGeoJSON = (grupo) => ({
  type: 'FeatureCollection',
  features: Object.entries(grupo).flatMap(([cat, lineas]) =>
    lineas.map((cs) => ({ type: 'Feature', properties: { cat }, geometry: { type: 'LineString', coordinates: cs } }))),
});

const kmEntre = (p, q) => Math.hypot((p[0] - q[0]) * 105, (p[1] - q[1]) * 111);

/** Parte la red en trozos cortos y le da a cada uno su banda de distancia a Campeche/Carmen (para la onda del latido). */
function trocearRed(red) {
  const features = [];
  for (const cat of ['a', 'b', 'c']) {
    for (const cs of red[cat] ?? []) {
      let ini = 0;
      let acum = 0;
      for (let i = 1; i < cs.length; i++) {
        acum += Math.hypot((cs[i][0] - cs[i - 1][0]) * 0.94, cs[i][1] - cs[i - 1][1]);
        if (acum >= LATIDO.trozoGrados || i === cs.length - 1) {
          const trozo = cs.slice(ini, i + 1);
          const medio = trozo[Math.floor(trozo.length / 2)];
          const d = Math.min(...ORIGENES.map((o) => kmEntre(medio, o)));
          features.push({ type: 'Feature', properties: { cat, b: Math.min(LATIDO.bandas - 1, Math.floor(d / LATIDO.anchoBandaKm)) }, geometry: { type: 'LineString', coordinates: trozo } });
          ini = i;
          acum = 0;
        }
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Centro de las localidades urbanas más grandes (por caja envolvente), con una fase propia para desfasar los anillos. */
function nodosUrbanos(urbano) {
  const nodos = [];
  for (const f of urbano.features ?? []) {
    const polis = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.coordinates ?? [];
    for (const p of polis) {
      const xs = p[0].map((q) => q[0]);
      const ys = p[0].map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      nodos.push({ area: (x1 - x0) * (y1 - y0), c: [(x0 + x1) / 2, (y0 + y1) / 2] });
    }
  }
  nodos.sort((a, b) => b.area - a.area);
  return {
    type: 'FeatureCollection',
    features: nodos.slice(0, ANILLOS.cuantas).map((n, i) => ({ type: 'Feature', properties: { f: (i * 0.6180339887) % 1 }, geometry: { type: 'Point', coordinates: n.c } })),
  };
}

const suave = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const mezcla = (a, b, u) => a + (b - a) * u;

function camaraEn(seg, movil) {
  const n = RECORRIDO.length;
  const ciclo = seg % (n * (VIAJE_S + PAUSA_S));
  const i = Math.floor(ciclo / (VIAJE_S + PAUSA_S));
  const local = ciclo - i * (VIAJE_S + PAUSA_S);
  const A = RECORRIDO[i];
  const B = RECORRIDO[(i + 1) % n];
  const u = local < PAUSA_S ? 0 : suave((local - PAUSA_S) / VIAJE_S);
  return {
    center: [mezcla(A.c[0], B.c[0], u), mezcla(A.c[1], B.c[1], u)],
    zoom: mezcla(A.z, B.z, u) - (movil ? 0.9 : 0),
    bearing: mezcla(A.b, B.b, u),
    pitch: mezcla(A.p, B.p, u) * (movil ? 0.7 : 1),
  };
}

const MapaHeroVivo = () => {
  const lienzo = useRef(null);
  const [estado, setEstado] = useState('cargando'); // cargando | listo | falla

  useEffect(() => {
    const raiz = lienzo.current;
    if (!raiz) return undefined;
    let vivo = true;
    let mapa = null;
    let raf = 0;
    let observador = null;
    let alRedimensionar = null;

    (async () => {
      try {
        const vacio = { type: 'FeatureCollection', features: [] };
        const [maplibregl, { default: urlTrabajador }, , red, urbano, rural] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
          import('maplibre-gl/dist/maplibre-gl.css'),
          fetch(URL_RED).then((r) => r.json()),
          fetch(URL_URBANO).then((r) => r.json()).catch(() => vacio),
          fetch(URL_RURAL).then((r) => r.json()).catch(() => vacio),
        ]);
        if (!vivo) return;
        maplibregl.setWorkerUrl(urlTrabajador); // Vite sirve el worker como archivo aparte

        const c = resolverColores(raiz.parentElement);
        const movil = window.matchMedia('(max-width: 760px)').matches;
        const quieto = prefiereMenosMovimiento();
        const ancho = () => raiz.clientWidth;
        const relleno = () => (ancho() > 900 ? { left: Math.round(ancho() * 0.3), right: Math.round(ancho() * 0.2), top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 });
        const inicio = camaraEn(0, movil);

        // Cada jerarquía lleva el mismo guinda con distinto peso (opacidad y grosor).
        const VIA = {
          a: { alfa: 1, luz: c['mapa-via-luz'] },
          b: { alfa: 0.88, luz: c['mapa-via-luz'] },
          c: { alfa: 0.55, luz: c['mapa-via-luz'] },
        };
        const colorVia = (k) => conAlfa(c['mapa-via'], VIA[k].alfa);
        const lineaVia = (id, cat, ancho3, extra = {}) => ({
          id, type: 'line', source: 'red', filter: ['==', ['get', 'cat'], cat], layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-gradient': degradado(colorVia(cat), VIA[cat].luz, quieto ? 1 : 0), 'line-width': ['interpolate', ['linear'], ['zoom'], 5, ancho3[0], 8, ancho3[1], 11, ancho3[2]], ...extra },
        });

        mapa = new maplibregl.Map({
          container: raiz,
          interactive: false,
          attributionControl: { compact: true },
          maxPitch: 75,
          fadeDuration: 0,
          ...inicio,
          padding: relleno(),
          style: {
            version: 8,
            projection: { type: 'mercator' },
            sky: { 'sky-color': c['mapa-velo'], 'horizon-color': c['mapa-velo'], 'fog-color': c['mapa-velo'], 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.4 },
            terrain: { source: 'dem-3d', exaggeration: EXAGERACION },
            sources: {
              dem: { type: 'raster-dem', tiles: [URL_DEM], tileSize: 256, encoding: 'terrarium', maxzoom: 12, attribution: 'Relieve: Mapzen / AWS Terrain Tiles' },
              // Mismas teselas en otra fuente: MapLibre recomienda no compartirla entre el terreno 3D y las capas de color/sombreado.
              'dem-3d': { type: 'raster-dem', tiles: [URL_DEM], tileSize: 256, encoding: 'terrarium', maxzoom: 12 },
              red: { type: 'geojson', data: aGeoJSON(red), lineMetrics: true },
              exterior: { type: 'image', url: URL_EXTERIOR, coordinates: ESQUINAS },
              latido: { type: 'geojson', data: trocearRed(red) },
              nodos: { type: 'geojson', data: nodosUrbanos(urbano) },
              urbano: { type: 'geojson', data: urbano },
              rural: { type: 'geojson', data: rural },
            },
            layers: [
              { id: 'mar-fondo', type: 'background', paint: { 'background-color': c['mapa-azul'] } },
              {
                // Tierra: llano en gris, lomeríos en verde de contexto (más intenso mientras más alto).
                id: 'altitud', type: 'color-relief', source: 'dem',
                paint: {
                  'color-relief-color': ['interpolate', ['linear'], ['elevation'],
                    -90, c['mapa-gris'], 0.5, c['mapa-gris'], 90, c['mapa-gris'], 140, c['mapa-t1'], 200, c['mapa-t2'], 265, c['mapa-t3'], 330, c['mapa-t4']],
                },
              },
              {
                id: 'sombreado', type: 'hillshade', source: 'dem',
                paint: {
                  'hillshade-exaggeration': 0.95, 'hillshade-illumination-direction': SOL.centro, 'hillshade-illumination-anchor': 'map',
                  'hillshade-shadow-color': c['mapa-sombra'], 'hillshade-highlight-color': c['mapa-luz'], 'hillshade-accent-color': c['mapa-sombra'],
                },
              },
              // Lo exterior al estado se apaga con un fundido continuo (imagen de distancia al contorno), sin borde duro ni contorno punteado.
              { id: 'exterior', type: 'raster', source: 'exterior', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
              {
                // Mar: encima del apagado, para que el azul llegue hasta la costa. Solo pinta elevación ≤ 0.
                id: 'mar', type: 'color-relief', source: 'dem',
                paint: {
                  'color-relief-color': ['interpolate', ['linear'], ['elevation'],
                    -100, c['mapa-mar-hondo'], -12, c['mapa-azul'], 0.3, c['mapa-azul'], 1.1, conAlfa(c['mapa-azul'], 0)],
                },
              },
              { id: 'urbano-fill', type: 'fill', source: 'urbano', paint: { 'fill-color': c['mapa-urbano'], 'fill-opacity': 0.7 } },
              { id: 'urbano-borde', type: 'line', source: 'urbano', paint: { 'line-color': c['mapa-urbano'], 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 9, 2] } },
              { id: 'rural', type: 'circle', source: 'rural', paint: { 'circle-color': c['mapa-urbano'], 'circle-opacity': 0.55, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 9, 1.8], 'circle-pitch-alignment': 'map' } },
              lineaVia('via-c', 'c', [0.45, 1, 1.9]),
              lineaVia('via-b', 'b', [1.1, 2.4, 4]),
              lineaVia('via-a-brillo', 'a', [5, 9, 14], { 'line-blur': 6, 'line-opacity': 0.22 }),
              lineaVia('via-a', 'a', [2, 4, 6.8]),
              // Latido: luz suave que viaja por bandas de distancia (se enciende y apaga por banda).
              ...Array.from({ length: LATIDO.bandas }, (_, k) => ({
                id: `latido-${k}`, type: 'line', source: 'latido', filter: ['==', ['get', 'b'], k], layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                  'line-color': c['mapa-via-luz'], 'line-opacity': 0, 'line-blur': 2.5,
                  'line-width': ['interpolate', ['linear'], ['zoom'],
                    5, ['match', ['get', 'cat'], 'a', 3.5, 'b', 2.2, 1.2],
                    8, ['match', ['get', 'cat'], 'a', 7, 'b', 4.2, 2],
                    11, ['match', ['get', 'cat'], 'a', 11, 'b', 7, 3.4]],
                },
              })),
              // Anillos tenues que nacen de las localidades urbanas.
              { id: 'anillo', type: 'circle', source: 'nodos', paint: { 'circle-color': c['mapa-via'], 'circle-opacity': 0, 'circle-radius': 1, 'circle-stroke-color': c['mapa-via'], 'circle-stroke-width': 1.1, 'circle-stroke-opacity': 0, 'circle-pitch-alignment': 'map' } },
            ],
          },
        });

        // Respaldo: si el relieve no llega o WebGL falla, vuelve el trazo de calles.
        let errores = 0;
        let exitos = 0;
        mapa.on('sourcedata', (e) => { if ((e.sourceId === 'dem' || e.sourceId === 'dem-3d') && e.tile) exitos += 1; });
        mapa.on('error', (e) => {
          if (e.sourceId === 'dem' || e.sourceId === 'dem-3d') errores += 1;
          if (vivo && exitos === 0 && errores >= 6) setEstado('falla');
        });
        mapa.on('load', () => { if (vivo) setEstado('listo'); });

        let visible = true;
        observador = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
        observador.observe(raiz);

        // Dibujo progresivo de la red + «respiración» suave; sin pulsos que corran por encima.
        const ultimoP = {};
        const pintarRed = (t) => {
          const ciclo = t % CICLO_S;
          const fuera = ciclo > CICLO_S - DESVANECE_S ? suave((ciclo - (CICLO_S - DESVANECE_S)) / DESVANECE_S) : 0;
          const respira = 0.5 + 0.5 * Math.sin((t / 5.5) * Math.PI * 2);
          for (const k of ['a', 'b', 'c']) {
            const p = suave(Math.min(1, Math.max(0, (ciclo - DIBUJO[k].ini) / DIBUJO[k].dur)));
            const pr = Math.round(p * 500) / 500;
            if (ultimoP[k] !== pr) {
              ultimoP[k] = pr;
              for (const id of k === 'a' ? ['via-a', 'via-a-brillo'] : [`via-${k}`]) mapa.setPaintProperty(id, 'line-gradient', degradado(colorVia(k), VIA[k].luz, pr));
            }
            const base = k === 'a' ? 1 : k === 'b' ? 0.9 : 0.8;
            mapa.setPaintProperty(`via-${k}`, 'line-opacity', (base - 0.14 * respira * (k === 'c' ? 0.5 : 1)) * (1 - fuera));
          }
          mapa.setPaintProperty('via-a-brillo', 'line-opacity', (0.16 + 0.16 * respira) * (1 - fuera));

          // Latido: el frente avanza por distancia desde Campeche/Carmen; cada banda se enciende cuando el frente la cruza.
          const listo = Math.min(1, Math.max(0, (ciclo - (DIBUJO.c.ini + DIBUJO.c.dur)) / 2));
          const frente = ((t % LATIDO.periodo) / LATIDO.periodo) * (LATIDO.alcanceKm + 2 * LATIDO.anchoBandaKm) - LATIDO.anchoBandaKm;
          for (let k = 0; k < LATIDO.bandas; k++) {
            const centro = LATIDO.anchoBandaKm * (k + 0.5);
            const inten = Math.exp(-(((centro - frente) / (LATIDO.anchoBandaKm * 0.9)) ** 2));
            mapa.setPaintProperty(`latido-${k}`, 'line-opacity', 0.55 * inten * listo * (1 - fuera));
          }

          // Anillos desfasados por localidad (fase propia) que crecen y se desvanecen.
          const u = ['%', ['+', t / ANILLOS.periodo, ['get', 'f']], 1];
          mapa.setPaintProperty('anillo', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 5, ['*', u, 9], 9, ['*', u, 26]]);
          mapa.setPaintProperty('anillo', 'circle-stroke-opacity', ['*', 0.42, ['^', ['-', 1, u], 2]]);

          // El sol del relieve se mueve muy despacio.
          mapa.setPaintProperty('sombreado', 'hillshade-illumination-direction', SOL.centro + SOL.amplitud * Math.sin((t / SOL.periodo) * Math.PI * 2));
        };

        const t0 = performance.now();
        let ultimoPintado = 0;
        const cuadro = (ahora) => {
          raf = requestAnimationFrame(cuadro);
          if (!visible || document.hidden) return;
          const seg = Math.max(0, (ahora - t0) / 1000); // el primer cuadro puede traer una marca anterior a t0
          mapa.jumpTo({ ...camaraEn(seg, movil), padding: relleno() });
          if (ahora - ultimoPintado > 50) { ultimoPintado = ahora; pintarRed(seg); }
        };
        if (!quieto) raf = requestAnimationFrame(cuadro);
        alRedimensionar = () => mapa?.resize();
        window.addEventListener('resize', alRedimensionar);
      } catch (error) {
        console.warn('[SESIM] Mapa de portada no disponible; se usa el trazo de calles.', error);
        if (vivo) setEstado('falla');
      }
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      observador?.disconnect();
      if (alRedimensionar) window.removeEventListener('resize', alRedimensionar);
      mapa?.remove();
    };
  }, []);

  return (
    <div className={`mapa-hero mapa-hero--${estado}`} aria-hidden="true">
      {estado === 'falla'
        ? <StreetLinesBackground factorZoom={1.12} colorBase={[122, 84, 98]} colorPulso={[159, 34, 65]} alphaBase={0.34} grosor={1.25} />
        : <div ref={lienzo} className="mapa-hero__lienzo" />}
      <div className="mapa-hero__velo" />
    </div>
  );
};

export default MapaHeroVivo;
