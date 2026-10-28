import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Proxy de desarrollo: el navegador habla SOLO con el servidor de Vite
// (mismo origen, sin problemas de CORS) y Vite reenvía al backend:
//   /supabase/*  ->  gateway de Supabase (GoTrue /auth/v1, PostgREST /rest/v1)
//   /procesos/*  ->  servicio-procesos (alta de usuarios, cargas)
// Destinos configurables con SESIM_GATEWAY y SESIM_PROCESOS (por omisión, local).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gateway = env.SESIM_GATEWAY || 'http://localhost:8000'
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
