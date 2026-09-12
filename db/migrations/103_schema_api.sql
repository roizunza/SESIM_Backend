-- Esquema api: lo unico PROPIO de SESIM que PostgREST expone, ademas de lo
-- que Supabase ya expone de fabrica (ver PGRST_DB_SCHEMAS en
-- docker-compose.sesim.yml -- incluye "api" junto con lo que trae Supabase
-- por defecto).
--
-- Cambio de fondo respecto a la version anterior (pre-Supabase): este
-- archivo ya NO trae api.login ni api.confirmar_restablecimiento. Esas dos
-- cosas las hace ahora GoTrue (el servicio de auth de Supabase) por su
-- cuenta, sin que SESIM tenga que escribir ni una linea de codigo:
--
--   Login:            POST {SUPABASE_URL}/auth/v1/token?grant_type=password
--                      body: {"email": "...", "password": "..."}
--                      header: apikey: <ANON_KEY>
--
--   Pedir reset:       POST {SUPABASE_URL}/auth/v1/recover
--                      body: {"email": "..."}
--                      header: apikey: <ANON_KEY>
--
--   Confirmar reset:   el enlace del correo trae un token; el front lo manda
--                      a POST {SUPABASE_URL}/auth/v1/verify (type=recovery)
--                      y con la sesion que eso devuelve, PUT
--                      {SUPABASE_URL}/auth/v1/user con la nueva contrasena.
--
-- (Ver README.md, seccion "Login y restablecimiento de contrasena", para los
-- curl de ejemplo completos.)
--
-- Lo unico que SESIM sigue necesitando resolver por su cuenta es el ALTA de
-- credenciales (nadie se auto-registra: solo administrador_vip puede crear
-- una cuenta nueva) -- eso vive en servicio-procesos, no aqui, porque
-- necesita llamar a la Admin API de Supabase por HTTP (algo que una funcion
-- de SQL corriente no puede hacer sin una extension adicional como pg_net,
-- que no se agrego para no sumar una pieza mas sin probar). Ver
-- servicio-procesos/main.py, POST /admin/alta-usuario.

create schema if not exists api;
comment on schema api is 'Unico esquema propio expuesto por PostgREST ademas de lo que Supabase expone de fabrica. Todo lo demas de core es invisible para el cliente.';

grant usage on schema api to anon, authenticated;

-- Vista de perfiles. security_invoker hace que la RLS de core.perfil se
-- aplique con el rol de quien consulta (siempre "authenticated" o "anon"
-- con Supabase), no con el dueno de la vista.
create or replace view api.perfil
  with (security_invoker = true)
as
select
  id,
  nombre,
  rol,
  ambito,
  cve_mun,
  dependencia,
  activo,
  creado_en
from core.perfil;

comment on view api.perfil is 'Perfiles visibles segun el rol de quien consulta (RLS de core.perfil via auth.uid()).';

grant select on api.perfil to authenticated;
grant update (dependencia, activo) on api.perfil to authenticated;
