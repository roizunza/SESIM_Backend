/** Modo de ejecución del portal: `demostracion` sirve el backend en memoria de Vite (npm run demo). */
export const MODO_DEMOSTRACION = (import.meta.env?.VITE_SESIM_MODO ?? '') === 'demostracion';
