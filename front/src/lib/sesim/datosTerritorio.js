/**
 * Datos de referencia del territorio de Campeche que se muestran como dato fijo en la portada.
 * No cambian con la operación del sistema, por eso no se piden a la API.
 */

/** Extensión territorial del Estado de Campeche, en km² (INEGI, Marco Geoestadístico). */
export const EXTENSION_KM2 = 57484.9;

/**
 * Longitud de la red vial del estado, en km: suma geodésica (elipsoide WGS 84) de las 56,507 líneas de la capa
 * DIt06 (Red vial) del dataset oficial SESIM. Incluye caminos de tierra, grava, asfalto y concreto, y tramos sin
 * clasificar; excluye 3 geometrías duplicadas contadas una sola vez en la capa original.
 */
export const RED_VIAL_KM = 15602.5;
