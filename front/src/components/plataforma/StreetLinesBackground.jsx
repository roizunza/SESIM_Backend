import { useEffect, useRef } from 'react';
import { geoMercator, geoPath } from 'd3-geo';

const ASSET_URL = '/assets/carmen-streets.json';

// Grosor por tipo de vía (misma categoría "a/b/c" — arterial, avenida, calle
// — que ya usa MapViewer para Red Vial), para que el trazo tenga jerarquía
// visual en vez de verse como una maraña plana.
const ESTILO_POR_CLASE = {
  a: { width: 1.3 },
  b: { width: 0.9 },
  c: { width: 0.6 },
};

// Dos extremos de calle a menos de esto (en grados, ~11 m) se consideran la
// misma intersección real — así las líneas dejan de ser segmentos sueltos y
// pasan a ser un grafo de verdad, con nodos compartidos donde de verdad se
// cruzan las calles.
const EPSILON_NODO = 0.0001;

function claveNodo(lon, lat) {
  return `${Math.round(lon / EPSILON_NODO)}_${Math.round(lat / EPSILON_NODO)}`;
}

/**
 * Arma un grafo real (nodos = intersecciones, aristas = tramos de calle) a
 * partir del GeoJSON recortado de calles — nada de esto está escrito a
 * mano: sale de las coordenadas reales de `carmen-streets.json`. Cada
 * arista guarda su geometría completa (para dibujarse tal cual, no como una
 * línea recta entre sus dos extremos) y su longitud geográfica real (para
 * que Dijkstra la trate como peso — una avenida larga tarda más en cruzarse
 * que una calle corta, igual que en la realidad).
 */
function construirGrafo(calles) {
  const nodos = [];
  const indicePorClave = new Map();
  const aristas = [];

  function nodoDe(lon, lat) {
    const clave = claveNodo(lon, lat);
    let idx = indicePorClave.get(clave);
    if (idx === undefined) {
      idx = nodos.length;
      nodos.push({ lon, lat });
      indicePorClave.set(clave, idx);
    }
    return idx;
  }

  // Distancia plana (Pitágoras sobre grados): a la escala de una sola
  // ciudad el error frente a Haversine es insignificante, y esto es un
  // fondo decorativo, no una medición.
  function distancia(lonA, latA, lonB, latB) {
    const dx = lonA - lonB;
    const dy = latA - latB;
    return Math.sqrt(dx * dx + dy * dy);
  }

  for (const calle of calles) {
    for (const linea of calle.g) {
      if (linea.length < 2) continue;
      const [lonIni, latIni] = linea[0];
      const [lonFin, latFin] = linea[linea.length - 1];
      const de = nodoDe(lonIni, latIni);
      const a = nodoDe(lonFin, latFin);
      let peso = 0;
      for (let i = 1; i < linea.length; i++) {
        peso += distancia(linea[i - 1][0], linea[i - 1][1], linea[i][0], linea[i][1]);
      }
      if (peso <= 0 || de === a) continue; // segmento degenerado
      aristas.push({ de, a, peso, coords: linea, clase: calle.c });
    }
  }

  const adyacencia = nodos.map(() => []);
  aristas.forEach((arista, i) => {
    adyacencia[arista.de].push({ nodo: arista.a, peso: arista.peso, arista: i });
    adyacencia[arista.a].push({ nodo: arista.de, peso: arista.peso, arista: i });
  });

  return { nodos, aristas, adyacencia };
}

/** Heap binario mínimo — suficiente para Dijkstra sobre unos pocos miles de
 * nodos, recalculado solo al elegir un nuevo origen (cada ~7-10s), nunca en
 * cada frame de la animación. */
class ColaMin {
  constructor() {
    this.datos = [];
  }
  get length() {
    return this.datos.length;
  }
  push(prioridad, valor) {
    this.datos.push([prioridad, valor]);
    let i = this.datos.length - 1;
    while (i > 0) {
      const padre = (i - 1) >> 1;
      if (this.datos[padre][0] <= this.datos[i][0]) break;
      [this.datos[padre], this.datos[i]] = [this.datos[i], this.datos[padre]];
      i = padre;
    }
  }
  pop() {
    const tope = this.datos[0];
    const ultimo = this.datos.pop();
    if (this.datos.length) {
      this.datos[0] = ultimo;
      let i = 0;
      for (;;) {
        const izq = 2 * i + 1;
        const der = 2 * i + 2;
        let menor = i;
        if (izq < this.datos.length && this.datos[izq][0] < this.datos[menor][0]) menor = izq;
        if (der < this.datos.length && this.datos[der][0] < this.datos[menor][0]) menor = der;
        if (menor === i) break;
        [this.datos[menor], this.datos[i]] = [this.datos[i], this.datos[menor]];
        i = menor;
      }
    }
    return tope;
  }
}

