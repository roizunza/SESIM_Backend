/**
 * Candados del flujo de captura.
 *
 * MODO_REVISION_DISENO = true  → el botón «Siguiente» del asistente de capas queda abierto para recorrer todos los pasos
 *                                sin cumplir los requisitos (guardar y enviar siguen exigiendo todo).
 * MODO_REVISION_DISENO = false → «Siguiente» se bloquea hasta que el paso esté completo (candados activos).
 */
export const MODO_REVISION_DISENO = true;

/**
 * CAPTURA_MEDICIONES = false → por ahora el capturista no captura mediciones: se ocultan el botón, la mesa y los avisos de mediciones.
 * (El código de MedicionModal se conserva para volver a encenderlo.)
 */
export const CAPTURA_MEDICIONES = false;
