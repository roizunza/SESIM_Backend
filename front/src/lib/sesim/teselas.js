/**
 * Teselas vectoriales (Ciclo 9) de las capas pesadas.
 *
 * Las capas de más de 25,000 elementos no se sirven como GeoJSON: el navegador pide solo las teselas
 * que ve (api.tesela_capa, MVT con la capa interna «capa» y las propiedades id, nombre, clasif, cve_mun, id_unidad).
 * `VITE_SESIM_CAPAS_ORIGEN=estatico` fuerza los archivos de respaldo. `VITE_SESIM_TESELAS_DESDE` baja el umbral (pruebas).
 */
import L from 'leaflet';
import { backend } from './supabase';

const env = import.meta.env ?? {};
export const TESELAS_DESDE = Number(env.VITE_SESIM_TESELAS_DESDE) || 25000;
const ORIGEN = (env.VITE_SESIM_CAPAS_ORIGEN || 'base').toLowerCase();

/** ¿Esta capa se dibuja con teselas? (id real, backend configurado y más elementos que el tope del GeoJSON). */
export function esPorTeselas(capa) {
  return ORIGEN !== 'estatico' && !!capa?.id && Number(capa.n_elementos) > TESELAS_DESDE && backend.configurado?.() !== false;
}

/** Plantilla de URL de VectorGrid ({z}/{x}/{y}); PostgREST acepta la función estable también por GET. */
export function urlTeselas(idCapa) {
  const base = env.VITE_SUPABASE_URL ?? '';
  return `${base}/rest/v1/rpc/tesela_capa?p_capa=${encodeURIComponent(idCapa)}&p_z={z}&p_x={x}&p_y={y}`;
}

/**
 * Encabezados de cada tesela. Mientras la migración 231 las deje públicas se piden siempre como `anon`:
 * así una sesión con el token vencido no deja la capa en blanco. Al revertir la 231, usar el token de la
 * sesión (backend.sesionGuardada()?.access_token) y renovarlo antes de vencer.
 */
export function cabecerasTeselas() {
  const anon = env.VITE_SUPABASE_ANON_KEY ?? '';
  return { apikey: anon, Authorization: `Bearer ${anon}`, 'Accept-Profile': 'api', Accept: 'application/vnd.mapbox-vector-tile' };
}

let promesaPlugin = null;
/** Carga leaflet.vectorgrid solo cuando se enciende una capa pesada (el plugin espera `L` global). */
export function cargarVectorGrid() {
  if (!promesaPlugin) {
    if (typeof window !== 'undefined' && !window.L) window.L = L;
    // leaflet.vectorgrid 1.3.0 llama a L.DomEvent.fakeStop, que Leaflet 1.9 ya no trae; sin él el clic falla en silencio.
    if (!L.DomEvent.fakeStop) L.DomEvent.fakeStop = (e) => { e._stopped = true; return L.DomEvent; };
    promesaPlugin = import('leaflet.vectorgrid').then(() => L.vectorGrid);
  }
  return promesaPlugin;
}
