import React, { useEffect, useRef, useState } from 'react';
import StreetLinesBackground from '../plataforma/StreetLinesBackground';
import './MapaHeroVivo.css';

/*
 * Mapa de la portada: relieve horneado de Campeche con la red vial por jerarquía y las localidades como puntos de luz,
 * en vista inclinada. Se puede explorar como un geovisor, pero no lo parece.
 *
 *  · MapLibre GL JS (código abierto; Mapbox GL exige token y licencia propia).
 *  · El relieve NO se calcula en el navegador: es una imagen (/sesim/hero/relieve.jpg) horneada una vez con
 *    scripts/datos/09_hornear_relieve_hero.py a partir del DEM MERIT: hillshade, curvas de nivel, hidrografía y fundido
 *    hacia los estados vecinos (sin dibujar ningún límite). Está en Web Mercator, alineada con LIMITES.
 *  · Red vial real (/sesim/hero/red_vial_onda.json, scripts/datos/10_red_vial_onda.py): tramos con su categoría (a = primaria,
 *    b = secundaria, c = local) y el km de recorrido en que se enciende cada uno. La jerarquía se lee en grosor y opacidad
 *    (blanco puro, sin líneas punteadas).
 *  · Localidades reales (/sesim/hero/localidades.json, de Loc01 y Loc02): puntos con halo; las urbanas crecen con su área.
 *  · Animación decorativa (no son datos en vivo), UNA sola vez al entrar a la portada: las vialidades se encienden desde las 13
 *    localidades urbanas mayores y avanzan por la red hasta encontrarse. Cada tramo se enciende con feature-state (no se vuelve a
 *    procesar la geometría). Además, una leve deriva de la cámara que se detiene cuando la persona toma el mapa. Corre a 30 fps,
 *    espera a que la portada esté a la vista, se pausa con la pestaña oculta y con «reducir movimiento» la red aparece completa.
 *  · Arrastrar mueve; clic derecho o Ctrl + arrastrar gira e inclina; Ctrl + rueda (o dos dedos en el celular) acerca, para no
 *    secuestrar el desplazamiento de la página. «Restablecer vista» vuelve a la vista inicial.
 *  · Vista inicial en VISTA. Para ajustarla: mover el mapa y escribir `sesimCamara()` en la consola.
 *  · Si la imagen no carga o no hay WebGL, se muestra el trazo de calles de respaldo.
 */
const URL_RED = '/sesim/hero/red_vial_onda.json';
const URL_RELIEVE = '/sesim/hero/relieve.jpg';
const URL_LOCALIDADES = '/sesim/hero/localidades.json';
const URL_CONTEXTO = '/sesim/hero/contexto.json'; // tierra plana de México y vecinos (script 11): contexto bajo el relieve
// Recuadro de la imagen horneada (deben coincidir con L0, L1, A0, A1 de scripts/datos/09_hornear_relieve_hero.py).
const LIMITES = { o: -93.25, e: -88.35, s: 17.0, n: 21.6 };
const ESQUINAS = [[LIMITES.o, LIMITES.n], [LIMITES.e, LIMITES.n], [LIMITES.e, LIMITES.s], [LIMITES.o, LIMITES.s]]; // NO, NE, SE, SO

// Vista inicial en perspectiva (c: [lon, lat], z: zoom, b: rumbo en grados, p: inclinación en grados).
const VISTA = { c: [-90.7, 19.05], z: 7.0, b: -8, p: 55 };
const VISTA_MOVIL = { c: [-90.75, 19.35], z: 6.1, b: -8, p: 42 };
// Deriva de la cámara: va y viene entre dos posiciones, muy despacio, hasta que la persona toma el mapa.
const DERIVA = { periodo: 36, rumbo: 0, inclinacion: 0 }; // vista congelada (Ismael): sin deriva; // segundos para ir; grados que se suman a la vista

// Jerarquía lumínica de la red vial: la federal manda; el resto es un rastro que se apaga.
const VIAS = { a: { alfa: 1, ancho: [1.6, 2.6, 4.5] }, b: { alfa: 0.7, ancho: [0.8, 1.2, 2] }, c: { alfa: 0.38, ancho: [0.5, 0.7, 1.1] } };

