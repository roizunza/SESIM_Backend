-- Front real (27-oct-2026): el front necesita saber QUIEN es la cuenta que acaba de entrar
-- (su perfil, no el de todos). api.perfil devuelve todas las filas que la RLS deja ver (el
-- Administrador ve a todos) y no trae id_usuario, asi que no sirve para ubicar la propia.
-- api.mi_perfil devuelve exactamente la fila de auth.uid(): la fuente de verdad del rol en
-- el front (el claim "rol" del JWT es solo conveniencia).

create or replace view api.mi_perfil
  with (security_invoker = true)
as
select id, id_usuario, nombre, rol, ambito, cve_mun, dependencia, activo, creado_en
from core.perfil
where id_usuario = auth.uid();

comment on view api.mi_perfil is 'Perfil de la cuenta con sesion (una fila, la de auth.uid()). El front la lee al iniciar sesion para saber rol, ambito y si la cuenta sigue activa.';

revoke all on api.mi_perfil from public, anon, authenticated;
grant select on api.mi_perfil to authenticated;
