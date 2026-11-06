import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { crearServidorDemo, CUENTAS_DEMOSTRACION } from './scripts/demo/servidorDemo.mjs'

// https://vite.dev/config/
//
// El navegador habla SOLO con el servidor de Vite (mismo origen, sin CORS):
//   /supabase/*  ->  gateway de Supabase (GoTrue /auth/v1, PostgREST /rest/v1)
//   /procesos/*  ->  servicio-procesos (alta de usuarios, invitaciones)
// Con el backend (npm run dev / preview) Vite reenvía a SESIM_GATEWAY y SESIM_PROCESOS.
// En modo demostración (npm run demo / demo:preview, es decir --mode demostracion) las mismas rutas
// las atiende el backend en memoria de scripts/demo/servidorDemo.mjs: no hace falta Docker ni un .env propio.

/** Monta el backend de demostración en /supabase y /procesos (servidor de desarrollo y de vista previa). */
function backendDemostracion(anonKey) {
  const datos = JSON.parse(readFileSync(new URL('./scripts/demo/datos_demo.json', import.meta.url), 'utf8'))
  const demo = crearServidorDemo({ anonKey, datos })
  for (const c of CUENTAS_DEMOSTRACION) demo.agregar(c.correo, c.password, c.nombre, c.rol)
  const montar = (middlewares) => {
    for (const prefijo of ['/supabase', '/procesos']) {
      middlewares.use(prefijo, (req, res, siguiente) => demo.manejar(req, res).catch(siguiente))
    }
  }
  return {
    name: 'sesim-backend-demostracion',
    configureServer: (server) => montar(server.middlewares),
    configurePreviewServer: (server) => montar(server.middlewares),
  }
}

const MODO_DEMOSTRACION = 'demostracion'

/**
 * Variables que el cliente necesita en modo demostración. Se fijan en process.env porque Vite las
 * antepone a cualquier archivo .env al construir import.meta.env; así el modo no depende de .env.local
 * (que apunta al backend real) ni de que exista un .env.demostracion.
 */
function prepararEntornoDemostracion(env) {
  const valores = {
    VITE_SESIM_MODO: MODO_DEMOSTRACION,
    VITE_SUPABASE_URL: '/supabase',
    VITE_PROCESOS_URL: '/procesos',
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || MODO_DEMOSTRACION,
  }
  Object.assign(process.env, valores)
  return valores
}

/**
 * true si el gateway responde como el backend SESIM: GoTrue contesta /auth/v1/health con 200.
 * Un puerto ocupado por otro programa o un gateway sin servicios sanos cuenta como «no hay backend».
 */
async function backendDisponible(gateway, anonKey, esperaMs = 2500) {
  try {
    const r = await fetch(new URL('/auth/v1/health', gateway), { headers: { apikey: anonKey ?? '' }, signal: AbortSignal.timeout(esperaMs) })
    return r.ok
  } catch {
    return false
  }
}

function configDemostracion(env) {
  const { VITE_SUPABASE_ANON_KEY } = prepararEntornoDemostracion(env)
  return { plugins: [react(), backendDemostracion(VITE_SUPABASE_ANON_KEY)] }
}

export default defineConfig(async ({ command, mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === MODO_DEMOSTRACION || env.VITE_SESIM_MODO === MODO_DEMOSTRACION) return configDemostracion(env)
  const gateway = env.SESIM_GATEWAY || 'http://localhost:8000'
  // `npm run dev` sin backend levantado: se usa el backend en memoria y se avisa en consola y en el portal.
  if (command === 'serve' && !isPreview && env.SESIM_SIN_RESPALDO !== '1' && !(await backendDisponible(gateway, env.VITE_SUPABASE_ANON_KEY))) {
    console.warn(`\n[SESIM] No hay backend en ${gateway}: se usa el backend de demostración en memoria.\n        Levante Docker (SESIM_Backend/scripts/levantar.sh) y reinicie \`npm run dev\` para usar el real.\n`)
    return configDemostracion(env)
  }
  if (command === 'serve' && !isPreview) console.info(`\n[SESIM] Backend real en ${gateway}. Las cuentas son las de la base (SESIM_Backend/scripts/sembrar.sh).\n`)
  const procesos = env.SESIM_PROCESOS || 'http://localhost:8001'
  const proxy = {
    '/supabase': { target: gateway, changeOrigin: true, rewrite: (p) => p.replace(/^\/supabase/, '') },
    '/procesos': { target: procesos, changeOrigin: true, rewrite: (p) => p.replace(/^\/procesos/, '') },
  }
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})