/** Distancia mínima real (Dijkstra) desde `origen` a cada nodo del grafo. */
function dijkstra(grafo, origen) {
  const dist = new Float64Array(grafo.nodos.length).fill(Infinity);
  dist[origen] = 0;
  const visitado = new Uint8Array(grafo.nodos.length);
  const cola = new ColaMin();
  cola.push(0, origen);
  while (cola.length) {
    const [d, u] = cola.pop();
    if (visitado[u]) continue;
    visitado[u] = 1;
    for (const { nodo: v, peso } of grafo.adyacencia[u]) {
      const nd = d + peso;
      if (nd < dist[v]) {
        dist[v] = nd;
        cola.push(nd, v);
      }
    }
  }
  return dist;
}

/**
 * Fondo decorativo: la traza urbana real de Ciudad del Carmen (recortada de
 * Red_vial.geojson a su bounding box, ver public/assets/carmen-streets.json)
 * dibujada en un <canvas>, animada como una expansión de Dijkstra real desde
 * un nodo origen aleatorio — cada tramo de calle se "enciende" en el
 * instante en que la ola alcanza su distancia real (una avenida larga tarda
 * más en cruzarse que una calle corta) y se apaga con una caída exponencial
 * suave, como si las calles se fueran iluminando unas a otras — igual que
 * una visualización de origen-destino o de Dijkstra. Al agotarse la ola se
 * elige otro origen al azar y se reinicia sin cortar el lienzo, para que el
 * movimiento nunca se detenga ni parpadee.
 *
 * La proyección (`d3-geo`, geoMercator + geoPath) y el propio grafo (nodos e
 * intersecciones) salen de las coordenadas reales del archivo — nada
 * hardcodeado. Deliberadamente tenue: vive detrás del contenido del héroe,
 * nunca compite con el texto. Respeta `prefers-reduced-motion` quedándose
 * estático en un solo frame.
 */
const StreetLinesBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let grafo = null;
    let pathsPorArista = null; // Path2D[] en coordenadas de pantalla, alineado con grafo.aristas
    let distancias = null; // Float64Array de distancias reales desde el origen vigente
    let distanciaMaxima = 1;
    let velocidadOla = 1; // "distancia" recorrida por segundo
    let tiempoOla = 0;
    let frameId = null;
    let resizeFrameId = null;
    let ultimoTimestamp = null;
    let cancelado = false;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function reiniciarOla() {
      if (!grafo || grafo.nodos.length === 0) return;
      const origen = Math.floor(Math.random() * grafo.nodos.length);
      distancias = dijkstra(grafo, origen);
      distanciaMaxima = 0;
      for (const d of distancias) if (Number.isFinite(d) && d > distanciaMaxima) distanciaMaxima = d;
      if (distanciaMaxima <= 0) distanciaMaxima = 1;
      // ~3.5 segundos para que la ola cruce el radio más largo alcanzable
      // desde el origen elegido (el doble de frecuencia que la versión
      // anterior, de ~7s), sin importar la escala real de los datos.
      velocidadOla = distanciaMaxima / 3.5;
      tiempoOla = 0;
    }

    function reproyectar() {
      if (!grafo) return;
      const { width, height } = canvas.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const featureCollection = {
        type: 'FeatureCollection',
        features: grafo.aristas.map((a) => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: a.coords },
        })),
      };
      // fitExtent proyecta las coordenadas reales al tamaño real del lienzo.
      const proyeccion = geoMercator().fitExtent(
        [
          [-20, -20],
          [width + 20, height + 20],
        ],
        featureCollection
      );
      // Acercamiento: en vez de agrandar el contenedor del héroe, se hace
      // zoom sobre la propia traza (misma proyección, más escala) alrededor
      // del centro visual del lienzo — dando la ilusión de una traza más
      // grande/densa sin empujar el resto de la página hacia abajo.
      const FACTOR_ZOOM = 1.7;
      const centro = [width / 2, height / 2];
      const [tx, ty] = proyeccion.translate();
      proyeccion
        .scale(proyeccion.scale() * FACTOR_ZOOM)
        .translate([
          centro[0] + (tx - centro[0]) * FACTOR_ZOOM,
          centro[1] + (ty - centro[1]) * FACTOR_ZOOM,
        ]);
      // Path2D como "contexto" de geoPath: captura la geometría proyectada
      // sin dibujarla, para pintarla (y repintarla cada frame) sin volver a
      // proyectar — ver mismo patrón en MapViewer/loaderCapas.
      pathsPorArista = grafo.aristas.map((a) => {
        const p2d = new Path2D();
        geoPath(proyeccion, p2d)({ type: 'LineString', coordinates: a.coords });
        return p2d;
      });
    }

    function dibujar() {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      if (!pathsPorArista || !distancias) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Cuánta "distancia" tarda una arista en apagarse tras encenderse —
      // proporcional al alcance de la ola actual, para que el pulso se vea
      // igual de "ancho" sin importar qué tan grande sea la red alcanzada.
      const anchoPulso = distanciaMaxima * 0.18;

      grafo.aristas.forEach((arista, i) => {
        const distNodo = Math.min(distancias[arista.de], distancias[arista.a]);
        const grosorBase = ESTILO_POR_CLASE[arista.clase]?.width ?? 0.6;

        if (!Number.isFinite(distNodo)) {
          // Tramo desconectado de la red alcanzable desde el origen actual
          // (p. ej. un fragmento aislado en los datos): color base fijo, sin
          // animar — nunca invisible.
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.16)';
          ctx.lineWidth = grosorBase;
          ctx.stroke(pathsPorArista[i]);
          return;
        }

        const delta = tiempoOla - distNodo;
        // Sube de golpe al llegar la ola y decae exponencialmente después —
        // continuo, nunca un salto discreto, así que nunca "parpadea".
        const intensidad = delta >= 0 ? Math.exp(-delta / anchoPulso) : 0;
        const alpha = Math.min(0.14 + intensidad * 0.75, 0.95);
        // De gris azulado tenue (apagada) a gris oxford (recién iluminada) —
        // el mismo tono neutro que el interruptor de encendido del
        // Geovisualizador; nunca un color vivo que compita con el título.
        const r = Math.round(100 + intensidad * (65 - 100));
        const g = Math.round(116 + intensidad * (71 - 116));
        const b = Math.round(139 + intensidad * (76 - 139));
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = grosorBase + intensidad * 0.9;
        ctx.stroke(pathsPorArista[i]);
      });
    }

    function animar(timestamp) {
      if (cancelado) return;
      if (ultimoTimestamp === null) ultimoTimestamp = timestamp;
      const dt = (timestamp - ultimoTimestamp) / 1000;
      ultimoTimestamp = timestamp;

      tiempoOla += dt * velocidadOla;
      // Cuando la ola ya recorrió toda la red alcanzable y tuvo tiempo de
      // apagarse otra vez, se elige un nuevo origen al azar — reinicio
      // continuo, sin limpiar el lienzo a un estado vacío entre una ola y
      // la siguiente, para que el movimiento nunca se note como un corte.
      if (tiempoOla > distanciaMaxima * 1.4) {
        reiniciarOla();
      }

      dibujar();
      frameId = requestAnimationFrame(animar);
    }

    fetch(ASSET_URL)
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        grafo = construirGrafo(data);
        reproyectar();
        reiniciarOla();
        if (reduceMotion) {
          dibujar();
        } else {
          frameId = requestAnimationFrame(animar);
        }
      })
      .catch((err) => console.error('Error loading street background:', err));

    // Debounced a un frame: reproyectar reconstruye TODOS los Path2D (caro
    // si se dispara de más) — sin este guard, un ResizeObserver disparando
    // varias veces seguidas por el mismo cambio de layout era la causa real
    // del parpadeo anterior.
    const observer = new ResizeObserver(() => {
      if (resizeFrameId) cancelAnimationFrame(resizeFrameId);
      resizeFrameId = requestAnimationFrame(() => {
        reproyectar();
        if (reduceMotion) dibujar();
      });
    });
    observer.observe(canvas);

    return () => {
      cancelado = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeFrameId) cancelAnimationFrame(resizeFrameId);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="street-lines-background" aria-hidden="true" />;
};

export default StreetLinesBackground;