// Encendido de la red: una sola vez. Dura `duracion` s; cada tramo brilla un momento (calor) antes de quedar fijo.
const ONDA = { duracion: 12, retardo: 0.5, fps: 30, calor: [0.45, 1.0] }; // segundos tras encenderse en que el tramo brilla a 100 % y a 50 %

const TEXTOS = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + rueda del ratón para acercar el mapa',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + desplazar para acercar el mapa',
  'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
};

const TOKENS = ['mapa-fondo', 'mapa-tierra', 'mapa-via', 'mapa-via-sombra', 'mapa-luz', 'mapa-halo'];

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

const MapaHeroVivo = () => {
  const lienzo = useRef(null);
  const mapaRef = useRef(null);
  const vistaRef = useRef(null);
  const derivaRef = useRef({ activa: true, t0: 0 });
  const [estado, setEstado] = useState('cargando'); // cargando | listo | falla
  const [movido, setMovido] = useState(false);

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
        const [maplibregl, { default: urlTrabajador }, , red, localidades, contexto] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
          import('maplibre-gl/dist/maplibre-gl.css'),
          fetch(URL_RED).then((r) => r.json()),
          fetch(URL_LOCALIDADES).then((r) => r.json()).catch(() => vacio),
          fetch(URL_CONTEXTO).then((r) => r.json()).catch(() => vacio),
        ]);
        if (!vivo) return;
        maplibregl.setWorkerUrl(urlTrabajador); // Vite sirve el worker como archivo aparte

        const c = resolverColores(raiz.parentElement);
        const movil = window.matchMedia('(max-width: 760px)').matches;
        const ancho = () => raiz.clientWidth;
        const relleno = () => (ancho() > 900 ? { left: Math.round(ancho() * 0.3), right: Math.round(ancho() * 0.2), top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 });
        const v = movil ? VISTA_MOVIL : VISTA;
        vistaRef.current = { center: v.c, zoom: v.z, bearing: v.b, pitch: v.p };

        const zoomAncho = ([a, b, c3]) => ['interpolate', ['linear'], ['zoom'], 5, a, 8, b, 11, c3];
        const lineaVia = (id, cat, paint, filtro) => ({ id, type: 'line', source: 'red', filter: filtro ?? ['==', ['get', 'c'], cat], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint });
        // Un tramo está encendido cuando la onda ya llegó a él (feature-state «l») o cuando se pide la red completa («todas»: reducir movimiento).
        const encendido = ['any', ['global-state', 'todas'], ['boolean', ['feature-state', 'l'], false]];
        const siEncendido = (alfa) => ['case', encendido, alfa, 0];
        const calor = ['*', 0.5, ['/', ['coalesce', ['feature-state', 'h'], 0], 2]]; // brillo del frente: 0.5 → 0.25 → 0
        const urbana = ['==', ['get', 't'], 'u'];
        const rural = ['==', ['get', 't'], 'r'];
        const raizArea = ['sqrt', ['max', ['coalesce', ['get', 'a'], 0], 0]];

        mapa = new maplibregl.Map({
          container: raiz,
          attributionControl: { compact: true, customAttribution: ['Relieve: MERIT DEM', 'Hidrografía © colaboradores de OpenStreetMap'] },
          maxPitch: v.p, // la vista inicial es el máximo de inclinación
          minZoom: v.z, // no se puede alejar más que la vista inicial; sí acercar y volver a ella
          
          maxZoom: 11,
          maxBounds: [[-94.5, 16.2], [-87.5, 22.2]],
          fadeDuration: 0,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), // la portada no necesita nitidez de retina
          canvasContextAttributes: { antialias: false },
          cooperativeGestures: true,
          keyboard: false,
          locale: TEXTOS,
          center: v.c, zoom: v.z, bearing: v.b, pitch: v.p,
          padding: relleno(),
          style: {
            version: 8,
            projection: { type: 'mercator' },
            state: { todas: { default: false } },
            sources: {
              contexto: { type: 'geojson', data: contexto },
              relieve: { type: 'image', url: URL_RELIEVE, coordinates: ESQUINAS },
              red: { type: 'geojson', data: red },
              localidades: { type: 'geojson', data: localidades },
            },
            layers: [
              { id: 'fondo', type: 'background', paint: { 'background-color': c['mapa-fondo'] } },
              { id: 'contexto', type: 'fill', source: 'contexto', paint: { 'fill-color': c['mapa-tierra'], 'fill-antialias': true } },
              { id: 'relieve', type: 'raster', source: 'relieve', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
              // Sombra suave bajo las dos primeras jerarquías: las despega del relieve. Solo donde ya se encendió la red.
              lineaVia('via-sombra', null, { 'line-color': c['mapa-via-sombra'], 'line-translate': [0, 2], 'line-blur': 2, 'line-width': zoomAncho([3, 4.5, 7]), 'line-opacity': siEncendido(1) }, ['in', ['get', 'c'], ['literal', ['a', 'b']]]),
              // Resplandor del frente de la onda: solo los tramos recién encendidos.
              lineaVia('via-frente', null, { 'line-color': c['mapa-halo'], 'line-blur': 4, 'line-width': zoomAncho([4, 6, 10]), 'line-opacity': calor }, ['has', 'c']),
              lineaVia('via-c', 'c', { 'line-color': c['mapa-via'], 'line-opacity': siEncendido(VIAS.c.alfa), 'line-width': zoomAncho(VIAS.c.ancho) }),
              lineaVia('via-b', 'b', { 'line-color': c['mapa-via'], 'line-opacity': siEncendido(VIAS.b.alfa), 'line-width': zoomAncho(VIAS.b.ancho) }),
              lineaVia('via-a', 'a', { 'line-color': c['mapa-via'], 'line-opacity': siEncendido(VIAS.a.alfa), 'line-width': zoomAncho(VIAS.a.ancho) }),
              // Localidades: halo gaussiano y núcleo. Las urbanas crecen con su área; las rurales son un punto tenue.
              { id: 'loc-rural-halo', type: 'circle', source: 'localidades', filter: rural, paint: { 'circle-color': c['mapa-halo'], 'circle-opacity': 0.15, 'circle-blur': 1, 'circle-pitch-alignment': 'map', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.2, 9, 6] } },
              { id: 'loc-rural', type: 'circle', source: 'localidades', filter: rural, paint: { 'circle-color': c['mapa-luz'], 'circle-opacity': 0.6, 'circle-pitch-alignment': 'map', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 1.4] } },
              { id: 'loc-urbana-halo', type: 'circle', source: 'localidades', filter: urbana, paint: { 'circle-color': c['mapa-halo'], 'circle-opacity': 0.35, 'circle-blur': 1, 'circle-pitch-alignment': 'map', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['+', 3, ['*', 0.9, raizArea]], 9, ['+', 7, ['*', 2.6, raizArea]]] } },
              { id: 'loc-urbana', type: 'circle', source: 'localidades', filter: urbana, paint: { 'circle-color': c['mapa-luz'], 'circle-opacity': 0.95, 'circle-pitch-alignment': 'map', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['+', 0.8, ['*', 0.22, raizArea]], 9, ['+', 1.8, ['*', 0.6, raizArea]]] } },
            ],
          },
        });
        mapaRef.current = mapa;
        mapa.getCanvas().setAttribute('tabindex', '-1'); // el mapa es de exploración con ratón o tacto; el teclado sigue el orden de la página
        window.sesimCamara = () => {
          const m = mapa;
          const r = (x, n = 2) => Number(x.toFixed(n));
          const { lng, lat } = m.getCenter();
          const texto = `{ c: [${r(lng, 3)}, ${r(lat, 3)}], z: ${r(m.getZoom())}, b: ${r(m.getBearing(), 0)}, p: ${r(m.getPitch(), 0)} }`;
          console.log(texto);
          return texto;
        };

        // Respaldo: si la imagen del relieve no llega o WebGL falla, vuelve el trazo de calles.
        mapa.on('error', (e) => { console.warn('[SESIM mapa]', e.sourceId, e.error?.message); if (vivo && e.sourceId === 'relieve') setEstado('falla'); });
        mapa.on('load', () => { if (vivo) setEstado('listo'); });
        // Solo cuenta como «movido» lo que hace la persona (los movimientos del código no traen evento original).
        mapa.on('movestart', (e) => {
          if (!vivo || !e.originalEvent) return;
          derivaRef.current.activa = false;
          setMovido(true);
        });

        // Animación decorativa, UNA vez: la red se enciende desde las localidades mayores (tramos ordenados por km de recorrido, red.features),
        // más una leve deriva de cámara. Espera a que la portada esté a la vista y se pausa con la pestaña oculta.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          mapa.on('load', () => mapa.setGlobalStateProperty('todas', true)); // sin movimiento: la red aparece completa
        } else {
          const tramos = red.features ?? [];
          const tmax = red.tmax || 1;
          const calientes = []; // [id, momento] en orden de encendido (cola: el más viejo primero)
          const tibios = [];
          let siguiente = 0;
          let inicio = 0;
          let cargado = false;
          let visible = false;
          observador = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
          observador.observe(raiz);
          mapa.on('load', () => { cargado = true; });
          const estado1 = (id, h, l) => mapa.setFeatureState({ source: 'red', id }, l ? { l: true, h } : { h });
          derivaRef.current.t0 = performance.now();
          let ultimo = 0;
          const cuadro = (ahora) => {
            raf = requestAnimationFrame(cuadro);
            if (document.hidden || ahora - ultimo < 1000 / ONDA.fps) return;
            ultimo = ahora;
            if (!inicio && cargado && visible) inicio = ahora + ONDA.retardo * 1000;
            if (inicio && ahora >= inicio) {
              const T = tmax * Math.min(1, (ahora - inicio) / (ONDA.duracion * 1000));
              while (siguiente < tramos.length && tramos[siguiente].properties.s <= T) {
                const id = tramos[siguiente].id;
                estado1(id, 2, true);
                calientes.push([id, ahora]);
                siguiente += 1;
              }
              while (calientes.length && ahora - calientes[0][1] > ONDA.calor[0] * 1000) {
                const [id, t] = calientes.shift();
                estado1(id, 1, false);
                tibios.push([id, t]);
              }
              while (tibios.length && ahora - tibios[0][1] > ONDA.calor[1] * 1000) estado1(tibios.shift()[0], 0, false);
            }
            const d = derivaRef.current;
            if (d.activa && ahora > d.t0) {
              const u = (1 - Math.cos((2 * Math.PI * (ahora - d.t0)) / 1000 / (2 * DERIVA.periodo))) / 2; // 0 → 1 → 0, suave
              const vi = vistaRef.current;
              mapa.jumpTo({ bearing: vi.bearing + DERIVA.rumbo * u, pitch: vi.pitch + DERIVA.inclinacion * u });
            }
          };
          raf = requestAnimationFrame(cuadro);
        }

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
      delete window.sesimCamara;
      mapa?.remove();
      mapaRef.current = null;
    };
  }, []);

  const restablecer = () => {
    mapaRef.current?.easeTo({ ...vistaRef.current, duration: 900 });
    derivaRef.current = { activa: true, t0: performance.now() + 1000 };
    setMovido(false);
  };

  return (
    <div className={`mapa-hero mapa-hero--${estado}`}>
      {estado === 'falla'
        ? <div aria-hidden="true"><StreetLinesBackground factorZoom={1.12} colorBase={[233, 228, 216]} colorPulso={[255, 255, 255]} alphaBase={0.3} grosor={1.25} /></div>
        : <div ref={lienzo} className="mapa-hero__lienzo" role="img" aria-label="Relieve de Campeche con su red carretera y sus localidades. Se puede mover con el ratón; con Ctrl y la rueda se acerca." />}
      <div className="mapa-hero__velo" aria-hidden="true" />
      {estado === 'listo' && movido && (
        <button type="button" className="mapa-hero__reiniciar" onClick={restablecer}>Restablecer vista</button>
      )}
    </div>
  );
};

export default MapaHeroVivo;
