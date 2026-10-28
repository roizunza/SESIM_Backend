# Informe de cierre: front conectado al backend con login real (27-oct-2026)

**Proyecto:** SESIM (SEDUMOP Campeche) · **Responsable:** Ismael Luna, Tejedores del territorio
**Alcance:** revisión del front (`~/Back/front`, copia en `D:\SESIM.OCT2026\Back\front_wsl_2026-10-27`), conexión con el backend y acceso con credenciales reales, sin simulación.
**Estado:** VERIFICADO contra Supabase real (16/16). Pendiente: aprobación para pasar al Ciclo 3.

## 1. Diagnóstico inicial
El front no estaba conectado: login simulado (usuarios y roles en localStorage: `sesim_sesion`, `sim_role`), sin cliente de Supabase y sin variables de entorno. Cualquiera podía asumir el rol de administrador editando el navegador.

## 2. Qué se implementó
| Componente | Resultado |
|---|---|
| Cliente de auth (`src/lib/sesim/supabase.js`) | Cliente mínimo propio contra GoTrue y PostgREST (sin supabase-js); corre en navegador y en Node. |
| Rol y estado | Salen de `api.mi_perfil` (migración 127); el claim `rol` del JWT es sólo conveniencia. |
| Login (`pages/Administracion.jsx`) | Correo y contraseña reales; credenciales -> modal de políticas -> la sesión se activa sólo al Aceptar; Cancelar la revoca. |
| Revalidación | La sesión guardada no se confía: al cargar se valida token, perfil y estado en el servidor. |
| Guardia de rutas (`AdminLayout.jsx`) | `/admin-visor/*` exige sesión y regresa a la ruta pedida tras entrar. |
| Cierre de sesión | Limpia local y revoca el refresh token en GoTrue. |
| Bitácora real | Página de Bitácora lee `api.bitacora` (alta, baja, reactivación, accesos). |
| Alta y baja | Cliente para `/admin/alta-usuario` (sólo titular) y baja lógica; 0 filas por RLS se trata como "sin permiso". |
| Entorno | Proxy Vite same-origin; `scripts/configurar-env.sh` genera `.env.local`. |
| Retirado | Claves de simulación y la lista de contraseñas de prueba en pantalla. |

## 3. Pruebas
**3.1 Contra Supabase REAL (stack Docker de Ismael), `scripts/prueba-cliente.mjs`: 16 PASS, 0 FAIL.**
Cubre: login válido y los 4 roles; contraseña, correo y apikey incorrectos; sesión no activa hasta aceptar políticas; revalidación; rol falsificado y token manipulado; cierre y revocación; refresh de token vencido; capturista ve sólo lo suyo y administrador ve todos; auditor lee bitácora pero no da de baja; alta sólo titular (administrador recibe 403); alta + baja + bitácora; sin configuración no simula.
(Las pruebas 06 y 07, cuenta dada de baja y usuario sin perfil, sólo corren en el mock.)

**3.2 Con backend simulado:** cliente 18/18; navegador real (Playwright/Chromium) 13/13: redirección sin sesión, error de contraseña, baja, modal de políticas, Cancelar/Aceptar, recarga, banner, cierre de sesión, localStorage forjado, claves de simulación antiguas, expulsión tras baja en servidor. Build de producción compila.

**3.3 Hallazgos de la corrida real y su corrección**
- Prueba 15: la RLS filtra la baja del auditor y PostgREST responde 200 con lista vacía. No era un hueco (sólo el titular actualiza perfiles); el cliente ahora lo interpreta como 403.
- Prueba 17: el servicio de procesos rechaza correos `.test` (422) y el cliente mostraba `[object Object]`. Se corrigió el correo de la prueba y el cliente ahora muestra el mensaje real.

## 4. Cuentas de desarrollo (contraseña `SesimDev2026!`)
Titular `sesimadminvip@gmail.com` · Administrador `sesimadmin@gmail.com` · Auditores `sesimauditor1/2@gmail.com` · Capturistas `sesimcapturista1/2@gmail.com`.

## 5. Límites conocidos
- Siguen locales en el navegador (con banner visible): mediciones, evidencias, dictámenes, hallazgos, invitaciones y catálogos estáticos. Se conectan en los Ciclos 4 a 8.
- Páginas públicas estáticas: anon sin grants (decisión D-14 abierta).
- Cada corrida de la prueba 17 deja una cuenta de prueba dada de baja en la bitácora.
- Prueba E2E de navegador sólo ejecutada contra el mock; la UI real se probó por cliente. Se recomienda un recorrido manual en `http://localhost:5173/admin`.
- SESIM_Externo no se tocó; su equivalente es el mismo cliente de auth.

## 6. Entregables en D:\SESIM.OCT2026\Back
`db/migrations/127_api_mi_perfil.sql`; front: `src/lib/sesim/{supabase,sesion,operacion}.js`, `pages/Administracion.jsx`, `AdminLayout.jsx`, `BitacoraCuentas.jsx`, `BitacoraPagina.jsx`, `vite.config.js`, `.env.example`, `scripts/{configurar-env.sh, mock-backend.mjs, prueba-cliente.mjs, e2e-login.mjs}`.

## 7. Siguiente paso
Con tu aprobación: Ciclo 3 (sincronizar Back, `./scripts/migrar.sh --adoptar-hasta 126`, `./scripts/pruebas-ciclo3.sh`) y luego Ciclo 4 (CRUD de catálogo e instrumentos).
