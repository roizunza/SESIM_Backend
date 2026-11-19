/**
 * Teselas vectoriales (Ciclo 9) de las capas pesadas.
 *
 * Las capas de más de 25,000 elementos no se sirven como GeoJSON: el navegador pide solo las teselas
 * que ve (api.tesela_capa, MVT con la capa interna «capa» y las propiedades id, nombre, clasif, cve_mun, id_unidad).
 * `VITE_SESIM_TESELAS_DESDE` baja el umbral (pruebas).
 */
import L from 'leaflet';
import { backend } from './supabase';

const env = import.meta.env ?? {};
export const TESELAS_DESDE = Number(env.VITE_SESIM_TESELAS_DESDE) || 25000;

/** ¿Esta capa se dibuja con teselas? (id real, backend configurado y más elementos que el tope del GeoJSON). */
export function esPorTeselas(capa) {
  return !!capa?.id && Number(capa.n_elementos) > TESELAS_DESDE && backend.configurado?.() !== false;
}

/** Plantilla de URL de VectorGrid ({z}/{x}/{y}); PostgREST acepta la función estable también por GET. */
export function urlTeselas(idCapa) {
  const base = env.VITE_SUPABASE_URL ?? '';
  return `${base}/rest/v1/rpc/tesela_capa?p_capa=${encodeURIComponent(idCapa)}&p_z={z}&p_x={x}&p_y={y}`;
}

/**
 * Encabezados de cada tesela. Con la migración 244 api.tesela_capa corre con los permisos de quien la pide
 * (RLS D-17), así que cada petición lleva el token de la sesión: el público ve las capas públicas; cada perfil,
 * las que le corresponden. Sin sesión se manda la llave `anon`.
 * Si el token está por vencer se renueva en segundo plano (las teselas siguientes ya salen con el nuevo); si ya
 * venció del todo se manda `anon` mientras tanto, para no recibir 401 en cada tesela.
 */
const MARGEN_RENOVAR_SEG = 60;
export function cabecerasTeselas() {
  const anon = env.VITE_SUPABASE_ANON_KEY ?? '';
  const sesion = backend.sesionGuardada?.();
  const ahora = Math.floor(Date.now() / 1000);
  let token = anon;
  if (sesion?.access_token) {
    const resta = (sesion.expires_at ?? 0) - ahora;
    if (resta < MARGEN_RENOVAR_SEG) backend.refrescar?.().catch(() => {});
    if (resta > 0) token = sesion.access_token;
  }
  return { apikey: anon, Authorization: `Bearer ${token}`, 'Accept-Profile': 'api', Accept: 'application/vnd.mapbox-vector-tile' };
}

/** Renueva el token de la sesión si está por vencer, antes de pedir las primeras teselas de una capa. */
export async function prepararTokenTeselas() {
  const sesion = backend.sesionGuardada?.();
  if (!sesion?.access_token) return;
  const resta = (sesion.expires_at ?? 0) - Math.floor(Date.now() / 1000);
  if (resta < MARGEN_RENOVAR_SEG) await backend.refrescar().catch(() => {});
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
